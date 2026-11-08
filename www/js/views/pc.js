/* Connecting a computer: the computer opens this phone in its browser (no install, no internet). The page shows
   the network to join, the address to type, the one-time browser warning, and the 6-digit code. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;

  const head = (title) => '<div class="bar-top"><button type="button" class="icon-btn" aria-label="חזרה" data-action="back">' + icon('back') + '</button><h1 class="grow">' + title + '</h1></div>';

  function art() {
    return '<div class="pc-art"><svg viewBox="0 0 320 110" aria-hidden="true">' +
      '<path class="beam" d="M96 50 L196 30 L196 82 L96 64Z"/>' +
      '<rect class="ph" x="58" y="18" width="44" height="80" rx="11"/><rect class="scr" x="63" y="26" width="34" height="58" rx="5"/>' +
      '<rect class="mon" x="178" y="12" width="118" height="76" rx="9"/><rect class="scr" x="186" y="20" width="102" height="60" rx="4"/>' +
      '<path class="stand" d="M224 88v10M210 100h44"/><circle class="sun" cx="80" cy="56" r="8"/><circle class="sun" cx="237" cy="50" r="11"/></svg></div>';
  }

  /** The address to type on the computer, and the phone's other addresses (a Wi-Fi that both may already share). */
  CB.pcAddress = (h) => {
    const port = (h.web && h.web.http) || 8080;
    const ips = h.addresses || [];
    const main = h.method === 'd' ? '192.168.49.1' : h.method === 'h' ? ips.filter((x) => /\.1$/.test(x))[0] || ips[0] : ips[0];
    const other = h.method === 'l' ? [] : ips.filter((x) => x !== main && !/^192\.168\.49\./.test(x));
    const p = port === 80 ? '' : ':' + port;
    return { main: main ? main + p : '', other: other.map((x) => x + p) };
  };

  function pin(p) {
    p = String(p || '');
    return p.length === 6 ? p.slice(0, 3) + ' ' + p.slice(3) : '··· ···';
  }

  function timer(h) {
    const left = Math.max(0, (h.expiresAt || 0) - Date.now());
    return 'קוד חדש בעוד ' + CB.duration(left);
  }

  V.pc = {
    html: () => {
      const h = CB.L().host || {};
      let x = head('חיבור למחשב') + art() + '<p class="pc-lead">המחשב פותח את הטלפון בדפדפן: בלי התקנה ובלי אינטרנט. הכי טוב Chrome או Edge.</p>';
      if (!h.ready) {
        if (h.error) return x + '<div class="notice warn">' + icon('alert', 'sm') + '<span class="grow">' + esc(CB.hostError(h.error)) + '</span></div><button type="button" class="btn" data-action="host-retry">' + icon('refresh') + 'לנסות שוב</button>';
        return x + '<div class="card pad pc-wait"><span class="spin"></span>מכין רשת ישירה למחשב…</div>';
      }
      const a = CB.pcAddress(h);
      if (h.claim) x += '<div class="notice green">' + icon('check', 'sm') + '<span class="grow"><b>נסרק.</b> התוכנה במחשב מתחברת לבד. אם המחשב לא על אותו Wi-Fi כמו הטלפון, מחברים אותו לרשת שבשלב 1.</span></div>';
      else x += '<button type="button" class="pc-program" data-action="pc-scan">' + icon('scan') + '<span class="grow"><b>יש לך את תוכנת חיברתי במחשב?</b><span>סורקים את הקוד שבתוכנה, ומדלגים על כל השלבים</span></span>' + icon('chevL', 'sm') + '</button>' +
        '<p class="pc-or">או מהדפדפן, בלי התקנה:</p>';
      const net = h.method === 'l'
        ? '<span>המחשב צריך להיות על אותו Wi-Fi כמו הטלפון' + (h.network ? ' (<bdi>' + esc(h.network) + '</bdi>)' : '') + '</span>'
        : '<span>במחשב מתחברים לרשת ה-Wi-Fi של הטלפון<span class="pc-box"><b class="ltr">' + esc(h.network || '') + '</b>' +
          (h.pass ? '<small>סיסמה</small><b class="ltr" id="pc-pass">' + esc(h.pass) + '</b>' : '') + '</span></span>';
      x += '<div class="card pad"><div class="how pc-how">' +
        '<span class="n">1</span>' + net +
        '<span class="n">2</span><span>בדפדפן במחשב כותבים בשורת הכתובת<span class="pc-box addr"><b class="ltr" id="pc-addr">' + esc(a.main) + '</b></span></span>' +
        '<span class="n">3</span><span>אם הדפדפן מזהיר שהחיבור "אינו פרטי": לוחצים <b>מתקדם</b> ואז <b>המשך</b>. זה קורה רק בפעם הראשונה.</span>' +
        '<span class="n">4</span><span>מקלידים במחשב את הקוד<span class="pc-pin ltr" id="pc-pin">' + pin(h.pin) + '</span><span class="timer" id="pc-timer">' + timer(h) + '</span></span>' +
        '<span class="n">5</span><span>כאן מאשרים, וזהו</span></div></div>';
      if (a.other.length) x += '<div class="notice gray">' + icon('wifi', 'sm') + '<span class="grow">המחשב כבר על אותו Wi-Fi כמו הטלפון? מדלגים על שלב 1 וכותבים <b class="ltr">' + esc(a.other[0]) + '</b></span></div>';
      if (h.method !== 'l') x += '<p class="fine">כל עוד המחשב מחובר לרשת של הטלפון אין בו אינטרנט, אלא אם הוא מחובר גם בכבל.</p>';
      x += '<button type="button" class="btn secondary" data-action="stop-host">ביטול</button>';
      if (h.web && h.web.fp) x += '<p class="fine pc-fp">טביעת האבטחה של הטלפון: <span class="ltr">' + esc(h.web.fp) + '</span></p>';
      return x;
    },
    sig: () => { const h = CB.L().host || {}; return [h.ready, h.error, h.claim, h.method, h.network, h.pass, (h.addresses || []).join(','), h.web && h.web.http, CB.L().mode].join('|'); },
    live: () => {
      const h = CB.L().host || {};
      if (!h.ready) return;
      CB.setText('pc-pin', pin(h.pin));
      CB.setText('pc-timer', timer(h));
    },
    tick: () => { const h = CB.L().host || {}; if (h.ready) CB.setText('pc-timer', timer(h)); }
  };
})();
