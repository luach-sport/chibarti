/* The computer's screen (and its sound) on the phone. The browser asks which screen or window to share
   (getDisplayMedia), the phone is asked, and on "yes" the picture is encoded to H.264 and the sound to Opus with
   WebCodecs, on the second connection. When the network is slow, frames are skipped before encoding (so the
   picture never breaks) and the quality goes down by itself, then back up. */
(function () {
  'use strict';
  const PC = window.PC;
  const T = PC.T;
  const S = PC.S;
  const Q = { standard: { w: 1280, h: 720, bitrate: 2500000 }, high: { w: 1920, h: 1080, bitrate: 5000000 }, saver: { w: 960, h: 540, bitrate: 1200000 } };
  PC.shareOpts = PC.store.get('share', { quality: 'standard', fps: 30, audio: true });
  let media = null, vtrack = null, atrack = null, venc = null, aenc = null, reader = null, areader = null, timer = 0;
  let encW = 0, encH = 0, codec = '', bitrate = 0, target = 0, needKey = true, lastKey = 0, sentConfig = '', drops = 0, okSince = 0, rateAt = 0;
  let frames = 0, fpsAt = 0, offeredAt = 0, gen = 0, preview = null, aConfigured = false, aFailed = false;

  PC.canShare = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.VideoEncoder && window.VideoFrame);
  PC.setShareOpt = (k, v) => { PC.shareOpts[k] = v; PC.store.set('share', PC.shareOpts); PC.render(); };

  /** "הצגת המסך של המחשב בטלפון" (a click: the browser only asks after one). */
  PC.shareScreen = async () => {
    if (S.role !== 'none' || PC.L.state !== 'on') return;
    S.error = '';
    if (!PC.canShare()) { S.error = 'no-encoder'; PC.render(); return; }
    const q = Q[PC.shareOpts.quality] || Q.standard, fps = PC.shareOpts.fps || 30;
    try {
      media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: fps, max: fps }, width: { max: q.w }, height: { max: q.h } },
        audio: PC.shareOpts.audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include'
      });
    } catch (e) {
      media = null;
      if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') { S.error = 'capture'; PC.render(); }
      return;
    }
    if (PC.L.state !== 'on' || S.role !== 'none') { stopTracks(); return; }
    vtrack = media.getVideoTracks()[0] || null;
    atrack = media.getAudioTracks()[0] || null;
    if (!vtrack) { stopTracks(); return; }
    try { vtrack.contentHint = 'detail'; } catch (e) { /* old browser */ }
    vtrack.addEventListener('ended', () => { if (S.role === 'offering' || S.role === 'sending') PC.stopMirror(true); });
    S.role = 'offering';
    S.state = 'waiting';
    S.sound = !!atrack;
    offeredAt = Date.now();
    const mine = offeredAt;
    PC.send(T.MIRROR_OFFER, { quality: PC.shareOpts.quality, fps, audio: !!atrack });
    setTimeout(() => { if (S.role === 'offering' && offeredAt === mine) { S.error = 'timeout'; PC.stopMirror(true); } }, 60000);
    PC.render();
  };

  PC.on(T.MIRROR_REPLY, async (b) => {
    if (S.role !== 'offering') return;
    const o = PC.json(b);
    if (!o.accept) { S.error = o.reason === 'busy' ? 'busy' : 'declined'; PC.stopMirror(false); return; }
    S.state = 'connecting';
    PC.render();
    const st = await PC.openStream();
    if (S.role !== 'offering') return;
    if (!st) { S.error = 'stream'; PC.stopMirror(true); return; }
    start();
  });

  PC.on(T.KEY_REQUEST, () => { needKey = true; });

  // ---------- encoding ----------
  const even = (n) => Math.max(2, n & ~1);
  function level(w, h) { const mbs = Math.ceil(w / 16) * Math.ceil(h / 16); return mbs <= 1620 ? '1E' : mbs <= 3600 ? '1F' : mbs <= 8192 ? '28' : '32'; }

  async function pickCodec(w, h, fps, rate) {
    const lv = level(w, h);
    // constrained baseline first: every phone can decode it, even very old ones
    for (const p of ['42E0', '4D40', '6400']) {
      const cfg = { codec: 'avc1.' + p + lv, width: w, height: h, bitrate: rate, framerate: fps, latencyMode: 'realtime', avc: { format: 'annexb' } };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) { /* next */ }
    }
    return null;
  }

  async function configure(w, h) {
    const g = gen;
    const fps = PC.shareOpts.fps || 30;
    const cfg = await pickCodec(w, h, fps, bitrate);
    if (g !== gen) return false;
    if (!cfg) { S.error = 'no-encoder'; PC.stopMirror(true); return false; }
    if (!venc || venc.state === 'closed') venc = new VideoEncoder({ output: onVideo, error: () => { if (S.role === 'sending') { S.error = 'encode'; PC.stopMirror(true); } } });
    venc.configure(cfg);
    encW = w;
    encH = h;
    codec = cfg.codec;
    needKey = true;
    return true;
  }

  function start() {
    gen++;
    S.role = 'sending';
    S.state = 'live';
    const q = Q[PC.shareOpts.quality] || Q.standard;
    target = bitrate = q.bitrate;
    needKey = true;
    sentConfig = '';
    drops = 0;
    okSince = rateAt = Date.now();
    aConfigured = false;
    aFailed = false;
    showPreview();
    if (typeof window.MediaStreamTrackProcessor === 'function') readTrack(gen);
    else pollVideo(gen);
    if (atrack && typeof window.AudioEncoder === 'function' && typeof window.MediaStreamTrackProcessor === 'function') readAudio(gen);
    else S.sound = false;
    PC.render();
  }

  // Chrome and Edge: the frames come straight from the capture, also when this window is hidden.
  async function readTrack(g) {
    try {
      reader = new MediaStreamTrackProcessor({ track: vtrack }).readable.getReader();
      for (;;) {
        const r = await reader.read();
        if (r.done || g !== gen) { if (r.value) r.value.close(); return; }
        await encode(r.value, g);
      }
    } catch (e) { /* stopped */ }
  }

  // Other browsers: copy the picture from a hidden video element (works best while this window stays open).
  function pollVideo(g) {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream([vtrack]);
    v.play().catch(() => {});
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const fps = PC.shareOpts.fps || 30;
    let busy = false;
    timer = setInterval(async () => {
      if (g !== gen) { clearInterval(timer); v.srcObject = null; return; }
      if (busy || !v.videoWidth) return;
      busy = true;
      const q = Q[PC.shareOpts.quality] || Q.standard, k = Math.min(1, q.w / v.videoWidth, q.h / v.videoHeight);
      const w = even(Math.round(v.videoWidth * k)), h = even(Math.round(v.videoHeight * k));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      x.drawImage(v, 0, 0, w, h);
      try { await encode(new VideoFrame(c, { timestamp: Math.round(performance.now() * 1000) }), g); } catch (e) { /* skip */ }
      busy = false;
    }, Math.round(1000 / fps));
  }

  async function encode(frame, g) {
    try {
      const st = PC.L.stream;
      if (!st || st.readyState !== 1) { needKey = true; return; }
      // the size sent to the phone: even numbers, within the chosen quality (the encoder scales the frame to it)
      let w = even(frame.displayWidth), h = even(frame.displayHeight);
      const q = Q[PC.shareOpts.quality] || Q.standard;
      if (w > q.w || h > q.h) { const k = Math.min(q.w / w, q.h / h); w = even(Math.round(w * k)); h = even(Math.round(h * k)); }
      if (w !== encW || h !== encH || !venc || venc.state !== 'configured') { if (!(await configure(w, h)) || g !== gen) return; }
      // the network can't keep up: skip this frame before encoding, so the picture stays whole
      if (st.bufferedAmount > 768 * 1024 || venc.encodeQueueSize > 2) { drops++; return; }
      adapt();
      const now = Date.now();
      const key = needKey || now - lastKey > 3000;
      venc.encode(frame, { keyFrame: key });
      if (key) { needKey = false; lastKey = now; }
    } catch (e) { needKey = true; } finally { frame.close(); }
  }

  // Slower network → lower bitrate; a quiet network for a while → back up towards the chosen quality.
  function adapt() {
    const now = Date.now();
    if (now - rateAt < 2000) return;
    rateAt = now;
    let next = bitrate;
    if (drops > 2) { next = Math.max(500000, Math.round(bitrate * 0.7)); okSince = now; }
    else if (now - okSince > 6000 && bitrate < target) { next = Math.min(target, Math.round(bitrate * 1.2)); okSince = now; }
    drops = 0;
    if (next !== bitrate && venc && venc.state === 'configured') {
      bitrate = next;
      try { venc.configure({ codec, width: encW, height: encH, bitrate, framerate: PC.shareOpts.fps || 30, latencyMode: 'realtime', avc: { format: 'annexb' } }); needKey = true; } catch (e) { /* keep the old one */ }
    }
    S.kbps = Math.round(bitrate / 1000);
  }

  // NAL units of an Annex B frame (00 00 01 / 00 00 00 01 start codes).
  function nals(u) {
    const out = [];
    let i = 0, s = -1;
    while (i + 2 < u.length) {
      if (u[i] === 0 && u[i + 1] === 0 && u[i + 2] === 1) { if (s >= 0) out.push(u.subarray(s, i > 0 && u[i - 1] === 0 ? i - 1 : i)); i += 3; s = i; }
      else i++;
    }
    if (s >= 0) out.push(u.subarray(s));
    return out;
  }
  const withStart = (n) => { const o = new Uint8Array(n.length + 4); o[3] = 1; o.set(n, 4); return o; };

  // The SPS and PPS from the avcC description (when the encoder doesn't put them in the frame).
  function fromAvcc(d) {
    const u = d instanceof Uint8Array ? d : new Uint8Array(d.buffer ? d.buffer : d, d.byteOffset || 0, d.byteLength);
    if (u.length < 8) return null;
    let p = 5, sps = null, pps = null;
    const ns = u[p++] & 31;
    for (let i = 0; i < ns; i++) { const l = (u[p] << 8) | u[p + 1]; p += 2; if (!sps) sps = u.subarray(p, p + l); p += l; }
    const np = u[p++];
    for (let i = 0; i < np; i++) { const l = (u[p] << 8) | u[p + 1]; p += 2; if (!pps) pps = u.subarray(p, p + l); p += l; }
    return sps && pps ? { sps, pps } : null;
  }

  function onVideo(chunk, meta) {
    const st = PC.L.stream;
    if (!st || st.readyState !== 1 || S.role !== 'sending') return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const key = chunk.type === 'key';
    if (key) {
      let sps = null, pps = null;
      for (const n of nals(data)) { const t = n[0] & 31; if (t === 7 && !sps) sps = n; if (t === 8 && !pps) pps = n; }
      if ((!sps || !pps) && meta && meta.decoderConfig && meta.decoderConfig.description) { const a = fromAvcc(meta.decoderConfig.description); if (a) { sps = a.sps; pps = a.pps; } }
      if (sps && pps) {
        const sig = encW + 'x' + encH + ':' + PC.hex(sps) + ':' + PC.hex(pps);
        if (sig !== sentConfig) { st.send(PC.frame(T.VIDEO_CONFIG, PC.config(encW, encH, withStart(sps), withStart(pps)))); sentConfig = sig; }
      }
    }
    if (!sentConfig) { needKey = true; return; }
    st.send(PC.frame(T.VIDEO_FRAME, PC.media(key ? 1 : 0, Math.max(0, Math.round(chunk.timestamp)), data)));
    frames++;
    const now = Date.now();
    if (!fpsAt) fpsAt = now;
    if (now - fpsAt >= 1000) { S.fps = Math.round((frames * 1000) / (now - fpsAt)); frames = 0; fpsAt = now; PC.live(); }
  }

  // ---------- sound ----------
  function opusHead(ch, rate) {
    const b = new Uint8Array(19), v = new DataView(b.buffer);
    'OpusHead'.split('').forEach((c, i) => { b[i] = c.charCodeAt(0); });
    b[8] = 1; b[9] = ch; v.setUint16(10, 312, true); v.setUint32(12, rate, true); v.setInt16(16, 0, true); b[18] = 0;
    return b;
  }

  async function readAudio(g) {
    try {
      areader = new MediaStreamTrackProcessor({ track: atrack }).readable.getReader();
      for (;;) {
        const r = await areader.read();
        if (r.done || g !== gen) { if (r.value) r.value.close(); return; }
        const ad = r.value;
        try {
          if (!aenc || aenc.state === 'closed') {
            const ch = Math.min(2, ad.numberOfChannels);
            if (aFailed) continue;
            aenc = new AudioEncoder({ output: onAudio, error: () => { aenc = null; aFailed = true; S.sound = false; PC.render(); } });
            aenc.configure({ codec: 'opus', sampleRate: ad.sampleRate, numberOfChannels: ch, bitrate: 96000 });
            aenc.chRate = [ch, ad.sampleRate];
            aConfigured = false;
          }
          const st = PC.L.stream;
          if (st && st.readyState === 1 && st.bufferedAmount < 1536 * 1024 && aenc.state === 'configured' && ad.numberOfChannels === aenc.chRate[0]) aenc.encode(ad);
        } catch (e) { /* skip */ } finally { ad.close(); }
      }
    } catch (e) { /* stopped */ }
  }

  function onAudio(chunk, meta) {
    const st = PC.L.stream;
    if (!st || st.readyState !== 1 || S.role !== 'sending') return;
    if (!aConfigured) {
      let head = null;
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d) { const u = new Uint8Array(d.buffer ? d.buffer : d, d.byteOffset || 0, d.byteLength); if (u.length >= 19 && String.fromCharCode.apply(null, u.subarray(0, 8)) === 'OpusHead') head = u.slice(); }
      const cr = aenc ? aenc.chRate : [2, 48000];
      st.send(PC.frame(T.AUDIO_OPUS_CONFIG, PC.config(48000, cr[0], head || opusHead(cr[0], cr[1]))));
      aConfigured = true;
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    st.send(PC.frame(T.AUDIO_FRAME, PC.media(0, Math.max(0, Math.round(chunk.timestamp)), data)));
  }

  // ---------- preview, stop, reconnect ----------
  function showPreview() {
    if (!preview) { preview = document.createElement('video'); preview.className = 'pc-preview'; preview.muted = true; preview.playsInline = true; preview.autoplay = true; }
    preview.srcObject = media;
    preview.play().catch(() => {});
  }
  PC.previewEl = () => preview;

  function stopTracks() {
    if (media) media.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* stopped */ } });
    media = vtrack = atrack = null;
  }

  /** Clears what was being shared (called by PC.stopMirror). */
  PC.shareEnded = () => {
    gen++;
    clearInterval(timer);
    try { if (reader) reader.cancel(); } catch (e) { /* done */ }
    try { if (areader) areader.cancel(); } catch (e) { /* done */ }
    reader = areader = null;
    try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) { /* closed */ }
    try { if (aenc && aenc.state !== 'closed') aenc.close(); } catch (e) { /* closed */ }
    venc = aenc = null;
    encW = encH = 0;
    sentConfig = '';
    S.fps = 0;
    S.kbps = 0;
    if (preview) preview.srcObject = null;
    stopTracks();
  };

  /** The connection came back: open the picture's connection again, resend the setup and a key frame. */
  PC.shareResumed = async () => {
    if (S.role !== 'sending') return;
    if (!PC.L.stream) await PC.openStream();
    sentConfig = '';
    aConfigured = false;
    needKey = true;
  };

  /** Stops sharing or watching, in either direction (tell = let the phone know). */
  PC.stopMirror = (tell) => {
    const was = S.role;
    if (was === 'none') return;
    if (tell) PC.send(T.MIRROR_STOP, {});
    S.role = 'none';
    S.state = '';
    S.request = null;
    PC.shareEnded();
    PC.viewEnded();
    const st = PC.L.stream;
    PC.L.stream = null;
    try { if (st) st.close(); } catch (e) { /* gone */ }
    PC.render();
  };

  PC.on(T.MIRROR_STOP, () => {
    const was = S.role;
    PC.stopMirror(false);
    if (was === 'viewing' || was === 'asked') PC.toast('הטלפון הפסיק להציג את המסך');
    else if (was === 'sending' || was === 'offering') PC.toast('הטלפון סגר את התצוגה');
  });
})();
