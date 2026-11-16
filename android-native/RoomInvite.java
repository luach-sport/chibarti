package com.luachsport.chibarti;

import org.json.JSONObject;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "Add a device" on a phone that joined (not the one that offered the connection). The room lives on the host, so the
 * member asks it (ROOM_ADD); the host opens a place in the room as if its own button was pressed and sends the code
 * back (ROOM_CODE: the QR text, the 6 digits, until when), again whenever the code changes, and "off" when the place
 * was taken or closed. The member shows that code on its own screen; the new device then joins the host directly.
 * The code goes only inside the encrypted connection, to a device that is already in the room.
 */
final class RoomInvite {
    private final Hub hub;
    /** On the host: who asked, and the last thing sent to each. */
    private final Map<String, String> askers = new ConcurrentHashMap<>();
    /** On a member: the code the host sent (null when there is none). */
    private volatile JSONObject remote;
    private volatile long askedAt = 0;

    RoomInvite(Hub hub) { this.hub = hub; }

    // ---------- member side ----------
    /** This phone joined someone: ask the host to open (or close) a place in the room. Returns false when not joined. */
    boolean askHost(boolean on) {
        Session s = hub.session;
        if (s == null || s.host || s.state == Session.CLOSED || !"phone".equals(s.kind)) return false;
        if (!on) remote = null;
        askedAt = on ? System.currentTimeMillis() : 0;
        Diag.log("room", (on ? "asking " : "telling ") + s.peerName + (on ? " to open a place for one more device" : " the place is not needed"));
        try { s.control(Proto.ROOM_ADD, new JSONObject().put("on", on)); } catch (Exception ignored) { }
        hub.changed();
        return true;
    }

    void onCode(Session from, JSONObject o) {
        if (from.host) return; // only from the room's host
        if (!o.optBoolean("on")) {
            if (remote != null || askedAt > 0) Diag.log("room", "the host closed the place" + (o.optString("reason").isEmpty() ? "" : " (" + o.optString("reason") + ")"));
            remote = null;
            askedAt = 0;
            if ("full".equals(o.optString("reason"))) hub.notice("room-full", null);
        } else remote = o;
        hub.changed();
    }

    /** What the member's screen shows as "this phone's code" (it is the host's code). */
    void describe(JSONObject host) throws Exception {
        JSONObject r = remote;
        if (r == null) {
            if (askedAt > 0) host.put("on", true).put("ready", false).put("remote", true).put("asked", askedAt);
            return;
        }
        host.put("on", true).put("ready", true).put("remote", true).put("qr", r.optString("qr")).put("pin", r.optString("pin"))
            .put("expiresAt", r.optLong("expiresAt")).put("method", r.optString("method")).put("network", r.optString("network"))
            .put("hostName", hub.session == null ? "" : hub.session.peerName);
    }

    boolean waiting() { return remote != null || askedAt > 0; }

    void clear() { remote = null; askedAt = 0; askers.clear(); }

    // ---------- host side ----------
    void onAsk(Session from, JSONObject o) {
        if (!from.host || !hub.isHost()) return;
        if (o.optBoolean("on")) {
            if (hub.members.size() >= Hub.ROOM_MAX) { send(from, off("full")); return; }
            askers.put(from.peerId, "");
            Diag.log("room", from.peerName + " asked for a place for one more device");
            hub.connect.host();
        } else {
            askers.remove(from.peerId);
            if (askers.isEmpty() && hub.connect.hosting) hub.connect.stopHost();
        }
        push();
    }

    /** Called on every change: sends the current code (or "off") to whoever asked, when it changed. */
    void push() {
        if (askers.isEmpty()) return;
        JSONObject now;
        try {
            Connect c = hub.connect;
            JSONObject h = new JSONObject();
            c.describe(h);
            JSONObject host = h.optJSONObject("host");
            if (host != null && host.optBoolean("on") && host.optBoolean("ready") && !host.optString("qr").isEmpty()) {
                now = new JSONObject().put("on", true).put("qr", host.optString("qr")).put("pin", host.optString("pin"))
                    .put("expiresAt", host.optLong("expiresAt")).put("method", host.optString("method")).put("network", host.optString("network"));
            } else if (host != null && host.optBoolean("on")) return; // still getting ready
            else now = off("");
        } catch (Exception e) { return; }
        String text = now.toString();
        for (Map.Entry<String, String> e : askers.entrySet()) {
            if (text.equals(e.getValue())) continue;
            Session m = hub.member(e.getKey());
            if (m == null || m.state == Session.CLOSED) { askers.remove(e.getKey()); continue; }
            send(m, now);
            e.setValue(text);
        }
        if (!now.optBoolean("on")) askers.clear();
    }

    private static JSONObject off(String reason) {
        try { return new JSONObject().put("on", false).put("reason", reason); } catch (Exception e) { return new JSONObject(); }
    }

    private static void send(Session s, JSONObject o) { try { s.control(Proto.ROOM_CODE, o); } catch (Exception ignored) { } }
}
