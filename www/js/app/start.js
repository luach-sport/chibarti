/* Start-up: load the app's data, ask Android what's going on (connected? hosting? transfers?), draw the first
   screen, and keep listening: Android's changes, coming back to the app, the back button, internet, new versions. */
(function () {
  'use strict';
  const CB = window.CB;
  const ui = CB.ui;

  async function autoUpdateCheck() {
    const info = await CB.update.check(false);
    if (info && info.build > (CB.state.updateSeen || 0) && !ui.sheet && !CB.view() && !CB.connected()) CB.openSheet('update');
  }
  function background() { CB.flushOutbox(); autoUpdateCheck(); }

  function listenToPhone() {
    CB.listenLive();
    if (!CB.isNative()) return;
    CB.listen('App', 'backButton', CB.onBack);
    CB.listen('App', 'appStateChange', async (st) => {
      if (!(st && st.isActive)) { CB.flushSave(); if (CB.screenName() === 'scan') CB.scanner.stop(); return; }
      await CB.loadLive();
      await CB.loadEnv();
      CB.refresh();
      if (CB.screenName() === 'scan' && !CB.scanner.running()) CB.render();
      background();
    });
  }

  // Once a second: the code's countdown and the "connected for" clock (in place, no redraw).
  function tick() {
    const n = CB.screenName();
    if (n === 'host') CB.views.host.tick();
    else if (n === 'home' && CB.L().link) CB.views.home.live();
  }

  async function init() {
    CB.bindEvents();
    await CB.initNetwork();
    CB.state = CB.normalize(await CB.loadState());
    if (!CB.state.setupDone) { CB.state.setupDone = true; CB.save(); }
    CB.applyTheme();
    CB.watchSystemTheme();
    listenToPhone();
    await CB.loadLive();
    CB.render();
    CB.loadEnv().then(() => CB.refresh());
    CB.loadHistory();
    CB.takeLink();
    CB.onUpdate(() => {
      if (CB.sheetIs('update')) CB.renderSheet();
      else if (!ui.sheet && ui.tab === 'settings' && !CB.view()) CB.refresh();
    });
    CB.onNetwork((on) => { if (CB.sheetIs('feedback')) CB.renderSheet(); if (on) background(); });
    setInterval(tick, 1000);
    setTimeout(background, 4000);
  }

  // Small test surface for automated checks and the site's screenshots.
  window.__chibarti = { get ui() { return ui; }, A: CB.A, CB, render: CB.render, openSheet: CB.openSheet, closeSheet: CB.closeSheet, normalize: CB.normalize };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
