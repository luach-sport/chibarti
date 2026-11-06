/* Taps, typing and long-press. Every button has data-action="name"; its function is CB.A[name]. */
(function () {
  'use strict';
  const CB = window.CB;
  const ui = CB.ui;
  let pressT = null, longDone = false;

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (longDone) { longDone = false; e.preventDefault(); return; }
    const fn = CB.A[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return;
    fn(el, e);
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.draft) { ui.draft = el.value; CB.growComposer(el); return; }
    if (el.dataset.f && ui.sheet) ui.form[el.dataset.f] = el.value;
  }

  function onKey(e) {
    if (e.key === 'Escape' && ui.sheet) CB.closeSheet();
    if (CB.sheetIs('pin') && /^[0-9]$/.test(e.key)) { CB.A['pin-key']({ dataset: { k: e.key } }); e.preventDefault(); }
    if (CB.sheetIs('pin') && e.key === 'Backspace') { CB.A['pin-key']({ dataset: { k: 'del' } }); e.preventDefault(); }
  }

  // Holding a photo for half a second opens its preview (handled by CB.onLongPress).
  function onDown(e) {
    const el = e.target.closest('[data-action]');
    clearTimeout(pressT);
    longDone = false;
    if (!el || !CB.onLongPress) return;
    pressT = setTimeout(() => { if (CB.onLongPress(el)) { longDone = true; CB.haptic(); } }, 480);
  }
  const cancelPress = () => clearTimeout(pressT);

  CB.bindEvents = () => {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    document.addEventListener('touchstart', onDown, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((t) => document.addEventListener(t, cancelPress, { passive: true }));
    document.addEventListener('contextmenu', (e) => { if (e.target.closest('.cell')) e.preventDefault(); });
  };
})();
