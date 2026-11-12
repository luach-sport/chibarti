package com.luachsport.chibarti;

import android.net.Network;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Making the connection, joining side: from a scanned QR code (shared Wi-Fi first, then the host's own network),
 * or from the list of nearby phones with the 6-digit code (a paired phone needs no code). Also reconnects a dropped
 * session and opens the second connection for the screen stream.
 */
final class Joiner implements LanBeacon.Found {
    private final Connect c;
    private final Hub hub;
    private volatile boolean joining = false, cancelled = false, scanning = false, joinedP2p = false;
    private volatile String step = "", target = "", error = "", scanError = "";
    private volatile Socket pending;
    private volatile CountDownLatch p2pLatch;
    private volatile String p2pOwnerIp;

    Joiner(Connect c) { this.c = c; this.hub = c.hub; }

    boolean busy() { return joining; }

    void describe(JSONObject s) throws Exception {
        s.put("join", new JSONObject().put("on", joining).put("step", step).put("name", target).put("error", error)
            .put("want", wantId.isEmpty() ? null : new JSONObject().put("id", wantId).put("name", wantName).put("until", wantUntil))
            .put("pinFor", pinFor.isEmpty() ? null : new JSONObject().put("key", pinFor).put("name", pinName)));
        JSONArray peers = new JSONArray();
        List<String> ids = new ArrayList<>();
        synchronized (c.beacon.peers) {
            for (LanBeacon.Peer p : c.beacon.peers.values()) {
                ids.add(p.id);
                peers.put(new JSONObject().put("key", "l:" + p.id).put("id", p.id).put("name", p.name).put("via", "wifi").put("app", true)
                    .put("trusted", hub.ids.trustedKey(p.id) != null));
            }
        }
        synchronized (c.p2p.peers) {
            for (WifiDirect.Peer p : c.p2p.peers.values()) {
                if (p.id != null && ids.contains(p.id)) continue;
                String name = p.name != null && !p.name.isEmpty() ? p.name : p.deviceName;
                peers.put(new JSONObject().put("key", "p:" + p.address).put("id", p.id == null ? "" : p.id).put("name", name == null ? "" : name)
                    .put("via", "wifi-direct").put("app", p.app).put("status", p.status)
                    .put("trusted", p.id != null && hub.ids.trustedKey(p.id) != null));
            }
        }
        s.put("scan", new JSONObject().put("on", scanning).put("error", scanError).put("peers", peers));
    }

    private void setStep(String st) { step = st; hub.changed(); }

    private void fail(String code) {
        error = code;
        joining = false;
        step = "";
        leaveNetwork();
        hub.notice("join-failed", code);
        hub.changed();
    }

    // ---------- QR ----------
    /** Returns null when the join started, or why the code can't be used. */
    String joinQr(String text) {
        final QrPayload q;
        try { q = QrPayload.parse(text, System.currentTimeMillis() / 1000); } catch (IllegalArgumentException e) { return "qr-" + e.getMessage(); }
        if (q.id.equals(hub.ids.myId())) return "qr-self";
        if (hub.connected()) return "busy";
        if (!begin(q.name)) return "busy";
        work(() -> runQr(q));
        return null;
    }

    private boolean begin(String name) {
        synchronized (this) {
            if (joining) return false;
            joining = true;
            cancelled = false;
        }
        error = "";
        wantId = "";
        target = name == null ? "" : name;
        if (c.hosting) c.stopHost();
        stopScan();
        LinkService.start(hub.ctx);
        setStep("connecting");
        return true;
    }

    private void work(Runnable r) { Thread t = new Thread(r, "join"); t.setDaemon(true); t.start(); }

    private void runQr(QrPayload q) {
        byte[] token = Crypto.unb64(q.token);
        try {
            Joined j = null;
            List<String> mine = NetUtil.addresses();
            for (String a : q.addresses) {
                if (a.startsWith("192.168.49.") || !inSubnet(a, mine)) continue;
                Handshake.Result r = attempt(a, q.port, NetUtil.wifiNetwork(hub.ctx), Handshake.MODE_QR, token, q.id);
                if (r != null) { j = new Joined(r, a, "wifi", null); break; }
            }
            if (j == null && !"l".equals(q.method)) j = viaNetwork(q.method, q.ssid, q.pass, q.addresses, q.port, Handshake.MODE_QR, token, q.id);
            if (cancelled) throw new IOException("cancelled");
            if (j == null) throw new IOException("l".equals(q.method) ? "lan-unreachable" : "unreachable");
            finish(j.r, j.via, j.addr, q.port, j.net, Handshake.MODE_QR);
        } catch (Handshake.AuthException e) {
            fail(authCode(e.code, Handshake.MODE_QR));
        } catch (Exception e) {
            fail(cancelled ? "cancelled" : String.valueOf(e.getMessage()));
        }
    }

    private static final class Joined {
        final Handshake.Result r;
        final String addr, via;
        final Network net;
        Joined(Handshake.Result r, String addr, String via, Network net) { this.r = r; this.addr = addr; this.via = via; this.net = net; }
    }

    /**
     * Joins the hosting phone's own network (its Wi-Fi Direct group "d" or local hotspot "h") with its name and
     * password, from the QR code or from the sealed announcement, and makes the encrypted connection there.
     */
    private Joined viaNetwork(String method, String ssid, String pass, List<String> addrs, int port, int mode, byte[] secret, String id) throws Exception {
        setStep("network");
        if ("d".equals(method) && Build.VERSION.SDK_INT >= 29 && p2pJoin(ssid, pass)) {
            String addr = p2pOwnerIp == null ? WifiDirect.OWNER_IP : p2pOwnerIp;
            setStep("connecting");
            Handshake.Result r = attemptRetry(addr, port, null, mode, secret, id);
            if (r != null) return new Joined(r, addr, "wifi-direct", null);
        }
        if (cancelled) return null;
        Network net = wifiJoin(ssid, pass);
        if (cancelled) throw new IOException("cancelled");
        setStep("connecting");
        List<String> cands = new ArrayList<>();
        if ("d".equals(method)) cands.add(WifiDirect.OWNER_IP);
        else {
            List<String> now = NetUtil.addresses();
            for (String a : addrs) if (inSubnet(a, now)) cands.add(a);
            for (String a : addrs) if (!cands.contains(a)) cands.add(a);
            // the hotspot's own address is usually .1 of the new network
            for (String a : now) { int dot = a.lastIndexOf('.'); String g = dot > 0 ? a.substring(0, dot) + ".1" : null; if (g != null && !cands.contains(g) && !g.equals(a)) cands.add(g); }
        }
        for (String a : cands) {
            Handshake.Result r = attemptRetry(a, port, net, mode, secret, id);
            if (r != null) return new Joined(r, a, "d".equals(method) ? "wifi-direct" : "hotspot", net);
        }
        return null;
    }

    private static boolean inSubnet(String a, List<String> mine) {
        for (String m : mine) if (NetUtil.sameSubnet24(a, m)) return true;
        return false;
    }

    static String authCode(int code, int mode) {
        switch (code) {
            case Handshake.ERR_CODE: return mode == Handshake.MODE_PIN ? "wrong-code" : "expired";
            case Handshake.ERR_EXPIRED: return "expired";
            case Handshake.ERR_BUSY: return "busy";
            case Handshake.ERR_VERSION: return "version";
            default: return mode == Handshake.MODE_TRUSTED ? "need-pin" : "unknown";
        }
    }

    /** One try; null when the phone isn't reachable there. A refused code is thrown (no point trying elsewhere). */
    private Handshake.Result attempt(String ip, int port, Network net, int mode, byte[] secret, String expectId) throws Handshake.AuthException {
        Socket s = null;
        try {
            s = NetUtil.connect(ip, port, net, 3000);
            pending = s;
            return Handshake.client(s, hub.ids.myId(), mode, secret, expectId);
        } catch (Handshake.AuthException e) {
            if (s != null) { try { s.close(); } catch (Exception ignored) { } }
            throw e;
        } catch (Exception e) {
            if (s != null) { try { s.close(); } catch (Exception ignored) { } }
            return null;
        }
    }

    /** A new network takes a few seconds to carry traffic: try for up to 12 seconds. */
    private Handshake.Result attemptRetry(String ip, int port, Network net, int mode, byte[] secret, String expectId) throws Handshake.AuthException {
        long until = System.currentTimeMillis() + 12000;
        while (!cancelled) {
            Handshake.Result r = attempt(ip, port, net, mode, secret, expectId);
            if (r != null || System.currentTimeMillis() > until) return r;
            try { Thread.sleep(1000); } catch (InterruptedException e) { return null; }
        }
        return null;
    }

    private boolean p2pJoin(String ssid, String pass) throws InterruptedException {
        final CountDownLatch started = new CountDownLatch(1);
        final boolean[] ok = { false };
        p2pLatch = new CountDownLatch(1);
        p2pOwnerIp = null;
        c.p2p.join(ssid, pass, (good, reason, a, b) -> { ok[0] = good; started.countDown(); });
        if (!started.await(10, TimeUnit.SECONDS) || !ok[0]) return false;
        joinedP2p = true;
        boolean up = p2pLatch.await(25, TimeUnit.SECONDS);
        if (!up) { c.p2p.removeGroup(); joinedP2p = false; }
        return up;
    }

    void onP2pConnection(boolean connected, String ownerIp, boolean owner) {
        CountDownLatch l = p2pLatch;
        if (connected && !owner) { p2pOwnerIp = ownerIp; if (l != null) l.countDown(); }
        hub.changed();
    }

    private Network wifiJoin(String ssid, String pass) throws IOException, InterruptedException {
        final CountDownLatch done = new CountDownLatch(1);
        final Object[] res = { null, null };
        c.wifi.join(ssid, pass, (net, err) -> { res[0] = net; res[1] = err; done.countDown(); });
        if (!done.await(75, TimeUnit.SECONDS)) throw new IOException("timeout");
        if (res[1] != null) throw new IOException("declined".equals(res[1]) ? "wifi-declined" : "unreachable");
        return (Network) res[0];
    }

    private void finish(Handshake.Result r, String via, String addr, int port, Network net, int mode) throws Exception {
        setStep("approval");
        JSONObject hello = new JSONObject().put("name", hub.ids.myName()).put("model", Build.MODEL).put("sdk", Build.VERSION.SDK_INT).put("app", 1);
        r.link.send(Proto.HELLO, Proto.json(hello));
        r.link.setReadTimeout(75000);
        Link.Frame f;
        try { f = r.link.read(); } catch (IOException e) { r.link.close(); throw new IOException(cancelled ? "cancelled" : "timeout"); }
        r.link.setReadTimeout(0);
        if (f.type == Proto.DENIED) {
            String why = new JSONObject(f.text()).optString("reason", "declined");
            r.link.close();
            throw new IOException(why);
        }
        if (f.type != Proto.APPROVED || cancelled) { r.link.close(); throw new IOException(cancelled ? "cancelled" : "protocol"); }
        JSONObject o = new JSONObject(f.text());
        String name = QrPayload.clean(o.optString("name"), 40), model = QrPayload.clean(o.optString("model"), 60);
        String pair = o.optString("pair", "");
        if (!pair.isEmpty()) hub.ids.saveTrusted(r.peerId, name, model, Crypto.unb64(pair), via);
        Session s = new Session(r.peerId, false, Crypto.unb64(o.getString("key")), hub);
        s.peerName = name;
        s.peerModel = model;
        s.peerSdk = o.optInt("sdk");
        s.via = via;
        s.address = addr;
        s.port = port;
        s.network = net;
        joining = false;
        step = "";
        hub.attach(s, r.link);
    }

    // ---------- nearby list ----------
    void scan() {
        scanning = true;
        scanError = "";
        c.beacon.startListening(hub.ids.myId(), this);
        if (c.p2p.supported()) {
            c.p2p.clearPeers();
            c.p2p.scan((ok, reason, a, b) -> { if (!ok) { scanError = WifiDirect.reason(reason); hub.changed(); } });
        } else scanError = "unsupported";
        hub.changed();
        expireLoop();
    }

    private void expireLoop() {
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            if (!scanning) return;
            if (c.beacon.expire(7000)) hub.changed();
            expireLoop();
        }, 3000);
    }

    void stopScan() {
        if (!scanning) return;
        scanning = false;
        c.p2p.stopScan();
        c.beacon.stopListening();
        hub.changed();
    }

    @Override public void onLanPeers() { checkWanted(); hub.changed(); }

    /** Connects to a phone from the nearby list. pin may be empty for a paired phone. */
    String connectPeer(String key, String pin) {
        if (key == null) return "unknown";
        if (hub.connected()) return "busy";
        final boolean lan = key.startsWith("l:");
        final String ref = key.substring(2);
        LanBeacon.Peer lp = null;
        WifiDirect.Peer pp = null;
        if (lan) synchronized (c.beacon.peers) { lp = c.beacon.peers.get(ref); }
        else synchronized (c.p2p.peers) { pp = c.p2p.peers.get(ref); }
        if (lp == null && pp == null) return "gone";
        final String id = lan ? lp.id : pp.id;
        byte[] trusted = id == null || id.isEmpty() ? null : hub.ids.trustedKey(id);
        final boolean usePin = pin != null && pin.matches("[0-9]{6}");
        if (!usePin && trusted == null) return "need-pin";
        final int mode = usePin ? Handshake.MODE_PIN : Handshake.MODE_TRUSTED;
        final byte[] secret = usePin ? pin.getBytes(Proto.UTF8) : trusted;
        // a remembered phone opens the other phone's network with the key it got last time; without it, the code
        NetSeal.Net known = null;
        if (!lan && !usePin && !pp.sealKnown.isEmpty()) {
            known = NetSeal.open(hub.ids.peerNet(id), pp.sealKnown);
            if (known == null) return "need-pin";
        }
        final NetSeal.Net fknown = known;
        final LanBeacon.Peer flp = lp;
        final WifiDirect.Peer fpp = pp;
        if (!begin(lan ? lp.name : (pp.name != null ? pp.name : pp.deviceName))) return "busy";
        pinFor = "";
        work(() -> {
            try {
                Joined j;
                if (lan) {
                    Network net = NetUtil.wifiNetwork(hub.ctx);
                    Handshake.Result r = attempt(flp.ip, flp.port, net, mode, secret, id);
                    j = r == null ? null : new Joined(r, flp.ip, "wifi", net);
                } else {
                    NetSeal.Net n = fknown;
                    if (n == null && usePin && !fpp.sealPin.isEmpty()) {
                        n = openWithPin(fpp.address, pin, id);
                        if (n == null) throw new IOException(cancelled ? "cancelled" : "wrong-code");
                    }
                    if (n != null) {
                        List<String> addrs = new ArrayList<>();
                        for (String a : fpp.addrs.split(",")) if (!a.trim().isEmpty()) addrs.add(a.trim());
                        j = viaNetwork(n.method, n.ssid, n.pass, addrs, fpp.port, mode, secret, id);
                    } else j = viaInvitation(fpp, mode, secret, id); // a phone with an older Chibarti
                }
                if (j == null) throw new IOException(cancelled ? "cancelled" : "unreachable");
                finish(j.r, j.via, j.addr, j.via.equals("wifi") ? flp.port : fpp.port, j.net, mode);
            } catch (Handshake.AuthException e) {
                fail(authCode(e.code, mode));
            } catch (Exception e) {
                fail(cancelled ? "cancelled" : String.valueOf(e.getMessage()));
            }
        });
        return null;
    }

    /**
     * Opens the network seal with the typed code. The code on the other phone may have just changed (a new seal is
     * announced within seconds), so on a mismatch it asks again for a few seconds before saying the code is wrong.
     */
    private NetSeal.Net openWithPin(String address, String pin, String hostId) throws InterruptedException {
        byte[] k = NetSeal.pinKey(pin, hostId);
        long until = System.currentTimeMillis() + 9000;
        String tried = null;
        while (!cancelled) {
            WifiDirect.Peer p;
            synchronized (c.p2p.peers) { p = c.p2p.peers.get(address); }
            String w = p == null ? "" : p.sealPin;
            if (!w.isEmpty() && !w.equals(tried)) {
                NetSeal.Net n = NetSeal.open(k, w);
                if (n != null) return n;
                if (tried == null) c.p2p.refreshServices();
                tried = w;
            }
            if (System.currentTimeMillis() > until) return null;
            Thread.sleep(700);
        }
        return null;
    }

    /** The old way (the other phone has an older Chibarti): Android asks the other phone to accept an invitation. */
    private Joined viaInvitation(WifiDirect.Peer fpp, int mode, byte[] secret, String id) throws Exception {
        setStep("network");
        p2pLatch = new CountDownLatch(1);
        final CountDownLatch started = new CountDownLatch(1);
        final boolean[] ok = { false };
        c.p2p.connect(fpp.address, (good, reason, a, b) -> { ok[0] = good; started.countDown(); });
        if (!started.await(10, TimeUnit.SECONDS) || !ok[0]) throw new IOException("p2p-failed");
        joinedP2p = true;
        if (!p2pLatch.await(45, TimeUnit.SECONDS)) throw new IOException(cancelled ? "cancelled" : "p2p-failed");
        String addr = p2pOwnerIp == null ? WifiDirect.OWNER_IP : p2pOwnerIp;
        setStep("connecting");
        Handshake.Result r = attemptRetry(addr, fpp.port, null, mode, secret, id == null || id.isEmpty() ? null : id);
        return r == null ? null : new Joined(r, addr, "wifi-direct", null);
    }

    // ---------- a remembered phone: "connect" from the list ----------
    private volatile String wantId = "", wantName = "", pinFor = "", pinName = "";
    private volatile long wantUntil = 0;

    /** Looks for a remembered phone (the other phone taps "Start a connection") and connects to it without a code. */
    String connectKnown(String id) {
        if (id == null || hub.ids.trustedKey(id) == null) return "unknown";
        if (hub.connected()) return "busy";
        if (joining) return "busy";
        String name = "";
        try {
            org.json.JSONArray l = hub.ids.list();
            for (int i = 0; i < l.length(); i++) if (id.equals(l.getJSONObject(i).optString("id"))) name = l.getJSONObject(i).optString("name");
        } catch (Exception ignored) { }
        wantId = id;
        wantName = name;
        wantUntil = System.currentTimeMillis() + 120000;
        pinFor = "";
        error = "";
        if (c.hosting) c.stopHost();
        if (!scanning) scan();
        checkWanted();
        wantTimeout();
        hub.changed();
        return null;
    }

    void cancelKnown() {
        if (wantId.isEmpty()) return;
        wantId = "";
        stopScan();
        hub.changed();
    }

    private void wantTimeout() {
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            if (wantId.isEmpty()) return;
            if (System.currentTimeMillis() < wantUntil) { wantTimeout(); return; }
            String n = wantName;
            wantId = "";
            stopScan();
            hub.notice("known-not-found", n);
            hub.changed();
        }, 2000);
    }

    /** Called whenever the nearby list changes: the wanted phone showed up (it is offering a connection). */
    void checkWanted() {
        final String id = wantId;
        if (id.isEmpty() || joining || hub.connected()) return;
        String key = null;
        synchronized (c.beacon.peers) { for (LanBeacon.Peer p : c.beacon.peers.values()) if (id.equals(p.id)) key = "l:" + p.id; }
        if (key == null) synchronized (c.p2p.peers) { for (WifiDirect.Peer p : c.p2p.peers.values()) if (p.app && id.equals(p.id)) key = "p:" + p.address; }
        if (key == null) return;
        synchronized (this) { if (!id.equals(wantId)) return; wantId = ""; } // found once, connected once
        final String k = key;
        hub.h.post(() -> {
            String err = connectPeer(k, null);
            if ("need-pin".equals(err)) { pinFor = k; pinName = wantName; hub.changed(); }
            else if (err != null && !"busy".equals(err)) { error = err; hub.notice("join-failed", err); hub.changed(); }
        });
    }

    void cancel() {
        if (!joining) return;
        cancelled = true;
        Socket s = pending;
        if (s != null) { try { s.close(); } catch (Exception ignored) { } }
        CountDownLatch l = p2pLatch;
        if (l != null) l.countDown();
        fail("cancelled");
    }

    void leaveNetwork() {
        c.wifi.leave();
        if (joinedP2p) { c.p2p.removeGroup(); joinedP2p = false; }
    }

    // ---------- after the session started ----------
    void reconnect(final Session s) {
        work(() -> {
            long until = System.currentTimeMillis() + 30000;
            while (s.state == Session.RECONNECTING && System.currentTimeMillis() < until) {
                try {
                    Socket so = NetUtil.connect(s.address, s.port, (Network) s.network, 3000);
                    Handshake.Result r = Handshake.client(so, hub.ids.myId(), Handshake.MODE_RESUME, s.key, s.peerId);
                    s.replaceMain(r.link);
                    return;
                } catch (Handshake.AuthException e) {
                    break;
                } catch (Exception e) {
                    try { Thread.sleep(2000); } catch (InterruptedException ie) { return; }
                }
            }
            if (s.state == Session.RECONNECTING) s.close("lost", false);
        });
    }

    /** The second connection, for the screen stream (always opened by the joining phone). */
    void openStream(final Session s, final Runnable onReady) {
        work(() -> {
            for (int i = 0; i < 5 && s.state != Session.CLOSED; i++) {
                try {
                    Socket so = NetUtil.connect(s.address, s.port, (Network) s.network, 3000);
                    so.setSendBufferSize(256 * 1024);
                    Handshake.Result r = Handshake.client(so, hub.ids.myId(), Handshake.MODE_STREAM, s.key, s.peerId);
                    s.attachStream(r.link);
                    if (onReady != null) onReady.run();
                    return;
                } catch (Exception e) {
                    try { Thread.sleep(1000); } catch (InterruptedException ie) { return; }
                }
            }
            hub.mirror.streamFailed();
        });
    }
}
