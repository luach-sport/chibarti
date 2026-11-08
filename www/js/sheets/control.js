/* Remote control of this phone: the connected device (a phone or a computer) asks while it watches this screen.
   Allowing turns on taps, swipes and typing from there; the first time, Android's accessibility setting for
   חיברתי must be switched on once (the sheet explains, and the answer goes out by itself when it's on). */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;

  CB.SHEETS.control = {
    title: () => 'שליטה מרחוק',
    render: () => {
      const c = CB.L().control || {}, pc = (CB.L().link || {}).kind === 'pc', who = esc(CB.peerName());
      if (c.role === 'setup') {
        return '<div class="req-head"><span class="avatar">' + icon('shield', 'lg') + '</span><h3>פעם אחת: להפעיל שליטה בהגדרות</h3>' +
          '<p>אנדרואיד מאפשר ללחוץ על המסך רק דרך הגדרות הנגישות.</p></div>' +
          '<div class="how"><span class="n">1</span><span>בהגדרות שנפתחו בוחרים <b>חיברתי – שליטה מרחוק</b> (לפעמים בתוך "אפליקציות שהורדו")</span>' +
          '<span class="n">2</span><span>מפעילים ומאשרים</span>' +
          '<span class="n">3</span><span>חוזרים לכאן. ' + who + ' יקבל את האישור לבד</span></div>' +
          '<p class="fine">האפשרות אפורה? בפרטי האפליקציה (חיברתי) לוחצים על ⋮ למעלה ← "לאפשר הגדרות מוגבלות", ושוב להגדרות הנגישות.</p>' +
          '<div class="btn-row"><button type="button" class="btn secondary" data-action="control-answer" data-allow="0">ביטול</button><button type="button" class="btn" data-action="control-settings">' + icon('open') + 'פתיחת ההגדרות</button></div>';
      }
      return '<div class="req-head"><span class="avatar">' + icon(pc ? 'monitor' : 'phone', 'lg') + '</span><h3>' + who + ' רוצה לשלוט בטלפון שלך</h3>' +
        '<p>' + (pc ? 'מהמחשב יוכלו' : 'יוכלו') + ' ללחוץ, לגלול ולכתוב בטלפון שלך, כל עוד המסך משותף. אפשר לעצור בכל רגע מההתראה.<br>מאשרים רק אם זה בסדר מבחינתך.</p></div>' +
        (c.service ? '' : '<p class="fine">בפעם הראשונה ייפתחו הגדרות הנגישות, כדי להפעיל את חיברתי פעם אחת.</p>') +
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
  A['control-stop'] = () => CB.N.call('controlStop');
})();
