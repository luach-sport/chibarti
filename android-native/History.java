package com.luachsport.chibarti;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

/** The transfer history and the last text messages, kept in small files inside the app (never shared). */
final class History {
    private static final int MAX = 300, MAX_TEXTS = 100;
    private final File file, texts;
    private JSONArray items, msgs;

    History(Context c) {
        file = new File(c.getFilesDir(), "history.json");
        texts = new File(c.getFilesDir(), "texts.json");
        items = load(file);
        msgs = load(texts);
    }

    private static JSONArray load(File f) {
        try {
            if (!f.exists()) return new JSONArray();
            InputStream in = new FileInputStream(f);
            byte[] b = new byte[(int) Math.min(f.length(), 4 * 1024 * 1024)];
            int pos = 0, n;
            while (pos < b.length && (n = in.read(b, pos, b.length - pos)) > 0) pos += n;
            in.close();
            return new JSONArray(new String(b, 0, pos, Proto.UTF8));
        } catch (Exception e) { return new JSONArray(); }
    }

    private static void save(File f, JSONArray a) {
        try {
            File tmp = new File(f.getPath() + ".tmp");
            FileOutputStream out = new FileOutputStream(tmp);
            out.write(a.toString().getBytes(Proto.UTF8));
            out.getFD().sync();
            out.close();
            if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
        } catch (Exception ignored) { }
    }

    private static JSONArray trimmed(JSONArray a, int max) {
        if (a.length() <= max) return a;
        JSONArray b = new JSONArray();
        for (int i = a.length() - max; i < a.length(); i++) b.put(a.opt(i));
        return b;
    }

    synchronized void add(JSONObject entry) {
        items.put(entry);
        items = trimmed(items, MAX);
        save(file, items);
    }

    synchronized JSONArray all() { return items; }

    synchronized void remove(String id) {
        JSONArray b = new JSONArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o != null && !id.equals(o.optString("id"))) b.put(o);
        }
        items = b;
        save(file, items);
    }

    synchronized void clear() { items = new JSONArray(); save(file, items); }

    synchronized void addText(JSONObject m) {
        msgs.put(m);
        msgs = trimmed(msgs, MAX_TEXTS);
        save(texts, msgs);
    }

    synchronized JSONArray texts() { return msgs; }

    synchronized void clearTexts() { msgs = new JSONArray(); save(texts, msgs); }
}
