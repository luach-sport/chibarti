package com.luachsport.chibarti;

import android.content.Intent;
import android.provider.Settings;
import org.json.JSONObject;

/**
 * Remote control, on top of screen sharing. The one watching asks (CONTROL_ASK); the one sharing sees who asks and
 * allows or not. Allowing needs the accessibility service on (once, in Settings); if it's off, Settings opens and the
 * answer goes out as soon as it's on. While "controlled", INPUT messages become taps, swipes, keys and text here.
 * It ends with the screen sharing, the connection, or either side's stop.
 *
 * role: none | asking (I asked to control the other) | controlling | asked (the other asks me) | setup | controlled
 */
final class Control {
    private final Hub hub;
    volatile String role = "none", error = "", peerKind = "";
    private long askedAt = 0;

    Control(Hub hub) { this.hub = hub; }

    private static JSONObject o(Object... kv) {
        JSONObject j = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) j.put((String) kv[i], kv[i + 1]); } catch (Exception ignored) { }
        return j;
    }

    static boolean serviceOn() { return ControlService.live != null; }

    // ---------- I watch the other screen and want to control it ----------
    void ask() {
        if (!"viewing".equals(hub.mirror.role) || "asking".equals(role) || "controlling".equals(role)) return;
        role = "asking";
        error = "";
        askedAt = System.currentTimeMillis();
        final long mine = askedAt;
        hub.send(Proto.CONTROL_ASK, new JSONObject());
        hub.h.postDelayed(() -> { if ("asking".equals(role) && askedAt == mine) { error = "timeout"; role = "none"; changed(); } }, 120000);
        changed();
    }

    /** One tap, swipe, key or piece of text for the other screen (from the viewer). */
    void input(JSONObject in) { if ("controlling".equals(role)) hub.send(Proto.INPUT, in); }

    // ---------- the other one watches my screen and asks ----------
    /** "לאפשר שליטה" / "לא" on this phone. */
    void answer(boolean allow) {
        if (!"asked".equals(role) && !"setup".equals(role)) return;
        LinkService.askDone(hub.ctx);
        if (!allow) { hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "declined")); role = "none"; changed(); return; }
        if (!ControlService.canTouch()) { hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "old")); role = "none"; error = "old"; changed(); return; }
        if (serviceOn()) { allowNow(); return; }
        role = "setup";
        openSettings();
        changed();
    }

    void openSettings() {
        try { hub.ctx.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }

    /** The accessibility service just came on (from Settings). */
    void onServiceReady() { if ("setup".equals(role)) hub.h.post(this::allowNow); }

    private void allowNow() {
        if (!"sending".equals(hub.mirror.role)) { role = "none"; changed(); return; }
        role = "controlled";
        hub.send(Proto.CONTROL_REPLY, o("accept", true));
        hub.notice("control-on", peer());
        changed();
    }

    // ---------- messages ----------
    void onMessage(int type, JSONObject m) {
        switch (type) {
            case Proto.CONTROL_ASK:
                if (!"sending".equals(hub.mirror.role)) { hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "not-sharing")); return; }
                if (!ControlService.canTouch()) { hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "old")); return; }
                if ("controlled".equals(role)) { hub.send(Proto.CONTROL_REPLY, o("accept", true)); return; }
                role = "asked";
                error = "";
                LinkService.controlAsk(hub.ctx, peer());
                hub.notice("control-ask", peer());
                break;
            case Proto.CONTROL_REPLY:
                if (!"asking".equals(role)) return;
                if (m.optBoolean("accept")) { role = "controlling"; error = ""; }
                else { role = "none"; error = m.optString("reason", "declined"); }
                break;
            case Proto.CONTROL_STOP:
                boolean was = "controlled".equals(role) || "controlling".equals(role);
                role = "none";
                LinkService.askDone(hub.ctx);
                if (was) hub.notice("control-off", peer());
                break;
            case Proto.INPUT:
                if (!"controlled".equals(role)) return;
                ControlService svc = ControlService.live;
                if (svc != null) Input.apply(svc, m);
                return; // no redraw for every touch
            default: return;
        }
        changed();
    }

    /** Stops controlling / being controlled (tell = let the other side know). */
    void stop(boolean tell) {
        if ("none".equals(role)) return;
        String was = role;
        role = "none";
        LinkService.askDone(hub.ctx);
        if (tell && !"asked".equals(was)) hub.send(Proto.CONTROL_STOP, new JSONObject());
        if (tell && "asked".equals(was)) hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "declined"));
        changed();
    }

    /** Screen sharing ended or the connection closed: control ends with it. */
    void ended() {
        if ("none".equals(role)) return;
        role = "none";
        LinkService.askDone(hub.ctx);
        changed();
    }

    private String peer() { Session s = hub.session; return s == null ? "" : s.peerName; }

    private void changed() { hub.changed(); MirrorRx.control(role, error); }

    JSONObject describe() {
        return o("role", role, "error", error, "service", serviceOn(), "can", ControlService.canTouch());
    }
}
