/* Moving around: tabs, back, pages, sheets, links, theme, settings toggles, updates and sharing the app. */
(function () {
  'use strict';
  const CB = window.CB;
  const A = CB.A;
  const ui = CB.ui;

  A.noop = () => {};
  A.tab = (el) => {
    const t = el.dataset.tab;
    ui.stack = [];
    if (ui.sheet) CB.closeSheet();
    if (ui.tab === t) { CB.render(); return; }
    ui.tab = t;
    CB.haptic();
    CB.render('restore');
  };
  A['go-home'] = () => { ui.stack = []; ui.tab = 'home'; CB.closeSheet(); CB.render(); };
  A['go-files'] = (el) => { ui.stack = []; ui.tab = 'files'; ui.filesSeg = el.dataset.seg || 'send'; CB.render(); };
  A.quick = (el) => {
    CB.haptic();
    ui.stack = [];
    ui.tab = el.dataset.tab;
    if (el.dataset.seg) ui.filesSeg = el.dataset.seg;
    CB.render();
    if (el.dataset.media && CB.connected()) A['pick-media']();
  };
  A.back = () => { if (ui.sheet) { CB.closeSheet(); return; } if (CB.view()) CB.popView(); };
  A['open-sheet'] = (el) => CB.openSheet(el.dataset.sheet);
  A['close-sheet'] = () => CB.closeSheet();
  A['open-url'] = (el) => CB.openExternal(el.dataset.url);
  A['open-devices'] = () => CB.pushView({ name: 'devices' });
  A['open-setup'] = () => CB.pushView({ name: 'setup' });
  A['confirm-yes'] = () => { const d = ui.sheet && ui.sheet.data; CB.closeSheet(); if (d && d.fn) d.fn(); };

  A['set-theme'] = (el) => { CB.state.settings.theme = el.dataset.v; CB.save(); CB.applyTheme(); CB.render(true); };
  A['set-quality'] = (el) => { CB.state.settings.quality = el.dataset.v; CB.save(); CB.haptic(); CB.render(true); };
  A['toggle-audio'] = async (el) => {
    if (el.getAttribute('aria-disabled') === 'true') return;
    const on = !CB.state.settings.audio;
    if (on && !(await CB.ensureAudioPerm())) { CB.toast('בלי האישור הזה המסך ישותף בלי קול'); }
    CB.state.settings.audio = on;
    CB.save();
    CB.render(true);
  };
  A['toggle-auto'] = () => { CB.state.settings.auto = !CB.state.settings.auto; CB.save(); CB.render(true); };
  A['toggle-haptics'] = () => { CB.state.settings.haptics = !CB.state.settings.haptics; CB.save(); CB.render(true); };

  A['open-settings'] = async (el) => { try { await CB.N.call('openSettings', { what: el.dataset.what || 'app' }); } catch (e) { CB.toast('לא הצלחתי לפתוח את ההגדרות'); } };
  A['enable-wifi'] = async () => {
    const r = await CB.N.call('enableWifi').catch(() => null);
    if (r && !r.panel) { await CB.sleep(1500); await CB.loadEnv(); CB.refresh(); if (CB.sheetIs('needs')) CB.renderSheet(); }
  };
  A['ask-perm'] = async (el) => {
    const k = el.dataset.k;
    const e = await CB.N.call('requestPerms', { which: [k] }).catch(() => null);
    if (e) ui.env = e;
    const missingNow = k === 'network' ? CB.missingFor(ui.env).indexOf('perm') >= 0 : e && e.perms && e.perms[k] === false;
    if (missingNow) CB.toast('אם החלון לא נפתח, מאשרים ב"הגדרות האפליקציה באנדרואיד" ← הרשאות', 4200);
    CB.refresh();
    if (CB.sheetIs('needs')) CB.renderSheet();
  };

  A['check-update'] = async () => {
    await CB.update.check(true);
    if (CB.update.info) CB.openSheet('update');
    else if (CB.update.error) CB.toast(CB.update.error);
    else CB.toast('יש לך את הגרסה האחרונה');
  };
  A['update-now'] = () => CB.update.apply();
  A['update-later'] = () => { if (CB.update.info) { CB.state.updateSeen = CB.update.info.build; CB.save(); } CB.closeSheet(); };

  A['share-app-link'] = () => CB.shareApp.link();
  A['share-app-apk'] = () => CB.shareApp.apk();
  A['share-app-copy'] = async () => { const ok = await CB.writeClipboard(CB.SITE_URL); CB.toast(ok ? 'הקישור הועתק' : 'לא הצלחתי להעתיק'); };
  A['share-app-direct'] = async () => {
    if (!CB.connected()) return;
    CB.toast('מכין את הקובץ…', 6000);
    try {
      const f = await CB.shareApp.file();
      await CB.N.call('sendFiles', { files: [f] });
      CB.closeSheet();
      ui.tab = 'files'; ui.filesSeg = 'send'; ui.stack = [];
      CB.render();
      CB.toast('חיברתי נשלחת לטלפון השני');
    } catch (e) { CB.toast('לא הצלחתי להכין את הקובץ'); }
  };

  // The phone's back button: sheet → page → home tab → leave the app.
  CB.onBack = () => {
    if (ui.sheet) { CB.closeSheet(); return; }
    if (CB.view()) { CB.popView(); return; }
    if (ui.tab !== 'home') { ui.tab = 'home'; CB.render('restore'); return; }
    CB.call('App', 'minimizeApp');
  };
})();
