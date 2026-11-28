/* "New version" sheet: what's new, and update inside the app (or download a new APK when the engine changed). */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;

  function action(U, i) {
    if (U.state === 'downloading' || U.state === 'applying') {
      return '<div class="field"><span class="label">' + (U.state === 'applying' ? 'מתקין… האפליקציה תיפתח מחדש' : 'מוריד את העדכון… ' + Math.round(U.progress) + '%') + '</span>' +
        '<div class="progress"><span style="width:' + (U.state === 'applying' ? 100 : Math.max(4, U.progress)) + '%"></span></div></div>';
    }
    if (i.inApp) {
      return '<button type="button" class="btn" data-action="update-now">' + icon('download') + 'עדכון עכשיו</button>' +
        '<p class="fine" style="text-align:center">העדכון נכנס בתוך האפליקציה, בלי להתקין קובץ. המכשירים המוכרים וההיסטוריה נשארים.</p>';
    }
    return '<button type="button" class="btn" data-action="open-url" data-url="' + esc(CB.APK_URL) + '">' + icon('download') + 'הורדת הגרסה החדשה</button>' +
      '<p class="fine" style="text-align:center">הגרסה הזו כוללת שינוי במנוע של האפליקציה, ולכן מתקינים אותה פעם אחת מעל הקיימת. המכשירים המוכרים וההיסטוריה נשארים.</p>';
  }

  CB.SHEETS.update = {
    title: () => 'גרסה חדשה',
    render: () => {
      const U = CB.update, i = U.info;
      const mine = 'אצלך: ' + esc(CB.VERSION.version) + ' (בנייה ' + esc(CB.VERSION.build) + ')';
      if (!i) {
        return '<div class="about-head">' + CB.logo(72) + '<h2>חיברתי</h2><span class="ver">' + mine + '</span></div>' +
          '<div class="notice green">' + icon('check', 'sm') + '<span class="grow">יש לך את הגרסה האחרונה.</span></div>' +
          '<button type="button" class="btn secondary" data-action="close-sheet">סגירה</button>';
      }
      let h = '<div class="about-head">' + CB.logo(72) + '<h2>חיברתי ' + esc(i.version) + '</h2><span class="ver">בנייה ' + i.build + ' · ' + mine + '</span></div>';
      if (i.notes.length) h += '<div class="card pad"><span class="section-label" style="display:block;margin:0 0 8px">מה חדש</span><ul class="note-list">' + i.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></div>';
      h += action(U, i);
      if (U.error) h += '<div class="notice accent">' + icon('alert', 'sm') + '<span class="grow">' + esc(U.error) + '</span></div>';
      if (U.state !== 'applying') h += '<button type="button" class="btn secondary" data-action="update-later">אחר כך</button>';
      return h;
    }
  };
})();
