package com.luachsport.chibarti;

/**
 * Hands the incoming screen stream to the viewer screen when it's open. Keeps the last setup (size, codec data),
 * so a viewer that opens (or comes back from the background) can start at once from the next key frame.
 */
final class MirrorRx {
    interface Viewer {
        void onVideoConfig(Proto.Config c);
        void onVideo(byte[] body);
        void onAudioConfig(Proto.Config c);
        void onAudio(byte[] body);
        void onStatus(String status);
        void onEnded(String why);
    }

    private static volatile Viewer viewer;
    private static volatile Proto.Config video, audio;
    static volatile String peer = "";
    static volatile boolean active = false;

    private MirrorRx() { }

    static void begin(String peerName) {
        peer = peerName == null ? "" : peerName;
        video = null;
        audio = null;
        active = true;
    }

    static void onFrame(int type, byte[] body) {
        Viewer v = viewer;
        try {
            switch (type) {
                case Proto.VIDEO_CONFIG: video = new Proto.Config(body); if (v != null) v.onVideoConfig(video); break;
                case Proto.VIDEO_FRAME: if (v != null) v.onVideo(body); break;
                case Proto.AUDIO_CONFIG: audio = new Proto.Config(body); if (v != null) v.onAudioConfig(audio); break;
                case Proto.AUDIO_OPUS_CONFIG: { Proto.Config c = new Proto.Config(body); c.mime = "audio/opus"; audio = c; if (v != null) v.onAudioConfig(c); break; }
                case Proto.AUDIO_FRAME: if (v != null) v.onAudio(body); break;
                default: break;
            }
        } catch (Exception ignored) { }
    }

    /** The viewer opened: give it what's known so far. Returns false when nothing is being shared anymore. */
    static boolean attach(Viewer v) {
        viewer = v;
        if (!active) return false;
        Proto.Config vc = video, ac = audio;
        if (vc != null) v.onVideoConfig(vc);
        if (ac != null) v.onAudioConfig(ac);
        return true;
    }

    static void detach(Viewer v) { if (viewer == v) viewer = null; }

    static void status(String s) { Viewer v = viewer; if (v != null) v.onStatus(s); }

    static void end(String why) {
        boolean was = active;
        active = false;
        video = null;
        audio = null;
        Viewer v = viewer;
        if (v != null && was) v.onEnded(why);
    }
}
