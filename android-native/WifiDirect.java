package com.luachsport.chibarti;

import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.NetworkInfo;
import android.net.wifi.WpsInfo;
import android.net.wifi.p2p.WifiP2pConfig;
import android.net.wifi.p2p.WifiP2pDevice;
import android.net.wifi.p2p.WifiP2pDeviceList;
import android.net.wifi.p2p.WifiP2pGroup;
import android.net.wifi.p2p.WifiP2pInfo;
import android.net.wifi.p2p.WifiP2pManager;
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceInfo;
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Wi-Fi Direct: phone to phone over Wi-Fi with no router and no internet.
 * The hosting phone makes a group (it becomes a tiny access point, always 192.168.49.1) and announces itself as a
 * Chibarti service; the other phone finds it, or joins straight from the QR code's network name and password.
 */
@SuppressLint("MissingPermission")
final class WifiDirect {
    static final String SERVICE = "_chibarti._tcp";
    static final String OWNER_IP = "192.168.49.1";

    interface Events {
        void onPeers();
        void onConnection(boolean connected, String ownerIp, boolean iAmOwner);
        void onEnabled(boolean enabled);
    }

    interface Done { void done(boolean ok, int reason, String a, String b); }

    static final class Peer {
        String address, deviceName, id, name;
        int status;
        boolean app, owner;
        long seen;
        // from the announcement of a hosting Chibarti phone: its port, its network (kind, public name) and the two
        // seals of the network's password (NetSeal)
        volatile int port = Proto.PORT;
        volatile String method = "", ssid = "", sealPin = "", sealKnown = "", addrs = "";
        String logged = "";
    }

    private final Context ctx;
    private final WifiP2pManager mgr;
    private WifiP2pManager.Channel ch;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Events ev;
    final Map<String, Peer> peers = new LinkedHashMap<>();
    volatile boolean enabled = true, connected = false, owner = false;
    volatile String ownerIp = null;
    private boolean registered = false, scanning = false;

    private final BroadcastReceiver rx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String a = i.getAction();
            if (WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION.equals(a)) {
                enabled = i.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE, -1) == WifiP2pManager.WIFI_P2P_STATE_ENABLED;
                ev.onEnabled(enabled);
            } else if (WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION.equals(a)) {
                requestPeers();
            } else if (WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION.equals(a)) {
                NetworkInfo ni = i.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO);
                WifiP2pInfo info = i.getParcelableExtra(WifiP2pManager.EXTRA_WIFI_P2P_INFO);
                boolean up = ni != null && ni.isConnected() && info != null && info.groupFormed;
                connected = up;
                owner = up && info.isGroupOwner;
                ownerIp = up && info.groupOwnerAddress != null ? info.groupOwnerAddress.getHostAddress() : null;
                ev.onConnection(up, ownerIp, owner);
            }
        }
    };

    WifiDirect(Context c, Events ev) {
        this.ctx = c.getApplicationContext();
        this.ev = ev;
        WifiP2pManager m = null;
        try { m = (WifiP2pManager) ctx.getSystemService(Context.WIFI_P2P_SERVICE); } catch (Exception ignored) { }
        mgr = m;
    }

    boolean supported() {
        return mgr != null && ctx.getPackageManager().hasSystemFeature("android.hardware.wifi.direct");
    }

    private boolean ready() {
        if (mgr == null) return false;
        if (ch == null) {
            try { ch = mgr.initialize(ctx, Looper.getMainLooper(), () -> ch = null); } catch (Exception e) { return false; }
        }
        if (!registered) {
            IntentFilter f = new IntentFilter();
            f.addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION);
            f.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION);
            f.addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);
            if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(rx, f, Context.RECEIVER_NOT_EXPORTED);
            else ctx.registerReceiver(rx, f);
            registered = true;
        }
        return ch != null;
    }

    private WifiP2pManager.ActionListener al(Done d) {
        return new WifiP2pManager.ActionListener() {
            @Override public void onSuccess() { if (d != null) d.done(true, 0, null, null); }
            @Override public void onFailure(int reason) { if (d != null) d.done(false, reason, null, null); }
        };
    }

    /** Makes this phone the group owner. done(ok, reason, networkName, password). */
    void createGroup(Done done) {
        if (!ready()) { done.done(false, WifiP2pManager.P2P_UNSUPPORTED, null, null); return; }
        try {
            mgr.removeGroup(ch, al((ok, r, a, b) -> h.postDelayed(() -> {
                try {
                    mgr.createGroup(ch, al((ok2, r2, a2, b2) -> {
                        if (!ok2) { Diag.log("p2p", "group FAILED: " + reason(r2)); done.done(false, r2, null, null); }
                        else pollGroup(done, 0);
                    }));
                } catch (SecurityException e) { Diag.log("p2p", "group: no permission"); done.done(false, -2, null, null); }
            }, ok ? 400 : 50)));
        } catch (SecurityException e) { done.done(false, -2, null, null); }
    }

    private void pollGroup(Done done, int tries) {
        try {
            mgr.requestGroupInfo(ch, (WifiP2pGroup g) -> {
                if (g != null && g.getPassphrase() != null && g.isGroupOwner()) {
                    Diag.log("p2p", "group ready: " + g.getNetworkName() + " (" + g.getClientList().size() + " connected)");
                    owner = true;
                    ownerIp = OWNER_IP;
                    done.done(true, 0, g.getNetworkName(), g.getPassphrase());
                } else if (tries < 24) h.postDelayed(() -> pollGroup(done, tries + 1), 500);
                else { Diag.log("p2p", "group never became ready"); done.done(false, WifiP2pManager.ERROR, null, null); }
            });
        } catch (SecurityException e) { done.done(false, -2, null, null); }
    }

    void removeGroup() {
        if (!ready()) return;
        try { mgr.removeGroup(ch, al(null)); } catch (Exception ignored) { }
        try { mgr.cancelConnect(ch, al(null)); } catch (Exception ignored) { }
        connected = false; owner = false; ownerIp = null;
    }

    /**
     * Lets nearby phones that search see this one as a Chibarti device: one small announcement with its id, name and
     * port (as before), and a second small one with its network (net: public name, kind, the two password seals).
     * Two small ones instead of one big one: a big announcement doesn't arrive on some phones.
     */
    void advertise(String id, String name, int port, Map<String, String> net) {
        if (!ready()) return;
        Map<String, String> txt = new HashMap<>();
        txt.put("i", id);
        txt.put("p", String.valueOf(port));
        txt.put("n", QrPayload.clean(name, 24).replace('=', '-'));
        txt.put("v", "3");
        final WifiP2pDnsSdServiceInfo who, where;
        try {
            who = WifiP2pDnsSdServiceInfo.newInstance("chibarti-" + id.substring(0, 8), SERVICE, txt);
            where = net == null || net.isEmpty() ? null : WifiP2pDnsSdServiceInfo.newInstance("chibarti-" + id.substring(0, 8) + "-n", SERVICE, net);
        } catch (Exception e) { Diag.log("p2p", "announcement not made: " + Diag.why(e)); return; }
        int size = 0;
        if (net != null) for (Map.Entry<String, String> e : net.entrySet()) size += e.getKey().length() + e.getValue().length() + 2;
        Diag.log("p2p", "announcing (with network: " + (where != null) + ", " + size + " bytes)");
        try {
            mgr.clearLocalServices(ch, al((ok, r, a, b) -> {
                addService(who, "identity");
                if (where != null) addService(where, "network");
            }));
        } catch (Exception e) { Diag.log("p2p", "announce failed: " + Diag.why(e)); }
    }

    private void addService(WifiP2pDnsSdServiceInfo info, String what) {
        try { mgr.addLocalService(ch, info, al((ok, r, a, b) -> Diag.log("p2p", "announce " + what + (ok ? " ok" : " FAILED: " + reason(r))))); }
        catch (Exception e) { Diag.log("p2p", "announce " + what + " FAILED: " + Diag.why(e)); }
    }

    void stopAdvertise() {
        if (!ready()) return;
        try { mgr.clearLocalServices(ch, al(null)); } catch (Exception ignored) { }
    }

    /** Looks for nearby Wi-Fi Direct devices; the ones running Chibarti (as hosts) are marked. */
    void scan(Done result) {
        if (!ready()) { result.done(false, WifiP2pManager.P2P_UNSUPPORTED, null, null); return; }
        scanning = true;
        try {
            mgr.setDnsSdResponseListeners(ch, (instance, type, dev) -> { }, (domain, txt, dev) -> {
                if (domain == null || !domain.contains("_chibarti") || dev == null) return;
                Peer p = peer(dev);
                p.app = true;
                String part;
                if (txt.containsKey("i")) {
                    part = "identity";
                    p.id = txt.get("i");
                    p.name = txt.get("n");
                    try { p.port = Integer.parseInt(txt.get("p")); } catch (Exception e) { p.port = Proto.PORT; }
                } else if (txt.containsKey("s")) {
                    part = "network";
                    p.ssid = NetSeal.txtRead(txt.get("s"));
                    p.method = txt.get("m") == null ? "" : txt.get("m");
                    p.sealPin = txt.get("w") == null ? "" : txt.get("w");
                    p.sealKnown = txt.get("r") == null ? "" : txt.get("r");
                    p.addrs = NetSeal.txtRead(txt.get("a"));
                } else part = "other " + txt.keySet();
                String note = part + (p.ssid.isEmpty() ? "" : " " + p.method + " " + p.ssid);
                if (!note.equals(p.logged)) { p.logged = note; Diag.log("p2p", "found Chibarti " + (p.name == null ? dev.deviceName : p.name) + " (" + dev.deviceAddress + "): " + part); }
                ev.onPeers();
            });
            WifiP2pDnsSdServiceRequest req = WifiP2pDnsSdServiceRequest.newInstance(SERVICE);
            mgr.clearServiceRequests(ch, al((o, r, a, b) -> {
                try { mgr.addServiceRequest(ch, req, al((o2, r2, a2, b2) -> serviceRound())); } catch (Exception ignored) { }
            }));
            mgr.discoverPeers(ch, al((ok, r, a, b) -> {
                Diag.log("p2p", "search " + (ok ? "started" : "FAILED: " + reason(r)));
                result.done(ok, r, null, null);
            }));
        } catch (SecurityException e) { result.done(false, -2, null, null); }
    }

    private void serviceRound() {
        if (!scanning || ch == null) return;
        try { mgr.discoverServices(ch, al(null)); } catch (Exception ignored) { }
        h.postDelayed(() -> {
            if (!scanning) return;
            try { mgr.discoverPeers(ch, al(null)); } catch (Exception ignored) { }
            serviceRound();
        }, 12000);
    }

    /** Asks the nearby Chibarti phones again (a new code means a new seal), also after the search was stopped. */
    void refreshServices() {
        if (!ready()) return;
        try {
            WifiP2pDnsSdServiceRequest req = WifiP2pDnsSdServiceRequest.newInstance(SERVICE);
            mgr.clearServiceRequests(ch, al((o, r, a, b) -> {
                try { mgr.addServiceRequest(ch, req, al((o2, r2, a2, b2) -> { try { mgr.discoverServices(ch, al(null)); } catch (Exception ignored) { } })); } catch (Exception ignored) { }
            }));
        } catch (Exception ignored) { }
    }

    void stopScan() {
        scanning = false;
        if (ch == null) return;
        try { mgr.stopPeerDiscovery(ch, al(null)); } catch (Exception ignored) { }
        try { mgr.clearServiceRequests(ch, al(null)); } catch (Exception ignored) { }
    }

    private void requestPeers() {
        if (ch == null) return;
        try {
            mgr.requestPeers(ch, (WifiP2pDeviceList list) -> {
                if (list == null) return;
                long now = System.currentTimeMillis();
                for (WifiP2pDevice d : list.getDeviceList()) {
                    boolean isNew;
                    synchronized (peers) { isNew = !peers.containsKey(d.deviceAddress); }
                    Peer p = peer(d);
                    p.seen = now;
                    if (isNew) Diag.log("p2p", "nearby device: " + d.deviceName + " (" + d.deviceAddress + (d.isGroupOwner() ? ", offering" : "") + ")");
                }
                ev.onPeers();
            });
        } catch (Exception ignored) { }
    }

    private Peer peer(WifiP2pDevice d) {
        synchronized (peers) {
            Peer p = peers.get(d.deviceAddress);
            if (p == null) { p = new Peer(); p.address = d.deviceAddress; peers.put(d.deviceAddress, p); }
            p.deviceName = d.deviceName;
            p.status = d.status;
            p.owner = d.isGroupOwner();
            p.seen = System.currentTimeMillis();
            return p;
        }
    }

    void clearPeers() { synchronized (peers) { peers.clear(); } }

    /** Connects to a found device (Android may ask the other phone to accept). */
    void connect(String address, Done done) {
        if (!ready()) { done.done(false, WifiP2pManager.P2P_UNSUPPORTED, null, null); return; }
        WifiP2pConfig c = new WifiP2pConfig();
        c.deviceAddress = address;
        c.wps.setup = WpsInfo.PBC;
        c.groupOwnerIntent = 0;
        Diag.log("p2p", "invitation to " + address + " (the other phone must accept)");
        try { mgr.connect(ch, c, al((ok, r, a, b) -> { Diag.log("p2p", "invitation " + (ok ? "sent" : "FAILED: " + reason(r))); done.done(ok, r, a, b); })); }
        catch (SecurityException e) { Diag.log("p2p", "invitation: no permission"); done.done(false, -2, null, null); }
    }

    /** Android 10+: joins the host's group straight from the QR code (no searching, no accept dialog). */
    void join(String networkName, String pass, Done done) {
        if (Build.VERSION.SDK_INT < 29 || !ready()) { done.done(false, WifiP2pManager.P2P_UNSUPPORTED, null, null); return; }
        try {
            WifiP2pConfig c = new WifiP2pConfig.Builder().setNetworkName(networkName).setPassphrase(pass).enablePersistentMode(false).build();
            mgr.connect(ch, c, al((ok, r, a, b) -> { Diag.log("p2p", "join " + networkName + (ok ? " started" : " FAILED: " + reason(r))); done.done(ok, r, a, b); }));
        } catch (Exception e) { Diag.log("p2p", "join FAILED: " + Diag.why(e)); done.done(false, WifiP2pManager.ERROR, null, null); }
    }

    void release() {
        stopScan();
        if (registered) { try { ctx.unregisterReceiver(rx); } catch (Exception ignored) { } registered = false; }
    }

    static String reason(int r) {
        switch (r) {
            case WifiP2pManager.P2P_UNSUPPORTED: return "unsupported";
            case WifiP2pManager.BUSY: return "busy";
            case -2: return "permission";
            default: return "error";
        }
    }
}
