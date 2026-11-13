package com.luachsport.chibarti;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.projection.MediaProjection;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;
import org.json.JSONObject;
import java.util.ArrayDeque;

/**
 * Captures this phone's screen into the encoder and streams it. The picture keeps the phone's shape (portrait or
 * landscape, re-made when the phone turns). Quality: 480p / 720p / 1080p at 30 fps, or 60 fps when the encoder
 * can. With automatic quality on, the bitrate follows the connection; frames are skipped (never queued up) when
 * the connection is behind, so the other phone always sees "now".
 */
final class ScreenSender implements VideoEncoder.Out, AudioSender.Out {
    /** Where the picture goes: one device's screen connection, or everyone in a room (StreamFan). */
    interface Sink {
        /** False when it couldn't go now (no screen connection): the next picture must be a key frame. */
        boolean send(int type, byte[] body, boolean key);
        /** Bytes still waiting beyond this sender's own queue (the slowest viewer in a room). */
        long waiting();
    }

    /** One device: straight to its screen connection (as between two phones). */
    static Sink to(final Session s) {
        return new Sink() {
            @Override public boolean send(int type, byte[] body, boolean key) {
                Link st = s.stream;
                if (st == null) return false;
                try { st.send(type, body); return true; } catch (Exception e) { s.dropStream(); return false; }
            }
            @Override public long waiting() { return 0; }
        };
    }

    /** Everyone in a room. */
    static Sink to(final StreamFan fan) {
        return new Sink() {
            @Override public boolean send(int type, byte[] body, boolean key) { fan.send(type, body, key); return true; }
            @Override public long waiting() { return fan.waiting(); }
        };
    }

    private final Context ctx;
    private final MediaProjection mp;
    private final JSONObject opts;
    private final Sink out;
    private final Runnable ended;
    private HandlerThread ht;
    private Handler h;
    private VirtualDisplay vd;
    private volatile VideoEncoder enc;
    private AudioSender audio;
    private RateControl rc;
    private DisplayManager.DisplayListener dl;
    private int screenW, screenH, dpi, fps;
    private final ArrayDeque<Object[]> q = new ArrayDeque<>();
    private long qBytes = 0, lastKeyAsk = 0;
    private boolean needKey = false;
    private volatile boolean running = false;
    private volatile byte[] lastConfig, lastAudioConfig;
    private Thread writer;
    private volatile String audioState = "off";
    private int framesSec = 0, bytesSec = 0, fpsNow = 0, kbpsNow = 0;
    private long secStart = 0;

    /** ended: Android stopped the capture (the user tapped "stop" in its notification). */
    ScreenSender(Context c, MediaProjection mp, JSONObject opts, Sink out, Runnable ended) {
        this.ctx = c;
        this.mp = mp;
        this.opts = opts;
        this.out = out;
        this.ended = ended;
    }

    private static int shortSide(String quality) {
        switch (quality) {
            case "low": return 480;
            case "high": case "max": return 1080;
            default: return 720;
        }
    }

    private static int align(int v) { return Math.max(16, Math.round(v / 16f) * 16); }

    /** Encoder size for the screen: the chosen short side (never above the real screen), steps down if unsupported. */
    private int[] size(int sw, int sh) {
        int[] steps = { shortSide(opts.optString("quality", "standard")), 720, 540, 480, 360 };
        for (int target : steps) {
            float scale = Math.min(1f, target / (float) Math.min(sw, sh));
            int w = align((int) (sw * scale)), hh = align((int) (sh * scale));
            if (VideoEncoder.supports(w, hh, fps)) return new int[] { w, hh };
            if (fps > 30 && VideoEncoder.supports(w, hh, 30)) { fps = 30; return new int[] { w, hh }; }
        }
        return new int[] { align(sw / 3), align(sh / 3) };
    }

    private static int bitrateFor(int w, int h, int fps) {
        return (int) Math.max(800_000, Math.min(12_000_000, (long) w * h * fps / 10));
    }

    private void readScreen() {
        WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics m = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(m);
        screenW = m.widthPixels;
        screenH = m.heightPixels;
        dpi = m.densityDpi;
    }

    void start() throws Exception {
        String quality = opts.optString("quality", "standard");
        fps = "max".equals(quality) ? 60 : Math.max(15, Math.min(60, opts.optInt("fps", 30)));
        ht = new HandlerThread("mirror");
        ht.start();
        h = new Handler(ht.getLooper());
        mp.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { if (running) { running = false; mirrorStop(); } }
            @Override public void onCapturedContentResize(int width, int height) { h.post(() -> reconfigure(width, height)); }
        }, h);
        readScreen();
        int[] s = size(screenW, screenH);
        rc = new RateControl(bitrateFor(s[0], s[1], fps), opts.optBoolean("auto", true));
        enc = new VideoEncoder();
        Surface surface = enc.start(s[0], s[1], rc.bitrate(), fps, this);
        vd = mp.createVirtualDisplay("Chibarti", s[0], s[1], dpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, surface, null, h);
        running = true;
        writer = new Thread(this::writeLoop, "video-out");
        writer.start();
        DisplayManager dm = (DisplayManager) ctx.getSystemService(Context.DISPLAY_SERVICE);
        dl = new DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int id) { }
            @Override public void onDisplayRemoved(int id) { }
            @Override public void onDisplayChanged(int id) {
                if (id != Display.DEFAULT_DISPLAY || !running) return;
                int ow = screenW, oh = screenH;
                readScreen();
                if ((ow > oh) != (screenW > screenH)) reconfigure(screenW, screenH);
            }
        };
        dm.registerDisplayListener(dl, h);
        startAudio();
    }

    private void mirrorStop() { new Handler(android.os.Looper.getMainLooper()).post(ended); }

    private void startAudio() {
        if (!opts.optBoolean("audio", true)) { audioState = "off"; return; }
        if (Build.VERSION.SDK_INT < 29) { audioState = "unsupported"; return; }
        if (ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { audioState = "no-permission"; return; }
        AudioSender a = new AudioSender();
        audioState = a.start(mp, this) ? "on" : "failed";
        if ("on".equals(audioState)) audio = a;
    }

    /** The phone turned (or Android 14's single-app sharing changed size): a new encoder in the new shape. */
    private void reconfigure(int sw, int sh) {
        if (!running) return;
        try {
            int[] s = size(sw, sh);
            VideoEncoder old = enc;
            if (old != null && old.width == s[0] && old.height == s[1]) return;
            VideoEncoder n = new VideoEncoder();
            Surface surface = n.start(s[0], s[1], rc.bitrate(), fps, this);
            vd.resize(s[0], s[1], dpi);
            vd.setSurface(surface);
            enc = n;
            if (old != null) old.stop();
        } catch (Exception e) {
            android.util.Log.w("Chibarti", "reconfigure", e);
        }
    }

    // ---------- encoder output → queue → stream connection ----------
    @Override public void config(int w, int hh, byte[] csd0, byte[] csd1) {
        byte[] body = Proto.config(w, hh, csd0, csd1);
        lastConfig = body;
        synchronized (q) { needKey = false; }
        push(Proto.VIDEO_CONFIG, body, true, false);
    }

    @Override public void frame(byte[] data, long ptsUs, boolean key) {
        push(Proto.VIDEO_FRAME, Proto.media(key ? 1 : 0, ptsUs, data, 0, data.length), key, false);
    }

    /** Waiting bytes: this sender's queue plus what the viewers still have to take (in a room). */
    private long congestion() { return qBytes + out.waiting(); }

    @Override public void audioConfig(int rate, int channels, byte[] csd) {
        byte[] body = Proto.config(rate, channels, csd, null);
        lastAudioConfig = body;
        push(Proto.AUDIO_CONFIG, body, true, true);
    }

    @Override public void audio(byte[] data, long ptsUs) { push(Proto.AUDIO_FRAME, Proto.media(0, ptsUs, data, 0, data.length), false, true); }

    private void push(int type, byte[] body, boolean key, boolean isAudio) {
        long now = System.currentTimeMillis();
        int newRate;
        synchronized (q) {
            long behind = congestion();
            if (type == Proto.VIDEO_FRAME) {
                if (needKey && !key) { rc.dropped(); askKey(now); return; }
                if (!key && behind > rc.dropThreshold()) { needKey = true; rc.dropped(); askKey(now); return; }
                if (key) needKey = false;
            } else if (type == Proto.AUDIO_FRAME && behind > rc.dropThreshold() * 2) return;
            q.add(new Object[] { type, body, key });
            qBytes += body.length;
            q.notifyAll();
            newRate = type == Proto.VIDEO_FRAME ? rc.tick(now, congestion()) : 0;
        }
        if (newRate > 0) { VideoEncoder e = enc; if (e != null) e.setBitrate(newRate); }
    }

    private void askKey(long now) {
        if (now - lastKeyAsk < 700) return;
        lastKeyAsk = now;
        VideoEncoder e = enc;
        if (e != null) e.requestKey();
    }

    private void writeLoop() {
        secStart = System.currentTimeMillis();
        while (running) {
            Object[] o;
            synchronized (q) {
                while (running && q.isEmpty()) { try { q.wait(500); } catch (InterruptedException e) { return; } }
                if (!running) return;
                o = q.poll();
                qBytes -= ((byte[]) o[1]).length;
            }
            int type = (Integer) o[0];
            byte[] body = (byte[]) o[1];
            if (out.send(type, body, (Boolean) o[2])) {
                if (type == Proto.VIDEO_FRAME) { framesSec++; }
                bytesSec += body.length;
            } else if (type == Proto.VIDEO_FRAME) synchronized (q) { needKey = true; }
            long now = System.currentTimeMillis();
            if (now - secStart >= 1000) {
                fpsNow = (int) (framesSec * 1000L / (now - secStart));
                kbpsNow = (int) (bytesSec * 8L / (now - secStart));
                framesSec = 0;
                bytesSec = 0;
                secStart = now;
            }
        }
    }

    /** The stream connection is back (after a reconnect): resend the setup and start from a key frame. */
    void streamBack() {
        byte[] c = lastConfig, a = lastAudioConfig;
        if (c != null) push(Proto.VIDEO_CONFIG, c, true, false);
        if (a != null) push(Proto.AUDIO_CONFIG, a, true, true);
        synchronized (q) { needKey = true; }
        requestKey();
    }

    void requestKey() { VideoEncoder e = enc; if (e != null) e.requestKey(); }

    void describe(JSONObject d) throws Exception {
        VideoEncoder e = enc;
        d.put("width", e == null ? 0 : e.width).put("height", e == null ? 0 : e.height).put("fps", fpsNow).put("kbps", kbpsNow)
            .put("bitrate", rc == null ? 0 : rc.bitrate() / 1000).put("audio", audioState).put("quality", opts.optString("quality", "standard"));
    }

    void stop() {
        running = false;
        synchronized (q) { q.clear(); qBytes = 0; q.notifyAll(); }
        try { ((DisplayManager) ctx.getSystemService(Context.DISPLAY_SERVICE)).unregisterDisplayListener(dl); } catch (Exception ignored) { }
        if (audio != null) audio.stop();
        if (vd != null) { try { vd.release(); } catch (Exception ignored) { } }
        VideoEncoder e = enc;
        enc = null;
        if (e != null) e.stop();
        if (ht != null) ht.quitSafely();
    }
}
