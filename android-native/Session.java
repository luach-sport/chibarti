package com.luachsport.chibarti;

import org.json.JSONObject;
import java.io.IOException;
import java.util.ArrayDeque;

/**
 * The live connection to the other phone: one encrypted main connection (messages and files) and, while a screen is
 * shared, a second one for the video. Messages always go before file pieces, so a tap never waits behind a big file;
 * a file's "finished" goes in line with its pieces (never ahead of them), so the other side checks the whole file.
 * A heartbeat every 2.5 s notices a dead connection within 10 s; then the phone that joined tries to reconnect for
 * 30 s with the session key (no new code, no approval), and transfers continue from where they stopped.
 */
final class Session {
    interface Listener {
        void onMessage(Session s, Link.Frame f);
        void onStreamFrame(Session s, Link.Frame f);
        void onLinkLost(Session s);
        void onResumed(Session s);
        void onClosed(Session s, String reason);
    }

    static final int ACTIVE = 1, RECONNECTING = 2, CLOSED = 3;
    private static final int BULK_MAX = 8;

    final String peerId;
    final boolean host;
    final byte[] key;
    final Listener l;
    String peerName = "", peerModel = "", via = "wifi-direct";
    int peerSdk;
    String address;
    int port;
    Object network; // android.net.Network of the joined network (kept as Object so this class runs on a PC)
    volatile Link main, stream;
    String kind = "phone"; // "phone" or "pc" (a computer's browser)
    boolean roomOk = false; // the other side understands rooms (Chibarti 2.0+ phones)
    volatile Runnable onDrain; // pieces waiting for this device went down (a room's host passes on files)
    volatile int state = ACTIVE;
    volatile int rttMs = -1;
    volatile int generation = 0;
    final long startedAt = System.currentTimeMillis();
    private final Object q = new Object();
    private final ArrayDeque<Object[]> ctl = new ArrayDeque<>(), bulk = new ArrayDeque<>();
    private Thread writer, pinger;

    Session(String peerId, boolean host, byte[] key, Listener l) {
        this.peerId = peerId;
        this.host = host;
        this.key = key;
        this.l = l;
    }

    void start(Link link) {
        main = link;
        startReader(link, false);
        writer = new Thread(this::writeLoop, "session-out");
        writer.setDaemon(true);
        writer.start();
        pinger = new Thread(this::pingLoop, "session-ping");
        pinger.setDaemon(true);
        pinger.start();
    }

    private void startReader(final Link link, final boolean isStream) {
        Thread t = new Thread(() -> {
            try {
                while (!link.isClosed()) {
                    Link.Frame f = link.read();
                    if (f.type == Proto.PING) { control(Proto.PONG, new JSONObject(f.text())); continue; }
                    if (f.type == Proto.PONG) {
                        try { rttMs = (int) Math.max(0, System.currentTimeMillis() - new JSONObject(f.text()).optLong("t")); } catch (Exception ignored) { }
                        continue;
                    }
                    if (isStream) l.onStreamFrame(this, f); else l.onMessage(this, f);
                }
            } catch (Exception e) {
                if (isStream) { if (stream == link) stream = null; link.close(); }
                else lost(link);
            }
        }, isStream ? "stream-in" : "session-in");
        t.setDaemon(true);
        t.start();
    }

    void attachStream(Link link) {
        Link old = stream;
        stream = link;
        if (old != null) old.close();
        startReader(link, true);
    }

    void dropStream() { Link s = stream; stream = null; if (s != null) s.close(); }

    void replaceMain(Link link) {
        Link old = main;
        main = link;
        if (old != null && old != link) old.close();
        state = ACTIVE;
        startReader(link, false);
        synchronized (q) { q.notifyAll(); }
        l.onResumed(this);
    }

    private void lost(Link link) {
        if (link != main || state == CLOSED) return;
        link.close();
        state = RECONNECTING;
        generation++;
        synchronized (q) {
            bulk.clear();
            // a "file finished" must not overtake the pieces that were lost with the connection (they are re-sent)
            java.util.Iterator<Object[]> it = ctl.iterator();
            while (it.hasNext()) if ((Integer) it.next()[0] == Proto.FILE_END) it.remove();
            q.notifyAll();
        }
        l.onLinkLost(this);
    }

    void control(int type, JSONObject o) {
        synchronized (q) { ctl.add(new Object[] { type, Proto.json(o) }); q.notifyAll(); }
    }

    /** A file's "finished": after its last piece, never before it. Throws when the connection dropped meanwhile. */
    void bulkControl(int type, JSONObject o, int gen) throws IOException { bulk(type, Proto.json(o), gen); }

    /** A file piece. Waits while 8 pieces are queued (so memory stays small). Throws when the connection dropped. */
    void bulk(int type, byte[] body, int gen) throws IOException {
        synchronized (q) {
            while (bulk.size() >= BULK_MAX && state == ACTIVE && gen == generation) {
                try { q.wait(250); } catch (InterruptedException e) { throw new IOException("interrupted"); }
            }
            if (state != ACTIVE || gen != generation) throw new IOException("link-lost");
            bulk.add(new Object[] { type, body });
            q.notifyAll();
        }
    }

    /** A piece passed on for another device: queued at once (the sender is asked to hold instead). Returns how many wait, -1 when gone. */
    int bulkNow(int type, byte[] body) {
        synchronized (q) {
            if (state != ACTIVE) return -1;
            bulk.add(new Object[] { type, body });
            q.notifyAll();
            return bulk.size();
        }
    }

    int waiting() { synchronized (q) { return bulk.size(); } }

    private void writeLoop() {
        while (state != CLOSED) {
            Object[] o;
            boolean drained = false;
            synchronized (q) {
                while (state != CLOSED && (state == RECONNECTING || (ctl.isEmpty() && bulk.isEmpty()))) {
                    try { q.wait(1000); } catch (InterruptedException e) { return; }
                }
                if (state == CLOSED) return;
                if (!ctl.isEmpty()) o = ctl.poll();
                else { o = bulk.poll(); drained = bulk.size() == Relay.LOW; }
                q.notifyAll();
            }
            Runnable d = onDrain;
            if (drained && d != null) d.run();
            if (o == null) continue;
            Link link = main;
            try { link.send((Integer) o[0], (byte[]) o[1]); } catch (IOException e) { lost(link); }
        }
    }

    private void pingLoop() {
        while (state != CLOSED) {
            try { Thread.sleep(2500); } catch (InterruptedException e) { return; }
            if (state != ACTIVE) continue;
            Link link = main;
            if (System.currentTimeMillis() - link.lastRx() > 10000) { lost(link); continue; }
            try { control(Proto.PING, new JSONObject().put("t", System.currentTimeMillis())); } catch (Exception ignored) { }
        }
    }

    /** Ends the session for good (the other phone is told why). */
    void close(String reason, boolean tell) {
        if (state == CLOSED) return;
        if (tell && state == ACTIVE) {
            try { main.send(Proto.BYE, Proto.json(new JSONObject().put("reason", reason))); } catch (Exception ignored) { }
        }
        state = CLOSED;
        synchronized (q) { ctl.clear(); bulk.clear(); q.notifyAll(); }
        if (main != null) main.close();
        dropStream();
        if (pinger != null) pinger.interrupt();
        l.onClosed(this, reason);
    }

    long bytesIn() { Link m = main, s = stream; return (m == null ? 0 : m.bytesIn()) + (s == null ? 0 : s.bytesIn()); }
}
