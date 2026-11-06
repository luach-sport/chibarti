package com.luachsport.chibarti;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Bundle;
import android.view.Surface;
import java.io.IOException;
import java.nio.ByteBuffer;

/**
 * H.264 hardware encoder fed straight from the screen (an input Surface: no copying of pixels in Java).
 * Low-latency settings: no B-frames, real-time priority, a key frame every 2 s, and the last picture is repeated
 * when the screen is still, so a phone that joins late or loses a frame recovers quickly.
 */
final class VideoEncoder {
    interface Out {
        void config(int w, int h, byte[] csd0, byte[] csd1);
        void frame(byte[] data, long ptsUs, boolean key);
    }

    static final String AVC = "video/avc";
    private MediaCodec codec;
    private Surface input;
    private Thread drain;
    private volatile boolean running;
    int width, height;

    /** Can the phone's encoder make this size at this rate? (Old phones often can't do 1080p or 60 fps.) */
    static boolean supports(int w, int h, int fps) {
        MediaCodec c = null;
        try {
            c = MediaCodec.createEncoderByType(AVC);
            MediaCodecInfo.VideoCapabilities v = c.getCodecInfo().getCapabilitiesForType(AVC).getVideoCapabilities();
            return v != null && v.isSizeSupported(w, h) && (fps <= 30 || v.areSizeAndRateSupported(w, h, fps));
        } catch (Exception e) {
            return w * h <= 1280 * 720;
        } finally {
            if (c != null) c.release();
        }
    }

    Surface start(int w, int h, int bitrate, int fps, final Out out) throws IOException {
        width = w;
        height = h;
        MediaFormat f = MediaFormat.createVideoFormat(AVC, w, h);
        f.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        f.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
        f.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
        f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);
        f.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000);
        if (Build.VERSION.SDK_INT >= 23) f.setInteger(MediaFormat.KEY_PRIORITY, 0);
        if (Build.VERSION.SDK_INT >= 29) f.setInteger(MediaFormat.KEY_MAX_B_FRAMES, 0);
        codec = MediaCodec.createEncoderByType(AVC);
        try {
            MediaCodecInfo.EncoderCapabilities ec = codec.getCodecInfo().getCapabilitiesForType(AVC).getEncoderCapabilities();
            if (ec != null && ec.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR)) f.setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR);
        } catch (Exception ignored) { }
        try {
            codec.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        } catch (Exception e) {
            // Some encoders refuse an option: try again with the basics only.
            codec.release();
            codec = MediaCodec.createEncoderByType(AVC);
            MediaFormat b = MediaFormat.createVideoFormat(AVC, w, h);
            b.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            b.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
            b.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
            b.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);
            codec.configure(b, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        }
        input = codec.createInputSurface();
        codec.start();
        running = true;
        drain = new Thread(() -> drainLoop(out), "video-enc");
        drain.start();
        return input;
    }

    private void drainLoop(Out out) {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean sentConfig = false;
        while (running) {
            int idx;
            try { idx = codec.dequeueOutputBuffer(info, 20000); } catch (Exception e) { return; }
            if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                MediaFormat f = codec.getOutputFormat();
                out.config(width, height, bytes(f.getByteBuffer("csd-0")), bytes(f.getByteBuffer("csd-1")));
                sentConfig = true;
            } else if (idx >= 0) {
                ByteBuffer b = codec.getOutputBuffer(idx);
                if (b != null && info.size > 0) {
                    byte[] data = new byte[info.size];
                    b.position(info.offset);
                    b.get(data, 0, info.size);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                        if (!sentConfig) { out.config(width, height, data, null); sentConfig = true; }
                    } else {
                        out.frame(data, info.presentationTimeUs, (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0);
                    }
                }
                try { codec.releaseOutputBuffer(idx, false); } catch (Exception e) { return; }
            }
        }
    }

    private static byte[] bytes(ByteBuffer b) {
        if (b == null) return null;
        b = b.duplicate();
        b.position(0);
        byte[] r = new byte[b.remaining()];
        b.get(r);
        return r;
    }

    void requestKey() {
        try { Bundle p = new Bundle(); p.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0); codec.setParameters(p); } catch (Exception ignored) { }
    }

    void setBitrate(int bps) {
        try { Bundle p = new Bundle(); p.putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, bps); codec.setParameters(p); } catch (Exception ignored) { }
    }

    void stop() {
        running = false;
        if (drain != null) { try { drain.join(500); } catch (InterruptedException ignored) { } }
        try { codec.stop(); } catch (Exception ignored) { }
        try { codec.release(); } catch (Exception ignored) { }
        if (input != null) input.release();
    }
}
