package com.luachsport.chibarti;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Unit tests for the parts of the Android code that are plain Java: the handshake and encryption, the one-time
 * codes and their expiry, the QR code contents, file pieces with SHA-256, cancel and resume, and automatic quality.
 * Run: bash tests/java/run.sh (needs a JDK; org.json comes from github.com/stleary/JSON-java).
 */
public class ChibartiTests {
    static int passed = 0, failed = 0;

    interface T { void run() throws Exception; }

    static void test(String name, T t) {
        try { t.run(); passed++; System.out.println("  ok   " + name); }
        catch (Throwable e) { failed++; System.out.println("  FAIL " + name + " -> " + e); }
    }

    static void check(boolean c, String what) { if (!c) throw new AssertionError(what); }

    static final String A = "0123456789abcdef0123456789abcdef", B = "fedcba9876543210fedcba9876543210";

    /** Runs the server handshake in a thread and the client in this one, over a real TCP socket. */
    static Handshake.Result[] pair(int mode, byte[] clientSecret, final byte[] serverSecret, final List<String> failures) throws Exception {
        final ServerSocket ss = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        final AtomicReference<Object> srv = new AtomicReference<>();
        Thread t = new Thread(() -> {
            Socket s = null;
            try {
                s = ss.accept();
                srv.set(Handshake.server(s, B, new Handshake.Secrets() {
                    public byte[] secretFor(int m, String id) { return serverSecret; }
                    public int refuseCode(int m, String id) { return Handshake.ERR_EXPIRED; }
                    public void failed(int m, String id) { if (failures != null) failures.add(id); }
                }));
            } catch (Exception e) {
                srv.set(e);
                if (s != null) { try { s.close(); } catch (Exception ignored) { } }
            }
        });
        t.start();
        Socket c = new Socket(InetAddress.getLoopbackAddress(), ss.getLocalPort());
        Handshake.Result cr;
        try { cr = Handshake.client(c, A, mode, clientSecret, B); }
        finally { t.join(3000); ss.close(); }
        Object s = srv.get();
        if (s instanceof Exception) throw (Exception) s;
        if (s == null) throw new IOException("server did not finish");
        return new Handshake.Result[] { cr, (Handshake.Result) s };
    }

    public static void main(String[] args) throws Exception {
        System.out.println("Chibarti protocol tests");

        test("base64url matches java.util.Base64 for many lengths", () -> {
            for (int n = 0; n < 70; n++) {
                byte[] b = Crypto.random(n);
                String mine = Crypto.b64(b), ref = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(b);
                check(mine.equals(ref), "encode " + n);
                check(Arrays.equals(Crypto.unb64(mine), b), "decode " + n);
            }
        });

        test("HKDF matches RFC 5869 test case 1", () -> {
            byte[] ikm = new byte[22]; Arrays.fill(ikm, (byte) 0x0b);
            byte[] okm = Crypto.hkdf(Crypto.unhex("000102030405060708090a0b0c"), ikm, Crypto.unhex("f0f1f2f3f4f5f6f7f8f9"), 42);
            check(Crypto.hex(okm).equals("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"), "okm");
        });

        test("QR handshake: both sides agree, messages flow both ways", () -> {
            byte[] tok = Crypto.random(16);
            Handshake.Result[] r = pair(Handshake.MODE_QR, tok, tok, null);
            check(r[0].peerId.equals(B) && r[1].peerId.equals(A), "ids");
            r[0].link.send(Proto.TEXT, "שלום".getBytes(Proto.UTF8));
            Link.Frame f = r[1].link.read();
            check(f.type == Proto.TEXT && f.text().equals("שלום"), "client to server");
            r[1].link.send(Proto.PONG, new byte[] { 1, 2, 3 });
            f = r[0].link.read();
            check(f.type == Proto.PONG && Arrays.equals(f.body, new byte[] { 1, 2, 3 }), "server to client");
            r[0].link.close(); r[1].link.close();
        });

        test("wrong 6-digit code is refused on both sides and counted", () -> {
            List<String> fails = new ArrayList<>();
            try {
                pair(Handshake.MODE_PIN, "123456".getBytes(Proto.UTF8), "654321".getBytes(Proto.UTF8), fails);
                throw new AssertionError("should fail");
            } catch (Handshake.AuthException e) {
                check(e.code == Handshake.ERR_CODE, "code " + e.code);
            }
            check(fails.size() == 1 && fails.get(0).equals(A), "server counted the failure");
        });

        test("expired or unknown secret is refused before any key exchange", () -> {
            try { pair(Handshake.MODE_QR, Crypto.random(16), null, null); throw new AssertionError("should fail"); }
            catch (Handshake.AuthException e) { check(e.code == Handshake.ERR_EXPIRED, "code " + e.code); }
        });

        test("a phone claiming a different host id is rejected", () -> {
            final ServerSocket ss = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
            byte[] tok = Crypto.random(16);
            Thread t = new Thread(() -> {
                try (Socket s = ss.accept()) {
                    Handshake.server(s, B, new Handshake.Secrets() {
                        public byte[] secretFor(int m, String id) { return tok; }
                        public int refuseCode(int m, String id) { return 0; }
                        public void failed(int m, String id) { }
                    });
                } catch (Exception ignored) { }
            });
            t.start();
            try (Socket c = new Socket(InetAddress.getLoopbackAddress(), ss.getLocalPort())) {
                Handshake.client(c, A, Handshake.MODE_QR, tok, A);
                throw new AssertionError("should fail");
            } catch (Handshake.AuthException e) {
                check(e.code == Handshake.ERR_UNKNOWN, "code");
            } finally { t.join(2000); ss.close(); }
        });

        test("a changed byte on the wire is detected (tampered frame)", () -> {
            byte[] key = Crypto.random(32);
            ByteArrayOutputStream wire = new ByteArrayOutputStream();
            SecureLink w = new SecureLink(fake(new ByteArrayInputStream(new byte[0]), wire), key, key, true);
            w.send(Proto.TEXT, "hello".getBytes(Proto.UTF8));
            byte[] bytes = wire.toByteArray();
            bytes[bytes.length - 3] ^= 1;
            // the reader is the other direction: same key, opposite role so the nonce matches
            SecureLink r = new SecureLink(fake(new ByteArrayInputStream(bytes), new ByteArrayOutputStream()), key, key, false);
            try { r.read(); throw new AssertionError("should fail"); } catch (IOException e) { check(e.getMessage().equals("tampered"), e.getMessage()); }
        });

        test("a replayed frame is detected (counter)", () -> {
            byte[] key = Crypto.random(32);
            ByteArrayOutputStream wire = new ByteArrayOutputStream();
            SecureLink w = new SecureLink(fake(new ByteArrayInputStream(new byte[0]), wire), key, key, true);
            w.send(Proto.TEXT, "one".getBytes(Proto.UTF8));
            byte[] once = wire.toByteArray();
            byte[] twice = new byte[once.length * 2];
            System.arraycopy(once, 0, twice, 0, once.length);
            System.arraycopy(once, 0, twice, once.length, once.length);
            SecureLink r = new SecureLink(fake(new ByteArrayInputStream(twice), new ByteArrayOutputStream()), key, key, false);
            check(r.read().text().equals("one"), "first");
            try { r.read(); throw new AssertionError("replay accepted"); } catch (IOException e) { check(true, ""); }
        });

        test("one-time codes expire after 10 minutes and five wrong tries renew the code", () -> {
            final long[] now = { 1_000_000 };
            Pairing p = new Pairing(() -> now[0]);
            String pin = p.pin(), tok = p.token();
            check(pin.matches("[0-9]{6}"), "pin format");
            check(Crypto.unb64(tok).length == 16, "token 128 bit");
            check(p.secretFor(Handshake.MODE_PIN) != null, "valid");
            now[0] += Pairing.TTL_MS - 1;
            check(p.secretFor(Handshake.MODE_QR) != null, "still valid");
            now[0] += 2;
            check(p.secretFor(Handshake.MODE_QR) == null && p.secretFor(Handshake.MODE_PIN) == null, "expired");
            check(p.refreshIfExpired() && !p.token().equals(tok), "renewed");
            for (int i = 0; i < 4; i++) check(!p.failed(), "not yet");
            String before = p.token();
            check(p.failed() && !p.token().equals(before), "renewed after 5");
            check(p.secretFor(Handshake.MODE_TRUSTED) == null, "no other modes");
        });

        test("QR code: round trip and every bad field is refused", () -> {
            QrPayload q = new QrPayload();
            q.id = A; q.name = "גלקסי של דני"; q.token = Crypto.b64(Crypto.random(16)); q.method = "d";
            q.ssid = "DIRECT-ab-Galaxy"; q.pass = "s3cretPass"; q.addresses.add("192.168.49.1"); q.addresses.add("10.0.0.7");
            q.port = 47821; q.expiresSec = 2_000_000_000L;
            String text = q.build();
            QrPayload r = QrPayload.parse(text, 1_700_000_000L);
            check(r.name.equals(q.name) && r.ssid.equals(q.ssid) && r.pass.equals(q.pass) && r.addresses.size() == 2 && r.port == 47821, "fields");
            String[][] bad = {
                { text.replace("v=1", "v=2"), "version" }, { text.replace("chibarti://", "http://"), "not-ours" },
                { text.replace("p=47821", "p=80"), "port" }, { text.replace("192.168.49.1", "999.1.1.1"), "address" },
                { text.replace("&t=" + q.token, "&t=abc"), "token" }, { text.replace("&k=s3cretPass", "&k=short"), "pass" },
                { text.replace("m=d", "m=x"), "method" }
            };
            for (String[] b : bad) {
                try { QrPayload.parse(b[0], 1_700_000_000L); throw new AssertionError("accepted " + b[1]); }
                catch (IllegalArgumentException e) { check(e.getMessage().equals(b[1]), b[1] + " got " + e.getMessage()); }
            }
            try { QrPayload.parse(text, 2_000_000_001L); throw new AssertionError("expired accepted"); }
            catch (IllegalArgumentException e) { check(e.getMessage().equals("expired"), "expired"); }
        });

        test("file names from the other phone are made safe", () -> {
            check(IncomingJob.safeName("../../etc/passwd").equals("passwd"), "path");
            check(IncomingJob.safeName("..\\x\\.hidden").equals("hidden"), "hidden");
            check(IncomingJob.safeName("a:b*c?.txt").equals("a_b_c_.txt"), "chars");
            check(IncomingJob.safeName("").equals("file"), "empty");
            String longName = new String(new char[300]).replace('\0', 'x') + ".pdf";
            String s = IncomingJob.safeName(longName);
            check(s.length() == 120 && s.endsWith(".pdf"), "long");
        });

        test("3 MB file + empty file arrive whole, SHA-256 checked", () -> {
            byte[] big = Crypto.random(3 * 1024 * 1024 + 123);
            Mem m = new Mem();
            OutgoingJob out = new OutgoingJob(7);
            out.items.add(new OutgoingJob.Item(1, "video.mp4", "video/mp4", big.length, () -> new ByteArrayInputStream(big)));
            out.items.add(new OutgoingJob.Item(2, "empty.txt", "text/plain", 0, () -> new ByteArrayInputStream(new byte[0])));
            IncomingJob in = new IncomingJob(7, m);
            in.items.add(new IncomingJob.Item(1, "video.mp4", "video/mp4", big.length));
            in.items.add(new IncomingJob.Item(2, "empty.txt", "text/plain", 0));
            out.run(wire(in, out, -1));
            check(in.finished() && out.finished(), "finished");
            check(Arrays.equals(m.files.get("video.mp4").toByteArray(), big), "content");
            check(m.committed.contains("video.mp4") && m.committed.contains("empty.txt"), "kept");
            check(in.item(1).state == IncomingJob.DONE && out.items.get(0).state == OutgoingJob.DONE, "states");
            check(out.items.get(0).sha.equals(Crypto.hex(MessageDigest.getInstance("SHA-256").digest(big))), "sha");
        });

        test("a corrupted piece fails the check and the file is deleted", () -> {
            byte[] data = Crypto.random(200_000);
            Mem m = new Mem();
            OutgoingJob out = new OutgoingJob(1);
            out.items.add(new OutgoingJob.Item(1, "a.bin", "", data.length, () -> new ByteArrayInputStream(data)));
            IncomingJob in = new IncomingJob(1, m);
            in.items.add(new IncomingJob.Item(1, "a.bin", "", data.length));
            out.run(wire(in, out, 1));
            check(in.item(1).state == IncomingJob.FAILED && "hash".equals(in.item(1).error), "hash failure");
            check(m.aborted.contains("a.bin") && !m.committed.contains("a.bin"), "deleted");
            check(out.items.get(0).state == OutgoingJob.FAILED, "sender told");
        });

        test("pieces out of order or past the size are refused", () -> {
            IncomingJob in = new IncomingJob(1, new Mem());
            in.items.add(new IncomingJob.Item(1, "x", "", 10));
            byte[] d = new byte[20];
            try { in.onChunk(1, 5, d, 0, 5); throw new AssertionError("gap accepted"); } catch (IOException e) { check(e.getMessage().equals("out-of-order"), "gap"); }
            try { in.onChunk(1, 0, d, 0, 11); throw new AssertionError("too long accepted"); } catch (IOException e) { check(e.getMessage().equals("too-long"), "long"); }
            try { in.onChunk(9, 0, d, 0, 1); throw new AssertionError("unknown accepted"); } catch (IOException e) { check(true, ""); }
        });

        test("cancel stops the sender and deletes the half-received file", () -> {
            byte[] data = Crypto.random(1_000_000);
            Mem m = new Mem();
            final OutgoingJob out = new OutgoingJob(3);
            out.items.add(new OutgoingJob.Item(1, "big.zip", "", data.length, () -> new ByteArrayInputStream(data)));
            final IncomingJob in = new IncomingJob(3, m);
            in.items.add(new IncomingJob.Item(1, "big.zip", "", data.length));
            OutgoingJob.Wire w = wire(in, out, -1);
            try {
                out.run(new OutgoingJob.Wire() {
                    int n = 0;
                    public void chunk(int t, int f, long o, byte[] b, int l) throws IOException { w.chunk(t, f, o, b, l); if (++n == 4) { out.cancelled = true; in.cancel("cancelled"); } }
                    public void end(int t, int f, long s, String h) throws IOException { w.end(t, f, s, h); }
                });
                throw new AssertionError("should stop");
            } catch (OutgoingJob.Cancelled e) { check(true, ""); }
            check(m.aborted.contains("big.zip") && in.item(1).state == IncomingJob.FAILED, "partial deleted");
        });

        test("resume after a dropped connection continues from the last piece, hash still whole", () -> {
            byte[] data = Crypto.random(900_000);
            Mem m = new Mem();
            OutgoingJob first = new OutgoingJob(4);
            first.items.add(new OutgoingJob.Item(1, "r.bin", "", data.length, () -> new ByteArrayInputStream(data)));
            IncomingJob in = new IncomingJob(4, m);
            in.items.add(new IncomingJob.Item(1, "r.bin", "", data.length));
            OutgoingJob.Wire w = wire(in, first, -1);
            try {
                first.run(new OutgoingJob.Wire() {
                    int n = 0;
                    public void chunk(int t, int f, long o, byte[] b, int l) throws IOException { if (++n == 6) throw new IOException("link-lost"); w.chunk(t, f, o, b, l); }
                    public void end(int t, int f, long s, String h) throws IOException { w.end(t, f, s, h); }
                });
            } catch (IOException e) { check(e.getMessage().equals("link-lost"), "dropped"); }
            long have = in.item(1).received;
            check(have == 5L * Proto.CHUNK_SIZE, "received before drop " + have);
            first.resumeAt.put(1, have);
            first.run(wire(in, first, -1));
            check(in.item(1).state == IncomingJob.DONE, "done after resume");
            check(Arrays.equals(m.files.get("r.bin").toByteArray(), data), "content whole");
        });

        test("pieces over the real encrypted connection", () -> {
            byte[] tok = Crypto.random(16);
            Handshake.Result[] r = pair(Handshake.MODE_QR, tok, tok, null);
            byte[] data = Crypto.random(700_000);
            Mem m = new Mem();
            IncomingJob in = new IncomingJob(9, m);
            in.items.add(new IncomingJob.Item(1, "net.bin", "", data.length));
            OutgoingJob out = new OutgoingJob(9);
            out.items.add(new OutgoingJob.Item(1, "net.bin", "", data.length, () -> new ByteArrayInputStream(data)));
            Thread rx = new Thread(() -> {
                try {
                    while (true) {
                        Link.Frame f = r[1].link.read();
                        if (f.type == Proto.CHUNK) {
                            java.nio.ByteBuffer b = java.nio.ByteBuffer.wrap(f.body);
                            b.getInt(); int fid = b.getInt(); long off = b.getLong();
                            in.onChunk(fid, off, f.body, 16, f.body.length - 16);
                        } else if (f.type == Proto.FILE_END) {
                            org.json.JSONObject o = new org.json.JSONObject(f.text());
                            in.onEnd(o.getInt("fid"), o.getLong("size"), o.getString("sha"));
                            return;
                        }
                    }
                } catch (Exception e) { throw new RuntimeException(e); }
            });
            rx.start();
            out.run(new OutgoingJob.Wire() {
                public void chunk(int t, int f, long o, byte[] b, int l) throws IOException { r[0].link.send(Proto.CHUNK, Proto.chunk(t, f, o, b, l)); }
                public void end(int t, int f, long s, String h) throws IOException {
                    try { r[0].link.send(Proto.FILE_END, Proto.json(new org.json.JSONObject().put("tid", t).put("fid", f).put("size", s).put("sha", h))); } catch (org.json.JSONException e) { throw new IOException(e); }
                }
            });
            rx.join(5000);
            check(in.item(1).state == IncomingJob.DONE && Arrays.equals(m.files.get("net.bin").toByteArray(), data), "arrived");
            r[0].link.close(); r[1].link.close();
        });

        test("automatic quality: lowers fast when behind, climbs back slowly when calm", () -> {
            RateControl rc = new RateControl(4_000_000, true);
            long t = 10_000;
            rc.tick(t, 0);
            int down = rc.tick(t + 1100, 500_000);
            check(down == 3_000_000, "down to 75%: " + down);
            check(rc.tick(t + 1200, 500_000) == 0, "no second step within a second");
            int r = 0;
            for (long x = t + 2000; x < t + 12000; x += 100) { int v = rc.tick(x, 0); if (v > 0) r = v; }
            check(r > 3_000_000 && r <= 4_000_000, "climbed back: " + r);
            RateControl off = new RateControl(4_000_000, false);
            check(off.tick(t, 10_000_000) == 0, "manual quality never changes");
            check(rc.dropThreshold() >= 60_000, "drop threshold");
        });

        test("video config packet round trip", () -> {
            byte[] sps = Crypto.random(23), pps = Crypto.random(5);
            Proto.Config c = new Proto.Config(Proto.config(1280, 720, sps, pps));
            check(c.a == 1280 && c.b == 720 && Arrays.equals(c.csd0, sps) && Arrays.equals(c.csd1, pps), "fields");
            try { new Proto.Config(new byte[] { 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 99 }); throw new AssertionError("bad accepted"); }
            catch (IllegalArgumentException e) { check(true, ""); }
        });

        test("computer page: WebSocket accept key matches RFC 6455", () -> {
            check(WsLink.accept("dGhlIHNhbXBsZSBub25jZQ==").equals("s3pPLMBiTxaQ9kYGzzhZRbK+xOo="), WsLink.accept("dGhlIHNhbXBsZSBub25jZQ=="));
        });

        test("computer page: the phone's own certificate is valid, kept, and its fingerprint stable", () -> {
            java.io.File dir = java.nio.file.Files.createTempDirectory("tls").toFile();
            Tls a = Tls.load(dir), b = Tls.load(dir);
            check(a.fingerprint.equals(b.fingerprint), "same certificate after restart");
            a.cert.checkValidity();
            a.cert.verify(a.cert.getPublicKey());
            check(a.cert.getSubjectX500Principal().getName().contains("CN="), "name");
            check(a.context.getServerSocketFactory() != null, "TLS ready");
        });

        test("computer page: a WebSocket message goes both ways over TLS (masked, fragmented, close)", () -> {
            java.io.File dir = java.nio.file.Files.createTempDirectory("tls").toFile();
            Tls tls = Tls.load(dir);
            final WsLink[] got = new WsLink[1];
            final java.util.concurrent.CountDownLatch in = new java.util.concurrent.CountDownLatch(1);
            WebServer w = new WebServer(tls, (path) -> new java.io.ByteArrayInputStream("<p>ok</p>".getBytes("UTF-8")), (link) -> { got[0] = link; in.countDown(); });
            w.start();
            try {
                javax.net.ssl.SSLContext trustAll = javax.net.ssl.SSLContext.getInstance("TLS");
                trustAll.init(null, new javax.net.ssl.TrustManager[] { new javax.net.ssl.X509TrustManager() {
                    public void checkClientTrusted(java.security.cert.X509Certificate[] c, String a) { }
                    public void checkServerTrusted(java.security.cert.X509Certificate[] c, String a) { }
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() { return new java.security.cert.X509Certificate[0]; }
                } }, null);
                java.net.Socket sk = trustAll.getSocketFactory().createSocket("127.0.0.1", w.httpsPort);
                java.io.OutputStream o = sk.getOutputStream();
                java.io.InputStream i = sk.getInputStream();
                o.write(("GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n").getBytes("UTF-8"));
                StringBuilder head = new StringBuilder();
                while (!head.toString().endsWith("\r\n\r\n")) head.append((char) i.read());
                check(head.toString().startsWith("HTTP/1.1 101") && head.toString().contains("s3pPLMBiTxaQ9kYGzzhZRbK+xOo="), head.toString());
                check(in.await(3, java.util.concurrent.TimeUnit.SECONDS), "page socket handed over");
                // a browser frame: binary, masked, in two pieces: [TEXT]["שלום"]
                byte[] msg = ((char) Proto.TEXT + "שלום").getBytes("UTF-8");
                byte[] key = { 9, 8, 7, 6 };
                int half = msg.length / 2;
                for (int part = 0; part < 2; part++) {
                    int from = part == 0 ? 0 : half, to = part == 0 ? half : msg.length;
                    o.write(part == 0 ? 0x02 : 0x80);
                    o.write(0x80 | (to - from));
                    o.write(key);
                    for (int k = from; k < to; k++) o.write(msg[k] ^ key[(k - from) & 3]);
                }
                o.flush();
                Link.Frame f = got[0].read();
                check(f.type == Proto.TEXT && f.text().equals("שלום"), "page to phone: " + f.type);
                got[0].send(Proto.PONG, new byte[] { 1, 2, 3 });
                check(i.read() == 0x82 && i.read() == 4 && i.read() == Proto.PONG && i.read() == 1 && i.read() == 2 && i.read() == 3, "phone to page");
                // the page closes: exactly one close frame comes back
                o.write(0x88); o.write(0x82); o.write(key); o.write(0x03 ^ 9); o.write(0xE8 ^ 8); o.flush();
                try { got[0].read(); throw new AssertionError("read after close"); } catch (IOException e) { check(true, ""); }
                check(i.read() == 0x88, "close frame");
                int n = i.read();
                for (int k = 0; k < n; k++) i.read();
                check(i.read() == -1, "only one close frame");
                sk.close();
            } finally { w.stop(); }
        });

        System.out.println(passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }

    // ---------- helpers ----------
    /** Received files in memory. */
    static final class Mem implements IncomingJob.Sinks {
        final java.util.Map<String, ByteArrayOutputStream> files = new java.util.HashMap<>();
        final List<String> committed = new ArrayList<>(), aborted = new ArrayList<>();
        public IncomingJob.Sink create(final IncomingJob.Item it) {
            final ByteArrayOutputStream b = new ByteArrayOutputStream();
            files.put(it.name, b);
            return new IncomingJob.Sink() {
                public OutputStream out() { return b; }
                public void commit() { committed.add(it.name); }
                public void abort() { aborted.add(it.name); files.remove(it.name); }
                public String location() { return "mem:" + it.name; }
            };
        }
    }

    /** Connects a sender straight to a receiver; corruptChunk >= 0 flips a byte in that piece. */
    static OutgoingJob.Wire wire(final IncomingJob in, final OutgoingJob out, final int corruptChunk) {
        return new OutgoingJob.Wire() {
            int n = 0;
            public void chunk(int t, int f, long o, byte[] b, int l) throws IOException {
                byte[] c = Arrays.copyOf(b, l);
                if (n++ == corruptChunk) c[l / 2] ^= 0x40;
                in.onChunk(f, o, c, 0, l);
            }
            public void end(int t, int f, long s, String h) {
                String err = in.onEnd(f, s, h);
                out.acked(f, err == null, err);
            }
        };
    }

    static Socket fake(final java.io.InputStream in, final OutputStream out) {
        return new Socket() {
            public java.io.InputStream getInputStream() { return in; }
            public OutputStream getOutputStream() { return out; }
        };
    }
}
