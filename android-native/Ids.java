package com.luachsport.chibarti;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Iterator;

/**
 * Who this phone is (a random id made once, and a name the user can change) and the phones it was paired with.
 * A paired phone has its own random key, so next time it connects without a code. "Forget" deletes the key.
 */
final class Ids {
    private static final String PREFS = "chibarti";
    private final SharedPreferences p;

    Ids(Context c) { p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    synchronized String myId() {
        String id = p.getString("id", null);
        if (id == null || !id.matches("[0-9a-f]{32}")) {
            id = Crypto.hex(Crypto.random(16));
            p.edit().putString("id", id).apply();
        }
        return id;
    }

    String myName() {
        String n = p.getString("name", "");
        if (n != null && !n.trim().isEmpty()) return n;
        String m = Build.MODEL == null ? "Android" : Build.MODEL;
        String brand = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        if (!brand.isEmpty() && !m.toLowerCase().startsWith(brand.toLowerCase())) m = cap(brand) + " " + m;
        return m;
    }

    void setName(String name) { p.edit().putString("name", QrPayload.clean(name, 40)).apply(); }

    String customName() { return p.getString("name", ""); }

    private static String cap(String s) { return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1); }

    private JSONObject trusted() {
        try { return new JSONObject(p.getString("trusted", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    synchronized byte[] trustedKey(String id) {
        JSONObject t = trusted().optJSONObject(id);
        if (t == null) return null;
        try { return Crypto.unb64(t.optString("key")); } catch (Exception e) { return null; }
    }

    synchronized void saveTrusted(String id, String name, String model, byte[] key, String via) {
        JSONObject all = trusted();
        try {
            JSONObject t = all.optJSONObject(id);
            if (t == null) { t = new JSONObject(); t.put("since", System.currentTimeMillis()); }
            if (key != null) t.put("key", Crypto.b64(key));
            t.put("name", QrPayload.clean(name, 40));
            t.put("model", QrPayload.clean(model, 60));
            t.put("last", System.currentTimeMillis());
            t.put("via", via);
            all.put(id, t);
            p.edit().putString("trusted", all.toString()).apply();
        } catch (Exception ignored) { }
    }

    synchronized void touch(String id, String via) {
        JSONObject all = trusted();
        JSONObject t = all.optJSONObject(id);
        if (t == null) return;
        try {
            t.put("last", System.currentTimeMillis());
            if (via != null) t.put("via", via);
            p.edit().putString("trusted", all.toString()).apply();
        } catch (Exception ignored) { }
    }

    synchronized void forget(String id) {
        JSONObject all = trusted();
        all.remove(id);
        p.edit().putString("trusted", all.toString()).apply();
    }

    /** The paired phones for the screen (without their keys). */
    synchronized JSONArray list() {
        JSONArray out = new JSONArray();
        JSONObject all = trusted();
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            String id = it.next();
            JSONObject t = all.optJSONObject(id);
            if (t == null) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("id", id);
                o.put("name", t.optString("name"));
                o.put("model", t.optString("model"));
                o.put("last", t.optLong("last"));
                o.put("since", t.optLong("since"));
                o.put("via", t.optString("via"));
                out.put(o);
            } catch (Exception ignored) { }
        }
        return out;
    }

    String pref(String k, String def) { return p.getString(k, def); }
    void setPref(String k, String v) { p.edit().putString(k, v).apply(); }
}
