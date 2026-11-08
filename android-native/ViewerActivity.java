package com.luachsport.chibarti;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * Full-screen view of the other phone's screen. The picture keeps its shape (black bars where needed) and
 * follows when the other phone turns. Tap to show the bar (name, quality, delay, rotate, close); it hides by itself.
 */
public class ViewerActivity extends Activity implements MirrorRx.Viewer, SurfaceHolder.Callback {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private SurfaceView sv;
    private LinearLayout bar, center;
    private TextView title, stats, status;
    private volatile VideoDecoder dec;
    private volatile AudioPlayer audio;
    private volatile Proto.Config vcfg;
    private Surface surface;
    private long lastKeyAsk = 0;
    private int lastFrames = 0;
    private boolean closing = false;
    private ViewerControl control;

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        sv = new SurfaceView(this);
        sv.getHolder().addCallback(this);
        root.addView(sv, new FrameLayout.LayoutParams(1, 1, Gravity.CENTER));

        center = new LinearLayout(this);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER);
        ProgressBar pb = new ProgressBar(this);
        center.addView(pb, new LinearLayout.LayoutParams(dp(40), dp(40)));
        status = text(16, Color.WHITE, false);
        status.setGravity(Gravity.CENTER);
        status.setPadding(dp(24), dp(14), dp(24), 0);
        status.setText("מתחבר למסך של " + MirrorRx.peer + "…");
        center.addView(status);
        root.addView(center, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER));

        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), dp(12), dp(8), dp(12));
        bar.setBackgroundColor(0x99000000);
        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        title = text(16, Color.WHITE, true);
        title.setText("המסך של " + MirrorRx.peer);
        stats = text(12, 0xFFCFE9EA, false);
        texts.addView(title);
        texts.addView(stats);
        bar.addView(texts, new LinearLayout.LayoutParams(0, -2, 1));
        TextView ctl = button("☝", "שליטה", v -> { control.toggle(); showBar(); });
        bar.addView(ctl);
        bar.addView(button("⟳", "סיבוב", v -> rotate()));
        bar.addView(button("✕", "סגירה", v -> close()));
        root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        root.setOnClickListener(v -> showBar());
        control = new ViewerControl(this, root, sv, ctl, this::showBar);
        root.addOnLayoutChangeListener((v, l, t, r, btm, ol, ot, or, ob) -> fit());
        setContentView(root);
        immersive();
        if (!MirrorRx.attach(this)) { finish(); return; }
        showBar();
        ui.postDelayed(tick, 1000);
    }

    private TextView text(int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextDirection(View.TEXT_DIRECTION_RTL);
        return t;
    }

    private TextView button(String glyph, String label, View.OnClickListener l) {
        TextView t = text(22, Color.WHITE, true);
        t.setText(glyph);
        t.setGravity(Gravity.CENTER);
        t.setContentDescription(label);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(14));
        bg.setColor(0x33FFFFFF);
        t.setBackground(bg);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(48), dp(48));
        p.setMarginStart(dp(8));
        t.setLayoutParams(p);
        t.setOnClickListener(l);
        return t;
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private final Runnable hideBar = () -> bar.animate().alpha(0f).setDuration(250).withEndAction(() -> bar.setVisibility(View.GONE));

    private void showBar() {
        bar.setVisibility(View.VISIBLE);
        bar.animate().cancel();
        bar.setAlpha(1f);
        ui.removeCallbacks(hideBar);
        ui.postDelayed(hideBar, 3500);
        immersive();
    }

    private void rotate() {
        int o = getRequestedOrientation();
        setRequestedOrientation(o == ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        showBar();
    }

    private void close() {
        closing = true;
        Hub.get(this).mirror.stop(true);
        finish();
    }

    @Override public void onBackPressed() { close(); }

    /** The picture as large as possible with its own shape. */
    private void fit() {
        Proto.Config c = vcfg;
        int W = root.getWidth(), H = root.getHeight();
        if (c == null || W == 0 || H == 0 || c.a <= 0 || c.b <= 0) return;
        float s = Math.min(W / (float) c.a, H / (float) c.b);
        int w = Math.round(c.a * s), h = Math.round(c.b * s);
        FrameLayout.LayoutParams p = (FrameLayout.LayoutParams) sv.getLayoutParams();
        if (p.width != w || p.height != h) { p.width = w; p.height = h; p.gravity = Gravity.CENTER; sv.setLayoutParams(p); }
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            VideoDecoder d = dec;
            Session s = Hub.get(ViewerActivity.this).session;
            if (d != null && vcfg != null) {
                int f = d.framesShown, fps = f - lastFrames;
                lastFrames = f;
                int rtt = s == null ? -1 : s.rttMs;
                int delay = Math.max(0, (rtt < 0 ? 0 : rtt / 2) + d.lagMs + 35);
                stats.setText(Math.min(vcfg.a, vcfg.b) + "p · " + fps + " FPS · השהיה ~" + delay + "ms" + (audio != null ? " · עם קול" : ""));
                if (f > 0 && center.getVisibility() == View.VISIBLE && status.getTag() == null) center.setVisibility(View.GONE);
            }
            ui.postDelayed(this, 1000);
        }
    };

    private void startDecoder() {
        stopDecoder();
        Proto.Config c = vcfg;
        if (c == null || surface == null || !surface.isValid()) return;
        VideoDecoder d = new VideoDecoder();
        if (d.start(surface, c)) { dec = d; askKey(true); }
    }

    private void stopDecoder() { VideoDecoder d = dec; dec = null; if (d != null) d.release(); }

    private void askKey(boolean now) {
        long t = System.currentTimeMillis();
        if (!now && t - lastKeyAsk < 800) return;
        lastKeyAsk = t;
        Hub.get(this).mirror.requestKey();
    }

    // ---------- MirrorRx.Viewer (called from the network thread) ----------
    @Override public void onVideoConfig(Proto.Config c) {
        ui.post(() -> { vcfg = c; fit(); startDecoder(); });
    }

    @Override public void onVideo(byte[] body) {
        VideoDecoder d = dec;
        if (d != null && !d.feed(body)) askKey(false);
    }

    @Override public void onAudioConfig(Proto.Config c) {
        ui.post(() -> {
            AudioPlayer old = audio;
            audio = null;
            if (old != null) old.release();
            AudioPlayer a = new AudioPlayer();
            if (a.start(c)) audio = a;
        });
    }

    @Override public void onAudio(byte[] body) { AudioPlayer a = audio; if (a != null) a.feed(body); }

    @Override public void onStatus(String st) {
        ui.post(() -> {
            if (st == null || st.isEmpty()) { status.setTag(null); if (dec != null && dec.framesShown > 0) center.setVisibility(View.GONE); return; }
            status.setTag("on");
            status.setText("reconnecting".equals(st) ? "החיבור נקטע לרגע, מתחבר שוב…" : st);
            center.setVisibility(View.VISIBLE);
        });
    }

    @Override public void onEnded(String why) { ui.post(() -> { closing = true; finish(); }); }

    @Override public void onControl(String role, String error) { ui.post(() -> { if (control != null) control.onControl(role, error); }); }

    // ---------- the surface ----------
    @Override public void surfaceCreated(SurfaceHolder h) { surface = h.getSurface(); startDecoder(); }
    @Override public void surfaceChanged(SurfaceHolder h, int f, int w, int hh) { }
    @Override public void surfaceDestroyed(SurfaceHolder h) { stopDecoder(); surface = null; }

    @Override protected void onResume() { super.onResume(); immersive(); }

    @Override protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        MirrorRx.detach(this);
        stopDecoder();
        AudioPlayer a = audio;
        audio = null;
        if (a != null) a.release();
        if (isFinishing() && !closing && "viewing".equals(Hub.get(this).mirror.role)) Hub.get(this).mirror.stop(true);
        super.onDestroy();
    }
}
