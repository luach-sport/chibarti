package com.luachsport.chibarti;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;
import java.util.List;

/**
 * The remote-control add-on "חיברתי – שליטה" (control-app/): a separate small app with the accessibility service,
 * because Play Protect blocks installing sideloaded apps that have one. Is it installed, is it on, open its screen,
 * and hand it what the controlling device sent (a broadcast only apps signed with our key can send or receive).
 */
final class ControlLink {
    static final String PKG = "com.luachsport.chibarti.control";
    static final String PERM = "com.luachsport.chibarti.permission.CONTROL";
    static final String ACTION_INPUT = PKG + ".INPUT";
    static final String URL = "https://github.com/luach-sport/chibarti/releases/latest/download/chibarti-control.apk";

    private ControlLink() { }

    static boolean installed(Context c) {
        try { c.getPackageManager().getPackageInfo(PKG, 0); return true; } catch (Exception e) { return false; }
    }

    static boolean enabled(Context c) {
        try {
            AccessibilityManager am = (AccessibilityManager) c.getSystemService(Context.ACCESSIBILITY_SERVICE);
            List<AccessibilityServiceInfo> on = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
            for (AccessibilityServiceInfo i : on) if (i.getId() != null && i.getId().startsWith(PKG + "/")) return true;
        } catch (Exception ignored) { }
        return false;
    }

    /** The add-on's own screen (how to turn it on); without it, the accessibility settings. */
    static void openSetup(Context c) {
        try { c.startActivity(new Intent().setClassName(PKG, PKG + ".SetupActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (Exception ignored) { }
        try { c.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }

    /** Play Protect's settings (to install the add-on when it blocks it), else the Play Store app. */
    static void openPlayProtect(Context c) {
        try { c.startActivity(new Intent("com.google.android.gms.settings.VERIFY_APPS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (Exception ignored) { }
        try { c.startActivity(c.getPackageManager().getLaunchIntentForPackage("com.android.vending").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }

    static void send(Context c, String json) {
        c.sendBroadcast(new Intent(ACTION_INPUT).setPackage(PKG).putExtra("m", json), PERM);
    }
}
