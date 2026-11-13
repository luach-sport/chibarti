package com.luachsport.chibarti;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * In a room, the hosting phone passes files between two other devices: A offers files "to" B; the host gives the
 * transfer its own number for B, forwards every message and piece, and translates the answers back to A. Pieces never
 * pile up on the host: when too many wait for B, A is asked to hold (HOLD) until they drain. A device that leaves or
 * loses its connection cancels its relayed transfers on the other side. Plain Java (tested on a PC).
 */
final class Relay {
    interface Out {
        void control(String to, int type, JSONObject o);
        /** A piece (or a file's "finished") in line with the pieces. Returns how many wait for that device, -1 when it's gone. */
        int bulk(String to, int type, byte[] body);
        int waiting(String to);
    }

    static final int HIGH = 24, LOW = 6;

    static final class Route {
        final String from, to;
        final int fromTid, toTid;
        boolean held;
        Route(String from, int fromTid, String to, int toTid) { this.from = from; this.fromTid = fromTid; this.to = to; this.toTid = toTid; }
    }

    private final Out out;
    private final Map<String, Route> bySender = new HashMap<>(), byReceiver = new HashMap<>();
    private int next;

    Relay(Out out, int firstTid) { this.out = out; this.next = firstTid; }

    private static String key(String id, int tid) { return id + "#" + tid; }

    /** A new transfer number that this phone's own transfers don't use (they count from the other end). */
    synchronized int newTid() { return next--; }

    /** An offer from member "from" to member "to" (the caller checked both are in the room). */
    synchronized void offer(String from, String fromName, JSONObject o, String to) {
        int fromTid = o.optInt("tid");
        Route r = bySender.get(key(from, fromTid));
        if (r == null) {
            if (o.optBoolean("resume")) { // its earlier transfer was cancelled when a connection dropped
                try { out.control(from, Proto.OFFER_REPLY, new JSONObject().put("tid", fromTid).put("accept", false).put("reason", "lost")); } catch (Exception ignored) { }
                return;
            }
            r = new Route(from, fromTid, to, next--);
            bySender.put(key(from, fromTid), r);
            byReceiver.put(key(to, r.toTid), r);
        }
        try {
            JSONObject f = new JSONObject(o.toString());
            f.remove("to");
            f.put("tid", r.toTid).put("from", new JSONObject().put("id", from).put("name", fromName));
            out.control(to, Proto.OFFER, f);
        } catch (Exception ignored) { }
    }

    /** A message about a relayed transfer, from either side. False when it isn't one (it's for this phone). */
    synchronized boolean handle(String who, int type, JSONObject o) {
        int tid = o.optInt("tid");
        Route s = bySender.get(key(who, tid)), r = byReceiver.get(key(who, tid));
        try {
            if (s != null) {
                switch (type) {
                    case Proto.FILE_END: { // after its pieces, not before them
                        JSONObject f = copy(o, s.toTid);
                        if (out.bulk(s.to, Proto.FILE_END, Proto.json(f)) < 0) gone(s.to);
                        return true;
                    }
                    case Proto.PAUSE: case Proto.RESUME: out.control(s.to, type, copy(o, s.toTid)); return true;
                    case Proto.CANCEL: out.control(s.to, type, copy(o, s.toTid)); drop(s); return true;
                    default: break;
                }
            }
            if (r != null) {
                switch (type) {
                    case Proto.OFFER_REPLY:
                        out.control(r.from, type, copy(o, r.fromTid));
                        if (!o.optBoolean("accept")) drop(r);
                        return true;
                    case Proto.FILE_ACK: out.control(r.from, type, copy(o, r.fromTid)); return true;
                    case Proto.CANCEL: out.control(r.from, type, copy(o, r.fromTid)); drop(r); return true;
                    default: break;
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    /** A piece from a sender: passed on under the receiver's number. False when it isn't relayed. */
    boolean chunk(String who, byte[] body) {
        if (body.length < 16) return false;
        int tid = ((body[0] & 255) << 24) | ((body[1] & 255) << 16) | ((body[2] & 255) << 8) | (body[3] & 255);
        Route s;
        synchronized (this) { s = bySender.get(key(who, tid)); }
        if (s == null) return false;
        body[0] = (byte) (s.toTid >>> 24); body[1] = (byte) (s.toTid >>> 16); body[2] = (byte) (s.toTid >>> 8); body[3] = (byte) s.toTid;
        int waiting = out.bulk(s.to, Proto.CHUNK, body);
        if (waiting < 0) { gone(s.to); return true; }
        if (waiting >= HIGH) {
            boolean tell;
            synchronized (this) { tell = !s.held; s.held = true; }
            if (tell) hold(s, true);
        }
        return true;
    }

    /** Pieces for "to" went out: senders that were asked to hold may go on. */
    void drained(String to) {
        List<Route> go = new ArrayList<>();
        synchronized (this) {
            if (out.waiting(to) > LOW) return;
            for (Route r : bySender.values()) if (r.to.equals(to) && r.held) { r.held = false; go.add(r); }
        }
        for (Route r : go) hold(r, false);
    }

    private void hold(Route r, boolean on) {
        try { out.control(r.from, Proto.HOLD, new JSONObject().put("tid", r.fromTid).put("on", on)); } catch (Exception ignored) { }
    }

    /** A device left or lost its connection: its relayed transfers stop on the other side. */
    void gone(String who) {
        List<Route> hit = new ArrayList<>();
        synchronized (this) {
            for (Route r : bySender.values()) if (r.from.equals(who) || r.to.equals(who)) hit.add(r);
            for (Route r : hit) drop(r);
        }
        for (Route r : hit) {
            try {
                if (!r.from.equals(who)) out.control(r.from, Proto.CANCEL, new JSONObject().put("tid", r.fromTid).put("reason", "lost"));
                if (!r.to.equals(who)) out.control(r.to, Proto.CANCEL, new JSONObject().put("tid", r.toTid).put("reason", "lost"));
            } catch (Exception ignored) { }
        }
    }

    synchronized int size() { return bySender.size(); }

    private void drop(Route r) {
        bySender.remove(key(r.from, r.fromTid));
        byReceiver.remove(key(r.to, r.toTid));
    }

    private static JSONObject copy(JSONObject o, int tid) throws Exception { return new JSONObject(o.toString()).put("tid", tid); }
}
