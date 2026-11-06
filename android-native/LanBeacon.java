package com.luachsport.chibarti;

import android.content.Context;
import android.net.wifi.WifiManager;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Finding each other on a shared Wi-Fi (a router or a third phone's hotspot, internet not needed): the hosting phone
 * sends a tiny "I'm here" (id, name, port) every 1.5 seconds; a searching phone listens. Nothing secret is in it.
 */
final class LanBeacon {
    interface Found { void onLanPeers(); }

    static final class Peer { String id, name, ip; int port; long seen; }

    private final Context ctx;
    private volatile Thread sender, listener;
    private volatile DatagramSocket listenSock;
    private WifiManager.MulticastLock lock;
    final Map<String, Peer> peers = new LinkedHashMap<>();

    LanBeacon(Context c) { ctx = c.getApplicationContext(); }

    void startSending(final String id, final String name, final int port) {
        stopSending();
        Thread t = new Thread(() -> {
            DatagramSocket s = null;
            try {
                s = new DatagramSocket();
                s.setBroadcast(true);
                byte[] msg = ("CHB1|" + id + "|" + port + "|" + QrPayload.clean(name, 40)).getBytes(Proto.UTF8);
                while (sender == Thread.currentThread()) {
                    for (InetAddress b : NetUtil.broadcasts()) {
                        try { s.send(new DatagramPacket(msg, msg.length, b, Proto.BEACON_PORT)); } catch (Exception ignored) { }
                    }
                    try { s.send(new DatagramPacket(msg, msg.length, InetAddress.getByName("255.255.255.255"), Proto.BEACON_PORT)); } catch (Exception ignored) { }
                    Thread.sleep(1500);
                }
            } catch (Exception ignored) {
            } finally { if (s != null) s.close(); }
        }, "beacon-out");
        sender = t;
        t.setDaemon(true);
        t.start();
    }

    void stopSending() { Thread t = sender; sender = null; if (t != null) t.interrupt(); }

    void startListening(final String myId, final Found found) {
        stopListening();
        try {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            lock = wm.createMulticastLock("chibarti");
            lock.setReferenceCounted(false);
            lock.acquire();
        } catch (Exception ignored) { }
        Thread t = new Thread(() -> {
            try {
                DatagramSocket s = new DatagramSocket(null);
                s.setReuseAddress(true);
                s.setBroadcast(true);
                s.bind(new InetSocketAddress(Proto.BEACON_PORT));
                listenSock = s;
                byte[] buf = new byte[512];
                while (listener == Thread.currentThread()) {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    s.receive(p);
                    String[] f = new String(p.getData(), 0, p.getLength(), Proto.UTF8).split("\\|", 4);
                    if (f.length < 4 || !"CHB1".equals(f[0]) || !f[1].matches("[0-9a-f]{32}") || f[1].equals(myId)) continue;
                    Peer peer = new Peer();
                    peer.id = f[1];
                    try { peer.port = Integer.parseInt(f[2]); } catch (Exception e) { continue; }
                    peer.name = QrPayload.clean(f[3], 40);
                    peer.ip = p.getAddress().getHostAddress();
                    peer.seen = System.currentTimeMillis();
                    boolean isNew;
                    synchronized (peers) { isNew = peers.put(peer.id, peer) == null; }
                    if (isNew) found.onLanPeers();
                }
            } catch (Exception ignored) { }
        }, "beacon-in");
        listener = t;
        t.setDaemon(true);
        t.start();
    }

    void stopListening() {
        listener = null;
        DatagramSocket s = listenSock;
        listenSock = null;
        if (s != null) s.close();
        if (lock != null) { try { lock.release(); } catch (Exception ignored) { } lock = null; }
        synchronized (peers) { peers.clear(); }
    }

    /** Drops phones that stopped announcing. Returns true when the list changed. */
    boolean expire(long olderThanMs) {
        long cut = System.currentTimeMillis() - olderThanMs;
        boolean changed = false;
        synchronized (peers) {
            java.util.Iterator<Peer> it = peers.values().iterator();
            while (it.hasNext()) if (it.next().seen < cut) { it.remove(); changed = true; }
        }
        return changed;
    }
}
