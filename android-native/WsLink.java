package com.luachsport.chibarti;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;

/**
 * A computer's browser connected over HTTPS + WebSocket (RFC 6455). Each binary WebSocket message is one app
 * message: [type][body], exactly like SecureLink, so the rest of the app doesn't care who is on the other side.
 * TLS already encrypts and checks every byte. Plain Java (tested on a PC).
 */
final class WsLink implements Link {
    static final int MAX = 8 * 1024 * 1024;
    final Socket socket;
    private final DataInputStream in;
    private final OutputStream out;
    private volatile boolean closed = false;
    private volatile long lastRx = System.currentTimeMillis(), bytesIn = 0;
    String remoteIp = "";

    WsLink(Socket socket, InputStream in) throws IOException {
        this.socket = socket;
        this.in = new DataInputStream(in);
        this.out = new BufferedOutputStream(socket.getOutputStream(), 64 * 1024);
    }

    @Override public void send(int type, byte[] body) throws IOException { send(type, body, 0, body == null ? 0 : body.length); }

    @Override public synchronized void send(int type, byte[] body, int off, int len) throws IOException {
        if (closed) throw new IOException("closed");
        writeHeader(0x2, len + 1);
        out.write(type);
        if (len > 0) out.write(body, off, len);
        out.flush();
    }

    private void writeHeader(int opcode, long n) throws IOException {
        out.write(0x80 | opcode);
        if (n < 126) out.write((int) n);
        else if (n < 65536) { out.write(126); out.write((int) (n >> 8)); out.write((int) (n & 255)); }
        else { out.write(127); for (int i = 7; i >= 0; i--) out.write((int) ((n >> (8 * i)) & 255)); }
    }

    private synchronized void control(int opcode, byte[] payload) throws IOException {
        writeHeader(opcode, payload.length);
        out.write(payload);
        out.flush();
    }

    @Override public Frame read() throws IOException {
        ByteArrayOutputStream msg = null;
        while (true) {
            int b0 = in.readUnsignedByte(), b1 = in.readUnsignedByte();
            boolean fin = (b0 & 0x80) != 0, masked = (b1 & 0x80) != 0;
            int op = b0 & 0x0F;
            long n = b1 & 0x7F;
            if (n == 126) n = in.readUnsignedShort();
            else if (n == 127) n = in.readLong();
            if (n < 0 || n > MAX) throw new IOException("too-big");
            byte[] key = new byte[4];
            if (masked) in.readFully(key);
            else throw new IOException("unmasked"); // browsers always mask; anything else isn't a browser
            byte[] p = new byte[(int) n];
            in.readFully(p);
            for (int i = 0; i < p.length; i++) p[i] ^= key[i & 3];
            lastRx = System.currentTimeMillis();
            bytesIn += n + 6;
            if (op == 0x8) {
                // the browser closes: answer with one close frame, then hang up (a second one is an error for it)
                if (!closed) { closed = true; try { control(0x8, p.length >= 2 ? new byte[] { p[0], p[1] } : new byte[0]); } catch (Exception ignored) { } }
                try { socket.close(); } catch (Exception ignored) { }
                throw new IOException("closed");
            }
            if (op == 0x9) { control(0xA, p); continue; }
            if (op == 0xA || op == 0x1) continue;
            if (op != 0x2 && op != 0x0) throw new IOException("bad-opcode");
            if (msg == null) msg = new ByteArrayOutputStream(Math.max(16, p.length));
            msg.write(p, 0, p.length);
            if (msg.size() > MAX) throw new IOException("too-big");
            if (!fin) continue;
            byte[] all = msg.toByteArray();
            if (all.length < 1) { msg = null; continue; }
            byte[] body = new byte[all.length - 1];
            System.arraycopy(all, 1, body, 0, body.length);
            return new Frame(all[0] & 255, body);
        }
    }

    @Override public void setReadTimeout(int ms) throws IOException { socket.setSoTimeout(ms); }
    @Override public boolean isClosed() { return closed; }
    @Override public long lastRx() { return lastRx; }
    @Override public long bytesIn() { return bytesIn; }

    @Override public void close() {
        if (closed) return;
        closed = true;
        try { synchronized (this) { writeHeader(0x8, 2); out.write(0x03); out.write(0xE8); out.flush(); } } catch (Exception ignored) { }
        try { socket.close(); } catch (Exception ignored) { }
    }

    /** The answer that turns an HTTP request into a WebSocket. */
    static String accept(String key) {
        return Crypto.b64std(Crypto.sha1((key.trim() + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(Proto.UTF8)));
    }
}
