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
 */
final class Mirror {
    private final Hub hub;
    private final Handler h = new Handler(Looper.getMainLooper());
    volatile String role = "none"; // none, offering, sending, asked, viewing
    volatile String state = "";    // waiting, connecting, live
    volatile String error = "";
    private volatile JSONObject opts = new JSONObject(), request = null;
    private volatile MediaProjection projection;
    private volatile ScreenSender sender;
    private volatile boolean accepted = false;
    private long offeredAt = 0;

    Mirror(Hub hub) { this.hub = hub; }

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
        try { hub.send(Proto.MIRROR_OFFER, new JSONObject().put("quality", opts.optString("quality", "standard")).put("fps", opts.optInt("fps", 30)).put("audio", opts.optBoolean("audio", true))); } catch (Exception ignored) { }
        h.postDelayed(() -> { if ("offering".equals(role) && offeredAt == mine && !accepted) { error = "timeout"; stop(true); } }, 60000);
        hub.changed();
    }

    private void startCapture() {
        Session s = session();
        MediaProjection mp = projection;
        if (s == null || mp == null || !"offering".equals(role)) return;
        try {
            ScreenSender ss = new ScreenSender(hub.ctx, mp, opts, s, this);
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

    // ---------- the other phone shares its screen ----------
    void answer(boolean accept) {
        Session s = session();
        if (!"asked".equals(role) || s == null) return;
        try { hub.send(Proto.MIRROR_REPLY, new JSONObject().put("accept", accept)); } catch (Exception ignored) { }
        LinkService.askDone(hub.ctx);
        if (!accept) { role = "none"; request = null; hub.changed(); return; }
        role = "viewing";
        state = "connecting";
        error = "";
        MirrorRx.begin(s.peerName);
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
    void onControl(int type, JSONObject o) {
        Session s = session();
        switch (type) {
            case Proto.MIRROR_OFFER:
                if (!"none".equals(role)) { hub.send(Proto.MIRROR_REPLY, put(new JSONObject(), "accept", false, "reason", "busy")); return; }
                request = o;
                role = "asked";
                state = "";
                LinkService.mirrorAsk(hub.ctx, s == null ? "" : s.peerName);
                hub.notice("mirror-ask", s == null ? "" : s.peerName);
                break;
            case Proto.MIRROR_REPLY:
                if (!"offering".equals(role)) return;
                if (!o.optBoolean("accept")) { error = "busy".equals(o.optString("reason")) ? "busy" : "declined"; stop(false); hub.notice("mirror-declined", null); return; }
                accepted = true;
                state = "connecting";
                if (s != null && !s.host) hub.connect.joiner.openStream(s, this::startCapture);
                else if (s != null && s.stream != null) startCapture();
                break;
            case Proto.MIRROR_STOP:
                boolean wasViewing = "viewing".equals(role) || "asked".equals(role);
                stop(false);
                hub.notice(wasViewing ? "mirror-ended" : "mirror-stopped", null);
                break;
            case Proto.KEY_REQUEST:
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
    void onStreamAttached() {
        if ("offering".equals(role) && accepted) startCapture();
        else if ("sending".equals(role)) { ScreenSender ss = sender; if (ss != null) ss.streamBack(); }
    }

    void onStream(Link.Frame f) {
        if ("viewing".equals(role)) {
            if (f.type == Proto.VIDEO_CONFIG && "connecting".equals(state)) { state = "live"; hub.changed(); }
            MirrorRx.onFrame(f.type, f.body);
        }
    }

    void requestKey() { hub.send(Proto.KEY_REQUEST, new JSONObject()); }

    void streamFailed() { error = "stream"; stop(true); }

    /** Stops sharing or watching (tell = let the other phone know). */
    void stop(boolean tell) {
        String was = role;
        if (tell && !"none".equals(was)) hub.send(Proto.MIRROR_STOP, new JSONObject());
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
        MirrorRx.end("viewing".equals(was) ? "stopped" : "");
        hub.control.ended();
        LinkService.askDone(hub.ctx);
        LinkService.mirrorOff(hub.ctx);
        hub.changed();
    }

    void onLinkLost() { MirrorRx.status("reconnecting"); }

    void onResumed() {
        Session s = session();
        if (s == null) return;
        MirrorRx.status("");
        if (!s.host && ("sending".equals(role) || "viewing".equals(role))) {
            hub.connect.joiner.openStream(s, () -> {
                ScreenSender ss = sender;
                if (ss != null) ss.streamBack(); else requestKey();
            });
        }
    }

    void onClosed() { if (!"none".equals(role)) stop(false); }

    JSONObject describe() throws Exception {
        JSONObject d = new JSONObject().put("role", role).put("state", state).put("error", error);
        JSONObject r = request;
        if (r != null) d.put("request", r);
        ScreenSender ss = sender;
        if (ss != null) ss.describe(d);
        return d;
    }
}
