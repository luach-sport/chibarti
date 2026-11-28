/* Smaller sheets: rename this phone, privacy and security, a photo preview, and "are you sure?". */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const ui = CB.ui;

  CB.SHEETS.rename = {
    title: () => 'השם של הטלפון הזה',
    init: () => { const me = CB.L().me || {}; ui.form = { name: me.custom || me.name || '' }; },
    render: () => '<p class="fine" style="font-size:14px">כך הטלפון השני יראה אותו ברשימה ובבקשת החיבור.</p>' +
      '<div class="field"><label for="rn">שם</label><input id="rn" class="input" data-f="name" maxlength="40" value="' + esc(ui.form.name) + '" autofocus></div>' +
      '<div class="btn-row"><button type="button" class="btn secondary" data-action="rename-reset">שם הדגם</button><button type="button" class="btn" data-action="rename-save">' + icon('check') + 'שמירה</button></div>'
  };

  CB.SHEETS.privacy = {
    title: () => 'פרטיות ואבטחה',
    render: () => {
      const li = (ic, t, s) => '<div class="row"><span class="tile ok">' + icon(ic) + '</span><span class="grow"><span class="t">' + t + '</span><span class="s">' + s + '</span></span></div>';
      return '<div class="card list">' +
        li('phones', 'ישירות בין הטלפונים', 'שום דבר לא עובר דרך אינטרנט, ענן או שרת. גם לא אצל המפתח.') +
        li('lock', 'מוצפן', 'כל חיבור מוצפן במפתח חדש (ECDH + AES-256-GCM). קוד ה-QR ו-6 הספרות תקפים לחיבור אחד ול-10 דקות לכל היותר.') +
        li('check', 'רק באישור', 'טלפון חדש מתחבר רק אחרי שאישרת. קבצים נשמרים רק אחרי שאישרת. שיתוף מסך רק אחרי שאישרת.') +
        li('shield', 'בדיקת קבצים', 'כל קובץ נבדק ב-SHA-256. קובץ שהגיע פגום נמחק ולא נשמר. קבצי APK לא מותקנים לבד.') +
        li('paste', 'הלוח', 'חיברתי קוראת את הלוח רק כשלוחצים "הדבקה", אף פעם לא ברקע.') +
        li('history', 'מה נשמר', 'רק בטלפון: היסטוריית ההעברות, ההודעות, והמכשירים שבחרת לזכור. אפשר למחוק הכל.') + '</div>' +
        '<button type="button" class="btn secondary" data-action="close-sheet">סגירה</button>';
    }
  };

  CB.SHEETS.preview = {
    title: (d) => d.name || 'תצוגה',
    render: (d) => '<div class="card" style="overflow:hidden;border-radius:20px;min-height:220px;display:flex;align-items:center;justify-content:center;background:var(--inset)" id="pv-box">' +
      '<span class="fine">טוען תצוגה…</span></div><p class="fine num" style="text-align:center">' + esc(d.name) + ' · ' + CB.bytes(d.size) + '</p>' +
      '<button type="button" class="btn secondary" data-action="close-sheet">סגירה</button>',
    onShow: (d) => {
      CB.thumb(d.uri, d.mime, 900).then((src) => CB.part('pv-box', src ? '<img alt="" src="' + src + '" style="display:block;width:100%;height:auto">' : '<span class="fine">אין תצוגה לקובץ הזה</span>'));
    }
  };

  CB.SHEETS.confirm = {
    title: (d) => d.title,
    render: (d) => '<p style="margin:0;font-size:15px;line-height:1.6">' + esc(d.text) + '</p>' +
      '<div class="btn-row"><button type="button" class="btn secondary" data-action="close-sheet">ביטול</button><button type="button" class="btn' + (d.danger ? ' danger' : '') + '" data-action="confirm-yes">' + esc(d.yes || 'אישור') + '</button></div>'
  };
  CB.confirm = (title, text, yes, fn, danger) => CB.openSheet('confirm', { title, text, yes, fn, danger });
})();
