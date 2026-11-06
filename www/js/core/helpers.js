/* Small helpers: escaping, ids, timing, numbers, sizes, speeds. */
(function () {
  'use strict';
  const CB = window.CB;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  CB.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  CB.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  CB.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  CB.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  CB.isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
  CB.fmt = (n) => new Intl.NumberFormat('he-IL').format(n);
  CB.isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  CB.str = (v, n) => String(v == null ? '' : v).slice(0, n);
  CB.clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  CB.int = (v, def, min, max) => { const n = Math.round(Number(v)); return isFinite(n) ? CB.clamp(n, min, max) : def; };
  CB.copy = (o) => JSON.parse(JSON.stringify(o));

  // 1536 → "1.5 KB", 1288490188 → "1.2 GB" (always with the unit on the left of the number in RTL, as people read it)
  // Sizes keep their left-to-right order inside Hebrew sentences (an isolated run: "7.15 MB", not "MB 7.15").
  const ltr = (s) => '\u2066' + s + '\u2069';
  CB.bytes = (n) => {
    n = Number(n) || 0;
    if (n < 0) return '';
    if (n < 1024) return ltr(n + ' B');
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return ltr(String(n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$|(\.\d)0$/, '$1') + ' ' + u[i]);
  };
  CB.speed = (bps) => (bps > 0 ? ltr(CB.bytes(bps).replace(/[\u2066\u2069]/g, '') + '/s') : '');
  CB.eta = (sec) => {
    if (!(sec >= 0)) return '';
    if (sec < 60) return 'עוד ' + Math.max(1, Math.round(sec)) + ' שנ׳';
    if (sec < 3600) return 'עוד ' + Math.round(sec / 60) + ' דק׳';
    return 'עוד ' + Math.floor(sec / 3600) + ':' + String(Math.round((sec % 3600) / 60)).padStart(2, '0') + ' שע׳';
  };
  CB.pct = (done, total) => (total > 0 ? CB.clamp(Math.floor((done / total) * 100), 0, 100) : 0);
  CB.time = (ts) => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  CB.dayLabel = (ts) => {
    const d = new Date(ts), now = new Date();
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(now) - start(d)) / 864e5);
    if (diff === 0) return 'היום';
    if (diff === 1) return 'אתמול';
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    if (diff < 7) return 'יום ' + days[d.getDay()];
    return d.getDate() + '.' + (d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2);
  };
  CB.dateFull = (ts) => { const d = new Date(ts); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); };
  CB.ago = (ts) => {
    if (!ts) return '';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'עכשיו';
    if (m < 60) return 'לפני ' + m + ' דק׳';
    const h = Math.round(m / 60);
    if (h < 24) return 'לפני ' + h + ' שע׳';
    return CB.dayLabel(ts);
  };
  CB.duration = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };
  // "ל" + "Redmi" → "ל-Redmi", "ל" + "דני" → "לדני" (Hebrew joins a prefix with a hyphen before Latin letters and digits)
  CB.pre = (p, name) => p + (/^[A-Za-z0-9]/.test(String(name || '')) ? '-' : '') + (name || '');
  CB.kind = (mime, name) => {
    mime = String(mime || '');
    name = String(name || '').toLowerCase();
    if (mime.indexOf('image/') === 0) return 'image';
    if (mime.indexOf('video/') === 0) return 'video';
    if (mime.indexOf('audio/') === 0) return 'audio';
    if (mime === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
    if (mime === 'application/vnd.android.package-archive' || /\.apk$/.test(name)) return 'apk';
    if (/zip|rar|7z|tar|gzip/.test(mime) || /\.(zip|rar|7z|tar|gz)$/.test(name)) return 'zip';
    if (/word|excel|sheet|presentation|powerpoint|officedocument|opendocument|text\//.test(mime) || /\.(docx?|xlsx?|pptx?|odt|ods|txt|csv)$/.test(name)) return 'doc';
    return 'file';
  };
})();
