/* Draws a QR code as sharp SVG (vendor/qrcode.js, MIT). Dark on white always, even in dark mode, so any camera reads it. */
(function () {
  'use strict';
  const CB = window.CB;

  CB.qrSvg = (text) => {
    if (!window.qrcode || !text) return '';
    const q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount(), pad = 1;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + pad) + ' ' + (r + pad) + 'h1v1h-1z';
    }
    const size = n + pad * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="קוד QR לחיבור"><rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#0F1A1B"/></svg>';
  };
})();
