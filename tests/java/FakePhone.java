package com.luachsport.chibarti;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A pretend phone on a PC, for testing the computer page (www/pc/) with the real WebServer, Tls and WsLink:
 * code 246810, approves at once, echoes messages, receives and sends files, sends a test H.264 picture and records
 * the picture the page sends. Commands come as messages from the page ("/send 2500000", "/share", "/drop", ...).
 * Everything that happens is printed as one line ("GOT name 3000000 ok") for tests/pc.test.mjs.
 * Run: java FakePhone <www dir> <out dir> <phone.h264>
 */
public final class FakePhone {
    static final String PIN = "246810", KEY = "c2Vzc2lvbi1rZXk=", PAIR = "cGFpci1rZXk=";
    static volatile WsLink main, stream;
    static File www, out;
    static byte[] h264;
    static final PrintStream log = utf8();

    static PrintStream utf8() { try { return new PrintStream(System.out, true, "UTF-8"); } catch (Exception e) { return System.out; } }
    static final Map<Integer, MessageDigest> inSha = new HashMap<>();
    static final Map<Integer, FileOutputStream> inFile = new HashMap<>();
    static final Map<Integer, Long> inAt = new HashMap<>();
    static final Map<Integer, String> inName = new HashMap<>();
    static volatile boolean sharing = false, keyWanted = false;
    static volatile int vFrames = 0, vKeys = 0, aFrames = 0;
    static volatile FileOutputStream rec;
    static volatile String audioHead = "";

    public static void main(String[] a) throws Exception {
        www = new File(a[0]);
        out = new File(a[1]);
        out.mkdirs();
        h264 = a.length > 2 ? read(new File(a[2])) : new byte[0];
        Tls tls = Tls.load(new File(out, "tls"));
        WebServer w = new WebServer(tls, (path) -> {
            String rel = path.startsWith("fonts/") || "icon.png".equals(path) || "logo.svg".equals(path) ? path : "pc/" + path;
            return new FileInputStream(new File(www, rel));
        }, FakePhone::socket);
        w.start();
        log.println("READY " + w.httpPort + " " + w.httpsPort + " " + tls.fingerprint);
        Thread.sleep(Long.MAX_VALUE);
    }

    static byte[] read(File f) throws Exception {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toByteArray();
        }
    }

    static void send(WsLink l, int type, JSONObject o) { try { l.send(type, Proto.json(o)); } catch (Exception e) { log.println("SEND-FAIL " + type); } }

    static void socket(WsLink link) {
        try {
            Link.Frame f = link.read();
            if (f.type != Proto.HELLO) { link.close(); return; }
            JSONObject h = new JSONObject(f.text());
            String mode = h.optString("mode");
            log.println("HELLO " + mode + " " + h.optString("name"));
            JSONObject ok = new JSONObject().put("key", KEY).put("pair", "").put("name", "Redmi Note 8").put("model", "Redmi Note 8").put("sdk", 28).put("app", 1).put("id", "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0");
            switch (mode) {
                case "pin":
                    if (!PIN.equals(h.optString("pin"))) { Thread.sleep(300); send(link, Proto.DENIED, new JSONObject().put("reason", "wrong-code")); link.close(); return; }
                    ok.put("pair", PAIR);
                    break;
                case "trusted":
                    if (!PAIR.equals(h.optString("key"))) { send(link, Proto.DENIED, new JSONObject().put("reason", "unknown")); link.close(); return; }
                    break;
                case "resume": case "stream":
                    if (!KEY.equals(h.optString("key"))) { send(link, Proto.DENIED, new JSONObject().put("reason", "unknown")); link.close(); return; }
                    send(link, Proto.APPROVED, new JSONObject().put("resumed", true));
                    if ("stream".equals(mode)) { stream = link; streamReader(link); return; }
                    break;
                default: link.close(); return;
            }
            if (!"resume".equals(mode)) send(link, Proto.APPROVED, ok);
            main = link;
            log.println("CONNECTED " + mode);
            pinger(link);
            while (!link.isClosed()) onMessage(link.read());
        } catch (Exception e) {
            log.println("LINK-CLOSED");
        }
    }

    static void pinger(final WsLink l) {
        Thread t = new Thread(() -> {
            while (!l.isClosed()) {
                try { Thread.sleep(2500); l.send(Proto.PING, Proto.json(new JSONObject().put("t", System.currentTimeMillis()))); } catch (Exception e) { return; }
            }
        });
        t.setDaemon(true);
        t.start();
    }

    static void onMessage(Link.Frame f) throws Exception {
        WsLink l = main;
        if (f.type == Proto.CHUNK) { chunk(f.body); return; }
        JSONObject o = new JSONObject(f.text());
        switch (f.type) {
            case Proto.PING: l.send(Proto.PONG, f.body); break;
            case Proto.PONG: break;
            case Proto.TEXT: text(o.optString("text")); break;
            case Proto.OFFER: {
                JSONArray files = o.getJSONArray("files");
                for (int i = 0; i < files.length(); i++) {
                    JSONObject x = files.getJSONObject(i);
                    int fid = x.getInt("fid");
                    inSha.put(fid, MessageDigest.getInstance("SHA-256"));
                    inFile.put(fid, new FileOutputStream(new File(out, "in-" + fid + ".bin")));
                    inAt.put(fid, 0L);
                    inName.put(fid, x.getString("name"));
                }
                log.println("OFFER " + o.getInt("tid") + " " + files.length() + " " + o.optLong("total"));
                send(l, Proto.OFFER_REPLY, new JSONObject().put("tid", o.getInt("tid")).put("accept", true));
                break;
            }
            case Proto.FILE_END: {
                int fid = o.getInt("fid");
                inFile.get(fid).close();
                String sha = hex(inSha.get(fid).digest());
                boolean good = sha.equals(o.optString("sha")) && o.optLong("size") == inAt.get(fid);
                log.println("GOT " + inName.get(fid).replace(' ', '_') + " " + inAt.get(fid) + " " + (good ? "ok" : "bad"));
                send(l, Proto.FILE_ACK, new JSONObject().put("tid", o.getInt("tid")).put("fid", fid).put("ok", good).put("error", good ? "" : "hash"));
                break;
            }
            case Proto.OFFER_REPLY:
                log.println("OFFER_REPLY " + o.optBoolean("accept"));
                if (o.optBoolean("accept")) sendFile(o.getInt("tid"));
                break;
            case Proto.FILE_ACK: log.println("ACK " + o.optInt("fid") + " " + o.optBoolean("ok")); break;
            case Proto.MIRROR_OFFER:
                log.println("MIRROR_OFFER " + o);
                vFrames = vKeys = aFrames = 0;
                rec = new FileOutputStream(new File(out, "from-pc.h264"));
                send(l, Proto.MIRROR_REPLY, new JSONObject().put("accept", true));
                break;
            case Proto.MIRROR_REPLY:
                log.println("MIRROR_REPLY " + o.optBoolean("accept"));
                if (o.optBoolean("accept")) shareScreen();
                break;
            case Proto.MIRROR_STOP:
                log.println("MIRROR_STOP v=" + vFrames + " k=" + vKeys + " a=" + aFrames);
                sharing = false;
                FileOutputStream r = rec;
                rec = null;
                if (r != null) r.close();
                break;
            case Proto.KEY_REQUEST: keyWanted = true; log.println("KEY_REQUEST"); break;
            case Proto.BYE: log.println("BYE " + o.optString("reason")); break;
            case Proto.CANCEL: log.println("CANCEL " + o.optString("reason")); break;
            default: log.println("MSG " + f.type);
        }
    }

    static void text(String t) throws Exception {
        log.println("TEXT " + t.replace('\n', ' '));
        WsLink l = main;
        if (t.startsWith("/send ")) {
            long n = Long.parseLong(t.substring(6).trim());
            JSONArray files = new JSONArray().put(new JSONObject().put("fid", 1).put("name", "סרטון מהטלפון.bin").put("mime", "application/octet-stream").put("size", n));
            pending = n;
            send(l, Proto.OFFER, new JSONObject().put("tid", 777).put("files", files).put("total", n).put("resume", false));
        } else if (t.equals("/share")) {
            send(l, Proto.MIRROR_OFFER, new JSONObject().put("quality", "standard").put("fps", 30).put("audio", false));
        } else if (t.equals("/stop")) {
            sharing = false;
            send(l, Proto.MIRROR_STOP, new JSONObject());
        } else if (t.equals("/drop")) {
            l.close();
        } else if (t.equals("/bye")) {
            send(l, Proto.BYE, new JSONObject().put("reason", "user"));
            l.close();
        } else {
            send(l, Proto.TEXT, new JSONObject().put("id", "abc123").put("text", "קיבלתי: " + t).put("ts", System.currentTimeMillis()));
        }
    }

    static volatile long pending = 0;

    /** The same bytes every time, so the test can check the file that the page saved. */
    static byte pattern(long i) { return (byte) ((i * 31 + (i >> 9)) & 255); }

    static void sendFile(final int tid) {
        new Thread(() -> {
            try {
                long n = pending;
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                for (long off = 0; off < n; off += 65536) {
                    int len = (int) Math.min(65536, n - off);
                    byte[] body = new byte[16 + len];
                    ByteBuffer b = ByteBuffer.wrap(body);
                    b.putInt(tid).putInt(1).putLong(off);
                    for (int i = 0; i < len; i++) body[16 + i] = pattern(off + i);
                    md.update(body, 16, len);
                    main.send(Proto.CHUNK, body);
                }
                main.send(Proto.FILE_END, Proto.json(new JSONObject().put("tid", tid).put("fid", 1).put("size", n).put("sha", hex(md.digest()))));
                log.println("SENT " + n);
            } catch (Exception e) { log.println("SEND-FILE-FAIL " + e); }
        }).start();
    }

    // ---------- this "phone" shares its screen: a test H.264 stream, 30 frames a second ----------
    static void shareScreen() {
        sharing = true;
        new Thread(() -> {
            try {
                for (int i = 0; i < 100 && stream == null; i++) Thread.sleep(50);
                WsLink st = stream;
                if (st == null) { log.println("NO-STREAM"); return; }
                List<byte[]> nals = nals(h264);
                byte[] sps = null, pps = null;
                List<byte[]> frames = new ArrayList<>();
                List<Boolean> keys = new ArrayList<>();
                for (byte[] n : nals) {
                    int t = n[4] & 31;
                    if (t == 7 && sps == null) sps = n;
                    else if (t == 8 && pps == null) pps = n;
                    else if (t == 5 || t == 1) { frames.add(n); keys.add(t == 5); }
                }
                ByteBuffer c = ByteBuffer.allocate(16 + sps.length + pps.length);
                c.putInt(720).putInt(1280).putInt(sps.length).put(sps).putInt(pps.length).put(pps);
                st.send(Proto.VIDEO_CONFIG, c.array());
                log.println("SHARING " + frames.size());
                long t0 = System.nanoTime() / 1000;
                int i = 0, sent = 0;
                while (sharing && stream == st && !st.isClosed()) {
                    int k = i % frames.size();
                    if (keyWanted && keys.get(k)) keyWanted = false;
                    byte[] d = frames.get(k);
                    ByteBuffer m = ByteBuffer.allocate(9 + d.length);
                    m.put((byte) (keys.get(k) ? 1 : 0)).putLong(System.nanoTime() / 1000).put(d);
                    st.send(Proto.VIDEO_FRAME, m.array());
                    sent++;
                    i++;
                    long next = t0 + (long) i * 33333;
                    long wait = next - System.nanoTime() / 1000;
                    if (wait > 0) Thread.sleep(wait / 1000, (int) (wait % 1000) * 1000);
                }
                log.println("SHARE-ENDED " + sent);
            } catch (Exception e) { log.println("SHARE-FAIL " + e); }
        }).start();
    }

    static List<byte[]> nals(byte[] u) {
        List<byte[]> out = new ArrayList<>();
        int s = -1;
        for (int i = 0; i + 3 < u.length; i++) {
            if (u[i] == 0 && u[i + 1] == 0 && u[i + 2] == 1) {
                if (s >= 0) { int e = u[i - 1] == 0 ? i - 1 : i; out.add(withStart(u, s, e)); }
                s = i + 3;
                i += 2;
            }
        }
        if (s >= 0) out.add(withStart(u, s, u.length));
        return out;
    }

    static byte[] withStart(byte[] u, int s, int e) {
        byte[] n = new byte[4 + e - s];
        n[3] = 1;
        System.arraycopy(u, s, n, 4, e - s);
        return n;
    }

    // ---------- the page's screen arriving here ----------
    static void streamReader(final WsLink l) {
        try {
            while (!l.isClosed()) {
                Link.Frame f = l.read();
                FileOutputStream r = rec;
                switch (f.type) {
                    case Proto.VIDEO_CONFIG: {
                        Proto.Config c = new Proto.Config(f.body);
                        log.println("VIDEO_CONFIG " + c.a + "x" + c.b + " " + (c.csd0[4] & 31) + " " + (c.csd1[4] & 31));
                        if (r != null) { r.write(c.csd0); r.write(c.csd1); }
                        break;
                    }
                    case Proto.VIDEO_FRAME:
                        vFrames++;
                        if ((f.body[0] & 1) != 0) vKeys++;
                        if (r != null) r.write(f.body, 9, f.body.length - 9);
                        if (vFrames % 30 == 0) log.println("STREAM v=" + vFrames + " k=" + vKeys + " a=" + aFrames);
                        break;
                    case Proto.AUDIO_OPUS_CONFIG: {
                        Proto.Config c = new Proto.Config(f.body);
                        audioHead = new String(c.csd0, 0, Math.min(8, c.csd0.length), "ISO-8859-1");
                        log.println("AUDIO_OPUS_CONFIG " + c.a + " " + c.b + " " + audioHead + " " + c.csd0.length);
                        break;
                    }
                    case Proto.AUDIO_FRAME: aFrames++; break;
                    default: log.println("STREAM-MSG " + f.type);
                }
            }
        } catch (Exception e) { /* closed */ }
        if (stream == l) stream = null;
        log.println("STREAM-CLOSED");
    }

    static void chunk(byte[] body) throws Exception {
        ByteBuffer b = ByteBuffer.wrap(body);
        b.getInt();
        int fid = b.getInt();
        long off = b.getLong();
        if (off != inAt.get(fid)) { log.println("CHUNK-ORDER " + off + " " + inAt.get(fid)); return; }
        inSha.get(fid).update(body, 16, body.length - 16);
        inFile.get(fid).write(body, 16, body.length - 16);
        inAt.put(fid, off + body.length - 16);
    }

    static String hex(byte[] d) {
        StringBuilder sb = new StringBuilder();
        for (byte x : d) sb.append(String.format("%02x", x & 255));
        return sb.toString();
    }
}
