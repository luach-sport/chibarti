package com.luachsport.chibarti;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.Socket;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * One encrypted TCP connection after the handshake. Every frame is AES-256-GCM with its own counter:
 * [length 4][ciphertext of (type 1 + body)][tag 16]. A changed, replayed or reordered frame fails the tag check
 * and closes the connection. Plain Java (tested on a PC).
 */
final class SecureLink implements Link {
    static final int MAX_FRAME = 8 * 1024 * 1024;

    final Socket socket;
    private final DataInputStream in;
    private final DataOutputStream out;
    private final SecretKeySpec sendKey, recvKey;
    private final byte sendDir, recvDir;
    private final Cipher enc, dec;
    private long sendCtr = 0, recvCtr = 0;
    private volatile boolean closed = false;
    private volatile long lastRx = System.currentTimeMillis();
    private volatile long bytesOut = 0, bytesIn = 0;

    SecureLink(Socket socket, byte[] sendKey, byte[] recvKey, boolean client) throws IOException {
        this.socket = socket;
        this.in = new DataInputStream(new BufferedInputStream(socket.getInputStream(), 64 * 1024));
        this.out = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream(), 64 * 1024));
        this.sendKey = new SecretKeySpec(sendKey, "AES");
        this.recvKey = new SecretKeySpec(recvKey, "AES");
        this.sendDir = (byte) (client ? 'C' : 'S');
        this.recvDir = (byte) (client ? 'S' : 'C');
        try {
            enc = Cipher.getInstance("AES/GCM/NoPadding");
            dec = Cipher.getInstance("AES/GCM/NoPadding");
        } catch (Exception e) { throw new IOException("no-aes-gcm", e); }
    }

    private static byte[] nonce(byte dir, long ctr) {
        byte[] n = new byte[12];
        n[0] = dir; n[1] = 'H'; n[2] = 'B'; n[3] = 1;
        for (int i = 0; i < 8; i++) n[4 + i] = (byte) (ctr >>> (56 - 8 * i));
        return n;
    }

    @Override public void send(int type, byte[] body) throws IOException { send(type, body, 0, body == null ? 0 : body.length); }

    @Override public synchronized void send(int type, byte[] body, int off, int len) throws IOException {
        if (closed) throw new IOException("closed");
        byte[] plain = new byte[1 + len];
        plain[0] = (byte) type;
        if (len > 0) System.arraycopy(body, off, plain, 1, len);
        byte[] ct;
        try {
            enc.init(Cipher.ENCRYPT_MODE, sendKey, new GCMParameterSpec(128, nonce(sendDir, sendCtr++)));
            ct = enc.doFinal(plain);
        } catch (Exception e) { throw new IOException("encrypt", e); }
        out.writeInt(ct.length);
        out.write(ct);
        out.flush();
        bytesOut += ct.length + 4;
    }

    /** Blocks until the next frame. Throws on a closed, broken or tampered connection. */
    @Override public Frame read() throws IOException {
        int len = in.readInt();
        if (len < 17 || len > MAX_FRAME) throw new IOException("bad-frame-size " + len);
        byte[] ct = new byte[len];
        in.readFully(ct);
        byte[] plain;
        try {
            dec.init(Cipher.DECRYPT_MODE, recvKey, new GCMParameterSpec(128, nonce(recvDir, recvCtr++)));
            plain = dec.doFinal(ct);
        } catch (Exception e) { throw new IOException("tampered", e); }
        lastRx = System.currentTimeMillis();
        bytesIn += len + 4;
        byte[] body = new byte[plain.length - 1];
        System.arraycopy(plain, 1, body, 0, body.length);
        return new Frame(plain[0] & 255, body);
    }

    @Override public boolean isClosed() { return closed; }
    @Override public long lastRx() { return lastRx; }
    @Override public long bytesIn() { return bytesIn; }
    @Override public void setReadTimeout(int ms) throws IOException { socket.setSoTimeout(ms); }

    @Override public void close() {
        closed = true;
        try { socket.close(); } catch (Exception ignored) { }
    }
}
