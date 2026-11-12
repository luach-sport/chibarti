package com.luachsport.chibarti;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

import static com.luachsport.chibarti.ChibartiTests.check;
import static com.luachsport.chibarti.ChibartiTests.test;

/**
 * The real send queue of a connection (Session) between the sender and the receiver, on a slow link like Wi-Fi
 * between two phones: a file's "finished" must never overtake its last pieces (that made every file fail its check
 * in 1.3). Also: a dropped "finished" sends the file again, and the sealed network of the nearby announcement.
 */
final class SessionTests {
    private SessionTests() { }

    /** A link that is slow to send (like Wi-Fi) and hands every frame to the other side, in order. */
    static final class SlowLink implements Link {
        final LinkedBlockingQueue<Frame> sent = new LinkedBlockingQueue<>();
        final List<Integer> order = new ArrayList<>();
        volatile boolean closed;
        final int delayMs;
        SlowLink(int delayMs) { this.delayMs = delayMs; }
        public void send(int type, byte[] body) throws IOException { send(type, body, 0, body.length); }
        public void send(int type, byte[] body, int off, int len) throws IOException {
            if (closed) throw new IOException("closed");
            try { Thread.sleep(delayMs); } catch (InterruptedException e) { throw new IOException(e); }
            synchronized (order) { order.add(type); }
            sent.add(new Frame(type, Arrays.copyOfRange(body, off, off + len)));
        }
        public Frame read() throws IOException {
            while (!closed) { try { Thread.sleep(50); } catch (InterruptedException e) { throw new IOException(e); } }
            throw new IOException("closed");
        }
        public void setReadTimeout(int ms) { }
        public boolean isClosed() { return closed; }
        public void close() { closed = true; }
        public long lastRx() { return System.currentTimeMillis(); }
        public long bytesIn() { return 0; }
    }

    static Session session(Link link) {
        Session s = new Session("p", true, Crypto.random(32), new Session.Listener() {
            public void onMessage(Session s, Link.Frame f) { }
            public void onStreamFrame(Session s, Link.Frame f) { }
            public void onLinkLost(Session s) { }
            public void onResumed(Session s) { }
            public void onClosed(Session s, String reason) { }
        });
        s.start(link);
        return s;
    }

    /** Sends one transfer the way Transfers does (pieces and "finished" through the session queue). */
    static OutgoingJob.Wire wire(final Session s) {
        final int gen = s.generation;
        return new OutgoingJob.Wire() {
            public void chunk(int tid, int fid, long off, byte[] buf, int len) throws IOException { s.bulk(Proto.CHUNK, Proto.chunk(tid, fid, off, buf, len), gen); }
            public void end(int tid, int fid, long size, String sha) throws IOException {
                try { s.bulkControl(Proto.FILE_END, new JSONObject().put("tid", tid).put("fid", fid).put("size", size).put("sha", sha), gen); }
                catch (org.json.JSONException e) { throw new IOException(e); }
            }
        };
    }

    static void run() {
        test("a file's \"finished\" never overtakes its pieces on a slow link (the 1.3 bug)", () -> {
            SlowLink link = new SlowLink(3);
            Session s = session(link);
            byte[] a = Crypto.random(1_300_000), b = Crypto.random(70_000);
            OutgoingJob out = new OutgoingJob(5);
            out.items.add(new OutgoingJob.Item(1, "movie.mp4", "video/mp4", a.length, () -> new ByteArrayInputStream(a)));
            out.items.add(new OutgoingJob.Item(2, "app.apk", "", b.length, () -> new ByteArrayInputStream(b)));
            out.items.add(new OutgoingJob.Item(3, "empty.txt", "", 0, () -> new ByteArrayInputStream(new byte[0])));
            ChibartiTests.Mem m = new ChibartiTests.Mem();
            IncomingJob in = new IncomingJob(5, m);
            in.items.add(new IncomingJob.Item(1, "movie.mp4", "video/mp4", a.length));
            in.items.add(new IncomingJob.Item(2, "app.apk", "", b.length));
            in.items.add(new IncomingJob.Item(3, "empty.txt", "", 0));
            // a message in the middle still goes first (a tap never waits behind a file)
            new Thread(() -> { try { Thread.sleep(20); s.control(Proto.TEXT, new JSONObject().put("text", "hi")); } catch (Exception ignored) { } }).start();
            out.run(wire(s));
            List<String> results = new ArrayList<>();
            boolean text = false;
            while (results.size() < 3) {
                Link.Frame f = link.sent.poll(10, TimeUnit.SECONDS);
                check(f != null, "frames stopped after " + results);
                if (f.type == Proto.CHUNK) {
                    ByteBuffer bb = ByteBuffer.wrap(f.body);
                    bb.getInt();
                    int fid = bb.getInt();
                    long off = bb.getLong();
                    in.onChunk(fid, off, f.body, 16, f.body.length - 16);
                } else if (f.type == Proto.FILE_END) {
                    JSONObject o = new JSONObject(f.text());
                    String err = in.onEnd(o.getInt("fid"), o.getLong("size"), o.getString("sha"));
                    results.add(err == null ? "ok" : err);
                } else if (f.type == Proto.TEXT) text = true;
            }
            s.close("test", false);
            check(results.equals(Arrays.asList("ok", "ok", "ok")), "checks: " + results);
            check(Arrays.equals(m.files.get("movie.mp4").toByteArray(), a) && Arrays.equals(m.files.get("app.apk").toByteArray(), b), "content");
            check(text, "the message went through");
        });

        test("a \"finished\" lost with the connection: the file is sent again after the reconnect", () -> {
            byte[] d = Crypto.random(100_000);
            OutgoingJob out = new OutgoingJob(9);
            out.items.add(new OutgoingJob.Item(1, "a.bin", "", d.length, () -> new ByteArrayInputStream(d)));
            try {
                out.run(new OutgoingJob.Wire() {
                    public void chunk(int t, int f, long o, byte[] b, int l) { }
                    public void end(int t, int f, long s, String h) throws IOException { throw new IOException("link-lost"); }
                });
                throw new AssertionError("no error");
            } catch (IOException e) { check("link-lost".equals(e.getMessage()), "error"); }
            check(out.items.get(0).state == OutgoingJob.SENDING, "still to send, state " + out.items.get(0).state);
            final int[] ends = { 0 };
            out.run(new OutgoingJob.Wire() {
                public void chunk(int t, int f, long o, byte[] b, int l) { }
                public void end(int t, int f, long s, String h) { ends[0]++; }
            });
            check(ends[0] == 1 && out.items.get(0).state == OutgoingJob.CHECKING, "sent again");
        });

        test("the nearby announcement's network opens with the right code or a remembered key only", () -> {
            String host = "0123456789abcdef0123456789abcdef";
            NetSeal.Net n = new NetSeal.Net("d", "DIRECT-aB-Galaxy A52", "x7Kp2mQz");
            String w = NetSeal.seal(NetSeal.pinKey("042913", host), n);
            NetSeal.Net got = NetSeal.open(NetSeal.pinKey("042913", host), w);
            check(got != null && got.method.equals("d") && got.ssid.equals(n.ssid) && got.pass.equals(n.pass), "right code");
            check(NetSeal.open(NetSeal.pinKey("042914", host), w) == null, "wrong code");
            check(NetSeal.open(NetSeal.pinKey("042913", "fedcba9876543210fedcba9876543210"), w) == null, "other phone's salt");
            char[] t = w.toCharArray();
            t[20] = t[20] == 'A' ? 'B' : 'A';
            check(NetSeal.open(NetSeal.pinKey("042913", host), new String(t)) == null, "changed");
            byte[] known = Crypto.random(32);
            NetSeal.Net h = new NetSeal.Net("h", "AndroidShare_4821", "longer hotspot passphrase 123");
            String r = NetSeal.seal(known, h);
            check(NetSeal.open(known, r) != null && NetSeal.open(known, r).pass.equals(h.pass), "remembered key");
            check(NetSeal.open(Crypto.random(32), r) == null && NetSeal.open(null, r) == null, "other key");
            check(w.length() < 200 && r.length() < 200, "fits the announcement: " + w.length() + "/" + r.length());
        });
    }
}
