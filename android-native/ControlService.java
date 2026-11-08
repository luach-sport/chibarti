package com.luachsport.chibarti;

import android.accessibilityservice.AccessibilityService;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;

/**
 * The only way Android lets an app touch the screen: an accessibility service the owner turns on once in Settings.
 * It does nothing at all on its own; it acts only while the owner allowed the connected device to control this phone
 * (Control.role == "controlled"), and only with what that device sends (Control.onInput).
 */
public class ControlService extends AccessibilityService {
    static volatile ControlService live;

    @Override protected void onServiceConnected() {
        live = this;
        try { Hub.get(this).control.onServiceReady(); } catch (Exception ignored) { }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent e) { }

    @Override public void onInterrupt() { }

    @Override public boolean onUnbind(android.content.Intent i) { if (live == this) live = null; return super.onUnbind(i); }

    @Override public void onDestroy() { if (live == this) live = null; super.onDestroy(); }

    /** Taps and swipes need Android 7 (API 24). */
    static boolean canTouch() { return Build.VERSION.SDK_INT >= 24; }
}
