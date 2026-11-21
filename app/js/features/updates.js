/* In-app updates (same system as MyCar and שמרתי).
   Every build publishes a signed update.json next to the APK on the GitHub release. The app checks it,
   verifies the signature with the public key baked into the app, and then installs the new app content
   in place (the native plugin re-checks the bundle's SHA-256 and rolls back if the new version fails to
   start). When a build also changes the native part, the app offers the new APK instead. */
(function () {
  'use strict';
  const MC = window.CB;
  const APP_ID = 'com.luachsport.chibarti';
  const RELEASES = 'https://github.com/' + MC.REPO + '/releases/';
  const MANIFEST_URLS = [
    RELEASES + 'latest/download/update.json',
    'https://raw.githubusercontent.com/' + MC.REPO + '/main/update.json'
  ];
  MC.APK_URL = RELEASES + 'latest/download/chibarti.apk';

  const U = (MC.update = { state: 'idle', info: null, progress: 0, error: '', checkedAt: 0 });
  const listeners = [];
  MC.onUpdate = (cb) => listeners.push(cb);
  const notify = () => listeners.forEach((cb) => { try { cb(U); } catch (e) { console.warn(e); } });
  const updater = () => MC.plugin('CapacitorUpdater');

  // Tell the native side this version started fine. Without it, a broken update is rolled back automatically.
  if (MC.isNative()) {
    try { const p = updater(); if (p && p.notifyAppReady) p.notifyAppReady().catch(() => {}); } catch (e) { /* not installed in this build */ }
  }

  const b64Bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  async function verify(doc) {
    const jwk = MC.VERSION.updateKey;
    if (!jwk || !window.crypto || !crypto.subtle) throw new Error('no-key');
    if (!doc || typeof doc.payload !== 'string' || typeof doc.sig !== 'string') throw new Error('bad-manifest');
    const ec = jwk.kty === 'EC';
    const importAlg = ec ? { name: 'ECDSA', namedCurve: jwk.crv } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const verifyAlg = ec ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' };
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, crv: jwk.crv, x: jwk.x, y: jwk.y }, importAlg, false, ['verify']);
    const ok = await crypto.subtle.verify(verifyAlg, key, b64Bytes(doc.sig), new TextEncoder().encode(doc.payload));
    if (!ok) throw new Error('bad-signature');
    const p = JSON.parse(doc.payload);
    if (p.app !== APP_ID) throw new Error('wrong-app');
    if (!/^[0-9a-f]{64}$/.test(String(p.sha256 || ''))) throw new Error('bad-checksum');
    if (typeof p.url !== 'string' || p.url.indexOf(RELEASES + 'download/') !== 0) throw new Error('bad-url');
    return p;
  }

  async function fetchManifest() {
    let last = null;
    for (const url of MANIFEST_URLS) {
      try {
        const r = await MC.http(url + '?t=' + Date.now(), { timeout: 15000, as: 'text' });
        if (!r.ok) { last = new Error('http ' + r.status); continue; }
        const doc = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        return await verify(doc);
      } catch (e) { last = e; }
    }
    throw last || new Error('no-manifest');
  }

  async function nativeBuild() {
    try { const i = await MC.callRaw('App', 'getInfo'); return parseInt(i && i.build, 10) || 0; } catch (e) { return 0; }
  }

  MC.currentBuild = () => parseInt(MC.VERSION.build, 10) || 0;
  MC.canSelfUpdate = () => MC.isNative() && !!updater() && !!MC.VERSION.updateKey;

  // Returns U.info when a newer version exists, otherwise null.
  U.check = async (manual) => {
    if (!MC.isNative() || !MC.VERSION.updateKey) return null;
    if (U.state === 'downloading' || U.state === 'applying' || U.state === 'checking') return U.info;
    if (!MC.online()) { if (manual) { U.error = 'אין חיבור לאינטרנט'; notify(); } return U.info; }
    if (!manual && Date.now() - U.checkedAt < 30 * 60e3) return U.info;
    U.state = 'checking'; U.error = ''; notify();
    try {
      const p = await fetchManifest();
      U.checkedAt = Date.now();
      if (+p.build > MC.currentBuild()) {
        const nb = await nativeBuild();
        U.payload = p;
        U.info = { version: String(p.version), build: +p.build, notes: Array.isArray(p.notes) ? p.notes.map(String).slice(0, 8) : [], inApp: !!updater() && nb >= (+p.minNative || 0) };
      } else { U.payload = null; U.info = null; }
      U.state = 'idle';
    } catch (e) {
      console.warn('update check', e && e.message);
      U.state = 'idle';
      if (manual) U.error = 'לא הצלחתי לבדוק כרגע. נסה שוב בעוד רגע.';
    }
    notify();
    return U.info;
  };

  // Downloads, verifies and switches to the new version. The app restarts into it.
  U.apply = async () => {
    const p = U.payload, up = updater();
    if (!p || !U.info || !U.info.inApp || !up) return false;
    if (!MC.online()) { U.error = 'אין חיבור לאינטרנט'; notify(); return false; }
    U.state = 'downloading'; U.progress = 0; U.error = ''; notify();
    let sub = null;
    try { sub = await up.addListener('download', (e) => { U.progress = MC.clamp(+e.percent || 0, 0, 100); notify(); }); } catch (e) { /* progress is optional */ }
    try {
      const bundle = await up.download({ url: p.url, version: p.version + '-b' + p.build, checksum: p.sha256 });
      U.state = 'applying'; notify();
      if (MC.flushSave) await MC.flushSave();
      await MC.sleep(500);
      await up.set({ id: bundle.id });
      return true;
    } catch (e) {
      console.warn('update apply', e && e.message);
      U.state = 'idle';
      U.error = 'העדכון לא הושלם. אפשר לנסות שוב.';
      notify();
      return false;
    } finally {
      try { if (sub && sub.remove) sub.remove(); } catch (e) { /* ignore */ }
    }
  };
})();
