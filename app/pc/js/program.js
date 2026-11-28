/* Inside the חיברתי program for Windows (window.PC_PROGRAM is set by the program; a browser page skips all this).
   The program finds the phones on the network that offer a connection; the page connects through it. A phone that
   remembers this computer is connected at once; a phone that scanned this computer's QR code too (that scan is the
   approval). Otherwise, the 6-digit code still works. */
(function () {
  'use strict';
  const P = window.PC_PROGRAM;
  if (!P) return;
  const PC = window.PC;
  const L = PC.L;
  PC.program = P;
  P.claim = PC.hex(PC.rand(16));
  P.found = [];
  P.searched = false;
  const tried = {};
  const head = { 'X-Chibarti': P.token };

  PC.wsUrl = (ph) => 'ws://' + location.host + '/ws?t=' + encodeURIComponent(P.token) + '&ip=' + encodeURIComponent(ph.ip) + '&port=' + ph.port + '&id=' + encodeURIComponent(ph.id);
  PC.claimQr = () => 'chibarti://pc?v=1&k=' + P.claim + '&n=' + encodeURIComponent(PC.store.get('name', '') || PC.deviceName());

  // the program closes by itself a little after its window is closed
  setInterval(() => { fetch('/api/beat', { headers: head }).catch(() => {}); }, 2000);

  let looking = false;
  async function look() {
    if (L.state !== 'off' || looking) return;
    looking = true;
    try { await lookOnce(); } finally { looking = false; }
  }

  async function lookOnce() {
    let list = [];
    try { const r = await fetch('/api/phones', { headers: head }); list = r.ok ? await r.json() : []; } catch (e) { list = []; }
    const sig = JSON.stringify(list.map((x) => x.id + x.ip));
    P.searched = true;
    if (sig !== P.sig) { P.sig = sig; P.found = list; PC.render(); }
    if (L.state !== 'off') return;
    const mine = (PC.store.get('phone', null) || {}).id, pair = PC.store.get('pair', '');
    for (const ph of list) {
      const now = Date.now();
      if (tried[ph.id] && now - tried[ph.id] < 5000) continue;
      tried[ph.id] = now;
      PC.target = ph;
      // remembered → connect; any other phone → maybe it scanned our QR code
      const err = pair && ph.id === mine ? await PC.connect('trusted', '', true, true) : await PC.connect('claim', P.claim, true, true);
      if (!err) return;
      if (err === 'unknown' && ph.id === mine) { PC.store.set('pair', ''); PC.render(); }
      // the remembered phone answered with another certificate (reinstalled, or not that phone): pair again
      if (err === 'changed' && P.note !== 'changed') { P.note = 'changed'; PC.render(); }
      if (L.state !== 'off') return;
    }
  }
  setInterval(look, 2000);
  setTimeout(look, 300);

  /** "התחברות עם קוד" to one of the phones found. */
  PC.A['prog-code'] = (b) => {
    const ph = P.found.filter((x) => x.id === b.getAttribute('data-id'))[0];
    if (!ph) return;
    PC.target = ph;
    PC.P.useCode = true;
    PC.P.codeFor = ph.name;
    PC.render();
  };
  PC.A['prog-back'] = () => { PC.P.useCode = false; PC.render(); };
})();
