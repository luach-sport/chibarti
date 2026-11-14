/* The phone's screen on the computer. The phone asks first (MIRROR_OFFER); after "הצגה" the computer opens the
   second connection, and the phone's H.264 picture (and sound, from Android 10) is decoded with WebCodecs and drawn
   on a canvas. A late picture is skipped and a fresh key frame is asked for, so what's shown stays live. */
(function () {
  'use strict';
  const PC = window.PC;
  const T = PC.T;
  // role: none | asked (the phone wants to show its screen) | viewing | offering / sending (screen-out.js)
  const S = (PC.S = { role: 'none', state: '', error: '', request: null, fps: 0, w: 0, h: 0, sound: false, muted: false, lag: 0 });
  const canvas = document.createElement('canvas');
  canvas.className = 'phone-screen';
  const ctx2d = canvas.getContext('2d');
  PC.viewCanvas = canvas;
  let vdec = null, adec = null, csd = null, needKey = true, keyAskedAt = 0, frames = 0, fpsAt = 0, audioCtx = null, nextAt = 0, base = 0;

  PC.canView = () => typeof window.VideoDecoder === 'function';

  PC.on(T.MIRROR_OFFER, (b) => {
    if (S.role !== 'none') { PC.send(T.MIRROR_REPLY, { accept: false, reason: 'busy' }); return; }
    S.request = PC.json(b);
    S.role = 'asked';
    S.error = '';
    PC.beep(880);
    PC.attention('הטלפון רוצה להציג את המסך');
    PC.render();
  });

  /** "הצגה" / "לא עכשיו" (a click, so sound may start). */
  PC.answerMirror = async (accept) => {
    if (S.role !== 'asked') return;
    if (accept && !PC.canView()) { accept = false; S.error = 'no-decoder'; }
    PC.send(T.MIRROR_REPLY, { accept });
    S.request = null;
    if (!accept) { S.role = 'none'; PC.render(); return; }
    S.role = 'viewing';
    S.state = 'connecting';
    S.w = S.h = 0;
    S.sound = false;
    startAudio();
    PC.render();
    const st = await PC.openStream();
    if (!st && S.role === 'viewing') { S.error = 'stream'; PC.stopMirror(true); }
  };

  function startAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  PC.audioCtx = () => { startAudio(); return audioCtx; };

  // ---------- video ----------
  const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };

  // "avc1.PPCCLL" from the SPS, so the browser picks the right decoder.
  PC.avcCodec = (annexB) => {
    for (let i = 0; i + 4 < annexB.length; i++) {
      if (annexB[i] === 0 && annexB[i + 1] === 0 && annexB[i + 2] === 1 && (annexB[i + 3] & 31) === 7 && i + 6 < annexB.length) {
        const h = (x) => (x < 16 ? '0' : '') + x.toString(16).toUpperCase();
        return 'avc1.' + h(annexB[i + 4]) + h(annexB[i + 5]) + h(annexB[i + 6]);
      }
    }
    return '';
  };

  function videoConfig(c) {
    closeVideo();
    csd = concat(c.csd0, c.csd1);
    S.w = c.a;
    S.h = c.b;
    try {
      vdec = new VideoDecoder({ output: show, error: () => { vdec = null; needKey = true; if (S.role === 'viewing') { S.error = 'decode'; PC.render(); } } });
      vdec.configure({ codec: PC.avcCodec(csd) || 'avc1.42E01F', optimizeForLatency: true, codedWidth: c.a, codedHeight: c.b });
    } catch (e) { vdec = null; S.error = 'no-decoder'; }
    needKey = true;
    askKey();
    PC.render();
  }

  function closeVideo() { if (vdec) { try { vdec.close(); } catch (e) { /* closed */ } } vdec = null; }

  function askKey() {
    const now = Date.now();
    if (now - keyAskedAt < 400) return;
    keyAskedAt = now;
    PC.send(T.KEY_REQUEST, {});
  }

  function videoFrame(b) {
    if (S.role !== 'viewing') return;
    if (!vdec || vdec.state !== 'configured') { askKey(); return; }
    const m = PC.readMedia(b), key = (m.flags & 1) === 1;
    // how far behind the phone's clock this frame is (the smallest gap seen = no delay)
    const gap = performance.now() * 1000 - m.pts;
    if (!base || gap < base) base = gap;
    S.lag = Math.max(0, Math.round((gap - base) / 1000));
    if (needKey && !key) { askKey(); return; }
    if (!key && (vdec.decodeQueueSize > 3 || S.lag > 700)) { needKey = true; base = 0; askKey(); return; }
    try {
      vdec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: m.pts, data: key ? concat(csd, m.data) : m.data }));
      if (key) needKey = false;
    } catch (e) { needKey = true; askKey(); }
  }

  function show(frame) {
    try {
      const w = frame.displayWidth, h = frame.displayHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx2d.drawImage(frame, 0, 0, w, h);
    } finally { frame.close(); }
    frames++;
    if (S.state !== 'live') { S.state = 'live'; S.error = ''; PC.render(); }
    const now = Date.now();
    if (!fpsAt) fpsAt = now;
    if (now - fpsAt >= 1000) { S.fps = Math.round((frames * 1000) / (now - fpsAt)); frames = 0; fpsAt = now; PC.live(); }
  }

  // ---------- sound (AAC from the phone, Android 10 and up) ----------
  function audioConfig(c, opus) {
    closeAudio();
    if (typeof window.AudioDecoder !== 'function') return;
    try {
      adec = new AudioDecoder({ output: play, error: () => { adec = null; } });
      const cfg = opus ? { codec: 'opus', sampleRate: 48000, numberOfChannels: Math.max(1, Math.min(2, c.b)) }
        : { codec: 'mp4a.40.2', sampleRate: c.a, numberOfChannels: Math.max(1, Math.min(2, c.b)), description: c.csd0 };
      if (opus && c.csd0.length) cfg.description = c.csd0;
      adec.configure(cfg);
      S.sound = true;
      nextAt = 0;
      PC.render();
    } catch (e) { adec = null; }
  }

  function closeAudio() { if (adec) { try { adec.close(); } catch (e) { /* closed */ } } adec = null; }

  function audioFrame(b) {
    if (!adec || adec.state !== 'configured' || S.role !== 'viewing') return;
    const m = PC.readMedia(b);
    try { adec.decode(new EncodedAudioChunk({ type: 'key', timestamp: m.pts, data: m.data })); } catch (e) { /* skip */ }
  }

  function play(ad) {
    const ac = audioCtx;
    try {
      if (!ac || S.muted || ac.state !== 'running') return;
      const n = ad.numberOfFrames, ch = Math.min(2, ad.numberOfChannels);
      const buf = ac.createBuffer(ch, n, ad.sampleRate);
      for (let i = 0; i < ch; i++) {
        const arr = new Float32Array(n);
        ad.copyTo(arr, { planeIndex: i, format: 'f32-planar' });
        buf.copyToChannel(arr, i);
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(ac.destination);
      const now = ac.currentTime;
      // a small cushion against Wi-Fi jitter; if sound fell behind, jump back to live
      if (nextAt < now + 0.01 || nextAt > now + 0.35) nextAt = now + 0.06;
      src.start(nextAt);
      nextAt += buf.duration;
    } catch (e) { /* skip this piece */ } finally { ad.close(); }
  }

  PC.toggleMute = () => { S.muted = !S.muted; if (!S.muted) startAudio(); PC.render(); };
  PC.fullscreen = () => {
    const el = PC.$('#screenStage') || canvas;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  PC.on(T.VIDEO_CONFIG, (b) => { if (S.role === 'viewing') videoConfig(PC.readConfig(b)); });
  PC.on(T.VIDEO_FRAME, videoFrame);
  PC.on(T.AUDIO_CONFIG, (b) => { if (S.role === 'viewing') audioConfig(PC.readConfig(b), false); });
  PC.on(T.AUDIO_OPUS_CONFIG, (b) => { if (S.role === 'viewing') audioConfig(PC.readConfig(b), true); });
  PC.on(T.AUDIO_FRAME, audioFrame);

  /** Clears what was being watched (called by PC.stopMirror). */
  PC.viewEnded = () => {
    closeVideo();
    closeAudio();
    csd = null;
    base = 0;
    S.fps = 0;
    S.lag = 0;
    S.sound = false;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  /** The connection came back: open the picture's connection again and start from a key frame. */
  PC.viewResumed = async () => {
    if (S.role !== 'viewing') return;
    needKey = true;
    base = 0;
    if (!PC.L.stream) await PC.openStream();
    askKey();
  };
})();
