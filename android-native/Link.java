package com.luachsport.chibarti;

import java.io.IOException;

/**
 * One connection to the other side, whatever carries it: the encrypted phone-to-phone link (SecureLink) or a
 * computer's browser over HTTPS + WebSocket (WsLink). Messages are always [type][body]. Plain Java.
 */
interface Link {
    final class Frame {
        final int type;
        final byte[] body;
        Frame(int type, byte[] body) { this.type = type; this.body = body; }
        String text() { return new String(body, Proto.UTF8); }
    }

    void send(int type, byte[] body) throws IOException;
    void send(int type, byte[] body, int off, int len) throws IOException;
    /** Blocks until the next message. Throws on a closed, broken or tampered connection. */
    Frame read() throws IOException;
    void setReadTimeout(int ms) throws IOException;
    boolean isClosed();
    void close();
    long lastRx();
    long bytesIn();
}
