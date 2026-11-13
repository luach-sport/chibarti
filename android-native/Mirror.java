package com.luachsport.chibarti;

import android.content.Intent;
import android.media.projection.MediaProjection;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;

/**
 * Screen sharing between the two phones, either direction. The sharing phone first gets Android's own permission
 * to capture the screen, then asks the other phone; only when that phone agrees does the picture start. Either
 * phone can stop at any time. The video goes on its own connection, so files and messages don't slow it down.
 * In a room, "to everyone" ("all"): the room's host does the fan-out (RoomShare) — for its own screen, or passing a
 * member's screen on. A member that shares to everyone just shares to the host, as between two phones.
 */
final class Mirror {
    private final Hub hub;
    private final Handler h = new Handler(Looper.getMainLooper());
    volatile String role = "none"; // none, offering, sending, asked, viewing, relaying (a room's host passing a member's screen on)
    volatile String state = "";    // waiting, connecting, live
    volatile String error = "";
    volatile JSONObject request = null;
    private volatile JSONObject opts = new JSONObject();
    private volatile boolean all = false; // this share goes to the whole room
    final RoomShare room;
    private volatile MediaProjection projection;
    private volatile ScreenSender sender;
    private volatile boolean accepted = false;
    private long offeredAt = 0;

    Mirror(Hub hub) { this.hub = hub; this.room = new RoomShare(this, hub); }

    private Session session() { return hub.session; }

    // ---------- this phone shares its screen ----------
    /** Called by the service once Android's capture permission was given. */
    void onProjection(MediaProjection mp, JSONObject o) {
        Session s = session();
        if (s == null || s.state != Session.ACTIVE || !"none".equals(role)) { try { mp.stop(); } catch (Exception ignored) { } return; }
        projection = mp;
        opts = o == null ? new JSONObject() : o;
        role = "offering";
        state = "waiting";
        error = "";
        accepted = false;
        offeredAt = System.currentTimeMillis();
        final long mine = offeredAt;
        all = opts.optBoolean("all") && (hub.isHost() ? hub.members.size() > 1 : hub.room.length() > 2);
        try {
            JSONObject offer = new JSONObject().put("quality", opts.optString("quality", "standard")).put("fps", opts.optInt("fps", 30)).put("audio", opts.optBoolean("audio", true)).put("all", all);
            if (all && hub.isHost()) room.offerAll(offer); else hub.send(Proto.MIRROR_OFFER, offer);
        } catch (Exception ignored) { }
        h.postDelayed(() -> { if ("offering".equals(role) && offeredAt == mine && !accepted) { error = "timeout"; stop(true); } }, 60000);
        hub.changed();
    }

    private void startCapture() {
        Session s = session();
        MediaProjection mp = projection;
        StreamFan fan = room.fan;
        if (mp == null || !"offering".equals(role) || (s == null && fan == null)) return;
        try {
            ScreenSender ss = new ScreenSender(hub.ctx, mp, opts, fan != null && !room.relaying() ? ScreenSender.to(fan) : ScreenSender.to(s), () -> stop(true));
            ss.start();
            sender = ss;
            role = "sending";
            state = "live";
        } catch (Exception e) {
            android.util.Log.w("Chibarti", "capture", e);
            error = "capture";
            stop(true);
        }
        hub.changed();
    }

    /** A room: the first device that agreed to watch this phone's screen. */
    void roomAccepted() {
        if (!"offering".equals(role)) return;
        accepted = true;
        state = "connecting";
        startCapture();
    }

    /** A viewer in the room needs a key frame of this phone's screen. */
    void senderKey() { ScreenSender ss = sender; if (ss != null) ss.requestKey(); }

    // ---------- the other phone shares its screen ----------
    void answer(boolean accept) {
        if (!"asked".equals(role)) return;
        if (room.relaying()) { room.hostAnswered(accept); return; }
        Session s = session();
        if (s == null) return;
        try { hub.send(Proto.MIRROR_REPLY, new JSONObject().put("accept", accept)); } catch (Exception ignored) { }
        LinkService.askDone(hub.ctx);
        if (!accept) { role = "none"; request = null; hub.changed(); return; }
        role = "viewing";
        state = "connecting";
        error = "";
        JSONObject r = request;
        MirrorRx.begin(r != null && !r.optString("name").isEmpty() ? r.optString("name") : s.peerName);
        if (!s.host) hub.connect.joiner.openStream(s, null);
        openViewer();
        hub.changed();
    }

    void openViewer() {
        Intent i = new Intent(hub.ctx, ViewerActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { hub.ctx.startActivity(i); } catch (Exception e) { android.util.Log.w("Chibarti", "viewer", e); }
    }

    // ---------- messages ----------
    /** A message about screen sharing from one of the connected devices (in a room: any of them). */
    void onControl(Session from, int type, JSONObject o) {
        Session s = session();
        switch (type) {
            case Proto.MIRROR_OFFER: {
                if (!"none".equals(role)) { from.control(Proto.MIRROR_REPLY, put(new JSONObject(), "accept", false, "reason", "busy")); return; }
                if (hub.isHost() && o.optBoolean("all") && hub.members.size() > 1) { room.startRelay(from, o); break; }
                // in a room, a member that starts sharing becomes the main connection (when nothing is shared yet)
                if (from != s && !hub.setMain(from.peerId)) { from.control(Proto.MIRROR_REPLY, put(new JSONObject(), "accept", false, "reason", "busy")); return; }
                String name = from.peerName;
                JSONObject by = from.host ? null : o.optJSONObject("from"); // passed on by the room's host: whose screen it is
                if (by != null) name = QrPayload.clean(by.optString("name"), 40);
                request = put(o, "name", name);
                role = "asked";
                state = "";
                LinkService.mirrorAsk(hub.ctx, name);
                hub.notice("mirror-ask", name);
                break;
            }
            case Proto.MIRROR_REPLY:
                if (room.onReply(from, o)) break;
                if (from != s || !"offering".equals(role)) return;
                if (!o.optBoolean("accept")) { error = "busy".equals(o.optString("reason")) ? "busy" : "declined"; stop(false); hub.notice("mirror-declined", null); return; }
                accepted = true;
                state = "connecting";
                if (s != null && !s.host) hub.connect.joiner.openStream(s, this::startCapture);
                else if (s != null && s.stream != null) startCapture();
                break;
            case Proto.MIRROR_STOP:
                if (room.onStop(from)) break;
                if (from != s) return;
                boolean wasViewing = "viewing".equals(role) || "asked".equals(role);
                stop(false);
                hub.notice(wasViewing ? "mirror-ended" : "mirror-stopped", null);
                break;
            case Proto.KEY_REQUEST:
                if (room.onKey(from)) break;
                ScreenSender ss = sender;
                if (ss != null) ss.requestKey();
                break;
            default: break;
        }
        hub.changed();
    }

    private static JSONObject put(JSONObject o, Object... kv) {
        try { for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception ignored) { }
        return o;
    }

    /** The joining phone opened the stream connection (seen on the hosting phone). */
    void onStreamAttached(Session from) {
        if (room.onStreamAttached(from)) return;
        if (from != session()) return;
        if ("offering".equals(role) && accepted) startCapture();
        else if ("sending".equals(role)) { ScreenSender ss = sender; if (ss != null) ss.streamBack(); }
    }

    void onStream(Session from, Link.Frame f) {
        if (room.onStream(from, f)) return;
        if (from != session()) return;
        if ("viewing".equals(role)) {
            if (f.type == Proto.VIDEO_CONFIG && "connecting".equals(state)) { state = "live"; hub.changed(); }
            MirrorRx.onFrame(f.type, f.body);
        }
    }

    void requestKey() {
        if (room.relaying()) { room.wantKey(); return; } // this phone shows a member's screen it passes on
        hub.send(Proto.KEY_REQUEST, new JSONObject());
    }

    void streamFailed() { error = "stream"; stop(true); }

    /** Stops sharing or watching (tell = let the other phone know). */
    void stop(boolean tell) {
        // a room's host closing its own view of a member's screen: the others go on watching
        if (room.relaying() && room.watching() && "viewing".equals(role) && room.othersWatching()) { room.stopWatching(); return; }
        String was = role;
        if (tell && !"none".equals(was)) { if (room.active()) room.tellAllStop(); else hub.send(Proto.MIRROR_STOP, new JSONObject()); }
        role = "none";
        state = "";
        request = null;
        accepted = false;
        ScreenSender ss = sender;
        sender = null;
        if (ss != null) ss.stop();
        MediaProjection mp = projection;
        projection = null;
        if (mp != null) { try { mp.stop(); } catch (Exception ignored) { } }
        Session s = session();
        if (s != null) s.dropStream();
        room.end();
        all = false;
        MirrorRx.end("viewing".equals(was) ? "stopped" : "");
        hub.control.ended();
        LinkService.askDone(hub.ctx);
        LinkService.mirrorOff(hub.ctx);
        hub.changed();
    }

    void onLinkLost(Session from) {
        if (room.active()) { if (from == room.from) MirrorRx.status("reconnecting"); return; }
        if (from == session()) MirrorRx.status("reconnecting");
    }

    void onResumed(Session from) {
        if (room.active()) { if (from == room.from) MirrorRx.status(""); return; }
        Session s = session();
        if (s == null || from != s) return;
        MirrorRx.status("");
        if (!s.host && ("sending".equals(role) || "viewing".equals(role))) {
            hub.connect.joiner.openStream(s, () -> {
                ScreenSender ss = sender;
                if (ss != null) ss.streamBack(); else requestKey();
            });
        }
    }

    void onClosed() { if (!"none".equals(role)) stop(false); }

    /** A connection ended: in a room only that viewer (or that sharer) is gone; otherwise everything stops. */
    void gone(Session from, boolean wasMain) {
        if (room.active()) { room.gone(from); return; }
        if (wasMain) onClosed();
    }

    JSONObject describe() throws Exception {
        JSONObject d = new JSONObject().put("role", role).put("state", state).put("error", error).put("all", all);
        room.describe(d);
        JSONObject r = request;
        if (r != null) d.put("request", r);
        ScreenSender ss = sender;
        if (ss != null) ss.describe(d);
        return d;
    }
}
