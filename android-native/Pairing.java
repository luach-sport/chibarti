package com.luachsport.chibarti;

/**
 * The one-time pairing secrets a hosting phone shows: a random token inside the QR code and a 6-digit code to type.
 * Both expire after 10 minutes and are replaced. Five wrong codes in a row replace the code at once. Plain Java.
 */
final class Pairing {
    static final long TTL_MS = 10 * 60 * 1000L;
    static final int MAX_FAILS = 5;

    interface Clock { long now(); }

    private final Clock clock;
    private byte[] token;
    private String pin;
    private long createdAt;
    private int fails;

    Pairing(Clock clock) {
        this.clock = clock;
        renew();
    }

    synchronized void renew() {
        token = Crypto.random(16);
        int n = Crypto.RNG.nextInt(1000000);
        pin = String.format(java.util.Locale.US, "%06d", n);
        createdAt = clock.now();
        fails = 0;
    }

    synchronized boolean expired() { return clock.now() - createdAt >= TTL_MS; }

    /** Renews if the time is up. Returns true when it did (the screen shows a new code). */
    synchronized boolean refreshIfExpired() {
        if (!expired()) return false;
        renew();
        return true;
    }

    synchronized long expiresAt() { return createdAt + TTL_MS; }
    synchronized String token() { return Crypto.b64(token); }
    synchronized String pin() { return pin; }

    /** The secret for a QR or code connection, or null when it has expired. */
    synchronized byte[] secretFor(int mode) {
        if (expired()) return null;
        if (mode == Handshake.MODE_QR) return token.clone();
        if (mode == Handshake.MODE_PIN) return pin.getBytes(Proto.UTF8);
        return null;
    }

    /** A wrong code. Returns true when the code was replaced because of too many tries. */
    synchronized boolean failed() {
        if (++fails >= MAX_FAILS) { renew(); return true; }
        return false;
    }

    /** Used once: after a phone connected with it, a new code is made for the next one. */
    synchronized void consumed() { renew(); }
}
