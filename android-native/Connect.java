package com.luachsport.chibarti;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Making the connection, hosting side: "Start a connection" makes a Wi-Fi Direct group (or, where Wi-Fi Direct
 * doesn't work, a local hotspot, or just the shared Wi-Fi), opens the server and shows a QR code and a 6-digit code.
 * Every new phone must be approved on this screen. The joining side is in Joiner.
 */
@SuppressLint("MissingPermission")
final class Connect implements Server.Gate, WifiDirect.Events {
    static final class Request {
        final String rid, name, model, via;
        String kind = "phone";
        final long at = System.currentTimeMillis();
        final CountDownLatch latch = new CountDownLatch(1);
        volatile boolean allow = false, remember = true;
        Request(String rid, String name, String model, String via) { this.rid = rid; this.name = name; this.model = model; this.via = via; }
    }

    final Hub hub;
    final Context ctx;
    final WifiDirect p2p;
    final WifiJoin wifi;
    final LanBeacon beacon;
    final Server server;
    final Joiner joiner;
    private Tls tls;
    private WebServer web;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Map<String, Request> requests = new LinkedHashMap<>();

    // hosting
    volatile boolean hosting = false, hostReady = false;
    // a remembered computer may connect while the app is open on a shared Wi-Fi (no code, no group), and
    // a computer whose QR code this phone scanned may connect once without asking (the scan was the approval)
    volatile boolean pcReady = false;
    private volatile String claimToken, claimName;
    private volatile long claimUntil;
    private static final int MODE_CLAIM = 99;
    private volatile Pairing pairing;
    private volatile String advertisedPin = "";
    private final java.util.concurrent.ExecutorService bg = java.util.concurrent.Executors.newSingleThreadExecutor();
    private String method = "l", ssid, pass, hostError;
    private List<String> addresses;
    private Object hotspot; // WifiManager.LocalOnlyHotspotReservation (Android 8+)

    Connect(Hub hub) {
        this.hub = hub;
        this.ctx = hub.ctx;
        p2p = new WifiDirect(ctx, this);
        wifi = new WifiJoin(ctx);
        beacon = new LanBeacon(ctx);
        server = new Server(this);
        joiner = new Joiner(this);
    }

    String mode() {
        if (hosting) return "hosting";
        if (joiner.busy()) return "joining";
        return "idle";
    }

    // ---------- hosting ----------
    void host() {
        synchronized (this) {
            if (hosting) return;
            hosting = true;
            hostReady = false;
            hostError = null;
            method = "l";
            pairing = new Pairing(System::currentTimeMillis);
        }
        joiner.stopScan();
        LinkService.start(ctx);
        Diag.log("host", "start (Android " + Build.VERSION.RELEASE + ", " + Build.MODEL + ")");
        try { server.start(); } catch (Exception e) { Diag.log("host", "server FAILED: " + Diag.why(e)); hostFailed("server"); return; }
        startWeb();
        hub.changed();
        if (!p2p.supported()) { tryHotspot("unsupported"); return; }
        p2p.createGroup((ok, reason, name, password) -> {
            if (!hosting) { p2p.removeGroup(); return; }
            if (ok) { ready("d", name, password); return; }
            tryHotspot(WifiDirect.reason(reason));
        });
        h.postDelayed(this::refreshCode, 5000);
    }

    private void refreshCode() {
        if (!hosting) return;
        Pairing p = pairing;
        if (p != null && p.refreshIfExpired()) hub.changed();
        if (p != null && !p.pin().equals(advertisedPin)) advertiseNet();
        h.postDelayed(this::refreshCode, 5000);
    }

    private void tryHotspot(final String why) {
        Diag.log("host", "Wi-Fi Direct group not possible (" + why + "), trying a local hotspot");
        if (Build.VERSION.SDK_INT < 26) { lanOnly(why); return; }
        try {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            wm.startLocalOnlyHotspot(new WifiManager.LocalOnlyHotspotCallback() {
                @Override public void onStarted(WifiManager.LocalOnlyHotspotReservation r) {
                    if (!hosting) { r.close(); return; }
                    hotspot = r;
                    String[] sp = hotspotCredentials(r);
                    h.postDelayed(() -> ready("h", sp[0], sp[1]), 1200);
                }
                @Override public void onFailed(int reason) { Diag.log("host", "hotspot FAILED: " + reason); lanOnly(why); }
            }, h);
        } catch (Exception e) { lanOnly(why); }
    }

    @SuppressWarnings("deprecation")
    private static String[] hotspotCredentials(WifiManager.LocalOnlyHotspotReservation r) {
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                android.net.wifi.SoftApConfiguration c = r.getSoftApConfiguration();
                String s = c.getSsid();
                return new String[] { s == null ? "" : s.replace("\"", ""), c.getPassphrase() };
            }
            android.net.wifi.WifiConfiguration c = r.getWifiConfiguration();
            return new String[] { c.SSID == null ? "" : c.SSID.replace("\"", ""), c.preSharedKey == null ? "" : c.preSharedKey.replace("\"", "") };
        } catch (Exception e) { return new String[] { "", "" }; }
    }

    private void lanOnly(String why) {
        List<String> a = NetUtil.addresses();
        Diag.log("host", "only the shared Wi-Fi: " + a);
        if (a.isEmpty()) { hostFailed("no-network:" + why); return; }
        synchronized (this) { hostError = "lan-only:" + why; }
        ready("l", null, null);
    }

    private void ready(String m, String name, String password) {
        if (!hosting) return;
        synchronized (this) {
            method = m;
            ssid = name;
            pass = password;
            addresses = NetUtil.addresses();
            if ("d".equals(m)) { addresses.remove(WifiDirect.OWNER_IP); addresses.add(0, WifiDirect.OWNER_IP); }
            hostReady = true;
        }
        Diag.log("host", "ready: " + ("d".equals(m) ? "Wi-Fi Direct" : "h".equals(m) ? "hotspot" : "shared Wi-Fi") + (name == null ? "" : " " + name) + ", addresses " + addresses + ", port " + server.port);
        String id = hub.ids.myId(), me = hub.ids.myName();
        advertisedPin = "";
        advertiseNet();
        beacon.startSending(id, me, server.port);
        hub.changed();
    }

    /**
     * The Wi-Fi Direct announcement, with this phone's network sealed twice (NetSeal): with the 6-digit code and with
     * the key of the remembered phones. A phone that picks this one from its nearby list then joins the network like
     * after scanning the QR code, without Android's "invitation" dialog. Made again whenever the code changes.
     */
    private void advertiseNet() {
        final Pairing p = pairing;
        if (!hosting || !hostReady || p == null || !p2p.supported()) return;
        final String pin = p.pin();
        if (pin.equals(advertisedPin)) return;
        advertisedPin = pin;
        final String m, sid, pw;
        final List<String> addrs;
        synchronized (this) { m = method; sid = ssid; pw = pass; addrs = addresses; }
        if (!"d".equals(m) && !"h".equals(m)) return; // on a shared Wi-Fi the LAN announcement is enough
        final String id = hub.ids.myId(), me = hub.ids.myName();
        final int port = server.port;
        bg.execute(() -> {
            Map<String, String> net = new java.util.HashMap<>();
            try {
                if (sid != null && !sid.isEmpty() && pw != null && !pw.isEmpty()) {
                    net.put("s", NetSeal.txtSafe(sid));
                    net.put("m", m);
                    net.put("w", NetSeal.seal(NetSeal.pinKey(pin, id), m, sid, pw));
                    net.put("r", NetSeal.seal(hub.ids.netKey(), m, sid, pw));
                    if ("h".equals(m) && addrs != null && !addrs.isEmpty()) {
                        StringBuilder a = new StringBuilder();
                        for (int i = 0; i < addrs.size() && i < 3; i++) a.append(i > 0 ? "," : "").append(addrs.get(i));
                        net.put("a", NetSeal.txtSafe(a.toString()));
                    }
                } else Diag.log("host", "no network name/password to announce");
            } catch (Exception e) { Diag.log("host", "sealing failed: " + Diag.why(e)); net.clear(); }
            h.post(() -> { if (hosting && pin.equals(advertisedPin)) p2p.advertise(id, me, port, net); });
        });
    }

    private void hostFailed(String why) {
        synchronized (this) { hostError = why; hostReady = false; }
        hub.notice("host-failed", why);
        hub.changed();
    }

    /** Stops offering a connection (keeps the network if a phone is already connected through it). */
    void stopHost() {
        Session s = hub.session;
        boolean keepNet = s != null && s.host && s.state != Session.CLOSED;
        synchronized (this) {
            hosting = false;
            hostReady = false;
            for (Request r : requests.values()) r.latch.countDown();
        }
        beacon.stopSending();
        p2p.stopAdvertise();
        if (!keepNet) teardownHostNet();
        hub.changed();
        if (hub.session == null && !joiner.busy()) LinkService.stop(ctx);
        if (pcReady && hub.session == null) startPcReady();
    }

    /** The app is open (on) or not (off): a remembered computer on the same Wi-Fi can connect by itself meanwhile. */
    void pcReady(boolean on) {
        pcReady = on;
        if (on) { if (!hosting && hub.session == null) startPcReady(); }
        else if (!hosting && hub.session == null && web != null) web.stop();
    }

    private void startPcReady() {
        if (hosting || hub.session != null || !hub.ids.hasComputer() || NetUtil.addresses().isEmpty()) return;
        startWeb();
    }

    /** A QR code from the program on a computer was scanned here: that computer may connect once, without asking. */
    void claim(String token, String name) {
        if (token == null || !token.matches("[0-9a-f]{32}")) return;
        claimToken = token;
        claimName = name == null ? "" : QrPayload.clean(name, 40);
        claimUntil = System.currentTimeMillis() + 10 * 60 * 1000L;
        hub.changed();
    }

    boolean claimWaiting() { return claimToken != null && System.currentTimeMillis() < claimUntil; }

    /** The web server for a computer's browser (HTTPS + WebSocket), running whenever this phone offers a connection. */
    private void startWeb() {
        try {
            if (tls == null) tls = Tls.load(new java.io.File(ctx.getFilesDir(), "tls"));
            if (web == null) web = new WebServer(tls, this::asset, this::pcAccepted);
            // what the חיברתי program on a computer reads when it looks for this phone on the network
            web.about = new JSONObject().put("app", "chibarti").put("v", 1).put("id", hub.ids.myId()).put("name", hub.ids.myName()).toString();
            web.start();
        } catch (Exception e) { android.util.Log.w("Chibarti", "web server", e); }
    }

    /** A file of the computer page (www/pc/), from the newest app files. The font and the icon are shared with the app. */
    private java.io.InputStream asset(String path) throws java.io.IOException {
        String rel = path.startsWith("fonts/") || "icon.png".equals(path) || "logo.svg".equals(path) ? path : "pc/" + path;
        String root = ChibartiPlugin.webRoot();
        if (root != null) {
            java.io.File f = new java.io.File(root, rel);
            if (f.isFile()) return new java.io.FileInputStream(f);
        }
        return ctx.getAssets().open("public/" + rel);
    }

    private void teardownHostNet() {
        server.stop();
        if (web != null) web.stop();
        p2p.removeGroup();
        Object r = hotspot;
        hotspot = null;
        if (r != null && Build.VERSION.SDK_INT >= 26) { try { ((WifiManager.LocalOnlyHotspotReservation) r).close(); } catch (Exception ignored) { } }
    }

    synchronized String qr() {
        if (!hosting || !hostReady || pairing == null) return null;
        QrPayload q = new QrPayload();
        q.id = hub.ids.myId();
        q.name = hub.ids.myName();
        q.token = pairing.token();
        q.method = method;
        q.ssid = ssid;
        q.pass = pass;
        q.addresses = addresses;
        q.port = server.port;
        q.expiresSec = pairing.expiresAt() / 1000;
        return q.build();
    }

    void describe(JSONObject s) throws Exception {
        JSONObject host = new JSONObject();
        synchronized (this) {
            host.put("on", hosting).put("ready", hostReady).put("method", method).put("error", hostError == null ? "" : hostError);
            if (hosting && hostReady && pairing != null) {
                host.put("qr", qr()).put("pin", pairing.pin()).put("expiresAt", pairing.expiresAt()).put("network", ssid == null ? "" : ssid);
                host.put("pass", pass == null ? "" : pass);
                JSONArray ips = new JSONArray();
                if (addresses != null) for (String a : addresses) ips.put(a);
                host.put("addresses", ips);
            }
            host.put("pcReady", pcReady && !hosting && web != null && web.running()).put("claim", claimWaiting());
            WebServer w = web;
            if (w != null && w.running()) host.put("web", new JSONObject().put("http", w.httpPort).put("https", w.httpsPort).put("fp", tls == null ? "" : tls.fingerprint));
            JSONArray req = new JSONArray();
            for (Request r : requests.values()) req.put(new JSONObject().put("rid", r.rid).put("name", r.name).put("model", r.model).put("via", r.via).put("kind", r.kind).put("at", r.at));
            s.put("requests", req);
        }
        s.put("host", host);
        joiner.describe(s);
    }

    void approve(String rid, boolean allow, boolean remember) {
        Request r;
        synchronized (this) { r = requests.get(rid); }
        if (r == null) return;
        r.allow = allow;
        r.remember = remember;
        r.latch.countDown();
    }

    // ---------- Server.Gate ----------
    @Override public String myId() { return hub.ids.myId(); }

    @Override public Handshake.Secrets secrets() {
        return new Handshake.Secrets() {
            @Override public byte[] secretFor(int mode, String clientId) {
                Session s = hub.session;
                switch (mode) {
                    case Handshake.MODE_QR: case Handshake.MODE_PIN: { Pairing p = pairing; return hosting && p != null ? p.secretFor(mode) : null; }
                    case Handshake.MODE_TRUSTED: return hosting ? hub.ids.trustedKey(clientId) : null;
                    default: return s != null && s.host && s.peerId.equals(clientId) && s.state != Session.CLOSED ? s.key : null;
                }
            }
            @Override public int refuseCode(int mode, String clientId) {
                if (mode == Handshake.MODE_QR || mode == Handshake.MODE_PIN) return Handshake.ERR_EXPIRED;
                return Handshake.ERR_UNKNOWN;
            }
            @Override public void failed(int mode, String clientId) {
                Diag.log("host", "a phone tried a wrong " + (mode == Handshake.MODE_PIN ? "code" : mode == Handshake.MODE_TRUSTED ? "remembered key" : "secret (mode " + mode + ")"));
                Pairing p = pairing;
                if (mode == Handshake.MODE_PIN && p != null && p.failed()) { hub.notice("pin-renewed", null); hub.changed(); }
            }
        };
    }

    @Override public void accepted(Handshake.Result r, String ip) {
        try {
            Session cur = hub.session;
            if (r.mode == Handshake.MODE_RESUME) {
                if (cur != null && cur.peerId.equals(r.peerId)) cur.replaceMain(r.link); else r.link.close();
                return;
            }
            if (r.mode == Handshake.MODE_STREAM) {
                if (cur != null && cur.peerId.equals(r.peerId)) { cur.attachStream(r.link); hub.mirror.onStreamAttached(); } else r.link.close();
                return;
            }
            Diag.log("host", "secure connection from " + ip + " (" + modeName(r.mode) + ")");
            r.link.setReadTimeout(15000);
            Link.Frame f = r.link.read();
            r.link.setReadTimeout(0);
            if (f.type != Proto.HELLO) { r.link.close(); return; }
            JSONObject hello = new JSONObject(f.text());
            String name = QrPayload.clean(hello.optString("name", "Android"), 40), model = QrPayload.clean(hello.optString("model", ""), 60);
            String via = ip != null && ip.startsWith("192.168.49.") ? "wifi-direct" : "h".equals(method) ? "hotspot" : "wifi";
            approveAndAttach(r.link, r.peerId, r.mode, name, model, hello.optInt("sdk"), via, "phone", ip);
        } catch (Exception e) {
            Diag.log("host", "connection dropped before approval: " + Diag.why(e));
            r.link.close();
        }
    }

    static String modeName(int m) {
        switch (m) {
            case Handshake.MODE_QR: return "QR";
            case Handshake.MODE_PIN: return "code";
            case Handshake.MODE_TRUSTED: return "remembered";
            case Handshake.MODE_RESUME: return "resume";
            case Handshake.MODE_STREAM: return "screen stream";
            default: return "mode " + m;
        }
    }

    /** A computer's browser (WebServer, after the HTTPS + WebSocket handshake). The first message must be HELLO. */
    void pcAccepted(WsLink link) {
        try {
            link.setReadTimeout(20000);
            Link.Frame f = link.read();
            link.setReadTimeout(0);
            if (f.type != Proto.HELLO) { link.close(); return; }
            JSONObject h = new JSONObject(f.text());
            String id = h.optString("id", "");
            if (!id.matches("[0-9a-f]{32}")) { deny(link, "bad"); return; }
            String mode = h.optString("mode", "pin");
            byte[] key;
            try { key = Crypto.unb64(h.optString("key", "")); } catch (Exception e) { key = new byte[0]; }
            Session cur = hub.session;
            if ("resume".equals(mode) || "stream".equals(mode)) {
                if (cur != null && cur.state != Session.CLOSED && cur.peerId.equals(id) && "pc".equals(cur.kind) && Crypto.same(cur.key, key)) {
                    link.send(Proto.APPROVED, Proto.json(new JSONObject().put("resumed", true)));
                    if ("resume".equals(mode)) cur.replaceMain(link);
                    else { cur.attachStream(link); hub.mirror.onStreamAttached(); }
                } else deny(link, "unknown");
                return;
            }
            String name = QrPayload.clean(h.optString("name", "מחשב"), 40), model = QrPayload.clean(h.optString("model", "דפדפן"), 60);
            int m;
            if ("trusted".equals(mode)) {
                byte[] k = hub.ids.trustedKey(id);
                if (k == null || !Crypto.same(k, key)) { deny(link, "unknown"); return; }
                if (!hosting && !pcReady) { deny(link, hub.session != null ? "busy" : "not-offering"); return; }
                m = Handshake.MODE_TRUSTED;
            } else if ("claim".equals(mode)) {
                String tok = claimToken;
                if (tok == null || System.currentTimeMillis() > claimUntil || !Crypto.same(tok.getBytes(Proto.UTF8), h.optString("token", "").getBytes(Proto.UTF8))) { deny(link, "unknown"); return; }
                if (hub.session != null) { deny(link, "busy"); return; }
                claimToken = null;
                if (claimName != null && !claimName.isEmpty()) name = claimName;
                m = MODE_CLAIM;
            } else {
                Pairing p = pairing;
                if (!hosting && hub.session != null) { deny(link, "busy"); return; }
                byte[] secret = hosting && p != null ? p.secretFor(Handshake.MODE_PIN) : null;
                if (secret == null) { deny(link, "expired"); return; }
                if (!Crypto.same(secret, h.optString("pin", "").getBytes(Proto.UTF8))) {
                    if (p.failed()) { hub.notice("pin-renewed", null); hub.changed(); }
                    try { Thread.sleep(1000); } catch (InterruptedException ignored) { }
                    deny(link, "wrong-code");
                    return;
                }
                m = Handshake.MODE_PIN;
            }
            // the חיברתי program on Windows, or a browser page
            approveAndAttach(link, id, m, name, model, 0, "program".equals(h.optString("client")) ? "program" : "pc", "pc", link.remoteIp);
        } catch (Exception e) {
            link.close();
        }
    }

    /** Same for phones and computers: a new device must be approved on this screen; a remembered one needs no approval. */
    private void approveAndAttach(Link link, String peerId, int mode, String name, String model, int sdk, String via, String kind, String ip) throws Exception {
        if (hub.busyWith(peerId)) { deny(link, "busy"); return; }
        boolean remember = true;
        if (mode != Handshake.MODE_TRUSTED && mode != MODE_CLAIM) {
            Request req = new Request(Crypto.hex(Crypto.random(6)), name, model, via);
            req.kind = kind;
            synchronized (this) { requests.put(req.rid, req); }
            hub.changed();
            LinkService.ask(ctx, name);
            boolean answered = req.latch.await(60, TimeUnit.SECONDS);
            synchronized (this) { requests.remove(req.rid); }
            LinkService.askDone(ctx);
            hub.changed();
            if (!answered || !req.allow) { Diag.log("host", name + ": " + (answered ? "declined" : "no answer in time")); deny(link, answered ? "declined" : "timeout"); return; }
            remember = req.remember;
            Pairing p = pairing;
            if (p != null) p.consumed();
        }
        byte[] key = Crypto.random(32);
        byte[] pair = remember && mode != Handshake.MODE_TRUSTED ? Crypto.random(32) : null;
        if (pair != null) hub.ids.saveTrusted(peerId, name, model, pair, via);
        JSONObject ok = new JSONObject().put("key", Crypto.b64(key)).put("pair", pair == null ? "" : Crypto.b64(pair))
            .put("name", hub.ids.myName()).put("model", Build.MODEL).put("sdk", Build.VERSION.SDK_INT).put("app", 1).put("id", hub.ids.myId());
        link.send(Proto.APPROVED, Proto.json(ok));
        Diag.log("host", "connected: " + name + " (" + via + (mode == Handshake.MODE_TRUSTED ? ", remembered, no approval" : "") + ")");
        Session s = new Session(peerId, true, key, hub);
        s.peerName = name;
        s.peerModel = model;
        s.peerSdk = sdk;
        s.via = via;
        s.kind = kind;
        s.address = ip;
        hub.attach(s, link);
    }

    private void deny(Link link, String why) {
        Diag.log("host", "refused: " + why);
        try { link.send(Proto.DENIED, Proto.json(new JSONObject().put("reason", why))); } catch (Exception ignored) { }
        link.close();
    }

    // ---------- session life ----------
    void onSessionStarted(Session s) {
        joiner.stopScan();
        if (s.host) {
            beacon.stopSending();
            p2p.stopAdvertise();
            synchronized (this) { hosting = false; hostReady = false; }
        }
    }

    void onLinkLost(Session s) {
        if (!s.host) joiner.reconnect(s);
        else h.postDelayed(() -> { if (s.state == Session.RECONNECTING) s.close("lost", false); }, 35000);
    }

    void onSessionClosed(Session s, String reason) {
        if (s.host) { if (!hosting) teardownHostNet(); }
        else joiner.leaveNetwork();
        if (!hosting && !joiner.busy()) LinkService.stop(ctx);
        if (pcReady) h.postDelayed(this::startPcReady, 1500);
    }

    void stopAll() {
        joiner.cancel();
        joiner.stopScan();
        if (hosting) stopHost();
        else if (hub.session == null) teardownHostNet();
    }

    // ---------- WifiDirect.Events ----------
    @Override public void onPeers() { joiner.checkWanted(); hub.changed(); }

    @Override public void onConnection(boolean connected, String ownerIp, boolean iAmOwner) { joiner.onP2pConnection(connected, ownerIp, iAmOwner); }

    @Override public void onEnabled(boolean enabled) {
        if (!enabled && hosting && "d".equals(method)) { synchronized (this) { hostError = "wifi-off"; } }
        hub.changed();
    }
}
