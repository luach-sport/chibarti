/* The top bar: who the computer is connected to, for how long, and the disconnect button. */
(function () {
  'use strict';
  const PC = window.PC;
  const L = PC.L;

  const since = () => {
    const s = Math.max(0, Math.floor((Date.now() - L.since) / 1000));
    return s < 60 ? 'עכשיו' : s < 3600 ? Math.floor(s / 60) + ' דק׳' : Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ' שע׳';
  };

  PC.part('status', () => {
    if (L.state === 'on') {
      return '<span class="chip ok"><i class="dot"></i>' + PC.esc(PC.pre('מחובר ל', L.phone.name || 'טלפון')) + '<small data-live="since"></small></span>' +
        '<button class="btn ghost sm" data-act="disconnect">' + PC.icon('unlink', 'sm') + 'ניתוק</button>';
    }
    if (L.state === 'reconnecting') return '<span class="chip warn"><i class="dot pulse"></i>החיבור נקטע · מתחבר שוב…</span><button class="btn ghost sm" data-act="disconnect">ניתוק</button>';
    if (L.state === 'pairing') return '<span class="chip"><i class="dot pulse"></i>מתחבר…</span>';
    return '<span class="chip off"><i class="dot"></i>לא מחובר</span>';
  }, (el) => {
    const s = el.querySelector('[data-live="since"]');
    if (s) s.textContent = ' · ' + since();
  });
})();
