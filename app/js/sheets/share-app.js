/* "Share the app" sheet: a link to the site with a short message, or the app itself as an APK file. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;

  const row = (action, ic, label, sub) => '<button type="button" class="row" data-action="' + action + '">' +
    '<span class="lead accent">' + icon(ic) + '</span><span class="grow"><span class="t b">' + esc(label) + '</span><span class="s">' + esc(sub) + '</span></span>' +
    '<span class="chev">' + icon('chevL', 'sm') + '</span></button>';

  CB.SHEETS.shareApp = {
    title: () => 'שיתוף האפליקציה',
    render: () => '<p class="fine" style="font-size:14px">אפשר לשלוח לחברים קישור לאתר של חיברתי, עם הסבר והורדה, או את האפליקציה עצמה כקובץ.</p>' +
      '<div class="card list">' +
      row('share-app-link', 'link', 'שליחת קישור לאתר', 'הודעה קצרה עם הקישור, לוואטסאפ ולכל מקום') +
      row('share-app-apk', 'download', 'שליחת האפליקציה כקובץ (APK)', 'בבלוטות\', בוואטסאפ או במנהל הקבצים. עובד גם בלי אינטרנט') +
      (CB.connected() ? row('share-app-direct', 'phones', 'לשלוח לטלפון המחובר', 'הקובץ עובר ישירות ב-Wi-Fi, ונשמר בהורדות שלו') : '') +
      row('share-app-copy', 'copy', 'העתקת הקישור לאתר', CB.SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '')) +
      '</div>' +
      '<div class="card pad"><span class="section-label" style="display:block;margin:0 0 6px">ההודעה שנשלחת</span><p class="fine" style="font-size:14px;margin:0">' + esc(CB.shareApp.text) + '<br><span class="ltr">' + esc(CB.SITE_URL) + '</span></p></div>'
  };
})();
