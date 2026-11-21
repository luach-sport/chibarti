/* Messages: send, paste (only when pressed), copy, clear. */
(function () {
  'use strict';
  const CB = window.CB;
  const A = CB.A;
  const ui = CB.ui;

  /**
   * Empties the typing bar right away. Android keyboards keep the word they are still "composing" and write it back
   * into an emptied box: leaving the box for a moment ends that word, and anything that comes back from the end of
   * the sent message is removed again.
   */
  CB.emptyComposer = (t, sent) => {
    t.value = '';
    ui.draft = '';
    t.blur();
    t.value = '';
    t.focus();
    const again = () => {
      const v = t.value.trim();
      if (v && sent.slice(-v.length) === v) { t.value = ''; ui.draft = ''; }
      CB.growComposer(t);
    };
    setTimeout(again, 60);
    setTimeout(again, 350);
  };

  A['text-send'] = async () => {
    const t = document.getElementById('composer');
    const text = t ? t.value.trim() : '';
    if (!text) { if (t) t.focus(); return; }
    if (!CB.connected()) { CB.toast('קודם מחברים את שני הטלפונים'); return; }
    const r = ui.reply;
    const reply = r ? { id: r.id, text: CB.clip(r.text, 200), name: r.name, from: r.from } : null;
    CB.emptyComposer(t, text);
    try {
      await CB.N.call('sendText', reply ? { text, reply } : { text });
      ui.reply = null;
      CB.replyBar();
      CB.haptic();
    } catch (e) {
      t.value = text;
      ui.draft = text;
      CB.growComposer(t);
      CB.toast('ההודעה לא נשלחה. בודקים את החיבור');
    }
  };

  // Answering a message (from its "תגובה" button, or by dragging it to the left).
  CB.startReply = (id) => {
    const m = (ui.texts || []).filter((x) => x.id === id)[0];
    if (!m) return;
    const L = CB.L();
    ui.reply = { id: m.id, text: m.text, from: m.mine ? (L.me || {}).id : (L.link || {}).peerId, name: m.mine ? (L.me || {}).name : m.peer || CB.peerName() };
    CB.replyBar();
    CB.haptic();
    const t = document.getElementById('composer');
    if (t) t.focus();
  };
  A['text-reply'] = (el) => CB.startReply(el.dataset.id);
  A['reply-cancel'] = () => { ui.reply = null; CB.replyBar(); };
  A['quote-jump'] = (el) => {
    const m = document.querySelector('#thread .msg[data-id="' + String(el.dataset.id).replace(/[^0-9a-zA-Z_-]/g, '') + '"]');
    if (!m) { CB.toast('ההודעה המקורית כבר לא כאן'); return; }
    m.scrollIntoView({ block: 'center', behavior: 'smooth' });
    m.classList.remove('flash');
    void m.offsetWidth;
    m.classList.add('flash');
  };
  A['text-paste'] = async () => {
    const r = await CB.N.call('paste').catch(() => null);
    const t = document.getElementById('composer');
    if (!r || !r.text) { CB.toast('הלוח ריק'); return; }
    if (t) { t.value = (t.value ? t.value + ' ' : '') + r.text; ui.draft = t.value; CB.growComposer(t); t.focus(); }
  };
  A['text-copy'] = async (el) => {
    const m = (ui.texts || []).filter((x) => x.id === el.dataset.id)[0];
    if (!m) return;
    if (CB.isNative()) await CB.N.call('copy', { text: m.text }).catch(() => null);
    else await CB.writeClipboard(m.text);
    CB.haptic();
    CB.toast('הועתק ללוח');
  };
  A['texts-clear'] = () => CB.confirm('ניקוי ההודעות', 'למחוק את כל ההודעות מהטלפון הזה?', 'ניקוי', async () => {
    await CB.N.call('clearTexts');
    ui.texts = [];
    CB.render(true);
  }, true);
})();
