/* Messages between the computer and the phone (the same TEXT message phones send each other). */
(function () {
  'use strict';
  const PC = window.PC;
  const T = PC.T;
  const C = (PC.C = { msgs: [], unread: 0, reply: null });

  // A quoted message: its id, its start, who wrote it (id and name). Nothing else.
  function cleanReply(r) {
    if (!r || typeof r !== 'object' || !r.id) return null;
    return { id: String(r.id).slice(0, 20), text: String(r.text || '').slice(0, 200), name: String(r.name || '').slice(0, 40), from: /^[0-9a-f]{32}$/.test(String(r.from || '')) ? r.from : '' };
  }
  PC.quoteName = (r) => (r.from && r.from === PC.myId() ? 'אני' : r.name || (PC.L.phone && PC.L.phone.name) || 'הטלפון');

  PC.sendText = (text) => {
    text = String(text || '').replace(/\s+$/, '');
    if (!text.trim()) return false;
    if (text.length > 20000) text = text.slice(0, 20000);
    const m = { id: PC.hex(PC.rand(6)), text, ts: Date.now() };
    if (C.reply) m.reply = cleanReply(C.reply);
    if (!PC.send(T.TEXT, m)) { PC.toast('אין חיבור לטלפון כרגע'); return false; }
    C.msgs.push({ id: m.id, text, ts: m.ts, mine: true, reply: m.reply || null });
    C.reply = null;
    trim();
    PC.render();
    return true;
  };

  // Answering a message: "↩" on it, then the next message carries the quote.
  PC.startReply = (id) => {
    const m = C.msgs.filter((x) => x.id === id)[0];
    if (!m) return;
    const phone = PC.store.get('phone', {}) || {};
    C.reply = { id: m.id, text: m.text, from: m.mine ? PC.myId() : phone.id || '', name: m.mine ? PC.store.get('name', '') || PC.deviceName() : (PC.L.phone && PC.L.phone.name) || phone.name || '' };
    PC.render();
    const say = PC.$('#say');
    if (say) say.focus();
  };

  PC.on(T.TEXT, (b) => {
    const o = PC.json(b);
    const text = String(o.text || '').slice(0, 20000);
    if (!text) return;
    C.msgs.push({ id: String(o.id || '').slice(0, 20), text, ts: Date.now(), mine: false, reply: cleanReply(o.reply) });
    trim();
    if (document.hidden || !PC.chatInView()) { C.unread++; PC.attention('הודעה חדשה'); }
    PC.beep(660);
    PC.render();
  });

  function trim() { if (C.msgs.length > 300) C.msgs.splice(0, C.msgs.length - 300); }

  PC.copyText = (id) => {
    const m = C.msgs.filter((x) => x.id === id)[0];
    if (!m) return;
    const done = () => PC.toast('ההודעה הועתקה');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).then(done, () => fallback(m.text, done));
    else fallback(m.text, done);
  };

  function fallback(text, done) {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* no clipboard */ }
    t.remove();
  }

  // Links in a message open in a new tab; everything else stays plain text.
  PC.linkify = (text) => PC.esc(text).replace(/\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g, (u) => '<a href="' + u + '" target="_blank" rel="noopener noreferrer" dir="ltr">' + u + '</a>');
})();
