package com.luachsport.chibarti;

import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaCodec;
import android.media.MediaFormat;
import java.nio.ByteBuffer;

/**
 * Plays the other phone's sound. A small buffer only (about a tenth of a second); pieces that arrive more than
 * 0.3 s late compared to the video's clock are skipped, so sound and picture stay together instead of drifting.
 */
final class AudioPlayer {
    private MediaCodec dec;
    private AudioTrack track;
    private Thread out;
    private volatile boolean running;
    private long baseUs = Long.MAX_VALUE, baseAt = 0;

    @SuppressWarnings("deprecation")
    boolean start(Proto.Config c) {
        try {
            int rate = c.a, ch = Math.max(1, Math.min(2, c.b));
            boolean opus = "audio/opus".equals(c.mime);
            if (opus) rate = 48000; // Opus always decodes at 48 kHz
            MediaFormat f = MediaFormat.createAudioFormat(c.mime, rate, ch);
            f.setByteBuffer("csd-0", ByteBuffer.wrap(c.csd0));
            if (opus) {
                // Android's Opus decoder also wants the pre-skip and the seek pre-roll, in nanoseconds (little-endian)
                int preSkip = c.csd0.length >= 12 ? (c.csd0[10] & 255) | (c.csd0[11] & 255) << 8 : 312;
                f.setByteBuffer("csd-1", le64(preSkip * 1_000_000_000L / 48000));
                f.setByteBuffer("csd-2", le64(80_000_000L));
            }
            dec = MediaCodec.createDecoderByType(c.mime);
            dec.configure(f, null, null, 0);
            dec.start();
            int mask = ch == 1 ? AudioFormat.CHANNEL_OUT_MONO : AudioFormat.CHANNEL_OUT_STEREO;
            int min = AudioTrack.getMinBufferSize(rate, mask, AudioFormat.ENCODING_PCM_16BIT);
            track = new AudioTrack(AudioManager.STREAM_MUSIC, rate, mask, AudioFormat.ENCODING_PCM_16BIT, Math.max(min * 2, 8192), AudioTrack.MODE_STREAM);
            track.play();
        } catch (Exception e) {
            release();
            return false;
        }
        running = true;
        out = new Thread(this::play, "audio-dec");
        out.start();
        return true;
    }

    private static ByteBuffer le64(long v) {
        ByteBuffer b = ByteBuffer.allocate(8).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        b.putLong(v);
        b.flip();
        return b;
    }

    void feed(byte[] body) {
        if (!running || body.length < 10) return;
        long pts = ByteBuffer.wrap(body, 1, 8).getLong();
        long diff = System.nanoTime() / 1000 - pts;
        long now = System.currentTimeMillis();
        if (diff < baseUs || now - baseAt > 15000) { baseUs = diff; baseAt = now; }
        if (diff - baseUs > 300_000) return;
        try {
            int idx = dec.dequeueInputBuffer(2000);
            if (idx < 0) return;
            ByteBuffer b = dec.getInputBuffer(idx);
            b.clear();
            b.put(body, 9, body.length - 9);
            dec.queueInputBuffer(idx, 0, body.length - 9, pts, 0);
        } catch (Exception ignored) { }
    }

    private void play() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        byte[] pcm = new byte[16384];
        while (running) {
            try {
                int idx = dec.dequeueOutputBuffer(info, 10000);
                if (idx < 0) continue;
                ByteBuffer b = dec.getOutputBuffer(idx);
                if (b != null && info.size > 0) {
                    if (pcm.length < info.size) pcm = new byte[info.size];
                    b.position(info.offset);
                    b.get(pcm, 0, info.size);
                    track.write(pcm, 0, info.size);
                }
                dec.releaseOutputBuffer(idx, false);
            } catch (Exception e) {
                if (!running) return;
            }
        }
    }

    void release() {
        running = false;
        if (out != null) { try { out.join(300); } catch (InterruptedException ignored) { } out = null; }
        if (track != null) { try { track.stop(); } catch (Exception ignored) { } track.release(); track = null; }
        if (dec != null) { try { dec.stop(); } catch (Exception ignored) { } try { dec.release(); } catch (Exception ignored) { } dec = null; }
    }
}
