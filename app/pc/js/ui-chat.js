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
      const q = m.reply ? '<button type="button" class="quote" data-act="quote-jump" data-id="' + PC.esc(m.reply.id) + '"><b>' + PC.esc(PC.quoteName(m.reply)) + '</b><span dir="auto">' + PC.esc(m.reply.text.slice(0, 90)) + '</span></button>' : '';
      return sep + '<div class="bubble ' + (m.mine ? 'mine' : 'theirs') + '" data-act="copy-msg" data-id="' + PC.esc(m.id) + '" title="לחיצה מעתיקה">' + q + '<div class="txt" dir="auto">' + PC.linkify(m.text) + '</div>' +
        '<span class="t">' + PC.time(m.ts) + '</span><button type="button" class="rep" data-act="reply-msg" data-id="' + PC.esc(m.id) + '" title="תגובה להודעה" aria-label="תגובה להודעה">' + PC.icon('reply') + '</button></div>';
    }).join('');
  }, null, (el) => { el.scrollTop = el.scrollHeight; if (PC.chatInView()) C.unread = 0; });

  // "Answering …" above the typing box, with ✕.
  PC.part('replyBar', () => {
    const r = C.reply;
    if (!r) return '';
    return '<span class="grow"><b>' + PC.esc(r.from === PC.myId() ? 'בתגובה להודעה שלי' : 'בתגובה ל' + (r.name || 'הטלפון')) + '</b><span dir="auto">' + PC.esc(r.text.slice(0, 120)) + '</span></span>' +
      '<button type="button" class="x" data-act="reply-cancel" aria-label="ביטול התגובה">✕</button>';
  });

  PC.A['reply-msg'] = (b) => PC.startReply(b.getAttribute('data-id'));
  PC.A['reply-cancel'] = () => { C.reply = null; PC.render(); };
  PC.A['quote-jump'] = (b) => {
    const el = document.querySelector('#msgs .bubble[data-id="' + String(b.getAttribute('data-id')).replace(/[^0-9a-zA-Z_-]/g, '') + '"]');
    if (!el) { PC.toast('ההודעה המקורית כבר לא כאן'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };

  PC.A['copy-msg'] = (b, e) => {
    if (e && e.target && e.target.closest('a')) return;
    const sel = window.getSelection && String(window.getSelection());
    if (sel) return; // the user is selecting part of it
    PC.copyText(b.getAttribute('data-id'));
  };
})();
