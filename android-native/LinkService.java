package com.luachsport.chibarti;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import org.json.JSONObject;

/**
 * Keeps the connection alive while the app is in the background or the screen is off (Android's rule: a visible
 * notification). Holds Wi-Fi at full speed while connected. Also shows the "a phone wants to connect / send you
 * files / show you its screen" alerts, and asks Android for screen capture in the right order (Android 14).
 */
public class LinkService extends Service {
    static final String START = "start", PROJECT = "project", STOP_MIRROR = "stop-mirror", DISCONNECT = "disconnect";
    private static final String CH_LINK = "link", CH_ALERT = "alerts";
    private static final int ID = 1, ID_ASK = 2, ID_OFFER = 3, ID_TEXT = 4;
    private static volatile LinkService me;
    private static volatile boolean starting = false;
    private final Handler h = new Handler(Looper.getMainLooper());
    private WifiManager.WifiLock wifiLock;
    private PowerManager.WakeLock wakeLock;
    private boolean projecting = false;

    // ---------- from the rest of the app ----------
    static void start(Context c) {
        if (me != null || starting) return;
        starting = true;
        send(c, new Intent(c, LinkService.class).setAction(START));
    }

    static void stop(Context c) {
        starting = false;
        LinkService s = me;
        if (s != null) s.h.post(() -> { s.stopForegroundCompat(); s.stopSelf(); });
    }

    static void project(Context c, int code, Intent data, String opts) {
        send(c, new Intent(c, LinkService.class).setAction(PROJECT).putExtra("code", code).putExtra("data", data).putExtra("opts", opts));
    }

    private static void send(Context c, Intent i) {
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception e) { starting = false; android.util.Log.w("Chibarti", "service", e); }
    }

    static void refresh(Context c) { LinkService s = me; if (s != null) s.show(); }

    static void mirrorOff(Context c) { LinkService s = me; if (s != null) s.h.post(() -> { s.projecting = false; s.foreground(); }); }

    static void ask(Context c, String name) { alert(c, ID_ASK, name + " רוצה להתחבר", "לחיצה לאישור או לסירוב"); }

    static void mirrorAsk(Context c, String name) { alert(c, ID_ASK, name + " רוצה להראות לך את המסך שלו", "לחיצה כדי לצפות"); }

    static void askDone(Context c) { cancel(c, ID_ASK); }

    static void offer(Context c, String name, int n) { alert(c, ID_OFFER, name + " רוצה לשלוח לך " + (n == 1 ? "קובץ" : n + " קבצים"), "לחיצה לאישור"); }

    static void offerDone(Context c) { cancel(c, ID_OFFER); }

    static void textArrived(Context c, String name, String text) {
        if (MainActivity.visible) return;
        alert(c, ID_TEXT, pre("הודעה מ", name), text.length() > 120 ? text.substring(0, 120) + "…" : text);
    }

    /** "ל" + "Redmi" → "ל-Redmi" (Hebrew joins a prefix with a hyphen before Latin letters and digits). */
    static String pre(String p, String name) {
        if (name == null) name = "";
        return p + (!name.isEmpty() && name.charAt(0) < 128 && Character.isLetterOrDigit(name.charAt(0)) ? "-" : "") + name;
    }

    // ---------- notifications ----------
    private static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_LINK) == null) {
            NotificationChannel l = new NotificationChannel(CH_LINK, "חיבור פעיל", NotificationManager.IMPORTANCE_LOW);
            l.setDescription("מופיעה כל זמן ששני הטלפונים מחוברים");
            l.setShowBadge(false);
            nm.createNotificationChannel(l);
        }
        if (nm.getNotificationChannel(CH_ALERT) == null) {
            NotificationChannel a = new NotificationChannel(CH_ALERT, "בקשות והודעות", NotificationManager.IMPORTANCE_HIGH);
            a.setDescription("בקשת חיבור, קבצים שמחכים לאישור, שיתוף מסך והודעות טקסט");
            nm.createNotificationChannel(a);
        }
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder builder(Context c, String ch) {
        channels(c);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_chibarti).setColor(0xFF0A8F94).setShowWhen(false);
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        b.setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return b;
    }

    @SuppressWarnings("deprecation")
    private static void alert(Context c, int id, String title, String text) {
        try {
            Notification.Builder b = builder(c, CH_ALERT).setContentTitle(title).setContentText(text).setAutoCancel(true).setShowWhen(true);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
            ((NotificationManager) c.getSystemService(NOTIFICATION_SERVICE)).notify(id, b.build());
        } catch (Exception ignored) { }
    }

    private static void cancel(Context c, int id) {
        try { ((NotificationManager) c.getSystemService(NOTIFICATION_SERVICE)).cancel(id); } catch (Exception ignored) { }
    }

    private PendingIntent action(String a, int req) {
        Intent i = new Intent(this, LinkService.class).setAction(a);
        return PendingIntent.getService(this, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @SuppressWarnings("deprecation")
    private Notification build() {
        Hub hub = Hub.get(this);
        String mode = hub.mode(), title, text = "";
        Session s = hub.session;
        String peer = s == null ? "" : s.peerName;
        String role = hub.mirror.role;
        if ("sending".equals(role) || "offering".equals(role)) { title = "משתף את המסך עם " + peer; text = "לחיצה על \"עצירה\" מפסיקה מיד"; }
        else if ("viewing".equals(role)) title = "צופה במסך של " + peer;
        else if ("connected".equals(mode)) { title = pre("מחובר ל", peer); text = "אפשר לשלוח קבצים, הודעות ולשתף מסך"; }
        else if ("reconnecting".equals(mode)) title = "החיבור נקטע, מתחבר שוב…";
        else if ("joining".equals(mode)) title = "מתחבר…";
        else if ("hosting".equals(mode)) { title = "מחכה שהטלפון השני יתחבר"; text = "בלי אינטרנט, ישירות בין הטלפונים"; }
        else title = "חיברתי";
        Notification.Builder b = builder(this, CH_LINK).setContentTitle(title).setContentText(text).setOngoing(true).setOnlyAlertOnce(true);
        if ("sending".equals(role) || "offering".equals(role)) b.addAction(new Notification.Action.Builder(0, "עצירת השיתוף", action(STOP_MIRROR, 1)).build());
        if (s != null) b.addAction(new Notification.Action.Builder(0, "ניתוק", action(DISCONNECT, 2)).build());
        return b.build();
    }

    private void show() {
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(ID, build()); } catch (Exception ignored) { }
    }

    private void foreground() {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE | (projecting ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION : 0);
                startForeground(ID, build(), types);
            } else startForeground(ID, build());
        } catch (Exception e) { android.util.Log.w("Chibarti", "foreground", e); }
    }

    @SuppressWarnings("deprecation")
    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE); else stopForeground(true);
    }

    // ---------- the service ----------
    @Override public void onCreate() {
        super.onCreate();
        me = this;
        starting = false;
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            int mode = Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wm.createWifiLock(mode, "chibarti");
            wifiLock.acquire();
            wakeLock = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "chibarti:link");
            wakeLock.acquire(6 * 60 * 60 * 1000L);
        } catch (Exception ignored) { }
    }

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        String a = i == null ? START : i.getAction();
        if (PROJECT.equals(a)) {
            projecting = true;
            foreground(); // Android 14: the service must be of "screen capture" type before asking for the capture
            try {
                MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
                Intent data = i.getParcelableExtra("data");
                MediaProjection mp = mpm.getMediaProjection(i.getIntExtra("code", 0), data);
                JSONObject opts;
                try { opts = new JSONObject(i.getStringExtra("opts")); } catch (Exception e) { opts = new JSONObject(); }
                if (mp == null) throw new IllegalStateException("no projection");
                Hub.get(this).mirror.onProjection(mp, opts);
            } catch (Exception e) {
                android.util.Log.w("Chibarti", "projection", e);
                projecting = false;
                Hub.get(this).notice("capture-failed", null);
            }
            foreground();
        } else {
            foreground();
            if (STOP_MIRROR.equals(a)) Hub.get(this).mirror.stop(true);
            else if (DISCONNECT.equals(a)) Hub.get(this).disconnect();
        }
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        me = null;
        try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (Exception ignored) { }
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) { }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
