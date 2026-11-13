package com.luachsport.chibarti;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * The center of the app's Android side. Holds the live connections and hands every message to the part that handles
 * it (Connect, Transfers, Mirror, Control, Texts). The screen (the web app) gets a snapshot of everything whenever
 * something changes (at most ~6 times a second) plus short notices ("connected", "saved").
 * A room: the phone that offers the connection can take several devices (up to ROOM_MAX). Each one has its own
 * connection (members); one of them is the main one (session), which screen sharing and remote control go to.
 * A device that joined has just one connection, to the room's host, and learns who else is there (ROOM).
 */
final class Hub implements Session.Listener {
    interface Out { void emit(String event, JSONObject data); }

    static final int ROOM_MAX = 7;
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
    final Control control;
    final Texts texts;
    final Relay relay;
    /** The main connection: the only one between two devices; in a room, the one screen sharing goes to. */
    volatile Session session;
    /** Every connection (a room's host has several; a device that joined has one, to the host). */
    final List<Session> members = new CopyOnWriteArrayList<>();
    /** On a device that joined a room: everyone in it, as the host described it. */
    volatile JSONArray room = new JSONArray();
    private volatile Out out;
    final Handler h = new Handler(Looper.getMainLooper());
    private boolean emitQueued = false;
    private long lastEmit = 0;

    private Hub(Context c) {
        ctx = c;
        Diag.attach(new java.io.File(c.getFilesDir(), "diag.log"));
        ids = new Ids(c);
        history = new History(c);
        connect = new Connect(this);
        transfers = new Transfers(this);
        mirror = new Mirror(this);
        control = new Control(this);
        texts = new Texts(this);
        relay = new Relay(new Relay.Out() {
            @Override public void control(String to, int type, JSONObject o) { Session m = member(to); if (m != null && m.state != Session.CLOSED) m.control(type, o); }
            @Override public int bulk(String to, int type, byte[] body) { Session m = member(to); return m == null ? -1 : m.bulkNow(type, body); }
            @Override public int waiting(String to) { Session m = member(to); return m == null ? 0 : m.waiting(); }
        }, Integer.MAX_VALUE - 1);
    }

    void setOut(Out o) { out = o; }

    void emit(String event, JSONObject data) {
        Out o = out;
        if (o != null) h.post(() -> o.emit(event, data));
    }

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
        try { emit("notice", new JSONObject().put("code", code).put("detail", detail == null ? "" : detail).put("at", System.currentTimeMillis())); } catch (Exception ignored) { }
    }

    /** Not synchronized on purpose: every part guards its own data, so no lock order can deadlock. */
    JSONObject snapshot() {
        JSONObject s = new JSONObject();
        // each part on its own: one part that fails must not hide the others (the list of remembered devices, say)
        try {
            s.put("me", new JSONObject().put("id", ids.myId()).put("name", ids.myName()).put("custom", ids.customName()));
            s.put("mode", mode());
        } catch (Exception ignored) { }
        try { s.put("devices", ids.list()); } catch (Exception ignored) { }
        try { connect.describe(s); } catch (Exception e) { android.util.Log.w("Chibarti", "describe connect", e); }
        try {
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
        } catch (Exception ignored) { }
        try { s.put("room", roomList()); } catch (Exception ignored) { }
        try { s.put("transfers", transfers.describe()); } catch (Exception e) { android.util.Log.w("Chibarti", "describe transfers", e); }
        try { s.put("offers", transfers.offers()); } catch (Exception ignored) { }
        try { s.put("mirror", mirror.describe()); } catch (Exception ignored) { }
        try { s.put("control", control.describe()); } catch (Exception ignored) { }
        try { s.put("textCount", history.texts().length()); } catch (Exception ignored) { }
        return s;
    }

    String mode() {
        Session ss = session;
        if (ss != null && ss.state == Session.ACTIVE) return "connected";
        if (ss != null && ss.state == Session.RECONNECTING) return "reconnecting";
        for (Session m : members) if (m.state == Session.ACTIVE) return "connected";
        return connect.mode();
    }

    boolean connected() { Session ss = session; return ss != null && ss.state == Session.ACTIVE; }

    // ---------- the room ----------
    /** This phone took the connection(s) in (it offered them): it is the room's host. */
    boolean isHost() { Session ss = session; return ss != null && ss.host && ss.state != Session.CLOSED; }

    Session member(String id) {
        if (id == null) return null;
        for (Session m : members) if (m.peerId.equals(id)) return m;
        return null;
    }

    /** Why a new device can't come in now, or null when it can (a room's host takes up to ROOM_MAX). */
    String canAdd(String peerId) {
        Session cur = session;
        if (cur == null || cur.state == Session.CLOSED) return null;
        if (member(peerId) != null) return null; // the same device again
        if (!cur.host) return "busy";
        if (members.size() >= ROOM_MAX) return "full";
        return null;
    }

    /** Everyone in the room, this phone included ("me"); empty when connected to just one device the old way. */
    JSONArray roomList() throws Exception {
        if (isHost()) {
            JSONArray a = new JSONArray();
            a.put(new JSONObject().put("id", ids.myId()).put("name", ids.myName()).put("host", true).put("me", true));
            Session p = session;
            for (Session m : members) {
                a.put(new JSONObject().put("id", m.peerId).put("name", m.peerName).put("model", m.peerModel).put("kind", m.kind).put("via", m.via)
                    .put("main", m == p).put("state", m.state == Session.ACTIVE ? "active" : "reconnecting"));
            }
            return a;
        }
        JSONArray r = room, a = new JSONArray();
        String me = ids.myId();
        for (int i = 0; i < r.length(); i++) {
            JSONObject x = r.optJSONObject(i);
            if (x == null) continue;
            a.put(new JSONObject().put("id", QrPayload.clean(x.optString("id"), 32)).put("name", QrPayload.clean(x.optString("name"), 40))
                .put("model", QrPayload.clean(x.optString("model"), 60)).put("kind", "pc".equals(x.optString("kind")) ? "pc" : "phone")
                .put("host", x.optBoolean("host")).put("me", me.equals(x.optString("id"))));
        }
        return a;
    }

    /** A member's name, as the room's host described it. */
    String roomName(String id) {
        JSONArray r = room;
        for (int i = 0; i < r.length(); i++) { JSONObject x = r.optJSONObject(i); if (x != null && id.equals(x.optString("id"))) return QrPayload.clean(x.optString("name"), 40); }
        return "";
    }

    /** The host tells every member who is in the room (when someone comes or goes). */
    private void broadcastRoom() {
        if (!isHost()) return;
        try {
            JSONArray list = new JSONArray();
            list.put(new JSONObject().put("id", ids.myId()).put("name", ids.myName()).put("model", android.os.Build.MODEL).put("kind", "phone").put("host", true));
            for (Session m : members) list.put(new JSONObject().put("id", m.peerId).put("name", m.peerName).put("model", m.peerModel).put("kind", m.kind));
            JSONObject o = new JSONObject().put("members", list);
            for (Session m : members) if (m.roomOk && m.state != Session.CLOSED) m.control(Proto.ROOM, o);
        } catch (Exception ignored) { }
    }

    /** In a room: which device screen sharing and remote control go to (only while nothing is shared). */
    boolean setMain(String id) {
        Session m = member(id);
        if (m == null || !"none".equals(mirror.role)) return false;
        session = m;
        changed();
        return true;
    }

    // ---------- connections ----------
    void attach(Session s, Link link) {
        List<Session> drop = new ArrayList<>();
        boolean joinRoom, mainReplaced;
        Session cur;
        synchronized (this) {
            cur = session;
            joinRoom = s.host && cur != null && cur.host && cur.state != Session.CLOSED;
            for (Session m : members) if (m.peerId.equals(s.peerId) || !joinRoom) drop.add(m);
            members.removeAll(drop);
            members.add(s);
            mainReplaced = cur != null && drop.contains(cur);
            if (!joinRoom || cur == null || mainReplaced) session = s;
            if (!s.host) room = new JSONArray();
        }
        for (Session d : drop) d.close("replaced", true);
        for (Session d : drop) mirror.gone(d, d == cur && mainReplaced);
        s.onDrain = () -> relay.drained(s.peerId);
        s.start(link);
        ids.touch(s.peerId, s.via);
        // two remembered phones swap the keys of their temporary networks, so next time no code is needed either way
        if ("phone".equals(s.kind) && ids.trustedKey(s.peerId) != null) {
            try { s.control(Proto.NET_KEY, new JSONObject().put("net", Crypto.b64(ids.netKey()))); } catch (Exception ignored) { }
        }
        connect.onSessionStarted(s);
        if (joinRoom) Diag.log("room", s.peerName + " joined the room (" + members.size() + " connected)");
        broadcastRoom();
        notice("connected", s.peerName);
        changed();
    }

    /** Ends everything: a room's host closes the room, a member leaves it. */
    void disconnect() {
        List<Session> all = new ArrayList<>(members);
        if (all.isEmpty()) connect.stopAll();
        for (Session s : all) s.close("user", true);
        changed();
    }

    /** The room's host sends one member out. */
    void removeMember(String id) {
        Session m = member(id);
        if (m != null && isHost()) m.close("removed", true);
    }

    /** To the main connection (screen sharing, remote control and their answers). */
    void send(int type, JSONObject o) {
        Session s = session;
        if (s != null && s.state != Session.CLOSED) s.control(type, o);
    }

    @Override public void onMessage(Session s, Link.Frame f) {
        if (!members.contains(s)) return;
        try {
            if (f.type == Proto.CHUNK) { if (!relay.chunk(s.peerId, f.body)) transfers.onChunk(s, f.body); return; }
            JSONObject o = new JSONObject(f.text());
            switch (f.type) {
                case Proto.TEXT: texts.received(s, o); break;
                case Proto.BYE: { String r = o.optString("reason", "peer"); s.close("user".equals(r) ? "peer" : r, false); break; }
                case Proto.NET_KEY:
                    if (ids.trustedKey(s.peerId) != null) { try { ids.saveNet(s.peerId, Crypto.unb64(o.optString("net"))); } catch (Exception ignored) { } }
                    break;
                case Proto.ROOM:
                    if (!s.host) { JSONArray m = o.optJSONArray("members"); room = m == null ? new JSONArray() : m; changed(); }
                    break;
                case Proto.OFFER: {
                    String to = o.optString("to", "");
                    if (s.host && !to.isEmpty() && !to.equals(ids.myId()) && member(to) != null && !to.equals(s.peerId)) relay.offer(s.peerId, s.peerName, o, to);
                    else transfers.onControl(s, f.type, o);
                    break;
                }
                case Proto.OFFER_REPLY: case Proto.FILE_END: case Proto.FILE_ACK: case Proto.CANCEL: case Proto.PAUSE: case Proto.RESUME: case Proto.HOLD:
                    if (!(s.host && relay.handle(s.peerId, f.type, o))) transfers.onControl(s, f.type, o);
                    break;
                case Proto.MIRROR_OFFER: case Proto.MIRROR_REPLY: case Proto.MIRROR_STOP: case Proto.KEY_REQUEST: case Proto.MIRROR_STATS:
                    mirror.onControl(s, f.type, o);
                    break;
                case Proto.CONTROL_ASK:
                    // a screen shared with the whole room can't be controlled (whose fingers would it be?)
                    if (mirror.room.active()) { s.control(Proto.CONTROL_REPLY, new JSONObject().put("accept", false).put("reason", "room")); break; }
                    if (s == session) control.onMessage(f.type, o);
                    break;
                case Proto.CONTROL_REPLY: case Proto.CONTROL_STOP: case Proto.INPUT:
                    if (s == session) control.onMessage(f.type, o);
                    break;
                default: break;
            }
        } catch (Exception e) {
            android.util.Log.w("Chibarti", "message " + f.type, e);
        }
    }

    @Override public void onStreamFrame(Session s, Link.Frame f) { mirror.onStream(s, f); }

    @Override public void onLinkLost(Session s) {
        Diag.log("link", "connection with " + s.peerName + " dropped, " + (s.host ? "waiting for it to come back" : "reconnecting"));
        relay.gone(s.peerId);
        transfers.onLinkLost(s);
        mirror.onLinkLost(s);
        connect.onLinkLost(s);
        notice("reconnecting", s.peerName);
        changed();
    }

    @Override public void onResumed(Session s) {
        Diag.log("link", "connection with " + s.peerName + " is back");
        transfers.onResumed(s);
        mirror.onResumed(s);
        notice("resumed", s.peerName);
        changed();
    }

    @Override public void onClosed(Session s, String reason) {
        boolean was, wasMain, empty;
        synchronized (this) {
            was = members.remove(s);
            wasMain = session == s;
            if (wasMain) session = members.isEmpty() ? null : members.get(0);
            empty = members.isEmpty();
        }
        relay.gone(s.peerId);
        transfers.onClosed(s);
        if (!was && !wasMain) return; // replaced by a new connection of the same device
        Diag.log("link", "ended with " + s.peerName + ": " + reason + (empty ? "" : " (" + members.size() + " still connected)"));
        mirror.gone(s, wasMain);
        if (empty) {
            room = new JSONArray();
            connect.onSessionClosed(s, reason);
        } else broadcastRoom();
        String code;
        if ("user".equals(reason)) code = empty ? "disconnected" : null; // closing the whole room: one message at the end
        else if ("removed".equals(reason)) code = s.host ? "member-removed" : "removed";
        else if ("peer".equals(reason) || "user-peer".equals(reason)) code = "peer-left";
        else code = "lost";
        if (code != null) notice(code, s.peerName);
        changed();
    }

    // ---------- text messages ----------
    void sendText(String text, JSONObject reply) { texts.send(text, reply); }

    JSONArray texts() { return history.texts(); }
}
