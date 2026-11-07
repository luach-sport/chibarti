package com.luachsport.chibarti;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;

/**
 * The HTTPS identity of this phone for a computer's browser: a self-signed certificate (EC P-256, made on the phone
 * once and kept in the app's private folder). Browsers need HTTPS for screen sharing and video decoding, and accept it
 * after a one-time "not private" warning (no internet authority can vouch for a phone on a home network).
 * Built with plain Java (a tiny DER writer, no extra libraries), so it is tested on a PC too.
 */
final class Tls {
    final X509Certificate cert;
    final SSLContext context;
    final String fingerprint;

    private Tls(PrivateKey key, X509Certificate cert) throws Exception {
        this.cert = cert;
        char[] pass = "chibarti".toCharArray();
        KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
        ks.load(null, null);
        ks.setKeyEntry("chibarti", key, pass, new Certificate[] { cert });
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, pass);
        context = SSLContext.getInstance("TLS");
        context.init(kmf.getKeyManagers(), null, null);
        String h = Crypto.hex(Crypto.sha256(cert.getEncoded())).toUpperCase(Locale.ROOT);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 16; i += 2) { if (sb.length() > 0) sb.append(':'); sb.append(h, i, i + 2); }
        fingerprint = sb.toString();
    }

    /** Loads the phone's certificate from dir, or makes one (valid for 5 years) and saves it there. */
    static Tls load(File dir) throws Exception {
        File f = new File(dir, "tls.bin");
        if (f.exists()) {
            try (DataInputStream in = new DataInputStream(new FileInputStream(f))) {
                byte[] k = new byte[in.readInt()];
                in.readFully(k);
                byte[] c = new byte[in.readInt()];
                in.readFully(c);
                X509Certificate cert = parse(c);
                if (cert.getNotAfter().getTime() > System.currentTimeMillis() + 7L * 864e5) {
                    return new Tls(KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(k)), cert);
                }
            } catch (Exception ignored) { /* make a new one */ }
        }
        KeyPair kp = Crypto.ecKeyPair();
        byte[] der = selfSigned(kp, "Chibarti", System.currentTimeMillis());
        X509Certificate cert = parse(der);
        dir.mkdirs();
        File tmp = new File(dir, "tls.bin.tmp");
        try (DataOutputStream out = new DataOutputStream(new FileOutputStream(tmp))) {
            byte[] k = kp.getPrivate().getEncoded();
            out.writeInt(k.length);
            out.write(k);
            out.writeInt(der.length);
            out.write(der);
        }
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
        return new Tls(kp.getPrivate(), cert);
    }

    static X509Certificate parse(byte[] der) throws Exception {
        return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));
    }

    // ---------- a minimal X.509 v3 certificate, DER-encoded ----------
    private static final byte[] OID_ECDSA_SHA256 = { 0x2A, (byte) 0x86, 0x48, (byte) 0xCE, 0x3D, 0x04, 0x03, 0x02 };
    private static final byte[] OID_CN = { 0x55, 0x04, 0x03 }, OID_O = { 0x55, 0x04, 0x0A };
    private static final byte[] OID_SAN = { 0x55, 0x1D, 0x11 }, OID_EKU = { 0x55, 0x1D, 0x25 }, OID_BASIC = { 0x55, 0x1D, 0x13 };
    private static final byte[] OID_SERVER_AUTH = { 0x2B, 0x06, 0x01, 0x05, 0x05, 0x07, 0x03, 0x01 };

    static byte[] selfSigned(KeyPair kp, String cn, long now) throws Exception {
        byte[] alg = seq(tlv(0x06, OID_ECDSA_SHA256));
        byte[] name = seq(set(seq(tlv(0x06, OID_CN), tlv(0x0C, cn.getBytes(Proto.UTF8)))), set(seq(tlv(0x06, OID_O), tlv(0x0C, "Itzko".getBytes(Proto.UTF8)))));
        byte[] validity = seq(time(now - 864e5), time(now + 5 * 365 * 864e5));
        byte[] serial = Crypto.random(16);
        serial[0] &= 0x7F;
        serial[0] |= 0x01;
        byte[] san = seq(tlv(0x82, "chibarti.local".getBytes(Proto.UTF8)));
        byte[] ext = tlv(0xA3, seq(
            seq(tlv(0x06, OID_BASIC), tlv(0x04, seq())),
            seq(tlv(0x06, OID_EKU), tlv(0x04, seq(tlv(0x06, OID_SERVER_AUTH)))),
            seq(tlv(0x06, OID_SAN), tlv(0x04, san))));
        byte[] tbs = seq(tlv(0xA0, tlv(0x02, new byte[] { 2 })), tlv(0x02, new BigInteger(1, serial).toByteArray()), alg, name, validity, name, kp.getPublic().getEncoded(), ext);
        Signature s = Signature.getInstance("SHA256withECDSA");
        s.initSign(kp.getPrivate());
        s.update(tbs);
        byte[] sig = s.sign();
        byte[] bits = new byte[sig.length + 1];
        System.arraycopy(sig, 0, bits, 1, sig.length);
        return seq(tbs, alg, tlv(0x03, bits));
    }

    private static byte[] time(double t) {
        SimpleDateFormat f = new SimpleDateFormat("yyMMddHHmmss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return tlv(0x17, f.format(new Date((long) t)).getBytes(Proto.UTF8));
    }

    private static byte[] seq(byte[]... parts) { return tlv(0x30, Handshake.concat(parts)); }
    private static byte[] set(byte[]... parts) { return tlv(0x31, Handshake.concat(parts)); }

    static byte[] tlv(int tag, byte[] v) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.write(tag);
        int n = v.length;
        if (n < 128) b.write(n);
        else if (n < 256) { b.write(0x81); b.write(n); }
        else if (n < 65536) { b.write(0x82); b.write(n >> 8); b.write(n & 255); }
        else { b.write(0x83); b.write(n >> 16); b.write((n >> 8) & 255); b.write(n & 255); }
        b.write(v, 0, n);
        return b.toByteArray();
    }
}
