/* Getting the user's attention when the phone asks something: a soft tone, and the tab title blinks until the
   window is looked at again. */
(function () {
  'use strict';
  const PC = window.PC;
  const TITLE = document.title;
  let blink = 0, beepAt = 0;

  PC.beep = (hz) => {
    const now = Date.now();
    if (now - beepAt < 800) return;
    beepAt = now;
    try {
      const ac = PC.audioCtx ? PC.audioCtx() : null;
      if (!ac || ac.state !== 'running') return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = hz || 740;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.4);
    } catch (e) { /* no sound */ }
  };

  PC.attention = (what) => {
    if (!document.hidden && document.hasFocus()) return;
    clearInterval(blink);
    let on = false;
    blink = setInterval(() => { on = !on; document.title = on ? '● ' + what : TITLE; }, 1000);
  };

  function back() {
    clearInterval(blink);
    document.title = TITLE;
    if (PC.chatInView && PC.chatInView() && PC.C && PC.C.unread) { PC.C.unread = 0; PC.render(); }
  }
  window.addEventListener('focus', back);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) back(); });

  // The messages panel is on screen (on a narrow window it may be scrolled away)
  PC.chatInView = () => {
    const el = document.getElementById('msgs');
    if (!el || document.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  };

  // The first click anywhere lets the page make sounds (browsers block sound before that).
  document.addEventListener('pointerdown', () => { if (PC.audioCtx) PC.audioCtx(); }, { once: true });
})();
