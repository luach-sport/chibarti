package com.luachsport.chibarti;

import android.content.ContentResolver;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Sending and receiving files. The sender offers a list; the other phone must approve it (and must have room);
 * then pieces flow in order, each file checked with SHA-256. Pause, cancel, and after a dropped connection the
 * transfer continues from the last piece that arrived. Every finished file goes into the history.
 */
final class Transfers {
    static final class Job {
        final int tid;
        final boolean out;
        OutgoingJob o;
        IncomingJob i;
        volatile String state; // asking, offer, sending, receiving, paused, interrupted, done, partial, declined, cancelled, failed
        String peer, reason = "";
        final long startedAt = System.currentTimeMillis();
        long sampleAt, sampleBytes;
        double speed;
        boolean peerPaused;
        Job(int tid, boolean out) { this.tid = tid; this.out = out; }
        long total() { return out ? o.total() : i.total(); }
        long done() { return out ? o.done() : i.done(); }
        boolean active() { return "asking".equals(state) || "offer".equals(state) || "sending".equals(state) || "receiving".equals(state) || "paused".equals(state) || "interrupted".equals(state); }
    }

    private final Hub hub;
    private final Map<Integer, Job> jobs = new LinkedHashMap<>();
    private int nextTid = 1 + Crypto.RNG.nextInt(1 << 20);

    Transfers(Hub hub) { this.hub = hub; }

    private String peer() { Session s = hub.session; return s == null ? "" : s.peerName; }

    // ---------- sending ----------
    synchronized int send(JSONArray files) throws Exception {
        if (!hub.connected()) throw new IOException("not-connected");
        if (files == null || files.length() == 0) throw new IOException("no-files");
        final ContentResolver cr = hub.ctx.getContentResolver();
        Job j = new Job(nextTid++, true);
        j.o = new OutgoingJob(j.tid);
        for (int k = 0; k < files.length() && k < 500; k++) {
            JSONObject f = files.getJSONObject(k);
            final Uri uri = Uri.parse(f.getString("uri"));
            long size = f.optLong("size", -1);
            if (size < 0) size = lengthOf(cr, uri);
            OutgoingJob.Item it = new OutgoingJob.Item(k + 1, IncomingJob.safeName(f.optString("name")), f.optString("mime", ""), size, () -> cr.openInputStream(uri));
            it.uri = uri.toString();
            j.o.items.add(it);
        }
        j.peer = peer();
        j.state = "asking";
        jobs.put(j.tid, j);
        offer(j, false);
        hub.changed();
        return j.tid;
    }

    /** The real length when the file picker didn't say (-1 when it can't be known before reading). */
    private static long lengthOf(ContentResolver cr, Uri uri) {
        try (android.content.res.AssetFileDescriptor fd = cr.openAssetFileDescriptor(uri, "r")) {
            return fd == null ? -1 : fd.getLength();
        } catch (Exception e) { return -1; }
    }

    private void offer(Job j, boolean resume) throws Exception {
        JSONArray list = new JSONArray();
        for (OutgoingJob.Item it : j.o.items) {
            if (resume && (it.state == OutgoingJob.DONE || it.state == OutgoingJob.FAILED)) continue;
            list.put(new JSONObject().put("fid", it.fid).put("name", it.name).put("mime", it.mime).put("size", it.size));
        }
        hub.send(Proto.OFFER, new JSONObject().put("tid", j.tid).put("files", list).put("total", j.o.total()).put("resume", resume));
    }

    private void startSending(final Job j) {
        final Session s = hub.session;
        if (s == null) return;
        final int gen = s.generation;
        j.state = j.o.paused ? "paused" : "sending";
        Thread t = new Thread(() -> {
            try {
                j.o.run(new OutgoingJob.Wire() {
                    @Override public void chunk(int tid, int fid, long off, byte[] buf, int len) throws IOException {
                        s.bulk(Proto.CHUNK, Proto.chunk(tid, fid, off, buf, len), gen);
                        hub.changed(); // the bar on this phone moves too (at most ~6 times a second)
                    }
                    @Override public void end(int tid, int fid, long size, String sha) throws IOException {
                        JSONObject o;
                        try { o = new JSONObject().put("tid", tid).put("fid", fid).put("size", size).put("sha", sha); } catch (Exception e) { throw new IOException(e); }
                        s.bulkControl(Proto.FILE_END, o, gen);
                        hub.changed();
                    }
                });
            } catch (OutgoingJob.Cancelled e) {
                // cancel() already updated the state
            } catch (Exception e) {
                synchronized (Transfers.this) {
                    if (j.active()) {
                        boolean wait = s.state == Session.RECONNECTING;
                        j.state = wait ? "interrupted" : "failed";
                        j.reason = wait ? "" : "read";
                        if (!wait) finish(j);
                    }
                }
            }
            hub.changed();
        }, "send-" + j.tid);
        t.setDaemon(true);
        t.start();
    }

    synchronized void pause(int tid, boolean on) {
        Job j = jobs.get(tid);
        if (j == null || !j.out || !j.active()) return;
        j.o.paused = on;
        if ("sending".equals(j.state) || "paused".equals(j.state)) j.state = on ? "paused" : "sending";
        try { hub.send(on ? Proto.PAUSE : Proto.RESUME, new JSONObject().put("tid", tid)); } catch (Exception ignored) { }
        hub.changed();
    }

    synchronized void cancel(int tid) {
        Job j = jobs.get(tid);
        if (j == null || !j.active()) return;
        try { hub.send(Proto.CANCEL, new JSONObject().put("tid", tid).put("reason", "user")); } catch (Exception ignored) { }
        stop(j, "cancelled", "you");
        hub.changed();
    }

    private void stop(Job j, String state, String reason) {
        j.state = state;
        j.reason = reason;
        if (j.out) j.o.cancelled = true; else j.i.cancel(state);
        finish(j);
    }

    // ---------- receiving ----------
    synchronized void answer(int tid, boolean accept) {
        Job j = jobs.get(tid);
        if (j == null || j.out || !"offer".equals(j.state)) return;
        try {
            if (accept && Saver.freeBytes() < j.i.total() + 50L * 1024 * 1024) {
                hub.send(Proto.OFFER_REPLY, new JSONObject().put("tid", tid).put("accept", false).put("reason", "space"));
                j.state = "failed";
                j.reason = "space";
                hub.notice("no-space", null);
            } else {
                hub.send(Proto.OFFER_REPLY, new JSONObject().put("tid", tid).put("accept", accept));
                j.state = accept ? "receiving" : "declined";
                if (!accept) j.reason = "you";
            }
        } catch (Exception ignored) { }
        hub.changed();
    }

    synchronized void onControl(int type, JSONObject o) throws Exception {
        int tid = o.optInt("tid");
        Job j = jobs.get(tid);
        switch (type) {
            case Proto.OFFER: onOffer(o, j); break;
            case Proto.OFFER_REPLY:
                if (j == null || !j.out) return;
                if (!o.optBoolean("accept")) { j.state = "declined"; j.reason = o.optString("reason", "peer"); finish(j); break; }
                JSONObject at = o.optJSONObject("offsets");
                j.o.resumeAt.clear();
                if (at != null) for (OutgoingJob.Item it : j.o.items) {
                    if (!at.has(String.valueOf(it.fid))) continue;
                    long v = at.optLong(String.valueOf(it.fid));
                    if (v == -1 && it.state != OutgoingJob.DONE) { j.o.acked(it.fid, true, null); record(true, it.name, it.mime, it.size, "done", it.uri, null); }
                    else if (v == -2 && it.state != OutgoingJob.FAILED) j.o.acked(it.fid, false, "peer");
                    else if (v >= 0) j.o.resumeAt.put(it.fid, v);
                }
                if (j.o.finished()) { j.state = allOk(j) ? "done" : "partial"; finish(j); break; }
                startSending(j);
                break;
            case Proto.FILE_END:
                if (j == null || j.out) return;
                int fid = o.optInt("fid");
                IncomingJob.Item it = j.i.item(fid);
                boolean already = it != null && (it.state == IncomingJob.DONE || it.state == IncomingJob.FAILED);
                String err = j.i.onEnd(fid, o.optLong("size", -1), o.optString("sha"));
                hub.send(Proto.FILE_ACK, new JSONObject().put("tid", tid).put("fid", fid).put("ok", err == null).put("error", err == null ? "" : err));
                if (it != null && !already) record(false, it.name, it.mime, it.size, err == null ? "done" : "failed", it.location, err);
                if (j.i.finished()) { j.state = allOk(j) ? "done" : "partial"; finish(j); if ("done".equals(j.state)) hub.notice("received", String.valueOf(j.i.items.size())); }
                break;
            case Proto.FILE_ACK:
                if (j == null || !j.out) return;
                j.o.acked(o.optInt("fid"), o.optBoolean("ok"), o.optString("error"));
                for (OutgoingJob.Item x : j.o.items) if (x.fid == o.optInt("fid")) record(true, x.name, x.mime, x.size, o.optBoolean("ok") ? "done" : "failed", x.uri, o.optString("error"));
                if (j.o.finished()) { j.state = allOk(j) ? "done" : "partial"; finish(j); if ("done".equals(j.state)) hub.notice("sent", String.valueOf(j.o.items.size())); }
                break;
            case Proto.CANCEL:
                if (j != null && j.active()) stop(j, "cancelled", "peer");
                break;
            case Proto.PAUSE: case Proto.RESUME:
                if (j != null && !j.out) { j.peerPaused = type == Proto.PAUSE; }
                break;
            default: break;
        }
        hub.changed();
    }

    private void onOffer(JSONObject o, Job existing) throws Exception {
        int tid = o.optInt("tid");
        if (existing != null && !existing.out && o.optBoolean("resume") && "interrupted".equals(existing.state)) {
            JSONObject at = new JSONObject();
            for (IncomingJob.Item it : existing.i.items) at.put(String.valueOf(it.fid), it.state == IncomingJob.DONE ? -1 : it.state == IncomingJob.FAILED ? -2 : it.received);
            existing.state = "receiving";
            hub.send(Proto.OFFER_REPLY, new JSONObject().put("tid", tid).put("accept", true).put("offsets", at));
            return;
        }
        if (existing != null) return;
        JSONArray files = o.optJSONArray("files");
        if (files == null || files.length() == 0 || files.length() > 500) return;
        Job j = new Job(tid, false);
        j.i = new IncomingJob(tid, new Saver(hub.ctx, Saver.mode(hub.ids), hub.ids.pref("folder", "")));
        for (int k = 0; k < files.length(); k++) {
            JSONObject f = files.getJSONObject(k);
            j.i.items.add(new IncomingJob.Item(f.optInt("fid"), IncomingJob.safeName(f.optString("name")), QrPayload.clean(f.optString("mime"), 100), f.optLong("size", -1)));
        }
        j.peer = peer();
        j.state = "offer";
        jobs.put(tid, j);
        LinkService.offer(hub.ctx, j.peer, files.length());
        hub.notice("offer", j.peer);
    }

    void onChunk(byte[] body) {
        ByteBuffer b = ByteBuffer.wrap(body);
        int tid = b.getInt(), fid = b.getInt();
        long off = b.getLong();
        Job j;
        synchronized (this) { j = jobs.get(tid); }
        if (j == null || j.out || !"receiving".equals(j.state)) return;
        try {
            j.i.onChunk(fid, off, body, 16, body.length - 16);
        } catch (IOException e) {
            synchronized (this) {
                try { hub.send(Proto.CANCEL, new JSONObject().put("tid", tid).put("reason", e.getMessage())); } catch (Exception ignored) { }
                stop(j, "failed", "write");
            }
            hub.changed();
            return;
        }
        hub.changed();
    }

    private static boolean allOk(Job j) {
        if (j.out) { for (OutgoingJob.Item x : j.o.items) if (x.state != OutgoingJob.DONE) return false; }
        else { for (IncomingJob.Item x : j.i.items) if (x.state != IncomingJob.DONE) return false; }
        return true;
    }

    private void record(boolean out, String name, String mime, long size, String status, String uri, String error) {
        try {
            hub.history.add(new JSONObject().put("id", Crypto.hex(Crypto.random(6))).put("dir", out ? "out" : "in").put("name", name)
                .put("mime", Saver.mimeOf(name, mime)).put("size", size).put("status", status).put("peer", peer())
                .put("at", System.currentTimeMillis()).put("uri", uri == null ? "" : uri).put("error", error == null ? "" : error));
        } catch (Exception ignored) { }
    }

    private void finish(Job j) {
        LinkService.offerDone(hub.ctx);
    }

    // ---------- connection changes ----------
    synchronized void onLinkLost() {
        for (Job j : jobs.values()) {
            if (!("sending".equals(j.state) || "receiving".equals(j.state) || "paused".equals(j.state) || "asking".equals(j.state))) continue;
            j.state = "interrupted";
            // files whose "finished" may not have arrived are checked again after the reconnect
            if (j.out) for (OutgoingJob.Item it : j.o.items) if (it.state == OutgoingJob.CHECKING) it.state = OutgoingJob.SENDING;
        }
    }

    synchronized void onResumed() {
        for (Job j : jobs.values()) {
            if (!"interrupted".equals(j.state)) continue;
            if (j.out) { j.state = "asking"; try { offer(j, true); } catch (Exception ignored) { } }
        }
    }

    synchronized void onClosed() {
        for (Job j : jobs.values()) if (j.active()) stop(j, "failed", "lost");
    }

    synchronized void clearFinished() {
        List<Integer> gone = new ArrayList<>();
        for (Job j : jobs.values()) if (!j.active()) gone.add(j.tid);
        for (Integer t : gone) jobs.remove(t);
        hub.changed();
    }

    // ---------- for the screen ----------
    synchronized JSONArray describe() throws Exception {
        JSONArray a = new JSONArray();
        long now = System.currentTimeMillis();
        for (Job j : jobs.values()) {
            if ("offer".equals(j.state)) continue;
            long done = j.done(), total = j.total();
            if (now - j.sampleAt >= 700) {
                if (j.sampleAt > 0 && ("sending".equals(j.state) || "receiving".equals(j.state))) {
                    double inst = (done - j.sampleBytes) * 1000.0 / (now - j.sampleAt);
                    j.speed = j.speed <= 0 ? inst : j.speed * 0.6 + inst * 0.4;
                } else if (!j.active()) j.speed = 0;
                j.sampleAt = now;
                j.sampleBytes = done;
            }
            JSONArray files = new JSONArray();
            if (j.out) for (OutgoingJob.Item x : j.o.items) files.put(new JSONObject().put("fid", x.fid).put("name", x.name).put("mime", Saver.mimeOf(x.name, x.mime)).put("size", x.size).put("done", x.sent).put("state", x.state).put("uri", x.uri));
            else for (IncomingJob.Item x : j.i.items) files.put(new JSONObject().put("fid", x.fid).put("name", x.name).put("mime", Saver.mimeOf(x.name, x.mime)).put("size", x.size).put("done", x.received).put("state", x.state).put("uri", x.location == null ? "" : x.location));
            long left = total - done;
            a.put(new JSONObject().put("tid", j.tid).put("dir", j.out ? "out" : "in").put("state", j.state).put("reason", j.reason).put("peer", j.peer)
                .put("total", total).put("done", done).put("speed", Math.round(j.speed)).put("eta", j.speed > 1000 && left > 0 ? Math.round(left / j.speed) : -1)
                .put("startedAt", j.startedAt).put("peerPaused", j.peerPaused).put("files", files));
        }
        return a;
    }

    synchronized JSONArray offers() throws Exception {
        JSONArray a = new JSONArray();
        for (Job j : jobs.values()) {
            if (!"offer".equals(j.state)) continue;
            JSONArray files = new JSONArray();
            for (IncomingJob.Item x : j.i.items) files.put(new JSONObject().put("name", x.name).put("mime", Saver.mimeOf(x.name, x.mime)).put("size", x.size));
            a.put(new JSONObject().put("tid", j.tid).put("peer", j.peer).put("total", j.i.total()).put("files", files).put("free", Saver.freeBytes()));
        }
        return a;
    }
}
