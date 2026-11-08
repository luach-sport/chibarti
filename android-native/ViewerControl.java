package com.luachsport.chibarti;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Controlling the screen being watched, inside the full-screen viewer: the "שליטה" button asks the other side;
 * once allowed, a touch on the picture becomes the same touch there (taps, long presses, swipes, drags), and a bar
 * at the bottom has back / home / recent apps (or Esc / Win for a computer) and a keyboard that types there.
 */
final class ViewerControl {
    private final Activity a;
    private final SurfaceView sv;
    private final LinearLayout nav, typing;
    private final EditText field;
    private final TextView button;
    private String role = "none", typed = "";
    private JSONArray stroke;
    private long t0, lastAdd;
    private boolean pc;

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, a.getResources().getDisplayMetrics()); }

    ViewerControl(Activity a, FrameLayout root, SurfaceView sv, TextView button, Runnable showBar) {
        this.a = a;
        this.sv = sv;
        this.button = button;
        Session s = Hub.get(a).session;
        pc = s != null && "pc".equals(s.kind);

        LinearLayout bottom = new LinearLayout(a);
        bottom.setOrientation(LinearLayout.VERTICAL);
        typing = new LinearLayout(a);
        typing.setPadding(dp(12), dp(8), dp(12), dp(4));
        field = new EditText(a);
        field.setHint("מה שכותבים כאן נכתב " + (pc ? "במחשב" : "בטלפון השני"));
        field.setHintTextColor(0x99FFFFFF);
        field.setTextColor(Color.WHITE);
        field.setSingleLine(true);
        field.setImeOptions(EditorInfo.IME_ACTION_SEND | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        field.setBackground(round(0x33FFFFFF, 12));
        field.setPadding(dp(14), dp(10), dp(14), dp(10));
        typing.addView(field, new LinearLayout.LayoutParams(-1, -2));
        typing.setVisibility(View.GONE);
        bottom.addView(typing, new LinearLayout.LayoutParams(-1, -2));

        nav = new LinearLayout(a);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(8), dp(6), dp(8), dp(10));
        nav.setBackgroundColor(0x99000000);
        if (pc) {
            nav.addView(key("Esc", "Escape", "esc"));
            nav.addView(key("⊞", "מקש Windows", "win"));
            nav.addView(key("↵", "Enter", "enter"));
            nav.addView(key("⌫", "מחיקה", "backspace"));
        } else {
            nav.addView(key("◁", "חזרה", "back"));
            nav.addView(key("○", "מסך הבית", "home"));
            nav.addView(key("▢", "אפליקציות אחרונות", "recents"));
            nav.addView(key("⌄", "התראות", "notifications"));
        }
        TextView kb = key("⌨", "הקלדה", null);
        kb.setOnClickListener(v -> toggleTyping());
        nav.addView(kb);
        // taps on the picture go to the other screen, so the viewer's own bar (stop, rotate, close) opens from here
        TextView more = key("⋮", "עוד", null);
        more.setOnClickListener(v -> showBar.run());
        nav.addView(more);
        bottom.addView(nav, new LinearLayout.LayoutParams(-1, -2));
        bottom.setVisibility(View.GONE);
        root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        this.bottomBar = bottom;

        // typing: what's added is sent as text, what's deleted as backspaces; "send" on the keyboard = Enter
        field.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int st, int c, int af) { }
            @Override public void onTextChanged(CharSequence s, int st, int b, int c) { }
            @Override public void afterTextChanged(Editable e) {
                String now = e.toString();
                int same = 0;
                while (same < now.length() && same < typed.length() && now.charAt(same) == typed.charAt(same)) same++;
                for (int i = typed.length(); i > same; i--) send(json("t", "k", "k", "backspace"));
                if (now.length() > same) send(json("t", "s", "s", now.substring(same)));
                typed = now;
            }
        });
        field.setOnEditorActionListener((v, id, ev) -> { send(json("t", "k", "k", "enter")); typed = ""; field.setText(""); return true; });

        sv.setOnTouchListener((v, e) -> touch(e));
    }

    private View bottomBar;

    private GradientDrawable round(int color, int r) { GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(r)); g.setColor(color); return g; }

    private TextView key(String glyph, String label, final String k) {
        TextView t = new TextView(a);
        t.setText(glyph);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, glyph.length() > 1 ? 15 : 22);
        t.setGravity(Gravity.CENTER);
        t.setContentDescription(label);
        t.setBackground(round(0x26FFFFFF, 14));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(48), 1);
        p.setMargins(dp(4), 0, dp(4), 0);
        t.setLayoutParams(p);
        if (k != null) t.setOnClickListener(v -> send(json("t", "k", "k", k)));
        return t;
    }

    private static JSONObject json(Object... kv) {
        JSONObject o = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception ignored) { }
        return o;
    }

    private void send(JSONObject o) { Hub.get(a).control.input(o); }

    private void toggleTyping() {
        boolean show = typing.getVisibility() != View.VISIBLE;
        typing.setVisibility(show ? View.VISIBLE : View.GONE);
        InputMethodManager im = (InputMethodManager) a.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (show) { field.requestFocus(); im.showSoftInput(field, InputMethodManager.SHOW_IMPLICIT); }
        else { im.hideSoftInputFromWindow(field.getWindowToken(), 0); typed = ""; field.setText(""); }
    }

    /** One finger on the picture = the same finger on the other screen (sent when it lifts, with its timing). */
    private boolean touch(MotionEvent e) {
        if (!"controlling".equals(role)) return false;
        float w = Math.max(1, sv.getWidth()), h = Math.max(1, sv.getHeight());
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                t0 = e.getEventTime();
                stroke = new JSONArray();
                add(e.getX() / w, e.getY() / h, 0);
                break;
            case MotionEvent.ACTION_MOVE:
                if (stroke == null) break;
                for (int i = 0; i < e.getHistorySize(); i++) add(e.getHistoricalX(i) / w, e.getHistoricalY(i) / h, e.getHistoricalEventTime(i) - t0);
                add(e.getX() / w, e.getY() / h, e.getEventTime() - t0);
                break;
            case MotionEvent.ACTION_UP:
                if (stroke == null) break;
                addLast(e.getX() / w, e.getY() / h, e.getEventTime() - t0);
                send(json("t", "g", "p", stroke));
                stroke = null;
                break;
            case MotionEvent.ACTION_CANCEL: case MotionEvent.ACTION_POINTER_DOWN:
                stroke = null; // two fingers: not passed on
                break;
            default: break;
        }
        return true;
    }

    private void add(float x, float y, long t) {
        if (stroke.length() > 0 && t - lastAdd < 12) return;
        lastAdd = t;
        addLast(x, y, t);
    }

    private void addLast(float x, float y, long t) {
        if (stroke.length() >= 400) return;
        try { stroke.put(new JSONArray().put(r(x)).put(r(y)).put(t)); } catch (Exception ignored) { }
    }

    private static double r(float v) { return Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000.0; }

    /** The "שליטה" button: ask, or stop. */
    void toggle() {
        Hub hub = Hub.get(a);
        if ("controlling".equals(role) || "asking".equals(role)) hub.control.stop(true);
        else { hub.control.ask(); toast("מבקש אישור לשליטה…"); }
    }

    void onControl(String r, String err) {
        role = r;
        boolean on = "controlling".equals(r);
        bottomBar.setVisibility(on ? View.VISIBLE : View.GONE);
        if (!on && typing.getVisibility() == View.VISIBLE) toggleTyping();
        button.setText(on ? "✋" : "☝");
        button.setAlpha("asking".equals(r) ? 0.6f : 1f);
        button.setBackground(round(on ? 0xFF0A8F94 : 0x33FFFFFF, 14));
        if (on) toast("אפשר לשלוט. נגיעה בתמונה = נגיעה " + (pc ? "במחשב" : "בטלפון השני"));
        else if (err != null && !err.isEmpty() && "none".equals(r)) toast(why(err));
    }

    private String why(String e) {
        switch (e) {
            case "declined": return "לא אישרו שליטה";
            case "old": return "בטלפון השני אין אפשרות שליטה (צריך אנדרואיד 7 ומעלה)";
            case "timeout": return "לא אישרו בזמן";
            case "browser": return "שליטה במחשב עובדת רק מתוכנת חיברתי למחשב, לא מהדפדפן";
            case "not-screen": return "כדי לשלוט, במחשב צריך לשתף את כל המסך";
            case "not-sharing": return "השיתוף כבר הסתיים";
            default: return "השליטה לא אושרה";
        }
    }

    private void toast(String t) { Toast.makeText(a, t, Toast.LENGTH_SHORT).show(); }
}
