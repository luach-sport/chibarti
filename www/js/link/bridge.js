/* The door to the Android side (ChibartiPlugin.java). In a browser (the site's screenshots, the tests) a small
   stand-in plays Android's part: CB.sim holds a pretend state and answers the same calls. */
(function () {
  'use strict';
  const CB = window.CB;
  const listeners = {};

  CB.N = {
    call: (method, args) => {
      if (CB.isNative()) return CB.callRaw('Chibarti', method, args || {});
      return Promise.resolve(CB.sim.call(method, args || {}));
    },
    on: (event, cb) => {
      if (CB.isNative()) { CB.listen('Chibarti', event, cb); return; }
      (listeners[event] = listeners[event] || []).push(cb);
    }
  };

  // ---------- the browser stand-in ----------
  const now = () => Date.now();
  const base = () => ({
    me: { id: '0123456789abcdef0123456789abcdef', name: 'Galaxy A54', custom: '' },
    mode: 'idle',
    host: { on: false, ready: false, method: 'd', error: '' },
    join: { on: false, step: '', name: '', error: '' },
    scan: { on: false, error: '', peers: [] },
    requests: [], transfers: [], offers: [], devices: [],
    mirror: { role: 'none', state: '', error: '' },
    textCount: 0
  });
  const S = { snap: base(), texts: [], history: [], env: null };
  const emit = (ev, data) => (listeners[ev] || []).forEach((cb) => { try { cb(data); } catch (e) { console.warn(e); } });
  const changed = () => emit('state', CB.copy(S.snap));

  const env = () => S.env || {
    sdk: 33, release: '13', model: 'Browser', p2p: true, camera: true, audioCapture: true, wifiOn: true, locationOn: true, locationNeeded: false,
    perms: { nearby: true, notifications: true, audio: false, camera: true }, batteryFree: false, folder: '', folderName: ''
  };

  CB.sim = {
    S,
    set: (patch) => { Object.keys(patch).forEach((k) => { S.snap[k] = patch[k]; }); changed(); },
    reset: () => { S.snap = base(); S.texts = []; S.history = []; changed(); },
    emit,
    call: (m, a) => {
      const s = S.snap;
      switch (m) {
        case 'state': return CB.copy(s);
        case 'env': case 'requestPerms': return env();
        case 'texts': return { items: S.texts.slice() };
        case 'history': return { items: S.history.slice() };
        case 'devices': return { items: s.devices };
        case 'host':
          s.mode = 'hosting';
          s.host = { on: true, ready: true, method: 'd', error: '', network: 'DIRECT-k7-Galaxy A54', pin: '482193', expiresAt: now() + 9.5 * 60e3,
            pass: 'k7Rw2pQx', addresses: ['192.168.49.1', '192.168.1.23'], web: { http: 8080, https: 8443, fp: 'AC:3D:A3:5D:2A:1E:91:AD' },
            qr: 'chibarti://join?v=1&i=0123456789abcdef0123456789abcdef&n=Galaxy%20A54&t=Qm9vbS1ib29tLWJvb20tIQ&m=d&s=DIRECT-k7-Galaxy&k=pass1234&a=192.168.49.1&p=47821&e=' + Math.round(now() / 1000 + 600) };
          changed(); return {};
        case 'stopHost': s.mode = 'idle'; s.host = base().host; changed(); return {};
        case 'scan': s.scan = { on: true, error: '', peers: [
          { key: 'p:aa', id: 'b1', name: 'Redmi Note 9', via: 'wifi-direct', app: true, trusted: true },
          { key: 'l:b2', id: 'b2', name: 'הטאבלט של אבא', via: 'wifi', app: true, trusted: false },
          { key: 'p:cc', id: '', name: 'DIRECT-TV-Living', via: 'wifi-direct', app: false, trusted: false }] };
          changed(); return {};
        case 'stopScan': s.scan.on = false; changed(); return {};
        case 'join': case 'connectPeer': s.mode = 'joining'; s.join = { on: true, step: 'network', name: 'Redmi Note 9', error: '' }; changed(); return { error: '' };
        case 'cancelJoin': s.mode = 'idle'; s.join = base().join; changed(); return {};
        case 'disconnect': S.snap = Object.assign(base(), { devices: s.devices }); changed(); return {};
        case 'sendText': {
          const msg = { id: CB.uid(), text: a.text, ts: now(), mine: true, peer: s.link ? s.link.name : '' };
          S.texts.push(msg); s.textCount = S.texts.length; emit('text', msg); changed(); return {};
        }
        case 'paste': return { text: 'https://example.com' };
        case 'pickFiles': return { files: a.media
          ? [1, 2, 3, 4, 5, 6].map((i) => ({ uri: 'sim://p' + i, name: 'IMG_20' + i + '.jpg', size: 2400000 + i * 300000, mime: i === 3 ? 'video/mp4' : 'image/jpeg' }))
          : [{ uri: 'sim://d1', name: 'חוזה שכירות.pdf', size: 845000, mime: 'application/pdf' }, { uri: 'sim://d2', name: 'תמונות טיול.zip', size: 312000000, mime: 'application/zip' }] };
        case 'thumb': return { data: '' };
        case 'sendFiles': return { tid: 1 };
        case 'pickFolder': return { uri: '', name: '' };
        case 'mirrorStart': return { ok: false };
        default: return {};
      }
    }
  };
})();
