/* Controlling the phone whose screen is shown here: "שליטה" asks the phone; once allowed, a mouse click is a tap,
   holding is a long press, dragging is a swipe, the wheel scrolls, right click is "back", and typing on the keyboard
   types in the phone. Sent as INPUT messages (places are fractions of the picture, so any window size works). */
(function () {
  'use strict';
  const PC = window.PC;
  const T = PC.T;
  const S = PC.S;
  const K = (PC.K = { role: 'none', error: '' }); // role: none | asking | controlling
  let askedAt = 0, stroke = null, t0 = 0, lastAdd = 0, wheel = 0, wheelAt = null, wheelTimer = 0, chars = '', charTimer = 0;

  const input = (o) => { if (K.role === 'controlling') PC.send(T.INPUT, o); };

  PC.askControl = () => {
    if (S.role !== 'viewing' || K.role !== 'none') return;
    K.role = 'asking';
    K.error = '';
    askedAt = Date.now();
    const mine = askedAt;
    PC.send(T.CONTROL_ASK, {});
    setTimeout(() => { if (K.role === 'asking' && askedAt === mine) { K.role = 'none'; K.error = 'timeout'; PC.render(); } }, 120000);
    PC.render();
  };

  PC.controlOutStop = (tell) => {
    if (K.role === 'none') return;
    if (tell) PC.send(T.CONTROL_STOP, {});
    K.role = 'none';
    stroke = null;
    PC.render();
  };

  PC.on(T.CONTROL_REPLY, (b) => {
    if (K.role !== 'asking') return;
    const o = PC.json(b);
    if (o.accept) {
      K.role = 'controlling';
      K.error = '';
      PC.toast('אפשר לשלוט: לחיצה = נגיעה בטלפון, קליק ימני = חזרה');
      const st = PC.$('#screenStage');
      if (st) st.focus();
    } else { K.role = 'none'; K.error = o.reason || 'declined'; }
    PC.render();
  });

  // ---------- the mouse on the picture ----------
  function at(e) {
    const c = PC.viewCanvas, r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width), y = (e.clientY - r.top) / Math.max(1, r.height);
    return [Math.round(Math.max(0, Math.min(1, x)) * 10000) / 10000, Math.round(Math.max(0, Math.min(1, y)) * 10000) / 10000, x >= 0 && x <= 1 && y >= 0 && y <= 1];
  }

  const canvas = PC.viewCanvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (K.role !== 'controlling' || e.button !== 0) return;
    const p = at(e);
    if (!p[2]) return;
    e.preventDefault();
    // the keyboard now types into the phone (not into this page's message box)
    const st = PC.$('#screenStage');
    if (st) st.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    t0 = performance.now();
    lastAdd = 0;
    stroke = [[p[0], p[1], 0]];
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    const t = Math.round(performance.now() - t0);
    if (t - lastAdd < 12 || stroke.length >= 400) return;
    lastAdd = t;
    const p = at(e);
    stroke.push([p[0], p[1], t]);
  });
  const end = (e) => {
    if (!stroke) return;
    const p = at(e);
    stroke.push([p[0], p[1], Math.round(performance.now() - t0)]);
    // a click that barely moved is a tap (or a long press when held)
    const a = stroke[0], z = stroke[stroke.length - 1];
    if (Math.abs(a[0] - z[0]) < 0.006 && Math.abs(a[1] - z[1]) < 0.006) stroke = [[a[0], a[1], z[2]]];
    input({ t: 'g', p: stroke });
    stroke = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { stroke = null; });
  canvas.addEventListener('contextmenu', (e) => { if (K.role === 'controlling') { e.preventDefault(); input({ t: 'k', k: 'back' }); } });
  canvas.addEventListener('wheel', (e) => {
    if (K.role !== 'controlling') return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    wheel += (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) / Math.max(1, r.height);
    if (!wheelAt) wheelAt = at(e);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      if (Math.abs(wheel) > 0.01) input({ t: 'w', x: wheelAt[0], y: wheelAt[1], dy: Math.max(-0.6, Math.min(0.6, wheel * 0.8)) });
      wheel = 0;
      wheelAt = null;
    }, 90);
  }, { passive: false });

  // ---------- the keyboard (when not typing in this page's own message box) ----------
  const busyTyping = () => { const a = document.activeElement; return a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT'); };
  const flush = () => { if (chars) { input({ t: 's', s: chars }); chars = ''; } };
  document.addEventListener('keydown', (e) => {
    if (K.role !== 'controlling' || busyTyping() || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // shortcuts stay on the computer (Ctrl+V pastes, below)
    const map = { Backspace: 'backspace', Enter: 'enter', Escape: 'back', Home: 'home' };
    if (map[e.key]) { e.preventDefault(); flush(); input({ t: 'k', k: map[e.key] }); return; }
    if (e.key.length === 1) {
      e.preventDefault();
      chars += e.key;
      clearTimeout(charTimer);
      charTimer = setTimeout(flush, 60);
    }
  });
  document.addEventListener('paste', (e) => {
    if (K.role !== 'controlling' || busyTyping()) return;
    const t = e.clipboardData && e.clipboardData.getData('text');
    if (t) { e.preventDefault(); e.stopImmediatePropagation(); flush(); input({ t: 's', s: t.slice(0, 5000) }); }
  }, true);

  PC.A['ctl-ask'] = () => (K.role === 'none' ? PC.askControl() : PC.controlOutStop(true));
  PC.A['ctl-key'] = (b) => input({ t: 'k', k: b.getAttribute('data-k') });
})();
