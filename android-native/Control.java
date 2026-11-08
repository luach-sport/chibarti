package com.luachsport.chibarti;

import org.json.JSONObject;

/**
 * Remote control, on top of screen sharing. The one watching asks (CONTROL_ASK); the one sharing sees who asks and
 * allows or not. Being controlled needs the add-on "חיברתי – שליטה" (ControlLink) installed and turned on once in the
 * accessibility settings; until then this phone shows how (install / setup) and the answer goes out by itself when
 * it's ready. While "controlled", INPUT messages go to the add-on, which taps, swipes, presses keys and types.
 * It ends with the screen sharing, the connection, or either side's stop.
 *
 * role: none | asking (I asked to control the other) | controlling | asked (the other asks me) | install | setup | controlled
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

    private boolean serviceOn() { return ControlLink.enabled(hub.ctx); }

    private static boolean canTouch() { return android.os.Build.VERSION.SDK_INT >= 24; }

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
        if (!"asked".equals(role) && !"install".equals(role) && !"setup".equals(role)) return;
        LinkService.askDone(hub.ctx);
        if (!allow) { hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "declined")); role = "none"; changed(); return; }
        if (!canTouch()) { hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "old")); role = "none"; error = "old"; changed(); return; }
        if (serviceOn()) { allowNow(); return; }
        if (ControlLink.installed(hub.ctx)) { role = "setup"; ControlLink.openSetup(hub.ctx); }
        else role = "install";
        watch();
        changed();
    }

    void openSettings() { ControlLink.openSetup(hub.ctx); }

    /** While waiting for the add-on (installed / turned on), look every 1.5 s; the answer goes out when it's ready. */
    private void watch() {
        hub.h.postDelayed(() -> {
            if (!"install".equals(role) && !"setup".equals(role)) return;
            if (!"sending".equals(hub.mirror.role)) { ended(); return; }
            if (serviceOn()) { allowNow(); return; }
            if ("install".equals(role) && ControlLink.installed(hub.ctx)) { role = "setup"; changed(); }
            watch();
        }, 1500);
    }

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
                if (!canTouch()) { hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "old")); return; }
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
                if ("controlled".equals(role)) ControlLink.send(hub.ctx, m.toString());
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
        boolean answered = "controlled".equals(was) || "asking".equals(was) || "controlling".equals(was);
        if (tell && answered) hub.send(Proto.CONTROL_STOP, new JSONObject());
        if (tell && !answered) hub.send(Proto.CONTROL_REPLY, o("accept", false, "reason", "declined"));
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
        return o("role", role, "error", error, "addon", ControlLink.installed(hub.ctx), "service", serviceOn(), "can", canTouch(), "url", ControlLink.URL);
    }
}
