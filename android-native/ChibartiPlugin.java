package com.luachsport.chibarti;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.location.LocationManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The web app's door to everything native (js/core/bridge.js). Events: state, notice, text, link. */
@CapacitorPlugin(name = "Chibarti", permissions = {
    @Permission(alias = "nearby", strings = { "android.permission.NEARBY_WIFI_DEVICES" }),
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }),
    @Permission(alias = "audio", strings = { Manifest.permission.RECORD_AUDIO }),
    @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }),
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
})
public class ChibartiPlugin extends Plugin {
    private static volatile ChibartiPlugin current;
    private Hub hub;
    private final ExecutorService pool = Executors.newFixedThreadPool(2);

    @Override
    public void load() {
        current = this;
        hub = Hub.get(getContext());
        hub.setOut((event, data) -> notifyListeners(event, js(data), !"state".equals(event)));
    }

    @Override
    protected void handleOnDestroy() { if (current == this) current = null; }

    /** Where the app's web files are now: the folder of the last in-app update, or null for the files inside the APK. */
    static String webRoot() {
        ChibartiPlugin p = current;
        try {
            String b = p == null || p.getBridge() == null ? null : p.getBridge().getServerBasePath();
            return b != null && b.startsWith("/") && new java.io.File(b, "pc/index.html").isFile() ? b : null;
        } catch (Exception e) { return null; }
    }

    static void linkArrived() {
        ChibartiPlugin p = current;
        if (p != null) p.notifyListeners("link", new JSObject(), true);
    }

    private static JSObject js(JSONObject o) {
        try { return new JSObject(o.toString()); } catch (Exception e) { return new JSObject(); }
    }

    private static JSObject one(String k, Object v) {
        JSObject o = new JSObject();
        o.put(k, v);
        return o;
    }

    private Context ctx() { return getContext(); }

    // ---------- state ----------
    @PluginMethod public void state(PluginCall call) { call.resolve(js(hub.snapshot())); }
    @PluginMethod public void texts(PluginCall call) { call.resolve(one("items", hub.texts())); }
    @PluginMethod public void clearTexts(PluginCall call) { hub.history.clearTexts(); hub.changed(); call.resolve(); }
    @PluginMethod public void history(PluginCall call) { call.resolve(one("items", hub.history.all())); }
    @PluginMethod public void historyRemove(PluginCall call) { hub.history.remove(call.getString("id", "")); call.resolve(); }
    @PluginMethod public void historyClear(PluginCall call) { hub.history.clear(); call.resolve(); }
    @PluginMethod public void forget(PluginCall call) { hub.ids.forget(call.getString("id", "")); hub.changed(); call.resolve(); }
    @PluginMethod public void setName(PluginCall call) { hub.ids.setName(call.getString("name", "")); hub.changed(); call.resolve(js(hub.snapshot())); }

    @PluginMethod public void pendingLink(PluginCall call) {
        String l = MainActivity.pendingLink;
        MainActivity.pendingLink = null;
        call.resolve(one("url", l == null ? "" : l));
    }

    // ---------- connecting ----------
    @PluginMethod public void host(PluginCall call) { hub.connect.host(); call.resolve(); }
    @PluginMethod public void stopHost(PluginCall call) { hub.connect.stopHost(); call.resolve(); }
    @PluginMethod public void claim(PluginCall call) { hub.connect.claim(call.getString("token", ""), call.getString("name", "")); call.resolve(); }
    @PluginMethod public void pcReady(PluginCall call) { hub.connect.pcReady(call.getBoolean("on", false)); call.resolve(); }
    @PluginMethod public void join(PluginCall call) { String e = hub.connect.joiner.joinQr(call.getString("qr", "")); call.resolve(one("error", e == null ? "" : e)); }
    @PluginMethod public void cancelJoin(PluginCall call) { hub.connect.joiner.cancel(); call.resolve(); }

    /** A remembered phone: look for it and connect without a code once it offers a connection. */
    @PluginMethod public void connectKnown(PluginCall call) {
        String e = hub.connect.joiner.connectKnown(call.getString("id", ""));
        call.resolve(one("error", e == null ? "" : e));
    }

    @PluginMethod public void cancelKnown(PluginCall call) { hub.connect.joiner.cancelKnown(); call.resolve(); }

    /** The connection log (Settings → יומן חיבור). */
    @PluginMethod public void diag(PluginCall call) {
        JSObject r = new JSObject();
        r.put("text", Diag.text());
        r.put("device", Build.MANUFACTURER + " " + Build.MODEL + " · Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        call.resolve(r);
    }

    @PluginMethod public void diagClear(PluginCall call) { Diag.clear(); call.resolve(); }

    /** Plain text to another app (the log to WhatsApp, e-mail…). */
    @PluginMethod public void shareText(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
            ctx().startActivity(Intent.createChooser(i, call.getString("title", "שיתוף")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) { call.reject("cant-share"); }
    }
    @PluginMethod public void scan(PluginCall call) { hub.connect.joiner.scan(); call.resolve(); }
    @PluginMethod public void stopScan(PluginCall call) { hub.connect.joiner.stopScan(); call.resolve(); }
    @PluginMethod public void connectPeer(PluginCall call) {
        String e = hub.connect.joiner.connectPeer(call.getString("key"), call.getString("pin", ""));
        call.resolve(one("error", e == null ? "" : e));
    }
    @PluginMethod public void approve(PluginCall call) {
        hub.connect.approve(call.getString("rid", ""), call.getBoolean("allow", false), call.getBoolean("remember", true));
        call.resolve();
    }
    @PluginMethod public void disconnect(PluginCall call) { hub.disconnect(); call.resolve(); }

    // ---------- text ----------
    @PluginMethod public void sendText(PluginCall call) {
        if (!hub.connected()) { call.reject("not-connected"); return; }
        JSObject r = call.getObject("reply");
        hub.sendText(call.getString("text", ""), r == null ? null : r);
        call.resolve();
    }

    @PluginMethod public void copy(PluginCall call) {
        ClipboardManager cm = (ClipboardManager) ctx().getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("Chibarti", call.getString("text", "")));
        call.resolve();
    }

    /** Reads the clipboard once, only when the user pressed "paste" (never in the background). */
    @PluginMethod public void paste(PluginCall call) {
        ClipboardManager cm = (ClipboardManager) ctx().getSystemService(Context.CLIPBOARD_SERVICE);
        String t = "";
        try {
            ClipData c = cm.getPrimaryClip();
            if (c != null && c.getItemCount() > 0) { CharSequence s = c.getItemAt(0).coerceToText(ctx()); t = s == null ? "" : s.toString(); }
        } catch (Exception ignored) { }
        call.resolve(one("text", t));
    }

    // ---------- files ----------
    @PluginMethod public void pickFiles(PluginCall call) {
        boolean media = call.getBoolean("media", false);
        Intent i;
        if (media && Build.VERSION.SDK_INT >= 33) {
            i = new Intent(MediaStore.ACTION_PICK_IMAGES);
            i.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(100, MediaStore.getPickImagesMaxLimit()));
        } else {
            i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            if (media) i.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/*", "video/*" });
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        startActivityForResult(call, i, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        JSArray files = new JSArray();
        Intent d = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && d != null) {
            List<Uri> uris = new ArrayList<>();
            if (d.getClipData() != null) for (int k = 0; k < d.getClipData().getItemCount(); k++) uris.add(d.getClipData().getItemAt(k).getUri());
            else if (d.getData() != null) uris.add(d.getData());
            for (Uri u : uris) {
                try { ctx().getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
                files.put(describe(u));
            }
        }
        call.resolve(one("files", files));
    }

    private JSONObject describe(Uri u) {
        String name = u.getLastPathSegment();
        long size = -1;
        try (Cursor c = ctx().getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                if (!c.isNull(0)) name = c.getString(0);
                if (!c.isNull(1)) size = c.getLong(1);
            }
        } catch (Exception ignored) { }
        String mime = ctx().getContentResolver().getType(u);
        JSONObject o = new JSONObject();
        try { o.put("uri", u.toString()).put("name", name == null ? "file" : name).put("size", size).put("mime", Saver.mimeOf(name == null ? "" : name, mime)); } catch (Exception ignored) { }
        return o;
    }

    @PluginMethod public void thumb(final PluginCall call) {
        final String uri = call.getString("uri", ""), mime = call.getString("mime", "");
        final int size = Math.max(64, Math.min(1080, call.getInt("size", 240)));
        pool.execute(() -> call.resolve(one("data", Thumbs.make(ctx(), uri, mime, size))));
    }

    @PluginMethod public void sendFiles(PluginCall call) {
        try { call.resolve(one("tid", hub.transfers.send(call.getArray("files", new JSArray())))); }
        catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod public void answerOffer(PluginCall call) { hub.transfers.answer(call.getInt("tid", 0), call.getBoolean("accept", false)); call.resolve(); }
    @PluginMethod public void cancelTransfer(PluginCall call) { hub.transfers.cancel(call.getInt("tid", 0)); call.resolve(); }
    @PluginMethod public void pauseTransfer(PluginCall call) { hub.transfers.pause(call.getInt("tid", 0), call.getBoolean("on", true)); call.resolve(); }
    @PluginMethod public void clearTransfers(PluginCall call) { hub.transfers.clearFinished(); call.resolve(); }

    private Uri viewable(String uriText) {
        Uri u = Uri.parse(uriText);
        if ("file".equals(u.getScheme())) {
            return androidx.core.content.FileProvider.getUriForFile(ctx(), ctx().getPackageName() + ".fileprovider", new File(u.getPath()));
        }
        return u;
    }

    @PluginMethod public void open(PluginCall call) {
        String mime = call.getString("mime", "*/*");
        try {
            if ("application/vnd.android.package-archive".equals(mime)) { openDownloadsApp(); call.resolve(one("apk", true)); return; }
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(viewable(call.getString("uri", "")), mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx().startActivity(Intent.createChooser(i, "פתיחה עם").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) { call.reject("cant-open"); }
    }

    @PluginMethod public void share(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_SEND).setType(call.getString("mime", "*/*")).putExtra(Intent.EXTRA_STREAM, viewable(call.getString("uri", "")))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            ctx().startActivity(Intent.createChooser(i, "שיתוף").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) { call.reject("cant-share"); }
    }

    private void openDownloadsApp() {
        ctx().startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    @PluginMethod public void openDownloads(PluginCall call) {
        try { openDownloadsApp(); call.resolve(); } catch (Exception e) { call.reject("cant-open"); }
    }

    @PluginMethod public void pickFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        startActivityForResult(call, i, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        Intent d = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || d == null || d.getData() == null) { call.resolve(one("uri", "")); return; }
        Uri u = d.getData();
        try { ctx().getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) { }
        hub.ids.setPref("folder", u.toString());
        String name = "";
        try { name = DocumentsContract.getTreeDocumentId(u); } catch (Exception ignored) { }
        hub.ids.setPref("folderName", name);
        hub.ids.setPref("saveMode", "folder");
        JSObject r = new JSObject();
        r.put("uri", u.toString());
        r.put("name", Saver.folderLabel(name));
        call.resolve(r);
    }

    @PluginMethod public void setFolder(PluginCall call) {
        hub.ids.setPref("folder", call.getString("uri", ""));
        if (call.getString("uri", "").isEmpty()) { hub.ids.setPref("folderName", ""); hub.ids.setPref("saveMode", "auto"); }
        call.resolve();
    }

    /** Where received files go: "auto" (by kind), "downloads" (all in Download/Chibarti) or "folder" (the picked one). */
    @PluginMethod public void setSaveMode(PluginCall call) {
        String m = call.getString("mode", "auto");
        if (!"auto".equals(m) && !"downloads".equals(m) && !"folder".equals(m)) m = "auto";
        if ("folder".equals(m) && hub.ids.pref("folder", "").isEmpty()) { call.reject("no-folder"); return; }
        hub.ids.setPref("saveMode", m);
        call.resolve(one("mode", m));
    }

    /** Opens the folder where received files go (the picked folder, or the downloads). */
    @PluginMethod public void openFolder(PluginCall call) {
        String tree = hub.ids.pref("folder", "");
        if ("folder".equals(Saver.mode(hub.ids)) && !tree.isEmpty()) {
            try {
                Uri t = Uri.parse(tree);
                Uri doc = DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
                Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(doc, DocumentsContract.Document.MIME_TYPE_DIR)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                ctx().startActivity(i);
                call.resolve();
                return;
            } catch (Exception ignored) { }
        }
        try { openDownloadsApp(); call.resolve(); } catch (Exception e) { call.reject("cant-open"); }
    }

    // ---------- screen ----------
    @PluginMethod public void mirrorStart(PluginCall call) {
        if (!hub.connected()) { call.reject("not-connected"); return; }
        if (!"none".equals(hub.mirror.role)) { call.reject("busy"); return; }
        MediaProjectionManager mpm = (MediaProjectionManager) ctx().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, mpm.createScreenCaptureIntent(), "consent");
    }

    @ActivityCallback
    private void consent(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.resolve(one("ok", false)); return; }
        JSONObject o = new JSONObject();
        try {
            o.put("quality", call.getString("quality", "standard")).put("fps", call.getInt("fps", 30))
                .put("audio", call.getBoolean("audio", true)).put("auto", call.getBoolean("auto", true));
        } catch (Exception ignored) { }
        LinkService.project(ctx(), result.getResultCode(), result.getData(), o.toString());
        call.resolve(one("ok", true));
    }

    @PluginMethod public void mirrorAnswer(PluginCall call) { hub.mirror.answer(call.getBoolean("accept", false)); call.resolve(); }
    @PluginMethod public void mirrorStop(PluginCall call) { hub.mirror.stop(true); call.resolve(); }
    @PluginMethod public void openViewer(PluginCall call) { hub.mirror.openViewer(); call.resolve(); }
    @PluginMethod public void controlAnswer(PluginCall call) { hub.control.answer(call.getBoolean("allow", false)); call.resolve(); }
    @PluginMethod public void controlStop(PluginCall call) { hub.control.stop(true); call.resolve(); }
    @PluginMethod public void controlSettings(PluginCall call) { hub.control.openSettings(); call.resolve(); }
    @PluginMethod public void controlPlayProtect(PluginCall call) { ControlLink.openPlayProtect(getContext()); call.resolve(); }
    @PluginMethod public void controlAppInfo(PluginCall call) { ControlLink.openAppInfo(getContext()); call.resolve(); }

    // ---------- the phone: permissions, Wi-Fi, location, battery ----------
    private boolean granted(String p) { return ctx().checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }

    @SuppressWarnings("deprecation")
    private JSObject env() {
        JSObject r = new JSObject();
        int sdk = Build.VERSION.SDK_INT;
        r.put("sdk", sdk);
        r.put("release", Build.VERSION.RELEASE);
        r.put("model", Build.MODEL);
        r.put("brand", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(java.util.Locale.ROOT));
        r.put("p2p", hub.connect.p2p.supported());
        r.put("camera", ctx().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY));
        r.put("audioCapture", sdk >= 29);
        boolean wifiOn = false;
        try { wifiOn = ((WifiManager) ctx().getApplicationContext().getSystemService(Context.WIFI_SERVICE)).isWifiEnabled(); } catch (Exception ignored) { }
        r.put("wifiOn", wifiOn);
        boolean locOn = true;
        try {
            if (sdk >= 28) locOn = ((LocationManager) ctx().getSystemService(Context.LOCATION_SERVICE)).isLocationEnabled();
            else locOn = Settings.Secure.getInt(ctx().getContentResolver(), Settings.Secure.LOCATION_MODE) != Settings.Secure.LOCATION_MODE_OFF;
        } catch (Exception ignored) { }
        r.put("locationOn", locOn);
        r.put("locationNeeded", sdk <= 32);
        JSObject p = new JSObject();
        if (sdk >= 33) p.put("nearby", granted("android.permission.NEARBY_WIFI_DEVICES"));
        else p.put("location", granted(Manifest.permission.ACCESS_FINE_LOCATION));
        if (sdk >= 33) p.put("notifications", granted("android.permission.POST_NOTIFICATIONS"));
        if (sdk <= 28) p.put("storage", granted(Manifest.permission.WRITE_EXTERNAL_STORAGE));
        p.put("audio", granted(Manifest.permission.RECORD_AUDIO));
        p.put("camera", granted(Manifest.permission.CAMERA));
        r.put("perms", p);
        boolean battery = true;
        try { battery = ((PowerManager) ctx().getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(ctx().getPackageName()); } catch (Exception ignored) { }
        r.put("batteryFree", battery);
        r.put("folder", hub.ids.pref("folder", ""));
        r.put("folderName", Saver.folderLabel(hub.ids.pref("folderName", "")));
        r.put("saveMode", Saver.mode(hub.ids));
        return r;
    }

    @PluginMethod public void env(PluginCall call) { call.resolve(env()); }

    @PluginMethod public void requestPerms(PluginCall call) {
        JSArray which = call.getArray("which", new JSArray());
        int sdk = Build.VERSION.SDK_INT;
        List<String> aliases = new ArrayList<>();
        for (int k = 0; k < which.length(); k++) {
            String w = which.optString(k);
            if ("network".equals(w)) aliases.add(sdk >= 33 ? "nearby" : "location");
            else if ("notifications".equals(w) && sdk >= 33) aliases.add("notifications");
            else if ("storage".equals(w) && sdk <= 28) aliases.add("storage");
            else if ("audio".equals(w) || "camera".equals(w)) aliases.add(w);
        }
        if (aliases.isEmpty()) { call.resolve(env()); return; }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permsDone");
    }

    @PermissionCallback
    private void permsDone(PluginCall call) { call.resolve(env()); }

    @SuppressWarnings("deprecation")
    @PluginMethod public void openSettings(PluginCall call) {
        String what = call.getString("what", "app");
        Intent i;
        switch (what) {
            case "wifi": i = new Intent(Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_WIFI : Settings.ACTION_WIFI_SETTINGS); break;
            case "location": i = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS); break;
            case "battery": i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS); break;
            case "notifications":
                if (Build.VERSION.SDK_INT >= 26) { i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName()); break; }
                // fall through
            default: i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx().getPackageName()));
        }
        try { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx().startActivity(i); call.resolve(); }
        catch (Exception e) { call.reject("cant-open"); }
    }

    /** Old Android can switch Wi-Fi on by itself; Android 10+ shows its own Wi-Fi panel instead. */
    @SuppressWarnings("deprecation")
    @PluginMethod public void enableWifi(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) {
            try { ((WifiManager) ctx().getApplicationContext().getSystemService(Context.WIFI_SERVICE)).setWifiEnabled(true); } catch (Exception ignored) { }
            call.resolve(one("panel", false));
            return;
        }
        try { ctx().startActivity(new Intent(Settings.Panel.ACTION_WIFI).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
        call.resolve(one("panel", true));
    }

    @PluginMethod public void devices(PluginCall call) { call.resolve(one("items", hub.ids.list())); }

    static JSONArray arr(JSONArray a) { return a == null ? new JSONArray() : a; }
}
