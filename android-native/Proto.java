package com.luachsport.chibarti;

import java.nio.ByteBuffer;
import java.nio.charset.Charset;

/** Message types on the encrypted connection, and the small binary layouts. Plain Java. */
final class Proto {
    static final Charset UTF8 = Charset.forName("UTF-8");
    static final int PORT = 47821;      // TCP, the connection
    static final int BEACON_PORT = 47820; // UDP, "I'm here" on a shared Wi-Fi

    // control (JSON body)
    static final int HELLO = 1, APPROVED = 2, DENIED = 3, PING = 4, PONG = 5, BYE = 6;
    static final int TEXT = 10;
    static final int OFFER = 20, OFFER_REPLY = 21, CHUNK = 22, FILE_END = 23, FILE_ACK = 24, CANCEL = 25, PAUSE = 26, RESUME = 27;
    static final int MIRROR_OFFER = 30, MIRROR_REPLY = 31, MIRROR_STOP = 32, KEY_REQUEST = 33, MIRROR_STATS = 34;
    // stream connection (binary body)
    static final int VIDEO_CONFIG = 40, VIDEO_FRAME = 41, AUDIO_CONFIG = 42, AUDIO_FRAME = 43;

    static final int CHUNK_SIZE = 64 * 1024;

    private Proto() { }

    static byte[] json(org.json.JSONObject o) { return o.toString().getBytes(UTF8); }

    // CHUNK: [tid 4][fid 4][offset 8][data]
    static byte[] chunk(int tid, int fid, long offset, byte[] data, int len) {
        ByteBuffer b = ByteBuffer.allocate(16 + len);
        b.putInt(tid).putInt(fid).putLong(offset).put(data, 0, len);
        return b.array();
    }

    // VIDEO_FRAME / AUDIO_FRAME: [flags 1][pts µs 8][data]
    static byte[] media(int flags, long ptsUs, byte[] data, int off, int len) {
        ByteBuffer b = ByteBuffer.allocate(9 + len);
        b.put((byte) flags).putLong(ptsUs).put(data, off, len);
        return b.array();
    }

    // VIDEO_CONFIG: [w 4][h 4][csd0 len 4][csd0][csd1 len 4][csd1]   AUDIO_CONFIG: [rate 4][channels 4][csd len 4][csd][0 4]
    static byte[] config(int a, int b, byte[] csd0, byte[] csd1) {
        if (csd0 == null) csd0 = new byte[0];
        if (csd1 == null) csd1 = new byte[0];
        ByteBuffer buf = ByteBuffer.allocate(16 + csd0.length + csd1.length);
        buf.putInt(a).putInt(b).putInt(csd0.length).put(csd0).putInt(csd1.length).put(csd1);
        return buf.array();
    }

    static final class Config {
        final int a, b;
        final byte[] csd0, csd1;
        Config(byte[] body) {
            ByteBuffer buf = ByteBuffer.wrap(body);
            a = buf.getInt();
            b = buf.getInt();
            int n0 = buf.getInt();
            if (n0 < 0 || n0 > buf.remaining()) throw new IllegalArgumentException("config");
            csd0 = new byte[n0];
            buf.get(csd0);
            int n1 = buf.getInt();
            if (n1 < 0 || n1 > buf.remaining()) throw new IllegalArgumentException("config");
            csd1 = new byte[n1];
            buf.get(csd1);
        }
    }
}
