package com.luachsport.chibarti;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * The name and password of a hosting phone's temporary network, sealed for the Wi-Fi Direct announcement, so a phone
 * that picks it from the nearby list can join it the same way as after scanning the QR code (no "accept invitation"
 * dialog of Android, which often doesn't show and makes the connection fail).
 * Two seals: one opens with the 6-digit code on the screen ("w"), one with the key the phone gave to the phones it
 * remembers ("r"). Either one only opens the network; the connection itself still needs the code or the remembered
 * device's own key, and a new phone still needs approval. Plain Java (tested on a PC).
 */
final class NetSeal {
    static final int PIN_ROUNDS = 10000;
    private static final byte[] AAD = "chibarti-net-1".getBytes(Proto.UTF8);

    static final class Net {
        final String method, ssid, pass;
        Net(String method, String ssid, String pass) { this.method = method; this.ssid = ssid; this.pass = pass; }
    }

    private NetSeal() { }

    /** A key from the 6-digit code (PBKDF2-HMAC-SHA256, salted with the hosting phone's id). */
    static byte[] pinKey(String pin, String hostId) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(("chibarti-pin:" + pin).getBytes(Proto.UTF8), "HmacSHA256"));
            mac.update(("chibarti-net:" + hostId).getBytes(Proto.UTF8));
            mac.update(new byte[] { 0, 0, 0, 1 });
            byte[] u = mac.doFinal(), t = u.clone();
            for (int i = 1; i < PIN_ROUNDS; i++) {
                u = mac.doFinal(u);
                for (int k = 0; k < t.length; k++) t[k] ^= u[k];
            }
            return t;
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    static String seal(byte[] key, Net n) {
        try {
            byte[] iv = Crypto.random(12);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, 0, 32, "AES"), new GCMParameterSpec(128, iv));
            c.updateAAD(AAD);
            byte[] body = c.doFinal((n.method + "\n" + n.ssid + "\n" + n.pass).getBytes(Proto.UTF8));
            byte[] out = new byte[12 + body.length];
            System.arraycopy(iv, 0, out, 0, 12);
            System.arraycopy(body, 0, out, 12, body.length);
            return Crypto.b64(out);
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    /** The network, or null when the key is wrong (a wrong code) or the text was changed. */
    static Net open(byte[] key, String sealed) {
        if (key == null || key.length < 32 || sealed == null || sealed.isEmpty()) return null;
        try {
            byte[] all = Crypto.unb64(sealed);
            if (all.length < 12 + 16 + 4) return null;
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, 0, 32, "AES"), new GCMParameterSpec(128, all, 0, 12));
            c.updateAAD(AAD);
            String[] p = new String(c.doFinal(all, 12, all.length - 12), Proto.UTF8).split("\n", -1);
            if (p.length != 3 || p[1].isEmpty()) return null;
            return new Net(p[0], p[1], p[2]);
        } catch (Exception e) { return null; }
    }
}
