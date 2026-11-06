package com.luachsport.chibarti;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What the QR code holds: chibarti://join?v=1&i=<device id>&n=<name>&t=<one-time token>&m=<d|h|l>&s=<network>&k=<password>
 * &a=<addresses>&p=<port>&e=<expiry, unix seconds>. Only a temporary token and the temporary network of this session,
 * never a lasting secret. Every field is checked before it is used. Plain Java.
 */
final class QrPayload {
    static final String PREFIX = "chibarti://join?";

    String id, name, token, method, ssid, pass;
    List<String> addresses = new ArrayList<>();
    int port;
    long expiresSec;

    String build() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("v", "1");
        m.put("i", id);
        m.put("n", name);
        m.put("t", token);
        m.put("m", method);
        if (ssid != null) m.put("s", ssid);
        if (pass != null) m.put("k", pass);
        m.put("a", join(addresses));
        m.put("p", String.valueOf(port));
        m.put("e", String.valueOf(expiresSec));
        StringBuilder sb = new StringBuilder(PREFIX);
        boolean first = true;
        for (Map.Entry<String, String> e : m.entrySet()) {
            if (!first) sb.append('&');
            first = false;
            sb.append(e.getKey()).append('=').append(enc(e.getValue()));
        }
        return sb.toString();
    }

    /** Reads and checks a scanned code. Throws IllegalArgumentException with a short reason. */
    static QrPayload parse(String text, long nowSec) {
        if (text == null) throw new IllegalArgumentException("empty");
        text = text.trim();
        if (!text.startsWith(PREFIX) || text.length() > 1200) throw new IllegalArgumentException("not-ours");
        Map<String, String> m = new LinkedHashMap<>();
        for (String part : text.substring(PREFIX.length()).split("&")) {
            int eq = part.indexOf('=');
            if (eq <= 0) continue;
            m.put(part.substring(0, eq), dec(part.substring(eq + 1)));
        }
        if (!"1".equals(m.get("v"))) throw new IllegalArgumentException("version");
        QrPayload q = new QrPayload();
        q.id = need(m, "i");
        if (!q.id.matches("[0-9a-f]{32}")) throw new IllegalArgumentException("id");
        q.name = clean(m.get("n"), 40);
        q.token = need(m, "t");
        byte[] tok;
        try { tok = Crypto.unb64(q.token); } catch (Exception e) { throw new IllegalArgumentException("token"); }
        if (tok.length != 16) throw new IllegalArgumentException("token");
        q.method = need(m, "m");
        if (!q.method.matches("[dhl]")) throw new IllegalArgumentException("method");
        q.ssid = m.get("s");
        q.pass = m.get("k");
        if (!"l".equals(q.method)) {
            if (q.ssid == null || q.ssid.isEmpty() || q.ssid.length() > 32) throw new IllegalArgumentException("ssid");
            if (q.pass == null || q.pass.length() < 8 || q.pass.length() > 63) throw new IllegalArgumentException("pass");
        }
        for (String a : need(m, "a").split(",")) {
            if (a.isEmpty()) continue;
            if (!isIpv4(a)) throw new IllegalArgumentException("address");
            if (q.addresses.size() < 8) q.addresses.add(a);
        }
        if (q.addresses.isEmpty() && "l".equals(q.method)) throw new IllegalArgumentException("address");
        try { q.port = Integer.parseInt(need(m, "p")); } catch (NumberFormatException e) { throw new IllegalArgumentException("port"); }
        if (q.port < 1024 || q.port > 65535) throw new IllegalArgumentException("port");
        try { q.expiresSec = Long.parseLong(need(m, "e")); } catch (NumberFormatException e) { throw new IllegalArgumentException("expiry"); }
        if (q.expiresSec < nowSec) throw new IllegalArgumentException("expired");
        return q;
    }

    static boolean isIpv4(String s) {
        String[] p = s.split("\\.");
        if (p.length != 4) return false;
        for (String x : p) {
            if (x.isEmpty() || x.length() > 3 || !x.matches("[0-9]+")) return false;
            if (Integer.parseInt(x) > 255) return false;
        }
        return true;
    }

    private static String need(Map<String, String> m, String k) {
        String v = m.get(k);
        if (v == null || v.isEmpty()) throw new IllegalArgumentException("missing-" + k);
        return v;
    }

    static String clean(String s, int max) {
        if (s == null) return "";
        s = s.replaceAll("[\\p{Cntrl}]", "").trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    private static String join(List<String> l) {
        StringBuilder sb = new StringBuilder();
        for (String s : l) { if (sb.length() > 0) sb.append(','); sb.append(s); }
        return sb.toString();
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s == null ? "" : s, "UTF-8").replace("+", "%20"); } catch (Exception e) { return ""; }
    }

    private static String dec(String s) {
        try { return URLDecoder.decode(s, "UTF-8"); } catch (Exception e) { throw new IllegalArgumentException("encoding"); }
    }
}
