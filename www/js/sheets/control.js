/* Remote control of this phone: the connected device (a phone or a computer) asks while it watches this screen.
   Allowing turns on taps, swipes and typing from there. That needs the small add-on "חיברתי – שליטה" (Play Protect
   blocks apps with an accessibility service, so it's kept out of the app): the first time, the sheet walks through
   downloading it and turning it on once; the answer goes out by itself as soon as it's ready. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const ui = CB.ui;

  // One step of the guide: its number (✓ when done), what to do, and the button that opens the right place.
  const step = (n, state, title, sub, btn) => '<div class="g ' + state + '"><span class="n">' + (state === 'done' ? icon('check', 'xs') : n) + '</span>' +
    '<span class="body"><span class="t">' + title + '</span>' + (sub ? '<span class="s">' + sub + '</span>' : '') + (btn || '') + '</span></div>';
  const btn = (action, ic, label, extra) => '<button type="button" class="btn small' + (extra || '') + '" data-action="' + action + '">' + icon(ic, 'sm') + label + '</button>';
  const cancel = '<button type="button" class="btn secondary" data-action="control-answer" data-allow="0">ביטול</button>';

  /** Turning Play Protect's scanning back on, right after the add-on was installed (it was off only for that). */
  CB.ppBackStep = (n) => step(n, 'now', 'מדליקים בחזרה את סריקת Play Protect',
    'התוסף כבר מותקן. בחלון של Play Protect מדליקים שוב את "סריקת אפליקציות", כדי שהטלפון יישאר מוגן. התוסף ימשיך לעבוד.',
    '<span class="row-btns">' + btn('control-play-protect', 'shield', 'פתיחת Play Protect', ' secondary') + btn('pp-back-done', 'check', 'הדלקתי') + '</span>');

  function installGuide() {
    const off = !!CB.state.ppOff;
    return '<div class="req-head"><span class="avatar">' + icon('download', 'lg') + '</span><h3>פעם אחת: התוסף לשליטה</h3>' +
      '<p>כדי שאפשר יהיה לשלוט בטלפון הזה צריך את התוסף הקטן <b>חיברתי – שליטה</b>. רק בטלפון הזה, ורק פעם אחת.</p></div>' +
      '<div class="guide">' +
      step(1, off ? 'done' : 'now', 'מכבים לרגע את סריקת Play Protect', 'Play Protect חוסם כל אפליקציה שיכולה ללחוץ על המסך. בחלון שנפתח לוחצים על ⚙ למעלה ומכבים את "סריקת אפליקציות". מיד אחרי ההתקנה נזכיר להדליק שוב.', btn('control-play-protect', 'shield', 'פתיחת Play Protect', off ? ' secondary' : '')) +
      step(2, off ? 'now' : '', 'מורידים ומתקינים את התוסף', 'קובץ קטן. כשההורדה נגמרת פותחים אותו ומתקינים. אם אנדרואיד שואל, מאשרים התקנה מהדפדפן.', btn('control-download', 'download', 'הורדת התוסף', off ? '' : ' secondary')) +
      step(3, '', 'חוזרים לכאן', 'חיברתי מזהה שהתוסף הותקן וממשיכה לשלב הבא לבד.') +
      '</div><div class="btn-row one">' + cancel + '</div>';
  }

  function setupGuide(who) {
    const e = CB.ui.env || {}, sdk = e.sdk || 0;
    let n = 0, h = '<div class="req-head"><span class="avatar">' + icon('shield', 'lg') + '</span><h3>עכשיו להפעיל את התוסף</h3>' +
      '<p>אנדרואיד מאפשר ללחוץ על המסך רק דרך הגדרות הנגישות.</p></div><div class="guide">';
    if (CB.state.ppOff) h += CB.ppBackStep(++n);
    if (sdk >= 33) {
      h += step(++n, CB.state.ppOff ? '' : 'now', 'מתירים לתוסף "הגדרות מוגבלות"',
        'באנדרואיד ' + esc(e.release || '13') + ' אפליקציה שהותקנה מקובץ צריכה את האישור הזה. בדף של התוסף לוחצים על ⋮ למעלה ← "התרת הגדרות מוגבלות", ומאשרים בטביעת אצבע או בקוד.' +
        (sdk >= 35 ? ' לא רואים את האפשרות? קודם מנסים להפעיל בנגישות (השלב הבא), ואז חוזרים לדף של התוסף.' : ''),
        btn('control-app-info', 'open', 'הדף של התוסף', ' secondary'));
    }
    h += step(++n, !CB.state.ppOff && sdk < 33 ? 'now' : '', 'מפעילים בהגדרות הנגישות',
      'בוחרים <b>חיברתי – שליטה</b> (לפעמים בתוך "אפליקציות שהורדו" או "שירותים מותקנים"), מפעילים ומאשרים.' + (/xiaomi|redmi|poco/.test(e.brand || '') ? ' בשיאומי כפתור האישור נפתח אחרי כמה שניות.' : ''),
      btn('control-settings', 'open', 'הגדרות הנגישות'));
    h += step(++n, '', 'חוזרים לכאן', who + ' יקבל את האישור לבד.');
    return h + '</div><div class="btn-row one">' + cancel + '</div>';
  }

  CB.SHEETS.control = {
    title: () => 'שליטה מרחוק',
    init: () => { if (!CB.ui.env) CB.loadEnv().then(() => { if (CB.sheetIs('control')) CB.renderSheet(); }); },
    render: () => {
      const c = CB.L().control || {}, pc = (CB.L().link || {}).kind === 'pc', who = esc(CB.peerName());
      if (c.role === 'install') return installGuide();
      if (c.role === 'setup') return setupGuide(who);
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
  A['control-play-protect'] = () => {
    // while the add-on isn't installed yet, this is "turn scanning off for a moment": remind to turn it back on later
    if (!(CB.L().control || {}).addon) { CB.state.ppOff = true; CB.save(); if (CB.sheetIs('control')) CB.renderSheet(); }
    return CB.N.call('controlPlayProtect');
  };
  A['control-app-info'] = () => CB.N.call('controlAppInfo');
  A['pp-back-done'] = () => {
    CB.state.ppOff = false;
    CB.save();
    CB.haptic();
    if (CB.sheetIs('ppBack')) CB.closeSheet(); else if (ui.sheet) CB.renderSheet();
    CB.toast('מצוין, הטלפון מוגן שוב');
  };

  // Right after the add-on was installed (also when the app was closed meanwhile): turn the scanning back on.
  CB.SHEETS.ppBack = {
    title: () => 'להחזיר את הסריקה',
    render: () => '<div class="guide">' + CB.ppBackStep(1) + '</div>'
  };
  A['control-download'] = () => CB.openExternal((CB.L().control || {}).url || 'https://github.com/luach-sport/chibarti/releases/latest/download/chibarti-control.apk');
  A['control-stop'] = () => CB.N.call('controlStop');
})();
