package com.luachsport.chibarti;

import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * Listens for the other phone (TCP, port 47821 when free). Every connection must pass the handshake before
 * anything is read from it; a failed or slow handshake is closed. After a wrong code the next try waits a second.
 */
final class Server {
    interface Gate {
        Handshake.Secrets secrets();
        String myId();
        void accepted(Handshake.Result r, String remoteIp);
    }

    private final Gate gate;
    private volatile ServerSocket ss;
    private volatile Thread loop;
    volatile int port = 0;

    Server(Gate gate) { this.gate = gate; }

    synchronized int start() throws java.io.IOException {
        if (ss != null && !ss.isClosed()) return port;
        ServerSocket s = new ServerSocket();
        s.setReuseAddress(true);
        try { s.bind(new InetSocketAddress(Proto.PORT), 8); } catch (java.io.IOException e) { s.close(); s = new ServerSocket(); s.bind(new InetSocketAddress(0), 8); }
        ss = s;
        port = s.getLocalPort();
        final ServerSocket me = s;
        loop = new Thread(() -> {
            while (!me.isClosed()) {
                try {
                    final Socket c = me.accept();
                    Thread t = new Thread(() -> handle(c), "server-conn");
                    t.setDaemon(true);
                    t.start();
                } catch (Exception e) {
                    if (me.isClosed()) return;
                }
            }
        }, "server");
        loop.setDaemon(true);
        loop.start();
        return port;
    }

    private void handle(Socket c) {
        try {
            c.setTcpNoDelay(true);
            c.setKeepAlive(true);
            Handshake.Result r = Handshake.server(c, gate.myId(), gate.secrets());
            gate.accepted(r, c.getInetAddress() == null ? null : c.getInetAddress().getHostAddress());
        } catch (Handshake.AuthException e) {
            Diag.log("host", "secure connection refused from " + c.getInetAddress().getHostAddress() + " (code " + e.code + ")");
            if (e.code == Handshake.ERR_CODE) { try { Thread.sleep(1000); } catch (InterruptedException ignored) { } }
            try { c.close(); } catch (Exception ignored) { }
        } catch (Exception e) {
            Diag.log("host", "connection from " + c.getInetAddress().getHostAddress() + " failed: " + Diag.why(e));
            try { c.close(); } catch (Exception ignored) { }
        }
    }

    synchronized void stop() {
        ServerSocket s = ss;
        ss = null;
        if (s != null) { try { s.close(); } catch (Exception ignored) { } }
        port = 0;
    }

    boolean running() { ServerSocket s = ss; return s != null && !s.isClosed(); }
}
