package com.luachsport.chibarti;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.SSLServerSocket;

/**
 * The phone as a small web server for a computer on the same network (the phone's Wi-Fi Direct group, its hotspot,
 * or a shared Wi-Fi; internet not needed). Port 8080 (plain HTTP) only explains the one-time browser warning and
 * forwards to port 8443 (HTTPS), which serves the computer page (assets "pc/") and the WebSocket "/ws".
 * Nothing works without the 6-digit code and approval on the phone (Connect.pcAccepted). Plain Java.
 */
final class WebServer {
    interface Assets { InputStream open(String path) throws IOException; }
    interface Gate { void socket(WsLink link); }

    static final int HTTP = 8080, HTTPS = 8443;
    private volatile ServerSocket plain, secure;
    volatile int httpPort = 0, httpsPort = 0;
    private final Tls tls;
    private final Assets assets;
    private final Gate gate;

    WebServer(Tls tls, Assets assets, Gate gate) { this.tls = tls; this.assets = assets; this.gate = gate; }

    synchronized void start() throws IOException {
        if (secure != null && !secure.isClosed()) return;
        SSLServerSocket s = (SSLServerSocket) tls.context.getServerSocketFactory().createServerSocket();
        s.setReuseAddress(true);
        try { s.bind(new InetSocketAddress(HTTPS), 16); } catch (IOException e) { s.close(); s = (SSLServerSocket) tls.context.getServerSocketFactory().createServerSocket(); s.bind(new InetSocketAddress(0), 16); }
        secure = s;
        httpsPort = s.getLocalPort();
        ServerSocket p = new ServerSocket();
        p.setReuseAddress(true);
        try { p.bind(new InetSocketAddress(HTTP), 16); } catch (IOException e) { p.close(); p = new ServerSocket(); p.bind(new InetSocketAddress(0), 16); }
        plain = p;
        httpPort = p.getLocalPort();
        loop(s, true);
        loop(p, false);
    }

    synchronized void stop() {
        for (ServerSocket s : new ServerSocket[] { secure, plain }) { if (s != null) { try { s.close(); } catch (Exception ignored) { } } }
        secure = plain = null;
        httpPort = httpsPort = 0;
    }

    boolean running() { ServerSocket s = secure; return s != null && !s.isClosed(); }

    private void loop(final ServerSocket ss, final boolean tlsSide) {
        Thread t = new Thread(() -> {
            while (!ss.isClosed()) {
                try {
                    final Socket c = ss.accept();
                    Thread h = new Thread(() -> handle(c, tlsSide), "web-conn");
                    h.setDaemon(true);
                    h.start();
                } catch (Exception e) { if (ss.isClosed()) return; }
            }
        }, tlsSide ? "web-https" : "web-http");
        t.setDaemon(true);
        t.start();
    }

    static final class Request {
        String method = "", path = "/";
        final Map<String, String> headers = new HashMap<>();
    }

    /** Reads the request line and headers (at most 16 KB). */
    static Request parse(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int state = 0;
        while (state < 4) {
            int c = in.read();
            if (c < 0) throw new IOException("eof");
            b.write(c);
            if (b.size() > 16384) throw new IOException("too-big");
            state = (c == '\r' && (state == 0 || state == 2)) ? state + 1 : (c == '\n' && (state == 1 || state == 3)) ? state + 1 : 0;
        }
        String[] lines = new String(b.toByteArray(), Proto.UTF8).split("\r\n");
        Request r = new Request();
        String[] first = lines[0].split(" ");
        if (first.length < 2) throw new IOException("bad-request");
        r.method = first[0];
        r.path = first[1];
        for (int i = 1; i < lines.length; i++) {
            int k = lines[i].indexOf(':');
            if (k > 0) r.headers.put(lines[i].substring(0, k).trim().toLowerCase(Locale.ROOT), lines[i].substring(k + 1).trim());
        }
        return r;
    }

    private void handle(Socket c, boolean tlsSide) {
        try {
            c.setSoTimeout(30000);
            c.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(c.getInputStream(), 16384);
            Request r = parse(in);
            OutputStream out = c.getOutputStream();
            if (!tlsSide) { redirectPage(out, r); c.close(); return; }
            String path = r.path;
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            if ("/ws".equals(path) && "websocket".equalsIgnoreCase(r.headers.get("upgrade")) && r.headers.containsKey("sec-websocket-key")) {
                out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + WsLink.accept(r.headers.get("sec-websocket-key")) + "\r\n\r\n").getBytes(Proto.UTF8));
                out.flush();
                c.setSoTimeout(0);
                WsLink link = new WsLink(c, in);
                link.remoteIp = c.getInetAddress() == null ? "" : c.getInetAddress().getHostAddress();
                gate.socket(link);
                return;
            }
            serve(out, r.method, path);
            c.close();
        } catch (Exception e) {
            try { c.close(); } catch (Exception ignored) { }
        }
    }

    private static final Map<String, String> TYPES = new HashMap<>();
    static {
        TYPES.put("html", "text/html; charset=utf-8");
        TYPES.put("css", "text/css; charset=utf-8");
        TYPES.put("js", "text/javascript; charset=utf-8");
        TYPES.put("json", "application/json; charset=utf-8");
        TYPES.put("png", "image/png");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("ttf", "font/ttf");
        TYPES.put("ico", "image/x-icon");
    }

    private void serve(OutputStream out, String method, String path) throws IOException {
        if (!"GET".equals(method) && !"HEAD".equals(method)) { simple(out, 405, "text/plain", "method"); return; }
        if (path.equals("/") || path.isEmpty()) path = "/index.html";
        String rel = path.substring(1);
        if (rel.contains("..") || rel.contains("\\") || rel.startsWith("/")) { simple(out, 404, "text/plain", "not found"); return; }
        int dot = rel.lastIndexOf('.');
        String type = TYPES.get(dot > 0 ? rel.substring(dot + 1).toLowerCase(Locale.ROOT) : "");
        if (type == null) { simple(out, 404, "text/plain", "not found"); return; }
        byte[] body;
        try (InputStream a = assets.open(rel)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = a.read(buf)) > 0) b.write(buf, 0, n);
            body = b.toByteArray();
        } catch (IOException e) { simple(out, 404, "text/plain", "not found"); return; }
        head(out, 200, type, body.length);
        if ("GET".equals(method)) out.write(body);
        out.flush();
    }

    private static void head(OutputStream out, int code, String type, int len) throws IOException {
        String status = code == 200 ? "OK" : code == 404 ? "Not Found" : "Error";
        out.write(("HTTP/1.1 " + code + " " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + len +
            "\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n").getBytes(Proto.UTF8));
    }

    private static void simple(OutputStream out, int code, String type, String text) throws IOException {
        byte[] b = text.getBytes(Proto.UTF8);
        head(out, code, type, b.length);
        out.write(b);
        out.flush();
    }

    /** Port 8080: explains the warning the browser is about to show, then moves on to the secure page. */
    private void redirectPage(OutputStream out, Request r) throws IOException {
        String host = r.headers.get("host");
        if (host == null || host.isEmpty()) host = "192.168.49.1";
        int colon = host.lastIndexOf(':');
        if (colon > 0 && host.indexOf(']') < colon) host = host.substring(0, colon);
        if (!host.matches("[0-9A-Za-z.\\-\\[\\]:]+")) host = "192.168.49.1";
        String url = "https://" + host + ":" + httpsPort + "/";
        String html = "<!doctype html><html lang=\"he\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<title>חיברתי</title><style>body{font-family:Segoe UI,Arial,sans-serif;background:#F1F6F6;color:#0F1A1B;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}" +
            ".c{background:#fff;border-radius:24px;padding:28px;max-width:520px;margin:16px;box-shadow:0 18px 40px -22px rgba(6,88,91,.5)}h1{margin:0 0 8px;color:#07777B}" +
            "ol{line-height:1.9;padding-right:20px}b{color:#066B6F}a.b{display:block;text-align:center;background:#0A8F94;color:#fff;border-radius:14px;padding:14px;font-weight:700;text-decoration:none;margin-top:16px}" +
            ".fp{direction:ltr;font-family:monospace;font-size:12px;color:#536869}</style></head><body><div class=\"c\"><h1>חיברתי</h1>" +
            "<p>עוברים לחיבור המאובטח עם הטלפון. הדפדפן יציג עכשיו אזהרה \"החיבור שלך אינו פרטי\". זה צפוי: הטלפון לא רשום אצל גוף אישורים באינטרנט.</p>" +
            "<ol><li>לוחצים <b>מתקדם</b> (Advanced)</li><li>לוחצים <b>המשך אל " + host + "</b> (Proceed / Continue)</li><li>מקלידים את 6 הספרות שמופיעות בטלפון</li></ol>" +
            "<p class=\"fp\">" + tls.fingerprint + "</p><a class=\"b\" href=\"" + url + "\">המשך לחיבור</a></div>" +
            "<script>setTimeout(function(){location.href='" + url + "'},6000)</script></body></html>";
        simple(out, 200, TYPES.get("html"), html);
    }
}
