package com.luachsport.chibarti.control;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** The add-on's only screen: turn it on once in the accessibility settings, then back to חיברתי. */
public class SetupActivity extends Activity {
    private TextView status, main;

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setLineSpacing(0, 1.25f);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        return t;
    }

    private TextView button(String s, boolean primary, View.OnClickListener l) {
        TextView b = text(s, 16, primary ? Color.WHITE : 0xFF066B6F, true);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(16));
        g.setColor(primary ? 0xFF0A8F94 : 0xFFDAF2F1);
        b.setBackground(g);
        b.setOnClickListener(l);
        return b;
    }

    private void add(LinearLayout box, View v, int top) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.topMargin = dp(top);
        box.addView(v, p);
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(0xFFF1F6F6);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        box.setPadding(dp(22), dp(28), dp(22), dp(28));
        box.setBackgroundColor(0xFFF1F6F6);
        add(box, text("חיברתי – שליטה", 24, 0xFF0F1A1B, true), 0);
        add(box, text("התוסף הזה מאפשר לטלפון או למחשב שמחובר בחיברתי ללחוץ ולכתוב בטלפון הזה, רק כשמשתפים את המסך ומאשרים. בלי אישור באותו רגע הוא לא עושה כלום, לא קורא את המסך ולא שולח ממנו שום דבר.", 15, 0xFF263435, false), 10);
        status = text("", 15, 0xFF066B6F, true);
        add(box, status, 18);
        add(box, text("פעם אחת: בהגדרות הנגישות בוחרים \"חיברתי – שליטה\" (לפעמים בתוך \"אפליקציות שהורדו\" או \"שירותים מותקנים\"), מפעילים ומאשרים.", 15, 0xFF263435, false), 14);
        main = button("פתיחת הגדרות הנגישות", true, v -> open(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        add(box, main, 16);
        if (Build.VERSION.SDK_INT >= 33) {
            add(box, text("האפשרות אפורה ולא נלחצת? אנדרואיד חוסם אותה לאפליקציות שלא מהחנות. בפרטי התוסף לוחצים על ⋮ למעלה ← \"לאפשר הגדרות מוגבלות\", ואז שוב להגדרות הנגישות.", 14, 0xFF536869, false), 22);
            add(box, button("פרטי התוסף", false, v -> open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())))), 10);
        }
        add(box, button("חזרה לחיברתי", false, v -> {
            Intent i = getPackageManager().getLaunchIntentForPackage("com.luachsport.chibarti");
            if (i != null) open(i);
            finish();
        }), 22);
        ScrollView sv = new ScrollView(this);
        sv.addView(box);
        setContentView(sv);
    }

    private void open(Intent i) {
        try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }

    @Override protected void onResume() {
        super.onResume();
        boolean on = ControlService.live != null;
        status.setText(on ? "✓ התוסף פעיל. אפשר לחזור לחיברתי." : "התוסף עוד לא פעיל.");
        status.setTextColor(on ? 0xFF1D7A45 : 0xFF8A5A00);
        main.setVisibility(on ? View.GONE : View.VISIBLE);
    }
}
