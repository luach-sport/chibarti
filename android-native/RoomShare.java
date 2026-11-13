package com.luachsport.chibarti;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * One screen to everyone in a room, on the room's host. Two cases:
 * - this phone shares its own screen: every member is asked; whoever agrees gets the picture (StreamFan);
 * - a member shares to everyone: this phone asks the others (and its own user), tells the member "yes" as soon as
 *   anyone agrees, and passes the member's picture on to everyone who agreed — showing it here too, if wanted.
 * A slow viewer skips to the next key frame without holding up the rest. Remote control is off while this runs.
 */
final class RoomShare {
    private final Mirror mirror;
    private final Hub hub;
    private final Handler h = new Handler(Looper.getMainLooper());
    volatile StreamFan fan;
    volatile Session from; // passing on: the member whose screen it is
    private final Set<String> pending = Collections.synchronizedSet(new HashSet<String>());
    private volatile boolean agreed, watching;
    private long lastKey;

    RoomShare(Mirror mirror, Hub hub) { this.mirror = mirror; this.hub = hub; }

    boolean active() { return fan != null; }
    boolean relaying() { return from != null; }
    boolean watching() { return watching; }

    // ---------- this phone's screen to everyone ----------
    void offerAll(JSONObject offer) {
        fan = new StreamFan(this::wantKey);
        pending.clear();
        for (Session m : hub.members) if (m.state == Session.ACTIVE) { pending.add(m.peerId); m.control(Proto.MIRROR_OFFER, offer); }
        Diag.log("screen", "sharing to the room, asked " + pending.size() + " device(s)");
    }

    // ---------- a member's screen to everyone ----------
    void startRelay(Session s, JSONObject o) {
        from = s;
        fan = new StreamFan(this::wantKey);
        pending.clear();
        agreed = false;
        watching = false;
        try {
            JSONObject req = new JSONObject(o.toString()).put("name", s.peerName).put("all", true);
            mirror.request = req;
            JSONObject fwd = new JSONObject(o.toString()).put("from", new JSONObject().put("id", s.peerId).put("name", s.peerName));
            for (Session m : hub.members) if (m != s && m.state == Session.ACTIVE) { pending.add(m.peerId); m.control(Proto.MIRROR_OFFER, fwd); }
        } catch (Exception ignored) { }
        mirror.role = "asked";
        mirror.state = "";
        Diag.log("screen", s.peerName + " shares to the room, asked " + pending.size() + " more device(s)");
        LinkService.mirrorAsk(hub.ctx, s.peerName);
        hub.notice("mirror-ask", s.peerName);
        final Session mine = s;
        h.postDelayed(() -> { if (from == mine && !agreed) decline(); }, 60000);
    }

    /** This phone's own answer about the member's screen. */
    void hostAnswered(boolean accept) {
        LinkService.askDone(hub.ctx);
        Session f = from;
        if (f == null) return;
        if (accept) {
            watching = true;
            mirror.role = "viewing";
            mirror.state = "connecting";
            MirrorRx.begin(f.peerName);
            mirror.openViewer();
            agree();
        } else {
            mirror.role = "relaying";
            mirror.request = null;
            maybeDecline();
        }
        hub.changed();
    }

    private void agree() {
        Session f = from;
        if (agreed || f == null) return;
        agreed = true;
        try { f.control(Proto.MIRROR_REPLY, new JSONObject().put("accept", true)); } catch (Exception ignored) { }
    }

    private void maybeDecline() { if (!agreed && pending.isEmpty() && !watching && !"asked".equals(mirror.role)) decline(); }

    private void decline() {
        Session f = from;
        if (f != null) { try { f.control(Proto.MIRROR_REPLY, new JSONObject().put("accept", false).put("reason", "declined")); } catch (Exception ignored) { } }
        tellViewersStop();
        mirror.stop(false);
    }

    // ---------- messages ----------
    boolean onReply(Session s, JSONObject o) {
        StreamFan f = fan;
        if (f == null || !pending.remove(s.peerId)) return false;
        boolean yes = o.optBoolean("accept");
        Diag.log("screen", s.peerName + (yes ? " watches" : " doesn't watch"));
        if (yes) f.add(s);
        if (relaying()) { if (yes) agree(); else maybeDecline(); }
        else if (yes) mirror.roomAccepted();
        else nobodyLeft();
        return true;
    }

    boolean onStop(Session s) {
        if (fan == null) return false;
        if (s == from) { tellViewersStop(); mirror.stop(false); hub.notice("mirror-ended", null); return true; }
        leave(s);
        return true;
    }

    boolean onKey(Session s) {
        if (fan == null) return false;
        wantKey();
        return true;
    }

    /** A key frame for a viewer: from this phone's encoder, or asked from the sharing member. */
    void wantKey() {
        long now = System.currentTimeMillis();
        synchronized (this) { if (now - lastKey < 600) return; lastKey = now; }
        Session f = from;
        if (f != null) { try { f.control(Proto.KEY_REQUEST, new JSONObject()); } catch (Exception ignored) { } }
        else mirror.senderKey();
    }

    boolean onStream(Session s, Link.Frame f) {
        StreamFan fn = fan;
        if (fn == null || s != from) return false;
        boolean key = f.type == Proto.VIDEO_FRAME && f.body.length > 0 && (f.body[0] & 1) == 1;
        fn.send(f.type, f.body, key);
        if (watching && "viewing".equals(mirror.role)) {
            if (f.type == Proto.VIDEO_CONFIG && "connecting".equals(mirror.state)) { mirror.state = "live"; hub.changed(); }
            MirrorRx.onFrame(f.type, f.body);
        }
        return true;
    }

    boolean onStreamAttached(Session s) {
        StreamFan f = fan;
        if (f == null) return false;
        if (f.has(s)) { f.ready(s); return true; }
        return s == from || pending.contains(s.peerId);
    }

    /** A member left the room or lost its connection. */
    void gone(Session s) {
        if (fan == null) return;
        if (s == from) { tellViewersStop(); mirror.stop(false); hub.notice("mirror-ended", s.peerName); return; }
        leave(s);
    }

    private void leave(Session s) {
        StreamFan f = fan;
        pending.remove(s.peerId);
        if (f != null) f.remove(s);
        s.dropStream();
        nobodyLeft();
    }

    /** Nobody watches any more (and nobody is still asked): it ends. */
    private void nobodyLeft() {
        StreamFan f = fan;
        if (f == null || f.size() > 0 || !pending.isEmpty() || watching || "asked".equals(mirror.role)) return;
        Session fr = from;
        if (fr != null) {
            if (!agreed) { decline(); return; }
            try { fr.control(Proto.MIRROR_STOP, new JSONObject()); } catch (Exception ignored) { }
            mirror.stop(false);
        } else {
            boolean was = "sending".equals(mirror.role);
            mirror.error = was ? "" : "declined";
            mirror.stop(false);
            hub.notice(was ? "mirror-stopped" : "mirror-declined", null);
        }
    }

    /** This phone stops watching a member's screen; the others go on watching. */
    boolean othersWatching() { StreamFan f = fan; return f != null && (f.size() > 0 || !pending.isEmpty()); }

    void stopWatching() {
        watching = false;
        mirror.role = "relaying";
        mirror.state = "";
        MirrorRx.end("stopped");
        hub.changed();
    }

    void tellAllStop() {
        tellViewersStop();
        Session f = from;
        if (f != null) { try { f.control(Proto.MIRROR_STOP, new JSONObject()); } catch (Exception ignored) { } }
    }

    private void tellViewersStop() {
        List<Session> all = new ArrayList<>();
        StreamFan f = fan;
        if (f != null) all.addAll(f.sessions());
        synchronized (pending) { for (String id : pending) { Session m = hub.member(id); if (m != null && !all.contains(m)) all.add(m); } }
        for (Session m : all) { try { m.control(Proto.MIRROR_STOP, new JSONObject()); } catch (Exception ignored) { } }
    }

    void end() {
        StreamFan f = fan;
        fan = null;
        if (f != null) { for (Session m : f.sessions()) m.dropStream(); f.stop(); }
        Session fr = from;
        from = null;
        if (fr != null) fr.dropStream();
        pending.clear();
        agreed = false;
        watching = false;
    }

    void describe(JSONObject d) throws Exception {
        StreamFan f = fan;
        if (f == null) return;
        Session fr = from;
        d.put("room", new JSONObject().put("viewers", f.size()).put("asked", pending.size()).put("from", fr == null ? "" : fr.peerName).put("watching", watching));
    }
}
