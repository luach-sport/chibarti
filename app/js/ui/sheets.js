/* Bottom sheets (dialogs). Each sheet in js/sheets/ has: title(), render(), and optional init(), onClose(), onShow(), full. */
(function () {
  'use strict';
  const CB = window.CB;
  const ui = CB.ui;
  const SHEETS = CB.SHEETS;

  CB.openSheet = (name, data) => {
    if (ui.sheet) CB.closeSheet();
    ui.sheet = { name, data: data || {} };
    if (SHEETS[name].init) SHEETS[name].init(ui.sheet.data);
    CB.renderSheet();
    const first = CB.$('#sheet-root [autofocus]');
    if (first) setTimeout(() => first.focus(), 80);
    if (SHEETS[name].onShow) SHEETS[name].onShow(ui.sheet.data);
  };

  CB.closeSheet = () => {
    if (!ui.sheet) return;
    const def = SHEETS[ui.sheet.name];
    ui.sheet = null;
    if (def.onClose) def.onClose();
    CB.$('#sheet-root').innerHTML = '';
  };

  CB.renderSheet = () => {
    const root = CB.$('#sheet-root');
    if (!ui.sheet) { root.innerHTML = ''; return; }
    const def = SHEETS[ui.sheet.name];
    const body = def.render(ui.sheet.data);
    const prev = root.querySelector('.sheet');
    const st = prev ? prev.scrollTop : 0;
    const title = def.title(ui.sheet.data);
    root.innerHTML = '<div class="sheet-wrap"><div class="sheet-backdrop" data-action="close-sheet"></div>' +
      '<div class="sheet' + (def.full ? ' full' : '') + '" role="dialog" aria-modal="true" aria-label="' + CB.esc(title) + '">' +
      '<div class="grabber" aria-hidden="true"></div>' +
      '<div class="sheet-head"><button type="button" class="icon-btn" aria-label="סגירה" data-action="close-sheet">' + CB.icon('close') + '</button><h2>' + CB.esc(title) + '</h2></div>' +
      body + '</div></div>';
    if (prev) {
      const s = root.querySelector('.sheet');
      if (s) { s.style.animation = 'none'; s.scrollTop = st; const b = root.querySelector('.sheet-backdrop'); if (b) b.style.animation = 'none'; }
    }
  };
  CB.sheetIs = (name) => !!ui.sheet && ui.sheet.name === name;

  // A list row that can be picked (used by several sheets).
  CB.pickRow = (action, v, label, on, sub, extra) => '<button type="button" class="row" data-action="' + action + '" data-v="' + CB.esc(v) + '" aria-pressed="' + on + '"' + (extra || '') + '>' +
    '<span class="grow"><span class="t">' + CB.esc(label) + '</span>' + (sub ? '<span class="s">' + CB.esc(sub) + '</span>' : '') + '</span>' + (on ? '<span class="check">' + CB.icon('check') + '</span>' : '') + '</button>';
})();
