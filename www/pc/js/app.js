/* Starts the page: one click handler for every button (data-act="name" runs PC.A[name]), dragging and pasting
   files, the message box, and a quick connection when this computer is already remembered by the phone. */
(function () {
  'use strict';
  const PC = window.PC;

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const fn = PC.A[b.getAttribute('data-act')];
    if (!fn) return;
    if (b.tagName === 'BUTTON' || b.tagName === 'A') e.preventDefault();
    fn(b, e);
  });

  document.addEventListener('dblclick', (e) => { if (e.target.closest('#screenStage')) PC.fullscreen(); });

  PC.A.disconnect = () => PC.disconnect();

  // ---------- pairing ----------
  document.addEventListener('input', (e) => { if (e.target.id === 'pin') PC.pinInput(e.target); });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'pinForm') { e.preventDefault(); PC.A.pair(); }
    if (e.target.id === 'compose') { e.preventDefault(); send(); }
  });

  // ---------- files: choose, drag anywhere on the page, or paste ----------
  const pick = PC.$('#pick');
  pick.addEventListener('change', () => { PC.sendFiles(pick.files); pick.value = ''; });
  PC.$('#drop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } });

  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = PC.L.state === 'on' ? 'copy' : 'none'; } });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    PC.sendFiles(e.dataTransfer.files);
  });
  document.addEventListener('paste', (e) => {
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length && PC.L.state === 'on') { e.preventDefault(); PC.sendFiles(files); }
  });

  // ---------- messages ----------
  const say = PC.$('#say');
  function send() { if (PC.sendText(say.value)) { say.value = ''; grow(); } }
  function grow() { say.style.height = 'auto'; say.style.height = Math.min(160, say.scrollHeight) + 'px'; }
  say.addEventListener('input', grow);
  say.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });

  // ---------- leaving ----------
  window.addEventListener('beforeunload', (e) => {
    if (PC.L.state === 'on' && (PC.F.jobs.some(PC.activeJob) || PC.S.role !== 'none')) { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('pagehide', () => { if (PC.L.state === 'on') PC.send(PC.T.BYE, { reason: 'user' }); });

  PC.render();
  // A phone that remembers this computer: connect at once (no code, no approval on the phone).
  if (PC.store.get('pair', '') && (PC.store.get('phone', null) || {}).name) PC.A.quick();
})();
