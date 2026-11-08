package com.luachsport.chibarti;

import android.accessibilityservice.GestureDescription;
import android.annotation.TargetApi;
import android.graphics.Path;

/** Taps and swipes through the accessibility service (Android 7+; kept apart so Android 6 never loads it). */
@TargetApi(24)
final class Gestures {
    private Gestures() { }

    static void dispatch(ControlService svc, Path path, long ms) {
        long max = GestureDescription.getMaxGestureDuration();
        GestureDescription.StrokeDescription s = new GestureDescription.StrokeDescription(path, 0, Math.max(1, Math.min(ms, max)));
        svc.dispatchGesture(new GestureDescription.Builder().addStroke(s).build(), null, null);
    }
}
