/* Connecting: start (show the code), scan, nearby list, the 6-digit code, approve, cancel, disconnect, forget. */
(function () {
  'use strict';
  const CB = window.CB;
  const A = CB.A;
  const ui = CB.ui;

  A.host = async () => {
    CB.haptic();
    ui.hostFor = 'phone';
    if (!(await CB.ensureNetwork('host'))) return;
    await CB.N.call('host');
    if (CB.screenName() !== 'host') CB.pushView({ name: 'host' });
  };
  A['host-retry'] = async () => { await CB.N.call('stopHost'); await CB.sleep(300); await CB.N.call('host'); };
  A['show-host'] = () => CB.pushView({ name: ui.hostFor === 'pc' ? 'pc' : 'host' });
  A['stop-host'] = async () => { await CB.N.call('stopHost'); if (CB.screenName() === 'host' || CB.screenName() === 'pc') CB.popView(); };

  // A computer: the same offer as for a phone, with the steps for a browser
  A.pc = async () => {
    CB.haptic();
    ui.hostFor = 'pc';
    if (!(await CB.ensureNetwork('pc'))) return;
    await CB.N.call('host');
    if (CB.screenName() !== 'pc') { if (CB.screenName() === 'host') ui.stack.pop(); CB.pushView({ name: 'pc' }); }
  };

  A.scan = async () => {
    CB.haptic();
    if (!(await CB.ensureNetwork('join'))) return;
    CB.pushView({ name: 'scan' });
  };

  A.nearby = async () => {
    if (!(await CB.ensureNetwork('scan'))) return;
    await CB.N.call('scan');
    if (CB.screenName() !== 'nearby') {
      if (CB.screenName() === 'scan') ui.stack.pop();
      CB.pushView({ name: 'nearby' });
    } else CB.render(true);
  };
  A['scan-stop'] = () => CB.N.call('stopScan');

  /** A QR code (camera or a chibarti:// link): start joining and show the progress on Home. */
  CB.joinWith = async (text) => {
    const r = await CB.N.call('join', { qr: text }).catch(() => ({ error: 'unreachable' }));
    if (r && r.error) {
      const msg = CB.joinError(r.error);
      if (msg) CB.toast(msg, 4200);
      if (CB.screenName() === 'scan') { await CB.sleep(1800); if (CB.screenName() === 'scan') CB.render(); }
      return;
    }
    ui.stack = [];
    ui.tab = 'home';
    CB.render();
  };

  A['peer-connect'] = (el) => {
    if (el.dataset.trusted === '1') { connectPeer(el.dataset.key, '', el.dataset.name); return; }
    CB.openSheet('pin', { key: el.dataset.key, name: el.dataset.name });
  };

  async function connectPeer(key, pin, name) {
    const r = await CB.N.call('connectPeer', { key, pin }).catch(() => ({ error: 'unreachable' }));
    if (r && r.error === 'need-pin') { CB.openSheet('pin', { key, name }); return; }
    if (r && r.error) { CB.toast(CB.joinError(r.error), 4200); return; }
    CB.closeSheet();
    ui.stack = [];
    ui.tab = 'home';
    CB.render();
  }

  A['pin-key'] = (el) => {
    const k = el.dataset.k, f = ui.form;
    f.bad = false;
    if (k === 'del') f.pin = f.pin.slice(0, -1);
    else if (f.pin.length < 6) f.pin += k;
    CB.haptic();
    CB.renderSheet();
    if (f.pin.length === 6) setTimeout(() => { if (CB.sheetIs('pin') && ui.form.pin.length === 6) A['pin-go'](); }, 180);
  };
  A['pin-go'] = () => {
    const d = ui.sheet && ui.sheet.data;
    if (!d || ui.form.pin.length !== 6) return;
    connectPeer(d.key, ui.form.pin, d.name);
  };

  A['toggle-remember'] = () => { ui.form.remember = !ui.form.remember; CB.renderSheet(); };
  A.approve = async (el) => {
    const d = ui.sheet && ui.sheet.data;
    if (!d) return;
    CB.haptic(true);
    await CB.N.call('approve', { rid: d.rid, allow: el.dataset.allow === '1', remember: !!ui.form.remember });
    CB.closeSheet();
  };

  A['cancel-join'] = () => CB.N.call('cancelJoin');
  A.disconnect = () => CB.confirm('ניתוק', 'לנתק את החיבור עם ' + CB.peerName() + '? העברות שעוד לא הסתיימו ייעצרו.', 'ניתוק', () => CB.N.call('disconnect'), true);
  A.forget = (el) => CB.confirm('שכחת המכשיר', 'לשכוח את ' + (el.dataset.name || 'המכשיר') + '? בפעם הבאה צריך קוד ואישור.', 'שכחה', () => CB.N.call('forget', { id: el.dataset.id }), true);

  A['needs-check'] = async () => { await CB.loadEnv(); CB.renderSheet(); };
  A['needs-go'] = () => {
    const then = ui.sheet && ui.sheet.data && ui.sheet.data.then;
    CB.closeSheet();
    if (then === 'host') A.host();
    else if (then === 'pc') A.pc();
    else if (then === 'join') A.scan();
    else if (then === 'scan') A.nearby();
  };
})();
