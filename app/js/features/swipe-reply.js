/* Dragging a message to the left answers it (like in WhatsApp): the message follows the finger, an arrow appears,
   and past the line it becomes "answering …" above the typing bar. Scrolling up and down is left alone. */
(function () {
  'use strict';
  const CB = window.CB;
  const LIMIT = 72, GO = 52;
  let s = null;

  document.addEventListener('touchstart', (e) => {
    const m = e.target && e.target.closest ? e.target.closest('#thread .msg') : null;
    if (!m || e.touches.length !== 1 || e.target.closest('a, button')) { s = null; return; }
    s = { m, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, on: false, dead: false };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!s || s.dead) return;
    const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s.dead = true; return; }
      if (dx > -12) return;
      s.on = true;
      s.m.classList.add('swiping');
    }
    s.dx = Math.max(-LIMIT, Math.min(0, dx));
    s.m.style.transform = 'translateX(' + s.dx + 'px)';
    const armed = s.dx <= -GO;
    if (armed && !s.m.classList.contains('armed')) CB.haptic();
    s.m.classList.toggle('armed', armed);
  }, { passive: true });

  const end = () => {
    if (!s) return;
    const m = s.m, go = s.on && s.dx <= -GO;
    m.classList.remove('swiping', 'armed');
    m.style.transform = '';
    s = null;
    if (go) CB.startReply(m.getAttribute('data-id'));
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
})();
