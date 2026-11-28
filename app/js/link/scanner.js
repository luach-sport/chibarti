/* Reads the other phone's QR code with the camera, on the phone itself (vendor/jsQR.js, Apache-2.0), no internet.
   Every ~120 ms one picture is checked: the whole view small, and every other time the middle sharper, so small
   or far codes are read too, even on old phones. */
(function () {
  'use strict';
  const CB = window.CB;
  let stream = null, timer = null, busy = false, flip = false;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');

  function tick(video, onCode) {
    timer = setTimeout(() => tick(video, onCode), 120);
    if (busy || !video.videoWidth || !window.jsQR) return;
    busy = true;
    try {
      const vw = video.videoWidth, vh = video.videoHeight;
      flip = !flip;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (flip) { const s = Math.min(vw, vh) * 0.62; sx = (vw - s) / 2; sy = (vh - s) / 2; sw = sh = s; }
      const scale = Math.min(1, 640 / Math.max(sw, sh));
      const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      g.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
      const img = g.getImageData(0, 0, w, h);
      const code = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (code && code.data) { CB.scanner.stop(); onCode(code.data); }
    } catch (e) { /* next frame */ }
    busy = false;
  }

  CB.scanner = {
    start: async (video, onCode) => {
      CB.scanner.stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no-camera');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      tick(video, onCode);
    },
    stop: () => {
      clearTimeout(timer);
      timer = null;
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    },
    running: () => !!stream
  };
})();
