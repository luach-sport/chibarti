package com.luachsport.chibarti;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Sends the files of one transfer, piece by piece (64 KB), never the whole file in memory.
 * Each file gets a SHA-256 of exactly the bytes that were sent; the other phone checks it.
 * Pause, cancel and resume-from-offset (after a reconnect). Plain Java (tested on a PC).
 */
final class OutgoingJob {
    interface Source { InputStream open() throws IOException; }

    interface Wire {
        void chunk(int tid, int fid, long offset, byte[] buf, int len) throws IOException;
        void end(int tid, int fid, long size, String sha) throws IOException;
    }

    static final int WAITING = 0, SENDING = 1, CHECKING = 2, DONE = 3, FAILED = 4;

    static final class Item {
        final int fid;
        final String name, mime;
        long size;
        final Source src;
        volatile long sent;
        volatile int state = WAITING;
        String sha, error, uri;
        Item(int fid, String name, String mime, long size, Source src) { this.fid = fid; this.name = name; this.mime = mime; this.size = size; this.src = src; }
    }

    static final class Cancelled extends IOException { Cancelled() { super("cancelled"); } }

    final int tid;
    final List<Item> items = new ArrayList<>();
    final Map<Integer, Long> resumeAt = new HashMap<>();
    volatile boolean paused, cancelled, held; // held: a room's host asks to wait until the receiver catches up

    OutgoingJob(int tid) { this.tid = tid; }

    long total() { long t = 0; for (Item i : items) t += Math.max(0, i.size); return t; }

    long done() { long t = 0; for (Item i : items) t += i.state == DONE || i.state == CHECKING ? Math.max(i.size, i.sent) : i.sent; return t; }

    boolean finished() {
        for (Item i : items) if (i.state != DONE && i.state != FAILED) return false;
        return true;
    }

    void run(Wire w) throws IOException, InterruptedException {
        byte[] buf = new byte[Proto.CHUNK_SIZE];
        for (Item it : items) {
            if (it.state == DONE || it.state == FAILED || it.state == CHECKING) continue;
            if (cancelled) throw new Cancelled();
            it.state = SENDING;
            MessageDigest md;
            try { md = MessageDigest.getInstance("SHA-256"); } catch (Exception e) { throw new IOException(e); }
            Long r = resumeAt.get(it.fid);
            long start = r == null ? 0 : Math.max(0, r);
            InputStream in = it.src.open();
            if (in == null) throw new IOException("cant-open");
            try {
                // On resume the hash still covers the whole file: re-read (locally, fast) what was already sent.
                long skipped = 0;
                while (skipped < start) {
                    int n = in.read(buf, 0, (int) Math.min(buf.length, start - skipped));
                    if (n < 0) throw new IOException("file-shorter");
                    md.update(buf, 0, n);
                    skipped += n;
                }
                it.sent = start;
                while (true) {
                    while ((paused || held) && !cancelled) Thread.sleep(120);
                    if (cancelled) throw new Cancelled();
                    int n = in.read(buf);
                    if (n < 0) break;
                    if (n == 0) continue;
                    md.update(buf, 0, n);
                    w.chunk(tid, it.fid, it.sent, buf, n);
                    it.sent += n;
                }
            } finally {
                try { in.close(); } catch (Exception ignored) { }
            }
            if (it.size < 0) it.size = it.sent;
            if (it.sent != it.size) { it.size = it.sent; }
            it.sha = Crypto.hex(md.digest());
            it.state = CHECKING;
            resumeAt.remove(it.fid);
            try {
                w.end(tid, it.fid, it.sent, it.sha);
            } catch (IOException e) {
                // the connection dropped before "finished" went out: send this file again after the reconnect
                if (it.state == CHECKING) it.state = SENDING;
                throw e;
            }
        }
    }

    /** The other phone's answer for one file. */
    void acked(int fid, boolean ok, String error) {
        for (Item i : items) if (i.fid == fid) { i.state = ok ? DONE : FAILED; i.error = ok ? null : error; }
    }
}
