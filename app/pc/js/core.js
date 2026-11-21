/* חיברתי במחשב: shared helpers (window.PC). The page is served by the phone itself, over HTTPS, on the local network. */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  PC.A = {};
  PC.$ = (s, r) => (r || document).querySelector(s);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  PC.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  PC.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ltr = (s) => '⁦' + s + '⁩';
  PC.bytes = (n) => {
    n = Number(n) || 0;
    if (n < 1024) return ltr(n + ' B');
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return ltr(String(n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$|(\.\d)0$/, '$1') + ' ' + u[i]);
  };
  PC.pct = (d, t) => (t > 0 ? Math.min(100, Math.floor((d / t) * 100)) : 0);
  PC.eta = (s) => (!(s >= 0) ? '' : s < 60 ? 'עוד ' + Math.max(1, Math.round(s)) + ' שנ׳' : s < 3600 ? 'עוד ' + Math.round(s / 60) + ' דק׳' : 'עוד ' + Math.floor(s / 3600) + ':' + String(Math.round((s % 3600) / 60)).padStart(2, '0') + ' שע׳');
  PC.time = (ts) => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  PC.pre = (p, name) => p + (/^[A-Za-z0-9]/.test(String(name || '')) ? '-' : '') + (name || '');
  PC.hex = (b) => Array.prototype.map.call(b, (x) => (x < 16 ? '0' : '') + x.toString(16)).join('');
  PC.rand = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };
  PC.store = {
    get: (k, d) => { try { const v = localStorage.getItem('chibarti.pc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('chibarti.pc.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  PC.toast = (msg, ms) => {
    const t = PC.$('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(PC.toastT);
    PC.toastT = setTimeout(() => t.classList.remove('on'), ms || 2800);
  };
  // What the computer calls itself on the phone ("מחשב Windows"), and its details ("Windows · Chrome")
  PC.deviceName = () => { const os = PC.os(); return !os ? 'מחשב' : os === 'Chromebook' ? os : 'מחשב ' + os; };
  PC.os = () => {
    const ua = navigator.userAgent;
    return /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : '';
  };
  PC.deviceModel = () => {
    const ua = navigator.userAgent;
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'מחשב';
    const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'דפדפן';
    return os + ' · ' + br;
  };
})();
