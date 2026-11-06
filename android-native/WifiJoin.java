package com.luachsport.chibarti;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

/**
 * Joins the host's temporary network (its Wi-Fi Direct group or its local hotspot) as an ordinary Wi-Fi client,
 * with the name and password from the QR code. Android 10+ asks the user in a system dialog; older Android joins
 * directly and the network is removed again on disconnect, so the phone goes back to its usual Wi-Fi.
 */
@SuppressLint("MissingPermission")
final class WifiJoin {
    interface Done { void done(Network net, String error); }

    private final Context ctx;
    private final Handler h = new Handler(Looper.getMainLooper());
    private ConnectivityManager.NetworkCallback cb;
    private int legacyId = -1;

    WifiJoin(Context c) { ctx = c.getApplicationContext(); }

    void join(String ssid, String pass, Done done) {
        leave();
        if (Build.VERSION.SDK_INT >= 29) joinModern(ssid, pass, done);
        else joinLegacy(ssid, pass, done);
    }

    private void joinModern(String ssid, String pass, Done done) {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        WifiNetworkSpecifier spec = new WifiNetworkSpecifier.Builder().setSsid(ssid).setWpa2Passphrase(pass).build();
        NetworkRequest req = new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .setNetworkSpecifier(spec)
            .build();
        final boolean[] answered = { false };
        cb = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) { if (!answered[0]) { answered[0] = true; done.done(n, null); } }
            @Override public void onUnavailable() { if (!answered[0]) { answered[0] = true; done.done(null, "declined"); } }
        };
        try { cm.requestNetwork(req, cb, 60000); } catch (Exception e) { cb = null; done.done(null, "error"); }
    }

    @SuppressWarnings("deprecation")
    private void joinLegacy(String ssid, String pass, Done done) {
        WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
        try {
            if (!wm.isWifiEnabled()) wm.setWifiEnabled(true);
            WifiConfiguration c = new WifiConfiguration();
            c.SSID = "\"" + ssid + "\"";
            c.preSharedKey = "\"" + pass + "\"";
            c.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK);
            legacyId = wm.addNetwork(c);
            if (legacyId < 0) { done.done(null, "error"); return; }
            wm.disconnect();
            wm.enableNetwork(legacyId, true);
            wm.reconnect();
        } catch (Exception e) { done.done(null, "error"); return; }
        waitLegacy(wm, done, System.currentTimeMillis() + 25000);
    }

    @SuppressWarnings("deprecation")
    private void waitLegacy(WifiManager wm, Done done, long until) {
        h.postDelayed(() -> {
            WifiInfo wi = null;
            try { wi = wm.getConnectionInfo(); } catch (Exception ignored) { }
            boolean up = wi != null && wi.getNetworkId() == legacyId && wi.getIpAddress() != 0;
            if (up) { h.postDelayed(() -> done.done(NetUtil.wifiNetwork(ctx), null), 800); return; }
            if (System.currentTimeMillis() > until) { done.done(null, "timeout"); return; }
            waitLegacy(wm, done, until);
        }, 600);
    }

    @SuppressWarnings("deprecation")
    void leave() {
        if (cb != null) {
            try { ((ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(cb); } catch (Exception ignored) { }
            cb = null;
        }
        if (legacyId >= 0) {
            try {
                WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
                wm.removeNetwork(legacyId);
                wm.saveConfiguration();
                wm.reconnect();
            } catch (Exception ignored) { }
            legacyId = -1;
        }
    }
}
