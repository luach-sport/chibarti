package com.luachsport.chibarti;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;

/**
 * The connection log ("יומן חיבור" in Settings): every step of offering, finding and joining, in plain lines, so a
 * failure on real phones can be seen instead of guessed. Never codes, passwords, keys or seals: only what happened.
 * Kept in memory and in a small file (the last few hundred lines survive a restart). Plain Java (tested on a PC).
 */
final class Diag {
    static final int MAX = 400;
    private static final ArrayDeque<String> lines = new ArrayDeque<>();
    private static File file;
    private static int sinceTrim = 0;
    private static final SimpleDateFormat TIME = new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US);

    private Diag() { }

    /** Where the log is kept between runs (set once by the app). */
    static synchronized void attach(File f) {
        if (file != null) return;
        file = f;
        lines.clear();
        if (f.isFile()) {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), Proto.UTF8))) {
                String s;
                while ((s = r.readLine()) != null) { lines.add(s); if (lines.size() > MAX) lines.poll(); }
            } catch (Exception ignored) { }
        }
    }

    static void log(String tag, String msg) {
        String line;
        synchronized (TIME) { line = TIME.format(new Date()) + " " + tag + ": " + clean(msg); }
        synchronized (Diag.class) {
            lines.add(line);
            if (lines.size() > MAX) lines.poll();
            write(line);
        }
    }

    private static String clean(String s) {
        if (s == null) return "";
        s = s.replace('\n', ' ').replace('\r', ' ');
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }

    private static void write(String line) {
        if (file == null) return;
        try {
            boolean trim = ++sinceTrim > MAX;
            try (Writer w = new OutputStreamWriter(new FileOutputStream(file, !trim), Proto.UTF8)) {
                if (trim) { sinceTrim = 0; for (String l : lines) w.write(l + "\n"); }
                else w.write(line + "\n");
            }
        } catch (Exception ignored) { }
    }

    static synchronized String text() {
        StringBuilder sb = new StringBuilder();
        for (String l : lines) sb.append(l).append('\n');
        return sb.toString();
    }

    static synchronized void clear() {
        lines.clear();
        sinceTrim = 0;
        if (file != null) { try { new FileOutputStream(file, false).close(); } catch (Exception ignored) { } }
    }

    /** A short reason for an exception, for the log. */
    static String why(Throwable e) {
        if (e == null) return "";
        String m = e.getMessage();
        return e.getClass().getSimpleName() + (m == null ? "" : " " + m);
    }
}
