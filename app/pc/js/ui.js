/* Drawing the page without jumps: every part (top status, pairing, screen, files, messages) makes its HTML; a part is
   replaced only when its HTML changed, and the numbers that move all the time (progress, speed, frames per second)
   are updated in place by PC.live(). Many changes in a row are drawn once. */
(function () {
  'use strict';
  const PC = window.PC;
  const parts = [];
  const last = {};
  let queued = false;

  /** id: the element; html(): its content; live(el): optional in-place updates; after(el): after it was replaced */
  PC.part = (id, html, live, after) => { parts.push({ id, html, live, after }); };

  function draw() {
    queued = false;
    const on = PC.L.state === 'on' || PC.L.state === 'reconnecting';
    PC.$('#pair').hidden = on;
    PC.$('#desk').hidden = !on;
    document.body.classList.toggle('connected', on);
    for (const p of parts) {
      const el = document.getElementById(p.id);
      if (!el) continue;
      if (el.closest('[hidden]')) { continue; }
      const h = p.html();
      if (h !== last[p.id]) {
        last[p.id] = h;
        el.innerHTML = h;
        if (p.after) p.after(el);
      }
      if (p.live) p.live(el);
    }
  }

  PC.render = () => {
    if (queued) return;
    queued = true;
    Promise.resolve().then(draw);
  };

  PC.live = () => {
    for (const p of parts) {
      if (!p.live) continue;
      const el = document.getElementById(p.id);
      if (el && !el.closest('[hidden]')) p.live(el);
    }
  };

  /** The page must draw a part again even if its HTML looks the same (an element inside was moved away). */
  PC.redraw = (id) => { delete last[id]; PC.render(); };

  // ---------- what the connection tells the parts ----------
  PC.onLinkLost = () => { PC.filesLinkLost(); };
  PC.onResumed = () => { PC.filesResumed(); PC.viewResumed(); PC.shareResumed(); PC.render(); };
  PC.onEnded = () => {
    PC.filesEnded();
    if (PC.S.role !== 'none') PC.stopMirror(false);
  };

  // Elapsed time and connection quality tick by once a second
  setInterval(() => { if (PC.L.state === 'on' || PC.L.state === 'reconnecting') PC.live(); }, 1000);
})();
