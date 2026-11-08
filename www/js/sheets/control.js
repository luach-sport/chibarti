/* Remote control of this phone: the connected device (a phone or a computer) asks while it watches this screen.
   Allowing turns on taps, swipes and typing from there. That needs the small add-on "חיברתי – שליטה" (Play Protect
   blocks apps with an accessibility service, so it's kept out of the app): the first time, the sheet walks through
   downloading it and turning it on once; the answer goes out by itself as soon as it's ready. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;

  CB.SHEETS.control = {
    title: () => 'שליטה מרחוק',
    render: () => {
      const c = CB.L().control || {}, pc = (CB.L().link || {}).kind === 'pc', who = esc(CB.peerName());
      if (c.role === 'install') {
        return '<div class="req-head"><span class="avatar">' + icon('download', 'lg') + '</span><h3>פעם אחת: התוסף לשליטה</h3>' +
          '<p>כדי שאפשר יהיה לשלוט בטלפון הזה צריך את התוסף הקטן <b>חיברתי – שליטה</b>.</p></div>' +
          '<div class="how"><span class="n">1</span><span>מורידים את התוסף (קובץ קטן)</span>' +
          '<span class="n">2</span><span>פותחים את הקובץ ומתקינים</span>' +
          '<span class="n">3</span><span>חוזרים לכאן וממשיכים</span></div>' +
          '<p class="fine"><b>Play Protect חוסם?</b> הוא חוסם כל אפליקציה שיכולה ללחוץ על המסך. ב-Play Protect (בכפתור למטה) לוחצים על ⚙ ומכבים את "סריקת אפליקציות", מתקינים, ומדליקים שוב.</p>' +
          '<button type="button" class="btn secondary small" data-action="control-play-protect">' + icon('shield') + 'הגדרות Play Protect</button>' +
          '<div class="btn-row"><button type="button" class="btn secondary" data-action="control-answer" data-allow="0">ביטול</button><button type="button" class="btn" data-action="control-download">' + icon('download') + 'הורדת התוסף</button></div>';
      }
      if (c.role === 'setup') {
        return '<div class="req-head"><span class="avatar">' + icon('shield', 'lg') + '</span><h3>עכשיו להפעיל את התוסף</h3>' +
          '<p>אנדרואיד מאפשר ללחוץ על המסך רק דרך הגדרות הנגישות.</p></div>' +
          '<div class="how"><span class="n">1</span><span>בהגדרות הנגישות בוחרים <b>חיברתי – שליטה</b> (לפעמים בתוך "אפליקציות שהורדו")</span>' +
          '<span class="n">2</span><span>מפעילים ומאשרים</span>' +
          '<span class="n">3</span><span>חוזרים לכאן. ' + who + ' יקבל את האישור לבד</span></div>' +
          '<p class="fine">האפשרות אפורה? בפרטי התוסף לוחצים על ⋮ למעלה ← "לאפשר הגדרות מוגבלות", ושוב להגדרות הנגישות.</p>' +
          '<div class="btn-row"><button type="button" class="btn secondary" data-action="control-answer" data-allow="0">ביטול</button><button type="button" class="btn" data-action="control-settings">' + icon('open') + 'הפעלה</button></div>';
      }
      return '<div class="req-head"><span class="avatar">' + icon(pc ? 'monitor' : 'phone', 'lg') + '</span><h3>' + who + ' רוצה לשלוט בטלפון שלך</h3>' +
        '<p>' + (pc ? 'מהמחשב יוכלו' : 'יוכלו') + ' ללחוץ, לגלול ולכתוב בטלפון שלך, כל עוד המסך משותף. אפשר לעצור בכל רגע מההתראה.<br>מאשרים רק אם זה בסדר מבחינתך.</p></div>' +
        (c.service ? '' : '<p class="fine">' + (c.addon ? 'בפעם הראשונה מפעילים את התוסף חיברתי – שליטה בהגדרות הנגישות.' : 'בפעם הראשונה צריך להוסיף את התוסף הקטן חיברתי – שליטה. נסביר איך.') + '</p>') +
        '<div class="btn-row"><button type="button" class="btn secondary" data-action="control-answer" data-allow="0">לא</button><button type="button" class="btn" data-action="control-answer" data-allow="1">' + icon('check') + 'לאפשר שליטה</button></div>';
    }
  };

  const A = CB.A;
  A['control-answer'] = async (el) => {
    const allow = el.dataset.allow === '1';
    if (!allow) CB.closeSheet();
    await CB.N.call('controlAnswer', { allow });
  };
  A['control-settings'] = () => CB.N.call('controlSettings');
  A['control-play-protect'] = () => CB.N.call('controlPlayProtect');
  A['control-download'] = () => CB.openExternal((CB.L().control || {}).url || 'https://github.com/luach-sport/chibarti/releases/latest/download/chibarti-control.apk');
  A['control-stop'] = () => CB.N.call('controlStop');
})();
