package com.luachsport.chibarti;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The center of the app's Android side. Holds the one live session with the other phone and hands every message to
 * the part that handles it (Connect, Transfers, Mirror, texts). The screen (the web app) gets a snapshot of
 * everything whenever something changes (at most ~6 times a second) plus short notices ("connected", "saved").
 */
final class Hub implements Session.Listener {
    interface Out { void emit(String event, JSONObject data); }

    private static Hub inst;

    static synchronized Hub get(Context c) {
        if (inst == null) inst = new Hub(c.getApplicationContext());
        return inst;
    }

    final Context ctx;
    final Ids ids;
    final History history;
    final Connect connect;
    final Transfers transfers;
    final Mirror mirror;
    volatile Session session;
    private volatile Out out;
    private final Handler h = new Handler(Looper.getMainLooper());
    private boolean emitQueued = false;
    private long lastEmit = 0;

    private Hub(Context c) {
        ctx = c;
        ids = new Ids(c);
        history = new History(c);
        connect = new Connect(this);
        transfers = new Transfers(this);
        mirror = new Mirror(this);
    }

    void setOut(Out o) { out = o; }

    // ---------- events to the screen ----------
    void changed() {
        synchronized (this) {
            if (emitQueued) return;
            emitQueued = true;
        }
        long wait = Math.max(0, 160 - (System.currentTimeMillis() - lastEmit));
        h.postDelayed(() -> {
            synchronized (Hub.this) { emitQueued = false; }
            lastEmit = System.currentTimeMillis();
            Out o = out;
            if (o != null) o.emit("state", snapshot());
            LinkService.refresh(ctx);
        }, wait);
    }

    void notice(String code, String detail) {
        try {
            JSONObject n = new JSONObject().put("code", code).put("detail", detail == null ? "" : detail).put("at", System.currentTimeMillis());
            Out o = out;
            if (o != null) h.post(() -> o.emit("notice", n));
        } catch (Exception ignored) { }
    }

    /** Not synchronized on purpose: every part guards its own data, so no lock order can deadlock. */
    JSONObject snapshot() {
        JSONObject s = new JSONObject();
        try {
            s.put("me", new JSONObject().put("id", ids.myId()).put("name", ids.myName()).put("custom", ids.customName()));
            s.put("mode", mode());
            connect.describe(s);
            Session ss = session;
            if (ss != null && ss.state != Session.CLOSED) {
                JSONObject l = new JSONObject();
                l.put("peerId", ss.peerId).put("name", ss.peerName).put("model", ss.peerModel).put("via", ss.via).put("kind", ss.kind)
                    .put("host", ss.host).put("since", ss.startedAt).put("rtt", ss.rttMs)
                    .put("state", ss.state == Session.ACTIVE ? "active" : "reconnecting")
                    .put("trusted", ids.trustedKey(ss.peerId) != null)
                    .put("quality", ss.rttMs < 0 ? "" : ss.rttMs < 40 ? "great" : ss.rttMs < 120 ? "good" : "weak");
                s.put("link", l);
            }
            s.put("transfers", transfers.describe());
            s.put("offers", transfers.offers());
            s.put("mirror", mirror.describe());
            s.put("devices", ids.list());
            s.put("textCount", history.texts().length());
        } catch (Exception ignored) { }
        return s;
    }

    String mode() {
        Session ss = session;
        if (ss != null && ss.state == Session.ACTIVE) return "connected";
        if (ss != null && ss.state == Session.RECONNECTING) return "reconnecting";
        return connect.mode();
    }

    boolean connected() { Session ss = session; return ss != null && ss.state == Session.ACTIVE; }

    // ---------- the session ----------
    boolean busyWith(String peerId) {
        Session ss = session;
        return ss != null && ss.state != Session.CLOSED && !ss.peerId.equals(peerId);
    }

    void attach(Session s, Link link) {
        Session old;
        synchronized (this) { old = session; session = s; }
        if (old != null && old != s) old.close("replaced", true);
        s.start(link);
        ids.touch(s.peerId, s.via);
        connect.onSessionStarted(s);
        notice("connected", s.peerName);
        changed();
    }

    void disconnect() {
        Session s = session;
        if (s != null) s.close("user", true);
        else connect.stopAll();
        changed();
    }

    void send(int type, JSONObject o) {
        Session s = session;
        if (s != null && s.state != Session.CLOSED) s.control(type, o);
    }

    @Override public void onMessage(Session s, Link.Frame f) {
        if (s != session) return;
        try {
            if (f.type == Proto.CHUNK) { transfers.onChunk(f.body); return; }
            JSONObject o = new JSONObject(f.text());
            switch (f.type) {
                case Proto.TEXT: onText(o, false); break;
                case Proto.BYE: s.close(o.optString("reason", "peer"), false); break;
                case Proto.OFFER: case Proto.OFFER_REPLY: case Proto.FILE_END: case Proto.FILE_ACK:
                case Proto.CANCEL: case Proto.PAUSE: case Proto.RESUME:
                    transfers.onControl(f.type, o); break;
                case Proto.MIRROR_OFFER: case Proto.MIRROR_REPLY: case Proto.MIRROR_STOP: case Proto.KEY_REQUEST: case Proto.MIRROR_STATS:
                    mirror.onControl(f.type, o); break;
                default: break;
            }
        } catch (Exception e) {
            android.util.Log.w("Chibarti", "message " + f.type, e);
        }
    }

    @Override public void onStreamFrame(Session s, Link.Frame f) { if (s == session) mirror.onStream(f); }

    @Override public void onLinkLost(Session s) {
        transfers.onLinkLost();
        mirror.onLinkLost();
        connect.onLinkLost(s);
        notice("reconnecting", s.peerName);
        changed();
    }

    @Override public void onResumed(Session s) {
        transfers.onResumed();
        mirror.onResumed();
        notice("resumed", s.peerName);
        changed();
    }

    @Override public void onClosed(Session s, String reason) {
        synchronized (this) { if (session == s) session = null; else return; }
        transfers.onClosed();
        mirror.onClosed();
        connect.onSessionClosed(s, reason);
        notice("user".equals(reason) ? "disconnected" : "peer".equals(reason) || "user-peer".equals(reason) ? "peer-left" : "lost", s.peerName);
        changed();
    }

    // ---------- text messages ----------
    void sendText(String text) {
        text = text == null ? "" : text;
        if (text.length() > 20000) text = text.substring(0, 20000);
        try {
            JSONObject m = new JSONObject().put("id", Crypto.hex(Crypto.random(6))).put("text", text).put("ts", System.currentTimeMillis());
            send(Proto.TEXT, m);
            onText(m, true);
        } catch (Exception ignored) { }
    }

    private void onText(JSONObject o, boolean mine) throws Exception {
        String text = o.optString("text", "");
        if (text.length() > 20000) text = text.substring(0, 20000);
        Session s = session;
        JSONObject m = new JSONObject().put("id", QrPayload.clean(o.optString("id"), 20)).put("text", text)
            .put("ts", System.currentTimeMillis()).put("mine", mine).put("peer", s == null ? "" : s.peerName);
        history.addText(m);
        Out ot = out;
        if (ot != null) h.post(() -> ot.emit("text", m));
        if (!mine) LinkService.textArrived(ctx, s == null ? "" : s.peerName, text);
        changed();
    }

    JSONArray texts() { return history.texts(); }
}
