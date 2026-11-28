/* Internet requests.
   On Android they go through the native side (no CORS limits, real redirects, any User-Agent); in a browser, fetch.
   opts.as: 'json' (default) | 'text' | 'base64'   opts.noRedirect: return a 3xx answer as it is.
   Returns { status, ok, data, url (after redirects), type, headers (lower-case names) }. */
(function () {
  'use strict';
  const CB = window.CB;

  // Who we say we are. Some sites answer only to a browser; crawlers (WhatsApp, Facebook) get the preview tags.
  CB.UA = {
    mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    whatsapp: 'WhatsApp/2.24.20.79 A',
    facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
  };

  const lower = (h) => { const o = {}; Object.keys(h || {}).forEach((k) => { o[k.toLowerCase()] = String(h[k]); }); return o; };

  async function nativeRequest(rt, url, opts, headers, as, timeout) {
    // Without this Android sends "Dalvik/…" as the User-Agent, which some sites (TikTok) refuse.
    if (!headers['User-Agent']) headers['User-Agent'] = CB.UA.mobile;
    if (opts.data != null) headers['Content-Type'] = 'application/json';
    const req = rt.CapacitorHttp.request({
      url, method: opts.method || 'GET', headers, data: opts.data, connectTimeout: timeout, readTimeout: timeout,
      disableRedirects: !!opts.noRedirect,
      responseType: as === 'base64' ? 'blob' : as === 'text' ? 'text' : 'json'
    });
    const res = await Promise.race([req, CB.sleep(timeout + 3000).then(() => { throw new Error('timeout'); })]);
    let data = res.data;
    if (typeof data === 'string' && as === 'json') { try { data = JSON.parse(data); } catch (e) { /* keep text */ } }
    const h = lower(res.headers);
    return { status: res.status, ok: res.status >= 200 && res.status < 300, data, url: res.url || url, type: h['content-type'] || '', headers: h };
  }

  async function webRequest(url, opts, headers, as, timeout) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), timeout);
    try {
      delete headers['User-Agent']; delete headers.Referer; delete headers.Cookie;
      const init = { method: opts.method || 'GET', headers, signal: ctl ? ctl.signal : undefined, redirect: opts.noRedirect ? 'manual' : 'follow' };
      if (opts.data != null) { init.body = JSON.stringify(opts.data); headers['Content-Type'] = opts.plain ? 'text/plain;charset=utf-8' : 'application/json'; }
      const res = await fetch(url, init);
      let data;
      if (as === 'base64') data = await CB.blobToBase64(await res.blob());
      else {
        const txt = await res.text();
        data = txt;
        if (as === 'json') { try { data = JSON.parse(txt); } catch (e) { /* text */ } }
      }
      const h = {};
      res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
      return { status: res.status, ok: res.ok, data, url: res.url || url, type: h['content-type'] || '', headers: h };
    } finally { clearTimeout(t); }
  }

  CB.http = async (url, opts = {}) => {
    const as = opts.as || 'json';
    const headers = Object.assign({}, opts.headers || {});
    if (as === 'json' && !headers.Accept) headers.Accept = 'application/json';
    const timeout = opts.timeout || 15000;
    const rt = window.ChibartiCap;
    if (CB.isNative() && rt && rt.CapacitorHttp) return nativeRequest(rt, url, opts, headers, as, timeout);
    return webRequest(url, opts, headers, as, timeout);
  };

  CB.blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
})();
