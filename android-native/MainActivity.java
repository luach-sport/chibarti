package com.luachsport.chibarti;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** The app's main screen (the web app inside). Also opens chibarti://join links from any QR scanner. */
public class MainActivity extends BridgeActivity {
    static volatile boolean visible = false;
    static volatile String pendingLink = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ChibartiPlugin.class);
        super.onCreate(savedInstanceState);
        take(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        take(intent);
    }

    private void take(Intent i) {
        if (i == null || !Intent.ACTION_VIEW.equals(i.getAction())) return;
        Uri d = i.getData();
        if (d != null && "chibarti".equals(d.getScheme())) {
            pendingLink = d.toString();
            ChibartiPlugin.linkArrived();
        }
    }

    @Override
    public void onStart() { super.onStart(); visible = true; }

    @Override
    public void onStop() { super.onStop(); visible = false; }
}
