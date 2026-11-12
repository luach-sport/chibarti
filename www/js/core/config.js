/* App identity, version and where feedback messages go. */
(function () {
  'use strict';
  const CB = (window.CB = window.CB || {});

  CB.VERSION = window.CHIBARTI_VERSION || { version: '1.4', build: 'dev' };
  CB.APP_ID = 'com.luachsport.chibarti';
  CB.REPO = 'luach-sport/chibarti';
  CB.SITE_URL = 'https://luach-sport.github.io/chibarti/';
  // Feedback goes to the developer's own Google Apps Script (shared with MyCar, שמרתי and קמתי), which e-mails only
  // the developer and says which app the message came from. No e-mail address ships in the app.
  CB.FEEDBACK_URL = 'https://script.google.com/macros/s/AKfycbwuxeoRQSIFoCfTrJqJ_QUeF1JANm0H4PY5Mc00Ns8hBm9K8lvJ2S5hBYQOVtA3lZX1lw/exec';
  CB.FEEDBACK_KEY = 'mc_9-ATPT_LPmYj188PGtCksaLh';
  CB.FEEDBACK_APP = 'chibarti';
  CB.NAME = 'חיברתי';
})();
