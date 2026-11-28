/* Drawing the current screen: a page on top (connect, scan, nearby, devices, history, setup) or a tab.
   CB.render() draws it all; CB.refresh() (on every change from Android) redraws only when the screen's structure
   changed, otherwise it updates numbers and bars in place, so nothing jumps, flickers or loses focus. */
(function () {
  'use strict';
  const CB = window.CB;
  const ui = CB.ui;
  let lastSig = '', lastName = '';

  const scrollKey = () => { const v = CB.view(); return v ? v.name : 'tab-' + ui.tab; };

  CB.screenName = () => { const v = CB.view(); return v ? v.name : ui.tab; };

  function current() { return CB.views[CB.screenName()] || CB.views.home; }

  CB.render = (keepScroll) => {
    const main = CB.$('#screen');
    const v = CB.view();
    const prevKey = main.dataset.key;
    if (prevKey) ui.scroll[prevKey] = window.scrollY;
    const name = CB.screenName(), V = current();
    if (name !== lastName && CB.views[lastName] && CB.views[lastName].leave) CB.views[lastName].leave();
    document.body.classList.toggle('no-tabs', !!v);
    document.body.classList.toggle('chat', !v && ui.tab === 'text');
    main.classList.toggle('pushed', !!v);
    main.innerHTML = V.html();
    if (name !== lastName) { main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); }
    const key = scrollKey();
    main.dataset.key = key;
    lastSig = V.sig ? V.sig() : '';
    const changedScreen = name !== lastName;
    lastName = name;
    // the typing bar is kept when it's already there, so the keyboard doesn't close on every new message
    const onText = !v && ui.tab === 'text';
    if (onText && document.getElementById('composer')) CB.views.composerUpdate();
    else {
      CB.$('#composer-root').innerHTML = onText ? CB.views.composer() : '';
      if (onText && CB.views.text.restoreDraft) CB.views.text.restoreDraft();
    }
    document.querySelectorAll('#tabs button[data-tab]').forEach((b) => {
      if (b.getAttribute('data-tab') === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    CB.tabBadges();
    if (V.after) V.after(changedScreen);
    if (keepScroll === true && prevKey === key) window.scrollTo(0, ui.scroll[key] || 0);
    else if (keepScroll === 'restore') window.scrollTo(0, ui.scroll[key] || 0);
    else if (keepScroll !== 'none') window.scrollTo(0, 0);
  };

  /** Something changed on the Android side: redraw only what's needed. */
  CB.refresh = () => {
    const V = current();
    const sig = V.sig ? V.sig() : '';
    if (sig !== lastSig) CB.render(true);
    else if (V.live) V.live();
    if (ui.sheet) {
      const S = CB.SHEETS[ui.sheet.name];
      if (S && S.live) S.live(ui.sheet.data);
      else if (S && S.sig) { const s2 = S.sig(ui.sheet.data); if (s2 !== ui.sheet.sig) { ui.sheet.sig = s2; CB.renderSheet(); } }
    }
    CB.tabBadges();
  };

  CB.tabBadges = () => {
    const L = CB.L();
    const set = (tab, on) => { const b = document.querySelector('#tabs button[data-tab="' + tab + '"] .dot'); if (b) b.classList.toggle('on', !!on); };
    set('text', (L.textCount || 0) > (CB.state ? CB.state.readTexts : 0) && ui.tab !== 'text');
    set('cast', L.mirror && L.mirror.role !== 'none');
    set('files', (L.transfers || []).some((t) => ['sending', 'receiving', 'asking', 'paused', 'interrupted'].indexOf(t.state) >= 0) && ui.tab !== 'files');
  };

  CB.pushView = (v) => { ui.scroll[scrollKey()] = window.scrollY; ui.stack.push(v); CB.render(); };
  CB.popView = () => { ui.stack.pop(); CB.render('restore'); };
  // Replaces just one part of the screen (keeps focus, the camera and scroll).
  CB.part = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
  CB.setText = (id, text) => { const el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; };
  CB.setWidth = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = pct + '%'; };
})();
