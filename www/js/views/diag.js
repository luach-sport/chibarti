/* The connection log (Settings → יומן חיבור): every step of offering, finding and joining, as written by Android.
   When something doesn't work on real phones, the log shows where it stopped. It has no codes or passwords. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;
  const ui = CB.ui;

  CB.loadDiag = async () => {
    try { ui.diag = await CB.N.call('diag'); } catch (e) { ui.diag = { text: '', device: '' }; }
    if (CB.screenName() === 'diag') CB.render(true);
  };

  /** The log as text to send: the phone, the app version, and the newest lines. */
  CB.diagText = (lines) => {
    const d = ui.diag || {}, all = String(d.text || '').trim().split('\n').filter(Boolean);
    return 'חיברתי ' + CB.VERSION.version + ' (בנייה ' + CB.VERSION.build + ') · ' + (d.device || '') + '\n' + all.slice(-(lines || 400)).join('\n');
  };

  V.diag = {
    html: () => {
      const d = ui.diag, lines = d ? String(d.text || '').trim().split('\n').filter(Boolean) : [];
      let h = '<div class="bar-top"><button type="button" class="icon-btn" aria-label="חזרה" data-action="back">' + icon('back') + '</button><h1 class="grow">יומן חיבור</h1>' +
        '<button type="button" class="icon-btn" aria-label="רענון" data-action="diag-refresh">' + icon('refresh') + '</button></div>';
      h += '<p class="fine" style="font-size:14px">כאן נרשם כל שלב: הצעת חיבור, חיפוש, מציאת הטלפון השני, כניסה לרשת שלו ואישור. משהו לא עובד? שולחים את היומן למפתח, וכך רואים בדיוק איפה זה נעצר. אין ביומן קודים או סיסמאות.</p>';
      h += '<div class="diag-acts"><button type="button" class="btn small" data-action="diag-send">' + icon('message', 'sm') + 'שליחה למפתח</button>' +
        '<button type="button" class="btn small secondary" data-action="diag-share">' + icon('share', 'sm') + 'שיתוף</button>' +
        '<button type="button" class="btn small secondary" data-action="diag-copy">' + icon('copy', 'sm') + 'העתקה</button>' +
        (lines.length ? '<button type="button" class="btn small ghost" data-action="diag-clear">' + icon('trash', 'sm') + 'ניקוי</button>' : '') + '</div>';
      if (!d) return h + '<div class="empty"><span class="spin"></span></div>';
      if (!lines.length) return h + '<div class="empty">' + CB.emptyArt() + '<h2>היומן ריק</h2><p>אחרי "התחלת חיבור", "חיפוש בסביבה" או סריקת קוד יופיעו כאן השלבים.</p></div>';
      return h + '<p class="fine dev-line">' + icon('phone', 'xs') + esc(d.device || '') + ' · ' + lines.length + ' שורות</p>' +
        '<pre class="diag-log" dir="ltr" id="diag-log">' + esc(lines.slice(-300).join('\n')) + '</pre>';
    },
    after: (first) => {
      if (first || !ui.diag) CB.loadDiag();
      const pre = document.getElementById('diag-log');
      if (pre) pre.scrollTop = pre.scrollHeight;
    },
    sig: () => (ui.diag ? String(ui.diag.text || '').length : -1) + ''
  };

  const A = CB.A;
  A['open-diag'] = () => { ui.diag = null; CB.pushView({ name: 'diag' }); };
  A['diag-refresh'] = () => CB.loadDiag();
  A['diag-copy'] = async () => {
    const t = CB.diagText();
    const ok = CB.isNative() ? await CB.N.call('copy', { text: t }).then(() => true, () => false) : await CB.writeClipboard(t);
    CB.toast(ok ? 'היומן הועתק' : 'לא הצלחתי להעתיק');
  };
  A['diag-share'] = () => CB.N.call('shareText', { text: CB.diagText(), title: 'יומן חיבור של חיברתי' }).catch(() => CB.shareText(CB.diagText(), 'יומן חיבור'));
  A['diag-send'] = () => CB.openSheet('feedback', { type: 'bug', message: 'מה ניסיתי ומה קרה:\n\n\n---- יומן חיבור ----\n' + CB.diagText(150) });
  A['diag-clear'] = () => CB.confirm('ניקוי היומן', 'למחוק את כל השורות ביומן?', 'ניקוי', async () => { await CB.N.call('diagClear'); CB.loadDiag(); }, true);
})();
