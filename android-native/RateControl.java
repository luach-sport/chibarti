package com.luachsport.chibarti;

/**
 * Automatic quality for the screen stream: watches how much video is waiting to go out. When the connection can't
 * keep up, the bitrate goes down a quarter at once; when it's calm for a few seconds, it climbs back slowly.
 * Also decides when to skip frames so the picture stays live instead of lagging. Plain Java (tested on a PC).
 */
final class RateControl {
    final int target, min;
    private int current;
    private long lastChange, calmSince;
    private int drops;
    final boolean auto;

    RateControl(int target, boolean auto) {
        this.target = target;
        this.min = Math.max(300_000, target / 6);
        this.current = target;
        this.auto = auto;
    }

    int bitrate() { return current; }

    /** Bytes of video that may wait before frames are skipped (about a third of a second). */
    long dropThreshold() { return Math.max(60_000, current / 8L * 35 / 100); }

    void dropped() { drops++; }

    /** Called about every frame. Returns the new bitrate, or 0 when it stays. */
    int tick(long now, long queuedBytes) {
        if (!auto) return 0;
        if (lastChange == 0) { lastChange = now; calmSince = now; }
        long perSec = current / 8L;
        boolean congested = drops > 0 || queuedBytes > perSec * 15 / 100;
        if (congested) {
            calmSince = now;
            if (now - lastChange >= 1000 && current > min) {
                drops = 0;
                lastChange = now;
                current = Math.max(min, current * 3 / 4);
                return current;
            }
            drops = 0;
            return 0;
        }
        if (current < target && now - calmSince >= 3000 && now - lastChange >= 2000 && queuedBytes < perSec * 3 / 100) {
            lastChange = now;
            current = Math.min(target, current * 11 / 10 + 50_000);
            return current;
        }
        return 0;
    }
}
