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
        s.put("join", new JSONObject().put("on", joining).put("step", step).put("name", target).put("error", error));
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
            Handshake.Result r = null;
            String via = "wifi", addr = null;
            Network net = null;
            List<String> mine = NetUtil.addresses();
            for (String a : q.addresses) {
                if (a.startsWith("192.168.49.") || !inSubnet(a, mine)) continue;
                r = attempt(a, q.port, NetUtil.wifiNetwork(hub.ctx), Handshake.MODE_QR, token, q.id);
                if (r != null) { addr = a; break; }
            }
            if (r == null && !"l".equals(q.method)) {
                setStep("network");
                if ("d".equals(q.method) && Build.VERSION.SDK_INT >= 29 && p2pJoin(q.ssid, q.pass)) {
                    addr = p2pOwnerIp == null ? WifiDirect.OWNER_IP : p2pOwnerIp;
                    via = "wifi-direct";
                    setStep("connecting");
                    r = attemptRetry(addr, q.port, null, Handshake.MODE_QR, token, q.id);
                }
                if (r == null && !cancelled) {
                    net = wifiJoin(q.ssid, q.pass);
                    if (cancelled) throw new IOException("cancelled");
                    setStep("connecting");
                    via = "d".equals(q.method) ? "wifi-direct" : "hotspot";
                    List<String> cands = new ArrayList<>();
                    if ("d".equals(q.method)) cands.add(WifiDirect.OWNER_IP);
                    else { List<String> now = NetUtil.addresses(); for (String a : q.addresses) if (inSubnet(a, now)) cands.add(a); for (String a : q.addresses) if (!cands.contains(a)) cands.add(a); }
                    for (String a : cands) { r = attemptRetry(a, q.port, net, Handshake.MODE_QR, token, q.id); if (r != null) { addr = a; break; } }
                }
            }
            if (cancelled) throw new IOException("cancelled");
            if (r == null) throw new IOException("l".equals(q.method) ? "lan-unreachable" : "unreachable");
            finish(r, via, addr, q.port, net, Handshake.MODE_QR);
        } catch (Handshake.AuthException e) {
            fail(authCode(e.code, Handshake.MODE_QR));
        } catch (Exception e) {
            fail(cancelled ? "cancelled" : String.valueOf(e.getMessage()));
        }
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

    @Override public void onLanPeers() { hub.changed(); }

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
        final LanBeacon.Peer flp = lp;
        final WifiDirect.Peer fpp = pp;
        if (!begin(lan ? lp.name : (pp.name != null ? pp.name : pp.deviceName))) return "busy";
        work(() -> {
            try {
                Handshake.Result r;
                String addr;
                Network net = null;
                int port = Proto.PORT;
                if (lan) {
                    addr = flp.ip;
                    port = flp.port;
                    net = NetUtil.wifiNetwork(hub.ctx);
                    r = attempt(addr, port, net, mode, secret, id);
                } else {
                    setStep("network");
                    p2pLatch = new CountDownLatch(1);
                    final CountDownLatch started = new CountDownLatch(1);
                    final boolean[] ok = { false };
                    c.p2p.connect(fpp.address, (good, reason, a, b) -> { ok[0] = good; started.countDown(); });
                    if (!started.await(10, TimeUnit.SECONDS) || !ok[0]) throw new IOException("p2p-failed");
                    joinedP2p = true;
                    if (!p2pLatch.await(45, TimeUnit.SECONDS)) throw new IOException(cancelled ? "cancelled" : "p2p-failed");
                    addr = p2pOwnerIp == null ? WifiDirect.OWNER_IP : p2pOwnerIp;
                    setStep("connecting");
                    r = attemptRetry(addr, port, null, mode, secret, id == null || id.isEmpty() ? null : id);
                }
                if (r == null) throw new IOException(cancelled ? "cancelled" : "unreachable");
                finish(r, lan ? "wifi" : "wifi-direct", addr, port, net, mode);
            } catch (Handshake.AuthException e) {
                fail(authCode(e.code, mode));
            } catch (Exception e) {
                fail(cancelled ? "cancelled" : String.valueOf(e.getMessage()));
            }
        });
        return null;
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
                    Socket so = NetUtil.connect(s.address, s.port, s.network, 3000);
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
                    Socket so = NetUtil.connect(s.address, s.port, s.network, 3000);
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
