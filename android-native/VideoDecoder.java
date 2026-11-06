package com.luachsport.chibarti;

import android.media.MediaCodec;
import android.media.MediaFormat;
import android.os.Build;
import android.view.Surface;
import java.nio.ByteBuffer;

/**
 * Hardware H.264 decoder straight onto the viewer's surface. Frames are shown the moment they're decoded (no
 * waiting buffer). Frames that arrive too late are skipped, and the next key frame is asked for, so the picture
 * stays live; until a key frame arrives nothing is fed (no grey smears).
 */
final class VideoDecoder {
    private MediaCodec codec;
    private Thread out;
    private volatile boolean running;
    private volatile boolean needKey = true;
    volatile int framesShown = 0;
    private long baseUs = Long.MAX_VALUE, baseAt = 0;
    volatile int lagMs = 0;

    boolean start(Surface s, Proto.Config c) {
        try {
            MediaFormat f = MediaFormat.createVideoFormat(VideoEncoder.AVC, c.a, c.b);
            if (c.csd0.length > 0) f.setByteBuffer("csd-0", ByteBuffer.wrap(c.csd0));
            if (c.csd1.length > 0) f.setByteBuffer("csd-1", ByteBuffer.wrap(c.csd1));
            if (Build.VERSION.SDK_INT >= 23) f.setInteger(MediaFormat.KEY_PRIORITY, 0);
            if (Build.VERSION.SDK_INT >= 30) f.setInteger(MediaFormat.KEY_LOW_LATENCY, 1);
            codec = MediaCodec.createDecoderByType(VideoEncoder.AVC);
            try { codec.configure(f, s, null, 0); }
            catch (Exception e) {
                codec.release();
                codec = MediaCodec.createDecoderByType(VideoEncoder.AVC);
                MediaFormat b = MediaFormat.createVideoFormat(VideoEncoder.AVC, c.a, c.b);
                if (c.csd0.length > 0) b.setByteBuffer("csd-0", ByteBuffer.wrap(c.csd0));
                if (c.csd1.length > 0) b.setByteBuffer("csd-1", ByteBuffer.wrap(c.csd1));
                codec.configure(b, s, null, 0);
            }
            codec.start();
        } catch (Exception e) {
            release();
            return false;
        }
        running = true;
        needKey = true;
        out = new Thread(this::render, "video-dec");
        out.start();
        return true;
    }

    /** Feeds one frame. Returns false when a key frame is needed (the caller asks the sender for one). */
    boolean feed(byte[] body) {
        if (!running || body.length < 10) return true;
        boolean key = (body[0] & 1) != 0;
        long pts = ByteBuffer.wrap(body, 1, 8).getLong();
        long nowUs = System.nanoTime() / 1000;
        long diff = nowUs - pts;
        long now = System.currentTimeMillis();
        if (diff < baseUs || now - baseAt > 15000) { baseUs = diff; baseAt = now; }
        lagMs = (int) Math.max(0, (diff - baseUs) / 1000);
        if (needKey && !key) return false;
        if (!key && lagMs > 600) { needKey = true; return false; }
        try {
            int idx = codec.dequeueInputBuffer(8000);
            if (idx < 0) { needKey = true; return false; }
            ByteBuffer b = codec.getInputBuffer(idx);
            b.clear();
            b.put(body, 9, body.length - 9);
            codec.queueInputBuffer(idx, 0, body.length - 9, pts, key ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0);
            if (key) needKey = false;
            return true;
        } catch (Exception e) {
            needKey = true;
            return false;
        }
    }

    private void render() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (running) {
            try {
                int idx = codec.dequeueOutputBuffer(info, 10000);
                if (idx >= 0) { codec.releaseOutputBuffer(idx, true); framesShown++; }
            } catch (Exception e) {
                if (!running) return;
            }
        }
    }

    void release() {
        running = false;
        if (out != null) { try { out.join(300); } catch (InterruptedException ignored) { } out = null; }
        if (codec != null) {
            try { codec.stop(); } catch (Exception ignored) { }
            try { codec.release(); } catch (Exception ignored) { }
            codec = null;
        }
    }
}
