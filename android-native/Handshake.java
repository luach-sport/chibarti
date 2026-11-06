package com.luachsport.chibarti;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.security.KeyPair;

/**
 * The first bytes on every connection: fresh ECDH keys on both sides, mixed with a secret both phones know
 * (the one-time QR token, the 6-digit code, the key saved when two phones were paired, or the session key).
 * Both sides prove they know the secret (HMAC over the whole exchange) before anything else is sent, so a phone
 * that doesn't know it learns nothing and can't connect. Plain Java (tested on a PC).
 */
final class Handshake {
    static final int MODE_QR = 1, MODE_PIN = 2, MODE_TRUSTED = 3, MODE_RESUME = 4, MODE_STREAM = 5;
    static final int OK = 0, ERR_CODE = 2, ERR_UNKNOWN = 3, ERR_BUSY = 4, ERR_EXPIRED = 5, ERR_VERSION = 6;
    private static final byte[] MAGIC = { 'C', 'H', 'B', '1' };
    private static final int VERSION = 1;

    /** The server's side: which secret goes with this mode and client (null = refuse with the given code). */
    interface Secrets {
        byte[] secretFor(int mode, String clientId);
        int refuseCode(int mode, String clientId);
        void failed(int mode, String clientId);
    }

    static final class AuthException extends IOException {
        final int code;
        AuthException(int code) { super("auth-" + code); this.code = code; }
    }

    static final class Result {
        final SecureLink link;
        final String peerId;
        final int mode;
        Result(SecureLink link, String peerId, int mode) { this.link = link; this.peerId = peerId; this.mode = mode; }
    }

    private Handshake() { }

    static Result client(Socket s, String myId, int mode, byte[] secret, String expectServerId) throws IOException {
        s.setSoTimeout(15000);
        DataOutputStream out = new DataOutputStream(s.getOutputStream());
        DataInputStream in = new DataInputStream(s.getInputStream());
        KeyPair kp = Crypto.ecKeyPair();
        byte[] nonce = Crypto.random(16);
        byte[] hello = hello(mode, Crypto.unhex(myId), nonce, kp.getPublic().getEncoded());
        out.write(hello);
        out.flush();
        byte[] head = readFixed(in, 6);
        if (head[0] != 'C' || head[1] != 'H' || head[2] != 'B' || head[3] != '1') throw new IOException("not-chibarti");
        if ((head[5] & 255) != OK) throw new AuthException(head[5] & 255);
        byte[] rest = readFixed(in, 32);
        int pubLen = in.readUnsignedShort();
        if (pubLen < 32 || pubLen > 200) throw new IOException("bad-key-size");
        byte[] pub = readFixed(in, pubLen);
        String serverId = Crypto.hex(slice(rest, 0, 16));
        if (expectServerId != null && !expectServerId.equalsIgnoreCase(serverId)) throw new AuthException(ERR_UNKNOWN);
        byte[] serverHello = concat(head, rest, new byte[] { (byte) (pubLen >> 8), (byte) pubLen }, pub);
        byte[][] keys = derive(Crypto.ecdh(kp.getPrivate(), pub), secret, hello, serverHello);
        byte[] th = Crypto.sha256(hello, serverHello);
        out.write(Crypto.hmac(keys[2], new byte[] { 'C' }, th));
        out.flush();
        int status = in.read();
        if (status != OK) throw new AuthException(status < 0 ? ERR_CODE : status);
        byte[] proof = readFixed(in, 32);
        if (!Crypto.same(proof, Crypto.hmac(keys[2], new byte[] { 'S' }, th))) throw new AuthException(ERR_UNKNOWN);
        s.setSoTimeout(0);
        return new Result(new SecureLink(s, keys[0], keys[1], true), serverId, mode);
    }

    static Result server(Socket s, String myId, Secrets secrets) throws IOException {
        s.setSoTimeout(15000);
        DataOutputStream out = new DataOutputStream(s.getOutputStream());
        DataInputStream in = new DataInputStream(s.getInputStream());
        byte[] head = readFixed(in, 6);
        if (head[0] != 'C' || head[1] != 'H' || head[2] != 'B' || head[3] != '1') throw new IOException("not-chibarti");
        int mode = head[5] & 255;
        byte[] rest = readFixed(in, 32);
        int pubLen = in.readUnsignedShort();
        if (pubLen < 32 || pubLen > 200) throw new IOException("bad-key-size");
        byte[] pub = readFixed(in, pubLen);
        byte[] hello = concat(head, rest, new byte[] { (byte) (pubLen >> 8), (byte) pubLen }, pub);
        String clientId = Crypto.hex(slice(rest, 0, 16));
        if ((head[4] & 255) != VERSION) { refuse(out, ERR_VERSION); throw new AuthException(ERR_VERSION); }
        byte[] secret = mode >= MODE_QR && mode <= MODE_STREAM ? secrets.secretFor(mode, clientId) : null;
        if (secret == null) {
            int code = secrets.refuseCode(mode, clientId);
            refuse(out, code);
            throw new AuthException(code);
        }
        KeyPair kp = Crypto.ecKeyPair();
        byte[] serverHello = hello(OK, Crypto.unhex(myId), Crypto.random(16), kp.getPublic().getEncoded());
        serverHello[5] = OK;
        out.write(serverHello);
        out.flush();
        byte[][] keys = derive(Crypto.ecdh(kp.getPrivate(), pub), secret, hello, serverHello);
        byte[] th = Crypto.sha256(hello, serverHello);
        byte[] proof = readFixed(in, 32);
        if (!Crypto.same(proof, Crypto.hmac(keys[2], new byte[] { 'C' }, th))) {
            secrets.failed(mode, clientId);
            out.write(ERR_CODE);
            out.flush();
            throw new AuthException(ERR_CODE);
        }
        out.write(OK);
        out.write(Crypto.hmac(keys[2], new byte[] { 'S' }, th));
        out.flush();
        s.setSoTimeout(0);
        return new Result(new SecureLink(s, keys[1], keys[0], false), clientId, mode);
    }

    // [CHB1][version][mode or status][id 16][nonce 16][key length 2][key]
    private static byte[] hello(int modeOrStatus, byte[] id, byte[] nonce, byte[] pub) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.write(MAGIC, 0, 4);
        b.write(VERSION);
        b.write(modeOrStatus);
        b.write(id, 0, 16);
        b.write(nonce, 0, 16);
        b.write(pub.length >> 8);
        b.write(pub.length & 255);
        b.write(pub, 0, pub.length);
        return b.toByteArray();
    }

    private static void refuse(OutputStream out, int code) throws IOException {
        out.write(new byte[] { 'C', 'H', 'B', '1', VERSION, (byte) code });
        out.flush();
    }

    /** [client→server key, server→client key, proof key] */
    private static byte[][] derive(byte[] shared, byte[] secret, byte[] clientHello, byte[] serverHello) {
        byte[] salt = Crypto.sha256("chibarti-secret".getBytes(Proto.UTF8), secret);
        byte[] info = concat("chibarti-v1".getBytes(Proto.UTF8), Crypto.sha256(clientHello, serverHello));
        byte[] okm = Crypto.hkdf(salt, shared, info, 96);
        return new byte[][] { slice(okm, 0, 32), slice(okm, 32, 32), slice(okm, 64, 32) };
    }

    static byte[] readFixed(InputStream in, int n) throws IOException {
        byte[] b = new byte[n];
        new DataInputStream(in).readFully(b);
        return b;
    }

    static byte[] slice(byte[] b, int off, int len) {
        byte[] r = new byte[len];
        System.arraycopy(b, off, r, 0, len);
        return r;
    }

    static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        for (byte[] p : parts) b.write(p, 0, p.length);
        return b.toByteArray();
    }
}
