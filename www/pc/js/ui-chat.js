/* The messages panel. A click on a message copies it; links open in a new tab. */
(function () {
  'use strict';
  const PC = window.PC;
  const C = PC.C;

  PC.part('msgs', () => {
    if (!C.msgs.length) return '<p class="empty">' + PC.icon('message', 'lg') + '<span>הודעה או קישור שתכתבו כאן יופיעו מיד בטלפון. לחיצה על הודעה מעתיקה אותה.</span></p>';
    let day = '';
    return C.msgs.map((m) => {
      const d = new Date(m.ts).toDateString();
      const sep = d !== day ? '<div class="day">' + (d === new Date().toDateString() ? 'היום' : new Date(m.ts).toLocaleDateString('he-IL')) + '</div>' : '';
      day = d;
      return sep + '<div class="bubble ' + (m.mine ? 'mine' : 'theirs') + '" data-act="copy-msg" data-id="' + PC.esc(m.id) + '" title="לחיצה מעתיקה"><div class="txt" dir="auto">' + PC.linkify(m.text) + '</div><span class="t">' + PC.time(m.ts) + '</span></div>';
    }).join('');
  }, null, (el) => { el.scrollTop = el.scrollHeight; if (PC.chatInView()) C.unread = 0; });

  PC.A['copy-msg'] = (b, e) => {
    if (e && e.target && e.target.closest('a')) return;
    const sel = window.getSelection && String(window.getSelection());
    if (sel) return; // the user is selecting part of it
    PC.copyText(b.getAttribute('data-id'));
  };
})();
