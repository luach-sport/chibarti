package com.luachsport.chibarti;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static com.luachsport.chibarti.ChibartiTests.check;
import static com.luachsport.chibarti.ChibartiTests.test;

/** One screen to several viewers in a room (StreamFan): a slow viewer skips to key frames and doesn't hold up the rest. */
final class FanTests {
    private FanTests() { }

    /** A viewer's screen connection: records what arrived, optionally slow. */
    static final class Screen implements Link {
        final List<int[]> got = new ArrayList<>(); // [type, first byte]
        final int delayMs;
        volatile boolean closed;
        Screen(int delayMs) { this.delayMs = delayMs; }
        public void send(int type, byte[] body) throws IOException { send(type, body, 0, body.length); }
        public void send(int type, byte[] body, int off, int len) throws IOException {
            if (closed) throw new IOException("closed");
            if (delayMs > 0) { try { Thread.sleep(delayMs); } catch (InterruptedException e) { throw new IOException(e); } }
            synchronized (got) { got.add(new int[] { type, body.length > 0 ? body[0] : -1 }); }
        }
        public Frame read() throws IOException { throw new IOException("no"); }
        public void setReadTimeout(int ms) { }
        public boolean isClosed() { return closed; }
        public void close() { closed = true; }
        public long lastRx() { return System.currentTimeMillis(); }
        public long bytesIn() { return 0; }
        int count(int type) { int n = 0; synchronized (got) { for (int[] g : got) if (g[0] == type) n++; } return n; }
        int first() { synchronized (got) { return got.isEmpty() ? -1 : got.get(0)[0]; } }
    }

    static Session viewer(String name, Screen sc) {
        Session s = new Session(name, true, Crypto.random(32), null);
        s.peerName = name;
        s.stream = sc;
        return s;
    }

    static byte[] frame(boolean key, int size) { byte[] b = new byte[size]; b[0] = (byte) (key ? 1 : 0); return b; }

    static void run() {
        test("room screen: every viewer gets the setup first, a slow one skips to key frames without holding up the others", () -> {
            AtomicInteger keys = new AtomicInteger();
            StreamFan fan = new StreamFan(keys::incrementAndGet);
            Screen fastS = new Screen(0), slowS = new Screen(40);
            Session fast = viewer("fast", fastS), slow = viewer("slow", slowS);
            fan.send(Proto.VIDEO_CONFIG, new byte[] { 7, 7 }, true);
            fan.add(fast);
            fan.add(slow);
            check(keys.get() >= 2, "a key frame asked for each new viewer");
            fan.send(Proto.VIDEO_FRAME, frame(true, 1000), true);
            long t0 = System.currentTimeMillis();
            // a fast stream (far faster than a real screen), paced a little so a busy test machine doesn't make the
            // fast viewer look slow
            for (int i = 0; i < 200; i++) { fan.send(Proto.VIDEO_FRAME, frame(i % 60 == 59, 20_000), i % 60 == 59); Thread.sleep(1); }
            check(System.currentTimeMillis() - t0 < 1000, "sending never waits for a slow viewer");
            Thread.sleep(1500);
            check(fastS.first() == Proto.VIDEO_CONFIG && slowS.first() == Proto.VIDEO_CONFIG, "setup first");
            check(fastS.count(Proto.VIDEO_FRAME) == 201, "the fast viewer got every picture: " + fastS.count(Proto.VIDEO_FRAME));
            int slowGot = slowS.count(Proto.VIDEO_FRAME);
            check(slowGot < 120, "the slow one skipped pictures: " + slowGot);
            check(keys.get() >= 3, "and asked for a key frame");
            fan.stop();
        });

        test("room screen: a viewer whose screen connection came back gets the setup again; a viewer that left gets nothing", () -> {
            StreamFan fan = new StreamFan(() -> { });
            Screen a = new Screen(0), b = new Screen(0);
            Session va = viewer("a", a), vb = viewer("b", b);
            fan.send(Proto.VIDEO_CONFIG, new byte[] { 1 }, true);
            fan.send(Proto.AUDIO_CONFIG, new byte[] { 2 }, true);
            fan.add(va);
            fan.add(vb);
            fan.send(Proto.VIDEO_FRAME, frame(true, 100), true);
            Thread.sleep(200);
            fan.remove(vb);
            va.stream = new Screen(0);
            Screen a2 = (Screen) va.stream;
            fan.ready(va);
            fan.send(Proto.VIDEO_FRAME, frame(false, 100), false);
            fan.send(Proto.VIDEO_FRAME, frame(true, 100), true);
            Thread.sleep(200);
            check(a2.count(Proto.VIDEO_CONFIG) == 1 && a2.count(Proto.AUDIO_CONFIG) == 1, "setup again");
            check(a2.count(Proto.VIDEO_FRAME) == 1, "from the next key frame only: " + a2.count(Proto.VIDEO_FRAME));
            check(b.count(Proto.VIDEO_FRAME) == 1, "nothing after leaving: " + b.count(Proto.VIDEO_FRAME));
            check(fan.size() == 1, "one viewer left");
            fan.stop();
        });
    }
}
