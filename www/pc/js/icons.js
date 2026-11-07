/* The app's own line icons (copied from www/js/core/icons.js by a script) and the logo. */
(function () {
  'use strict';
  const PC = window.PC;
  const P = {
    "cast": "<rect x=\"2\" y=\"4\" width=\"20\" height=\"13\" rx=\"2\"/><path d=\"M8 21h8M12 17v4\"/><path d=\"M7 11.5a5 5 0 0 1 5-5M9.5 12a2.5 2.5 0 0 1 2.5-2.5\"/>",
    "files": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z\"/><path d=\"M14 2v6h6M9 15l3-3 3 3M12 12v6\"/>",
    "message": "<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z\"/><path d=\"M8 9h8M8 13h5\"/>",
    "phone": "<rect x=\"6\" y=\"2\" width=\"12\" height=\"20\" rx=\"3\"/><path d=\"M11 18h2\"/>",
    "link": "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>",
    "unlink": "<path d=\"m18.84 12.25 1.72-1.71a4.99 4.99 0 0 0-7.07-7.07l-1.72 1.71M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71M8 2v3M2 8h3M16 22v-3M22 16h-3\"/>",
    "close": "<path d=\"M18 6 6 18M6 6l12 12\"/>",
    "check": "<path d=\"M20 6 9 17l-5-5\"/>",
    "upload": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12\"/>",
    "download": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3\"/>",
    "send": "<path d=\"M22 2 11 13M22 2l-7 20-4-9-9-4Z\"/>",
    "copy": "<rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/>",
    "trash": "<path d=\"M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"/>",
    "pause": "<rect x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/><rect x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/>",
    "play": "<path d=\"m6 3 14 9-14 9Z\"/>",
    "stop": "<rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"2\"/>",
    "refresh": "<path d=\"M21 12a9 9 0 0 1-15.5 6.2L3 16\"/><path d=\"M3 12a9 9 0 0 1 15.5-6.2L21 8\"/><path d=\"M21 3v5h-5M3 21v-5h5\"/>",
    "alert": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v5M12 16h.01\"/>",
    "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 16v-5M12 8h.01\"/>",
    "shield": "<path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z\"/><path d=\"m9 12 2 2 4-4\"/>",
    "lock": "<rect x=\"4\" y=\"11\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 8 0v4\"/>",
    "image": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><path d=\"m21 15-5-5L5 21\"/>",
    "video": "<rect x=\"2\" y=\"5\" width=\"14\" height=\"14\" rx=\"2\"/><path d=\"m22 8-6 4 6 4Z\"/>",
    "audio": "<path d=\"M9 18V5l11-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"17\" cy=\"16\" r=\"3\"/>",
    "pdf": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z\"/><path d=\"M14 2v6h6M8 13h1.5a1.5 1.5 0 0 1 0 3H8v-3Zm0 3v2M13 13v5h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2Z\"/>",
    "doc": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z\"/><path d=\"M14 2v6h6M8 13h8M8 17h8M8 9h2\"/>",
    "zip": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z\"/><path d=\"M14 2v6h6M10 4h1M10 7h1M10 10h1M10 13h1v3h-1Z\"/>",
    "apk": "<path d=\"M5 16V11a7 7 0 0 1 14 0v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z\"/><path d=\"M8 4l1.5 2.5M16 4l-1.5 2.5M9.5 11h.01M14.5 11h.01\"/>",
    "file": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z\"/><path d=\"M14 2v6h6\"/>",
    "folder": "<path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z\"/>",
    "volume": "<path d=\"M11 5 6 9H2v6h4l5 4Z\"/><path d=\"M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14\"/>",
    "rotate": "<path d=\"M21 12a9 9 0 1 1-3-6.7L21 8\"/><path d=\"M21 3v5h-5\"/>",
    "open": "<path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3\"/>",
    "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
    "eye": "<path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
    "sparkle": "<path d=\"M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1\"/>",
    "gauge": "<path d=\"M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0\"/>",
    "monitor": "<rect x=\"2\" y=\"3\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M8 21h8M12 17v4\"/>",
    "mute": "<path d=\"M11 5 6 9H2v6h4l5 4Z\"/><path d=\"m22 9-6 6M16 9l6 6\"/>",
    "full": "<path d=\"M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3\"/>"
  };
  PC.icon = (name, cls) => '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || P.info) + '</svg>';
  const glyph = '<rect x="13" y="30" width="34" height="60" rx="9" fill="#fff"/><rect x="73" y="30" width="34" height="60" rx="9" fill="#fff"/>' +
    '<path d="M21 42h18M21 50h11M81 42h18M81 50h11" stroke="#0A8F94" stroke-opacity=".38" stroke-width="4.5" stroke-linecap="round"/>' +
    '<path d="M25 80h10M85 80h10" stroke="#0A8F94" stroke-opacity=".5" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M50.5 52.5q9.5-10 19 0M54.6 60q5.4-5.6 10.8 0" stroke="#FFD27A" stroke-width="5.5" fill="none" stroke-linecap="round"/><circle cx="60" cy="67.5" r="3.6" fill="#FFD27A"/>';
  PC.logo = (size) => '<svg class="logo" width="' + size + '" height="' + size + '" viewBox="0 0 120 120" aria-hidden="true"><rect width="120" height="120" rx="30" fill="#0A8F94"/>' + glyph + '</svg>';
  // which icon a file gets, by its type or name
  PC.kind = (mime, name) => {
    const m = String(mime || ''), n = String(name || '').toLowerCase();
    if (/^image\//.test(m) || /\.(jpe?g|png|gif|webp|heic|bmp)$/.test(n)) return 'image';
    if (/^video\//.test(m) || /\.(mp4|mkv|mov|avi|webm|3gp)$/.test(n)) return 'video';
    if (/^audio\//.test(m) || /\.(mp3|m4a|wav|ogg|aac|flac|opus)$/.test(n)) return 'audio';
    if (/pdf/.test(m) || /\.pdf$/.test(n)) return 'pdf';
    if (/\.apk$/.test(n)) return 'apk';
    if (/zip|rar|7z|tar|gzip/.test(m) || /\.(zip|rar|7z|tar|gz)$/.test(n)) return 'zip';
    if (/word|document|text|sheet|excel|presentation/.test(m) || /\.(docx?|xlsx?|pptx?|txt|csv|odt)$/.test(n)) return 'doc';
    return 'file';
  };
})();
