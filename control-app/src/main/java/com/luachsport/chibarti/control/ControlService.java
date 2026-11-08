package com.luachsport.chibarti.control;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;
import org.json.JSONObject;

/**
 * "חיברתי – שליטה": the only way Android lets an app touch the screen is an accessibility service the owner turns on
 * once in Settings. This add-on does nothing on its own: it only carries out what חיברתי sends it (taps, swipes, keys,
 * text) — and חיברתי sends only while the owner allowed the connected device to control this phone. Only apps signed
 * with the same key as this one may send (the signature permission on both sides).
 */
public class ControlService extends AccessibilityService {
    static final String PERM = "com.luachsport.chibarti.permission.CONTROL";
    static final String ACTION_INPUT = "com.luachsport.chibarti.control.INPUT";
    static volatile ControlService live;

    private final BroadcastReceiver input = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String m = i.getStringExtra("m");
            if (m == null) return;
            try { Input.apply(ControlService.this, new JSONObject(m)); } catch (Exception ignored) { }
        }
    };

    @Override protected void onServiceConnected() {
        live = this;
        IntentFilter f = new IntentFilter(ACTION_INPUT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(input, f, PERM, null, Context.RECEIVER_EXPORTED);
        else registerReceiver(input, f, PERM, null);
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent e) { }

    @Override public void onInterrupt() { }

    @Override public boolean onUnbind(Intent i) { stop(); return super.onUnbind(i); }

    @Override public void onDestroy() { stop(); super.onDestroy(); }

    private void stop() {
        if (live != this) return;
        live = null;
        try { unregisterReceiver(input); } catch (Exception ignored) { }
    }
}
