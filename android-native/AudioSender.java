package com.luachsport.chibarti;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.projection.MediaProjection;
import java.nio.ByteBuffer;

/**
 * The phone's sound while sharing the screen (Android 10+ only, Android's own "playback capture").
 * Apps can forbid it (calls, many streaming apps): their sound is simply silent; Android doesn't allow more.
 * Encoded to AAC 128 kbps, stamped with the same clock as the video so the other phone keeps them together.
 */
final class AudioSender {
    interface Out {
        void audioConfig(int rate, int channels, byte[] csd);
        void audio(byte[] data, long ptsUs);
    }

    private static final int RATE = 48000, CH = 2;
    private AudioRecord rec;
    private MediaCodec enc;
    private Thread t;
    private volatile boolean running;

    @TargetApi(29)
    @SuppressLint("MissingPermission")
    boolean start(MediaProjection mp, final Out out) {
        try {
            AudioPlaybackCaptureConfiguration cfg = new AudioPlaybackCaptureConfiguration.Builder(mp)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build();
            AudioFormat fmt = new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_IN_STEREO).build();
            int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT);
            rec = new AudioRecord.Builder().setAudioFormat(fmt).setBufferSizeInBytes(Math.max(min * 2, 16384)).setAudioPlaybackCaptureConfig(cfg).build();
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) { rec.release(); rec = null; return false; }
            MediaFormat f = MediaFormat.createAudioFormat("audio/mp4a-latm", RATE, CH);
            f.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
            f.setInteger(MediaFormat.KEY_BIT_RATE, 128000);
            f.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384);
            enc = MediaCodec.createEncoderByType("audio/mp4a-latm");
            enc.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            enc.start();
            rec.startRecording();
        } catch (Exception e) {
            stop();
            return false;
        }
        running = true;
        t = new Thread(() -> loop(out), "audio-enc");
        t.start();
        return true;
    }

    private void loop(Out out) {
        byte[] pcm = new byte[4096];
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean sentConfig = false;
        while (running) {
            try {
                int n = rec.read(pcm, 0, pcm.length);
                if (n <= 0) continue;
                long pts = System.nanoTime() / 1000 - (n / (2L * CH)) * 1_000_000L / RATE;
                int in = enc.dequeueInputBuffer(10000);
                if (in >= 0) {
                    ByteBuffer b = enc.getInputBuffer(in);
                    b.clear();
                    int len = Math.min(n, b.remaining());
                    b.put(pcm, 0, len);
                    enc.queueInputBuffer(in, 0, len, pts, 0);
                }
                int o;
                while ((o = enc.dequeueOutputBuffer(info, 0)) != MediaCodec.INFO_TRY_AGAIN_LATER) {
                    if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        ByteBuffer csd = enc.getOutputFormat().getByteBuffer("csd-0");
                        if (csd != null) { byte[] c = new byte[csd.remaining()]; csd.duplicate().get(c); out.audioConfig(RATE, CH, c); sentConfig = true; }
                        continue;
                    }
                    if (o < 0) continue;
                    ByteBuffer ob = enc.getOutputBuffer(o);
                    if (ob != null && info.size > 0) {
                        byte[] d = new byte[info.size];
                        ob.position(info.offset);
                        ob.get(d);
                        if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) { if (!sentConfig) { out.audioConfig(RATE, CH, d); sentConfig = true; } }
                        else out.audio(d, info.presentationTimeUs);
                    }
                    enc.releaseOutputBuffer(o, false);
                }
            } catch (Exception e) {
                if (!running) return;
            }
        }
    }

    void stop() {
        running = false;
        if (t != null) { try { t.join(400); } catch (InterruptedException ignored) { } }
        if (rec != null) { try { rec.stop(); } catch (Exception ignored) { } rec.release(); rec = null; }
        if (enc != null) { try { enc.stop(); } catch (Exception ignored) { } try { enc.release(); } catch (Exception ignored) { } enc = null; }
    }
}
