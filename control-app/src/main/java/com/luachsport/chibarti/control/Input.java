package com.luachsport.chibarti.control;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.graphics.Path;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the controlling device sends, done on this phone through the accessibility service. Places are fractions of
 * the screen (0..1), so they fit whatever size the picture had on the other side.
 *   {t:"g", p:[[x,y,ms],...]}  a touch: one point = tap (long = long press), more = a swipe or drag, with its timing
 *   {t:"w", x, y, dy}          scroll (dy: fraction of the screen height, + = down)
 *   {t:"k", k:"back"|"home"|"recents"|"notifications"|"quick"|"power"|"lock"|"backspace"|"enter"}
 *   {t:"s", s:"text"}          types into the field that has the focus
 */
final class Input {
    private Input() { }

    static void apply(ControlService svc, JSONObject o) {
        try {
            switch (o.optString("t")) {
                case "g": gesture(svc, o.optJSONArray("p")); break;
                case "w": scroll(svc, o.optDouble("x", .5), o.optDouble("y", .5), o.optDouble("dy", 0)); break;
                case "k": key(svc, o.optString("k")); break;
                case "s": type(svc, o.optString("s")); break;
                default: break;
            }
        } catch (Exception e) { android.util.Log.w("ChibartiControl", "input", e); }
    }

    @SuppressWarnings("deprecation")
    private static int[] size(Context c) {
        DisplayMetrics m = new DisplayMetrics();
        ((WindowManager) c.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(m);
        return new int[] { m.widthPixels, m.heightPixels };
    }

    private static float clamp(double v, int max) { return (float) Math.max(0, Math.min(max - 1, v * max)); }

    private static void gesture(ControlService svc, JSONArray p) throws Exception {
        if (p == null || p.length() == 0 || Build.VERSION.SDK_INT < 24) return;
        int[] wh = size(svc);
        Path path = new Path();
        long dur = 1;
        for (int i = 0; i < p.length() && i < 400; i++) {
            JSONArray q = p.getJSONArray(i);
            float x = clamp(q.getDouble(0), wh[0]), y = clamp(q.getDouble(1), wh[1]);
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
            dur = Math.max(dur, q.optLong(2, 0));
        }
        // a tap of ~0 ms is too short for some apps; a drag keeps its real speed (a fast one flings)
        dur = Math.max(p.length() == 1 ? 60 : 30, Math.min(dur, 4000));
        Gestures.dispatch(svc, path, dur);
    }

    private static void scroll(ControlService svc, double x, double y, double dy) {
        if (Build.VERSION.SDK_INT < 24 || dy == 0) return;
        int[] wh = size(svc);
        dy = Math.max(-0.6, Math.min(0.6, dy));
        double y0 = Math.max(0.15, Math.min(0.85, y));
        double y1 = Math.max(0.02, Math.min(0.98, y0 - dy));
        Path path = new Path();
        path.moveTo(clamp(x, wh[0]), clamp(y0, wh[1]));
        path.lineTo(clamp(x, wh[0]), clamp(y1, wh[1]));
        Gestures.dispatch(svc, path, 260);
    }

    private static void key(ControlService svc, String k) {
        switch (k) {
            case "back": svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK); break;
            case "home": svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME); break;
            case "recents": svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS); break;
            case "notifications": svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS); break;
            case "quick": svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS); break;
            case "power": svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_POWER_DIALOG); break;
            case "lock": if (Build.VERSION.SDK_INT >= 28) svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN); break;
            case "backspace": edit(svc, "", true); break;
            case "enter": enter(svc); break;
            default: break;
        }
    }

    private static void type(ControlService svc, String s) { if (s != null && !s.isEmpty()) edit(svc, s.length() > 5000 ? s.substring(0, 5000) : s, false); }

    /** Puts text where the cursor is in the focused field (or deletes the character before it). */
    private static void edit(ControlService svc, String add, boolean back) {
        AccessibilityNodeInfo n = svc.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (n == null || !n.isEditable()) return;
        CharSequence cs = n.getText();
        boolean hint = Build.VERSION.SDK_INT >= 26 && n.isShowingHintText();
        String cur = cs == null || hint ? "" : cs.toString();
        int a = n.getTextSelectionStart(), b = n.getTextSelectionEnd();
        if (a < 0 || b < 0 || a > cur.length() || b > cur.length()) { a = b = cur.length(); }
        if (a > b) { int t = a; a = b; b = t; }
        if (back && a == b) { if (a == 0) return; a = a - Character.charCount(cur.codePointBefore(a)); }
        String next = cur.substring(0, a) + add + cur.substring(b);
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, next);
        n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        int at = a + add.length();
        Bundle sel = new Bundle();
        sel.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, at);
        sel.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, at);
        n.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, sel);
    }

    private static void enter(ControlService svc) {
        AccessibilityNodeInfo n = svc.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (n == null) return;
        // Android 11+: the keyboard's own "enter" (search, send, next); before that, a new line in a multi-line field
        if (Build.VERSION.SDK_INT >= 30 && n.performAction(android.R.id.accessibilityActionImeEnter)) return;
        if (n.isMultiLine()) edit(svc, "\n", false);
    }
}
