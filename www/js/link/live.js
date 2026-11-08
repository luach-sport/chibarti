/* What Android says is happening (CB.live): the connection, transfers, screen sharing, requests.
   Every change refreshes only what changed on screen (no jumps); requests that need an answer open by themselves. */
(function () {
  'use strict';
  const CB = window.CB;
  const ui = CB.ui;
  const shown = { req: {}, offer: {}, mirror: false };
  let prevMode = 'idle';

  CB.live = null;
  CB.L = () => CB.live || { mode: 'idle', host: {}, join: {}, scan: { peers: [] }, requests: [], transfers: [], offers: [], devices: [], mirror: { role: 'none' }, me: {} };
  CB.connected = () => CB.L().mode === 'connected' || CB.L().mode === 'reconnecting';
  CB.peerName = () => { const l = CB.L().link; return l ? l.name || 'הטלפון השני' : ''; };

  function autoSheets(s) {
    // 1) a phone asks to connect (most urgent)
    const req = (s.requests || [])[0];
    if (req && !shown.req[req.rid]) {
      shown.req[req.rid] = 1;
      CB.haptic(true);
      CB.openSheet('approve', { rid: req.rid });
      return;
    }
    if (CB.sheetIs('approve') && !(s.requests || []).some((r) => r.rid === ui.sheet.data.rid)) CB.closeSheet();
    // 2) the other phone wants to show its screen
    if (s.mirror && s.mirror.role === 'asked' && !shown.mirror) {
      shown.mirror = true;
      CB.haptic(true);
      CB.openSheet('mirrorAsk');
      return;
    }
    if (!(s.mirror && s.mirror.role === 'asked')) { shown.mirror = false; if (CB.sheetIs('mirrorAsk')) CB.closeSheet(); }
    // 3) the device watching this screen wants to control it (also while the accessibility setting is being turned on)
    const cr = s.control && s.control.role;
    if ((cr === 'asked' || cr === 'setup') && !shown.control) {
      shown.control = true;
      CB.haptic(true);
      CB.openSheet('control');
      return;
    }
    if (cr !== 'asked' && cr !== 'setup') { shown.control = false; if (CB.sheetIs('control')) CB.closeSheet(); }
    // 4) files waiting for approval
    const off = (s.offers || [])[0];
    if (off && !shown.offer[off.tid] && !CB.sheetIs('approve') && !CB.sheetIs('mirrorAsk')) {
      shown.offer[off.tid] = 1;
      CB.haptic(true);
      CB.openSheet('offer', { tid: off.tid });
    }
    if (CB.sheetIs('offer') && !(s.offers || []).some((o) => o.tid === ui.sheet.data.tid)) CB.closeSheet();
  }

  function onState(s) {
    if (!s || typeof s !== 'object') return;
    CB.live = s;
    const mode = s.mode;
    if (mode === 'connected' && prevMode !== 'connected' && prevMode !== 'reconnecting') {
      // connected: close the connect / scan / nearby pages and show the connected home
      const v = CB.view();
      if (v && (v.name === 'host' || v.name === 'pc' || v.name === 'scan' || v.name === 'nearby')) { ui.stack = []; ui.tab = 'home'; CB.render(); }
      CB.haptic(true);
    }
    if (mode === 'hosting' && prevMode !== 'hosting' && !CB.view()) CB.pushView({ name: ui.hostFor === 'pc' ? 'pc' : 'host' });
    prevMode = mode;
    autoSheets(s);
    CB.refresh();
  }

  CB.loadLive = async () => {
    try { onState(await CB.N.call('state')); } catch (e) { console.warn('state', e); }
  };

  CB.listenLive = () => {
    CB.N.on('state', onState);
    CB.N.on('notice', (n) => { if (n) CB.onNotice(n.code, n.detail); });
    CB.N.on('text', (m) => { if (CB.onText) CB.onText(m); });
    CB.N.on('link', () => CB.takeLink());
  };

  // A chibarti://join link opened the app (a QR scanned with the phone's own camera).
  CB.takeLink = async () => {
    try {
      const r = await CB.N.call('pendingLink');
      if (r && r.url) CB.joinWith(r.url);
    } catch (e) { /* none */ }
  };
})();
