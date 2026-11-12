package com.luachsport.chibarti;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * The password of a hosting phone's temporary network, sealed for its Wi-Fi Direct announcement, so a phone that
 * picks it from the nearby list can join the network the same way as after scanning the QR code (no "invitation"
 * dialog of Android, which often doesn't show and makes the connection fail).
 * The network's name is public anyway (every phone around sees it), so only the password is sealed — short, so the
 * announcement stays small. Two seals: one opens with the 6-digit code on the screen ("w"), one with the key the
 * phone gave to the phones it remembers ("r"). Either one only opens the network; the connection itself still needs
 * the code or the remembered device's own key, and a new phone still needs approval. Plain Java (tested on a PC).
 */
final class NetSeal {
    static final int PIN_ROUNDS = 10000;

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

    /** The network's kind and name are bound in, so a seal can't be moved to another network. */
    private static byte[] aad(String method, String ssid) { return ("chibarti-net-2|" + method + "|" + ssid).getBytes(Proto.UTF8); }

    static String seal(byte[] key, String method, String ssid, String pass) {
        try {
            byte[] iv = Crypto.random(12);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, 0, 32, "AES"), new GCMParameterSpec(128, iv));
            c.updateAAD(aad(method, ssid));
            byte[] body = c.doFinal(pass.getBytes(Proto.UTF8));
            byte[] out = new byte[12 + body.length];
            System.arraycopy(iv, 0, out, 0, 12);
            System.arraycopy(body, 0, out, 12, body.length);
            return Crypto.b64(out);
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    /** The password, or null when the key is wrong (a wrong code), or the seal belongs to another network or was changed. */
    static String open(byte[] key, String method, String ssid, String sealed) {
        if (key == null || key.length < 32 || sealed == null || sealed.isEmpty() || ssid == null) return null;
        try {
            byte[] all = Crypto.unb64(sealed);
            if (all.length < 12 + 16 + 1) return null;
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, 0, 32, "AES"), new GCMParameterSpec(128, all, 0, 12));
            c.updateAAD(aad(method, ssid));
            String p = new String(c.doFinal(all, 12, all.length - 12), Proto.UTF8);
            return p.isEmpty() ? null : p;
        } catch (Exception e) { return null; }
    }

    /** Text that is safe inside a Wi-Fi Direct announcement ("=" and odd letters break it on some phones). */
    static String txtSafe(String s) { return s == null ? "" : Crypto.b64(s.getBytes(Proto.UTF8)); }

    static String txtRead(String s) {
        if (s == null || s.isEmpty()) return "";
        try { return new String(Crypto.unb64(s), Proto.UTF8); } catch (Exception e) { return ""; }
    }
}
