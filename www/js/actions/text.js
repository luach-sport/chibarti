/* Messages: send, paste (only when pressed), copy, clear. */
(function () {
  'use strict';
  const CB = window.CB;
  const A = CB.A;
  const ui = CB.ui;

  A['text-send'] = async () => {
    const t = document.getElementById('composer');
    const text = t ? t.value.trim() : '';
    if (!text) { if (t) t.focus(); return; }
    if (!CB.connected()) { CB.toast('קודם מחברים את שני הטלפונים'); return; }
    try {
      await CB.N.call('sendText', { text });
      t.value = '';
      ui.draft = '';
      CB.growComposer(t);
      t.focus();
      CB.haptic();
    } catch (e) { CB.toast('ההודעה לא נשלחה. בודקים את החיבור'); }
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
