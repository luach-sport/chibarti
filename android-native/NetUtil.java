package com.luachsport.chibarti;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** This phone's local addresses, and connecting a socket over the right network (never over mobile data). */
final class NetUtil {
    private NetUtil() { }

    /** Local IPv4 addresses (Wi-Fi, Wi-Fi Direct, hotspot), most useful first. */
    static List<String> addresses() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName() == null ? "" : ni.getName();
                if (n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("dummy") || n.startsWith("tun")) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && a.isSiteLocalAddress()) {
                        String s = a.getHostAddress();
                        if (n.startsWith("p2p")) out.add(0, s); else out.add(s);
                    }
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** Broadcast addresses of the local networks (for the "I'm here" beacon). */
    static List<InetAddress> broadcasts() {
        List<InetAddress> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null && ia.getAddress() instanceof Inet4Address) out.add(ia.getBroadcast());
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    static boolean sameSubnet24(String a, String b) {
        int i = a.lastIndexOf('.'), j = b.lastIndexOf('.');
        return i > 0 && j > 0 && a.substring(0, i).equals(b.substring(0, j));
    }

    /** The Wi-Fi network object, when there is one (to keep sockets off mobile data). */
    static Network wifiNetwork(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return n;
            }
        } catch (Exception ignored) { }
        return null;
    }

    /** A TCP connection with the small-delay options the app needs. */
    static Socket connect(String host, int port, Network net, int timeoutMs) throws java.io.IOException {
        Socket s = new Socket();
        if (net != null) {
            try { net.bindSocket(s); } catch (Exception ignored) { /* the route may still work unbound (Wi-Fi Direct) */ }
        }
        s.setTcpNoDelay(true);
        s.setKeepAlive(true);
        try {
            s.connect(new InetSocketAddress(host, port), timeoutMs);
        } catch (java.io.IOException e) {
            try { s.close(); } catch (Exception ignored) { }
            throw e;
        }
        return s;
    }
}
