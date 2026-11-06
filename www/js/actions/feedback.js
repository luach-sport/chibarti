/* Feedback form actions: type, send, try again. */
(function () {
  'use strict';
  const CB = window.CB;
  const A = CB.A;
  const ui = CB.ui;

  A['fb-type'] = (el) => { ui.form.type = el.dataset.v; CB.renderSheet(); };
  A['feedback-retry'] = async () => {
    if (!CB.online()) { CB.toast('אין חיבור כרגע'); return; }
    const n = await CB.flushOutbox();
    CB.toast(n ? 'נשלח. תודה!' : 'עדיין לא הצלחתי לשלוח. ננסה שוב לבד.');
  };
  A['send-feedback'] = async () => {
    if (CB.feedbackBusy()) return;
    const f = ui.form, err = CB.feedbackErrors(f);
    f.err = err;
    if (Object.keys(err).length) { CB.renderSheet(); return; }
    CB.state.profile = { name: f.name.trim(), email: f.email.trim() };
    CB.state.outbox.push({ id: CB.uid(), ts: Date.now(), type: f.type, name: f.name.trim(), email: f.email.trim(), message: f.message.trim(), status: 'pending' });
    CB.state.outbox = CB.state.outbox.slice(-30);
    CB.save();
    f.message = ''; f.err = {};
    CB.renderSheet();
    if (!CB.online()) { CB.toast('נשמר. הפנייה תישלח כשיחזור האינטרנט'); return; }
    CB.toast('שולח…', 8000);
    const n = await CB.flushOutbox();
    CB.toast(n ? 'תודה! הפנייה נשלחה' : 'לא הצלחתי לשלוח כרגע. ננסה שוב לבד.');
  };
})();
