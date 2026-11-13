package com.luachsport.chibarti;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Text messages. Between two devices they simply go to the other one. In a room the host passes every member's
 * message on to everyone else with who wrote it ("from"); a device with an older Chibarti gets the name in front of
 * the text instead. Replies carry a short quote of the message they answer.
 */
final class Texts {
    private final Hub hub;

    Texts(Hub hub) { this.hub = hub; }

    /** reply: the message this one answers ({id, text, name, from}), or null. */
    void send(String text, JSONObject reply) {
        text = text == null ? "" : text;
        if (text.length() > 20000) text = text.substring(0, 20000);
        try {
            JSONObject m = new JSONObject().put("id", Crypto.hex(Crypto.random(6))).put("text", text).put("ts", System.currentTimeMillis());
            JSONObject r = cleanReply(reply);
            if (r != null) m.put("reply", r);
            if (hub.isHost()) { for (Session s : hub.members) deliver(s, m, null); }
            else hub.send(Proto.TEXT, m);
            show(m, true, hub.ids.myName(), hub.ids.myId());
        } catch (Exception ignored) { }
    }

    /** A message from a connected device. */
    void received(Session s, JSONObject o) throws Exception {
        String name = s.peerName, fromId = s.peerId;
        JSONObject from = s.host ? null : o.optJSONObject("from"); // only the room's host says who wrote it
        if (from != null && from.optString("id").matches("[0-9a-f]{32}")) {
            fromId = from.optString("id");
            name = QrPayload.clean(from.optString("name"), 40);
        }
        show(o, false, name, fromId);
        // the room's host passes it on to everyone else
        if (s.host && hub.members.size() > 1) {
            JSONObject f = new JSONObject().put("id", s.peerId).put("name", s.peerName);
            for (Session m : hub.members) if (m != s) deliver(m, o, f);
        }
    }

    private void deliver(Session to, JSONObject o, JSONObject from) {
        if (to.state == Session.CLOSED) return;
        try {
            JSONObject c = new JSONObject().put("id", QrPayload.clean(o.optString("id"), 20)).put("text", o.optString("text", "")).put("ts", o.optLong("ts", System.currentTimeMillis()));
            JSONObject r = cleanReply(o.optJSONObject("reply"));
            if (r != null) c.put("reply", r);
            if (from != null) {
                if (to.roomOk) c.put("from", from);
                else c.put("text", from.optString("name") + ": " + c.optString("text")); // an older Chibarti, or a computer
            }
            to.control(Proto.TEXT, c);
        } catch (Exception ignored) { }
    }

    private void show(JSONObject o, boolean mine, String name, String fromId) throws Exception {
        String text = o.optString("text", "");
        if (text.length() > 20000) text = text.substring(0, 20000);
        JSONObject m = new JSONObject().put("id", QrPayload.clean(o.optString("id"), 20)).put("text", text)
            .put("ts", System.currentTimeMillis()).put("mine", mine).put("peer", mine ? "" : name).put("from", fromId);
        JSONObject r = cleanReply(o.optJSONObject("reply"));
        if (r != null) m.put("reply", r);
        hub.history.addText(m);
        hub.emit("text", m);
        if (!mine) LinkService.textArrived(hub.ctx, name, text);
        hub.changed();
    }

    /** A quoted message: its id, the start of its text and who wrote it (nothing else is kept). */
    static JSONObject cleanReply(JSONObject r) {
        if (r == null) return null;
        String id = QrPayload.clean(r.optString("id"), 20), t = r.optString("text", "");
        if (id.isEmpty()) return null;
        if (t.length() > 200) t = t.substring(0, 200);
        String from = r.optString("from", "");
        try { return new JSONObject().put("id", id).put("text", t).put("name", QrPayload.clean(r.optString("name"), 40)).put("from", from.matches("[0-9a-f]{32}") ? from : ""); } catch (Exception e) { return null; }
    }

    JSONArray all() { return hub.history.texts(); }
}
