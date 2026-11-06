package com.luachsport.chibarti;

import java.io.IOException;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * Receives the files of one transfer: pieces must arrive in order and never past the announced size; the SHA-256
 * of what was written must match the sender's. A file is kept only when it matches; otherwise it's deleted.
 * Plain Java (tested on a PC); where the file is written (Downloads, Pictures, a chosen folder) is the Sink's job.
 */
final class IncomingJob {
    interface Sink {
        OutputStream out() throws IOException;
        void commit() throws IOException;
        void abort();
        String location();
    }

    interface Sinks { Sink create(Item item) throws IOException; }

    static final int WAITING = 0, RECEIVING = 1, DONE = 3, FAILED = 4;

    static final class Item {
        final int fid;
        final String name, mime;
        final long size;
        volatile long received;
        volatile int state = WAITING;
        String error, location;
        MessageDigest md;
        Sink sink;
        OutputStream out;
        Item(int fid, String name, String mime, long size) { this.fid = fid; this.name = name; this.mime = mime; this.size = size; }
    }

    final int tid;
    final List<Item> items = new ArrayList<>();
    private final Sinks sinks;

    IncomingJob(int tid, Sinks sinks) { this.tid = tid; this.sinks = sinks; }

    Item item(int fid) { for (Item i : items) if (i.fid == fid) return i; return null; }

    long total() { long t = 0; for (Item i : items) t += Math.max(0, i.size); return t; }

    long done() { long t = 0; for (Item i : items) t += i.received; return t; }

    boolean finished() {
        for (Item i : items) if (i.state != DONE && i.state != FAILED) return false;
        return true;
    }

    void onChunk(int fid, long offset, byte[] body, int off, int len) throws IOException {
        Item it = item(fid);
        if (it == null) throw new IOException("unknown-file");
        if (it.state == DONE || it.state == FAILED) throw new IOException("file-closed");
        if (offset != it.received) throw new IOException("out-of-order");
        if (it.size >= 0 && it.received + len > it.size) throw new IOException("too-long");
        if (it.sink == null) {
            it.sink = sinks.create(it);
            it.out = it.sink.out();
            try { it.md = MessageDigest.getInstance("SHA-256"); } catch (Exception e) { throw new IOException(e); }
            it.state = RECEIVING;
        }
        it.out.write(body, off, len);
        it.md.update(body, off, len);
        it.received += len;
    }

    /** The sender's "file finished" with its hash. Returns null when the file is kept, or the reason it wasn't. */
    String onEnd(int fid, long size, String sha) {
        Item it = item(fid);
        if (it == null) return "unknown-file";
        if (it.state == DONE) return null;
        try {
            if (it.sink == null) { // an empty file
                it.sink = sinks.create(it);
                it.out = it.sink.out();
                it.md = MessageDigest.getInstance("SHA-256");
            }
            it.out.flush();
            it.out.close();
            String mine = Crypto.hex(it.md.digest());
            if (size != it.received) return fail(it, "size");
            if (sha == null || !sha.equalsIgnoreCase(mine)) return fail(it, "hash");
            it.sink.commit();
            it.location = it.sink.location();
            it.state = DONE;
            return null;
        } catch (Exception e) {
            return fail(it, "write");
        }
    }

    private String fail(Item it, String why) {
        it.state = FAILED;
        it.error = why;
        if (it.sink != null) it.sink.abort();
        return why;
    }

    /** Stops: files already finished stay, the half-written one is deleted. */
    void cancel(String why) {
        for (Item it : items) {
            if (it.state == RECEIVING || it.state == WAITING) {
                if (it.out != null) { try { it.out.close(); } catch (Exception ignored) { } }
                if (it.sink != null) it.sink.abort();
                it.state = FAILED;
                it.error = why;
            }
        }
    }

    /** A file name that is safe to save: no folders, no hidden-file dot, no control characters, not too long. */
    static String safeName(String name) {
        if (name == null) name = "";
        name = name.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        name = name.replaceAll("[\\p{Cntrl}:*?\"<>|]", "_").trim();
        while (name.startsWith(".")) name = name.substring(1);
        if (name.isEmpty()) name = "file";
        if (name.length() > 120) {
            int dot = name.lastIndexOf('.');
            String ext = dot > 0 && name.length() - dot <= 10 ? name.substring(dot) : "";
            name = name.substring(0, 120 - ext.length()) + ext;
        }
        return name;
    }
}
