package com.luachsport.chibarti;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * One shared screen to several devices in a room. Every viewer has its own small queue and its own writer, so a
 * slow viewer never holds up the others: when its queue is too long it skips pictures until the next key frame
 * (asked for at once), and always sees "now". A viewer that joins late, or whose screen connection came back, first
 * gets the picture's setup again. Used by the phone that shares to everyone, and by a room's host passing on a
 * member's screen. Plain Java (tested on a PC).
 */
final class StreamFan {
    static final long LIMIT = 1_200_000; // bytes waiting for one viewer before it skips to the next key frame

    private static final class V {
        final Session s;
        final ArrayDeque<Object[]> q = new ArrayDeque<>();
        long bytes;
        boolean needKey = true, gone;
        int sent;
        V(Session s) { this.s = s; }
    }

    private final List<V> viewers = new ArrayList<>();
    private final Runnable wantKey;
    private volatile byte[] config, audioConfig;
    private volatile boolean running = true;

    StreamFan(Runnable wantKey) { this.wantKey = wantKey; }

    synchronized boolean has(Session s) { return find(s) != null; }
    synchronized int size() { return viewers.size(); }

    synchronized List<Session> sessions() {
        List<Session> l = new ArrayList<>();
        for (V v : viewers) l.add(v.s);
        return l;
    }

    private V find(Session s) { for (V v : viewers) if (v.s == s) return v; return null; }

    /** A viewer accepted: its writer starts; pictures go to it once its screen connection is there. */
    void add(final Session s) {
        V v;
        synchronized (this) {
            if (!running || find(s) != null) return;
            v = new V(s);
            viewers.add(v);
        }
        final V fv = v;
        Thread t = new Thread(() -> writeLoop(fv), "fan-" + s.peerName);
        t.setDaemon(true);
        t.start();
        ready(s);
    }

    void remove(Session s) {
        synchronized (this) {
            V v = find(s);
            if (v == null) return;
            viewers.remove(v);
            synchronized (v) { v.gone = true; v.q.clear(); v.bytes = 0; v.notifyAll(); }
        }
    }

    /** The viewer's screen connection is (back) there: the picture's setup again, then from a key frame. */
    void ready(Session s) {
        V v;
        synchronized (this) { v = find(s); }
        if (v == null) return;
        byte[] c = config, a = audioConfig;
        synchronized (v) {
            v.q.clear();
            v.bytes = 0;
            if (c != null) { v.q.add(new Object[] { Proto.VIDEO_CONFIG, c }); v.bytes += c.length; }
            if (a != null) { v.q.add(new Object[] { Proto.AUDIO_CONFIG, a }); v.bytes += a.length; }
            v.needKey = true;
            v.notifyAll();
        }
        wantKey.run();
    }

    /** One piece of the shared screen, to every viewer that can take it now. */
    void send(int type, byte[] body, boolean key) {
        if (type == Proto.VIDEO_CONFIG) config = body;
        if (type == Proto.AUDIO_CONFIG) audioConfig = body;
        boolean ask = false;
        List<V> all;
        synchronized (this) { all = new ArrayList<>(viewers); }
        for (V v : all) {
            synchronized (v) {
                if (type == Proto.VIDEO_FRAME) {
                    if (v.needKey && !key) continue;
                    if (!key && v.bytes > LIMIT) { v.needKey = true; ask = true; continue; }
                    if (key) v.needKey = false;
                } else if (type == Proto.AUDIO_FRAME && v.bytes > LIMIT * 2) continue;
                v.q.add(new Object[] { type, body });
                v.bytes += body.length;
                v.notifyAll();
            }
        }
        if (ask) wantKey.run();
    }

    /** The longest queue (the slowest viewer): the sharing phone's quality follows it. */
    synchronized long waiting() {
        long w = 0;
        for (V v : viewers) synchronized (v) { w = Math.max(w, v.bytes); }
        return w;
    }

    void stop() {
        List<V> all;
        synchronized (this) { running = false; all = new ArrayList<>(viewers); viewers.clear(); }
        for (V v : all) synchronized (v) { v.gone = true; v.q.clear(); v.notifyAll(); }
    }

    private void writeLoop(V v) {
        while (true) {
            Object[] o;
            synchronized (v) {
                while (!v.gone && v.q.isEmpty()) { try { v.wait(500); } catch (InterruptedException e) { return; } }
                if (v.gone) return;
                o = v.q.poll();
                v.bytes -= ((byte[]) o[1]).length;
            }
            Link st = v.s.stream;
            int type = (Integer) o[0];
            if (st == null) { synchronized (v) { if (type == Proto.VIDEO_FRAME) v.needKey = true; } continue; }
            try {
                st.send(type, (byte[]) o[1]);
                v.sent++;
            } catch (Exception e) {
                v.s.dropStream();
                synchronized (v) { v.needKey = true; }
            }
        }
    }
}
