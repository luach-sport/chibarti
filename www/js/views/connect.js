/* Connecting pages: this phone's QR code and 6-digit code (host), the camera scanner, and nearby phones. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;
  const ui = CB.ui;
  const METHOD = { d: 'Wi-Fi Direct', h: 'נקודה חמה מקומית', l: 'דרך ה-Wi-Fi הקיים' };

  const head = (title) => '<div class="bar-top"><button type="button" class="icon-btn" aria-label="חזרה" data-action="back">' + icon('back') + '</button><h1 class="grow">' + title + '</h1></div>';

  function pinHtml(pin) {
    pin = String(pin || '');
    if (pin.length !== 6) return '<span>·</span><span>·</span><span>·</span><span class="gap"></span><span>·</span><span>·</span><span>·</span>';
    return pin.split('').map((d, i) => (i === 3 ? '<span class="gap"></span>' : '') + '<span>' + d + '</span>').join('');
  }

  function timer(h) {
    const left = Math.max(0, (h.expiresAt || 0) - Date.now()), frac = left / 600000;
    const c = 2 * Math.PI * 6;
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><circle class="bg" cx="8" cy="8" r="6"/><circle class="fg" cx="8" cy="8" r="6" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - frac)).toFixed(2) + '"/></svg>' +
      'קוד חדש בעוד ' + CB.duration(left);
  }

  // ---------- host: show the QR code ----------
  V.host = {
    html: () => {
      const h = CB.L().host || {};
      const ready = h.ready && h.qr;
      let box;
      if (ready) box = '<div class="sq" id="qr-sq">' + CB.qrSvg(h.qr) + '</div>';
      else if (h.error && !h.ready) box = '<div class="sq"><div class="wait">' + icon('alert', 'lg') + esc(CB.hostError(h.error)) + '</div></div>';
      else box = '<div class="sq"><div class="wait"><span class="spin"></span>מכין רשת ישירה בין הטלפונים…</div></div>';
      let x = head('חיבור חדש') + '<div class="qr-stage"><div class="qr-box">' + box + '</div>' +
        '<div class="pin-line"><span class="lbl">או מקלידים את הקוד</span><div class="pin" id="pin">' + pinHtml(ready ? h.pin : '') + '</div>' +
        '<span class="timer" id="qr-timer">' + (ready ? timer(h) : '') + '</span></div>' +
        (ready ? '<span class="via-chip">' + icon(h.method === 'd' ? 'phones' : 'wifi', 'xs') + esc(METHOD[h.method] || '') + (h.network ? ' · <span class="ltr">' + esc(h.network) + '</span>' : '') + '</span>' : '') + '</div>';
      if (ready && h.error) x += '<div class="notice warn">' + icon('info', 'sm') + '<span class="grow">' + esc(CB.hostError(h.error)) + '</span></div>';
      x += '<div class="card pad"><div class="how">' +
        '<span class="n">1</span><span>בטלפון השני פותחים את חיברתי</span>' +
        '<span class="n">2</span><span>לוחצים "סריקת קוד" ומכוונים אל הקוד, או מקלידים את 6 הספרות מ"חיפוש טלפונים"</span>' +
        '<span class="n">3</span><span>כאן מאשרים את החיבור, וזהו</span></div></div>';
      if (h.error && !h.ready) x += '<button type="button" class="btn" data-action="host-retry">' + icon('refresh') + 'לנסות שוב</button>';
      x += '<p class="fine" style="text-align:center">הקוד משתנה כל 10 דקות ואחרי כל חיבור. בלי אישור שלך אף טלפון לא מתחבר.</p>';
      return x;
    },
    sig: () => { const h = CB.L().host || {}; return [h.ready, h.qr, h.error, h.method, CB.L().mode].join('|'); },
    live: () => {
      const h = CB.L().host || {};
      if (!h.ready) return;
      CB.part('pin', pinHtml(h.pin));
      CB.part('qr-timer', timer(h));
    },
    tick: () => { const h = CB.L().host || {}; if (h.ready) CB.part('qr-timer', timer(h)); },
    leave: () => { if (CB.L().mode === 'hosting') { /* keep offering while the user looks around; Home shows it */ } }
  };

  // ---------- scan: the camera ----------
  V.scan = {
    html: () => head('סריקת קוד') +
      '<div class="scan-stage" id="scan-stage"><div class="sq"><video id="scan-video" muted playsinline></video>' +
      '<div class="frame"><span class="corner c1"></span><span class="corner c2"></span><span class="corner c3"></span><span class="corner c4"></span></div>' +
      '<div class="msg" id="scan-msg">מכוונים אל הקוד שעל הטלפון השני</div>' +
      '<div class="cover" id="scan-cover"><span class="spin" style="width:34px;height:34px;border-radius:17px;border:4px solid rgba(255,255,255,.3);border-top-color:#fff;animation:spin .9s linear infinite"></span>פותח מצלמה…</div></div></div>' +
      '<div class="card list">' + CB.navRow('nearby', 'radar', 'אין מצלמה או שהיא לא קוראת?', 'חיפוש טלפונים בסביבה והקלדת 6 הספרות') + '</div>' +
      '<p class="fine" style="text-align:center">הקוד נקרא בתוך הטלפון. שום תמונה לא נשמרת ולא נשלחת.</p>',
    after: (first) => { if (first) startCamera(); },
    leave: () => CB.scanner.stop()
  };

  async function startCamera() {
    const video = document.getElementById('scan-video');
    const cover = (html) => { const c = document.getElementById('scan-cover'); if (c) { c.innerHTML = html; c.style.display = html ? 'flex' : 'none'; } };
    if (!(await CB.ensureCamera())) {
      cover(icon('camera', 'lg') + 'אין אישור למצלמה.<button type="button" class="btn small" data-action="open-settings" data-what="app">פתיחת ההגדרות</button>');
      return;
    }
    try {
      await CB.scanner.start(video, (text) => {
        const st = document.getElementById('scan-stage');
        if (st) st.classList.add('hit');
        CB.haptic(true);
        CB.joinWith(text);
      });
      cover('');
    } catch (e) {
      cover(icon('camera', 'lg') + 'לא הצלחתי לפתוח את המצלמה. אפשר לחפש טלפונים בסביבה ולהקליד את הקוד.');
    }
  }

  // ---------- nearby phones ----------
  V.nearby = {
    html: () => {
      const s = CB.L().scan || {}, peers = s.peers || [];
      const app = peers.filter((p) => p.app), other = peers.filter((p) => !p.app);
      let h = head('טלפונים בסביבה') + '<div class="radar' + (s.on ? '' : ' idle') + '"><span class="ring"></span><span class="ring r2"></span><span class="ring r3"></span><span class="core">' + icon('radar', 'lg') + '</span></div>';
      h += '<p class="fine" style="text-align:center;font-size:14px">' + (s.on ? 'מחפש… בטלפון השני צריך ללחוץ "התחלת חיבור"' : 'החיפוש נעצר') + '</p>';
      if (s.error && s.error !== 'busy') h += '<div class="notice warn">' + icon('alert', 'sm') + '<span class="grow">' + (s.error === 'unsupported' ? 'הטלפון הזה לא תומך ב-Wi-Fi Direct. אפשר למצוא טלפון שנמצא על אותו Wi-Fi.' : s.error === 'permission' ? 'חסר אישור של אנדרואיד לחיפוש. פותחים "חיבור והרשאות" בהגדרות.' : 'החיפוש הישיר לא עבד כרגע. ממשיך לחפש ברשת ה-Wi-Fi.') + '</span></div>';
      h += '<div class="card list" id="peers">' + peerRows(app, true) + '</div>';
      if (other.length) h += '<span class="section-label">מכשירים אחרים עם Wi-Fi Direct</span><div class="card list">' + peerRows(other, false) + '</div>';
      h += s.on ? '<button type="button" class="btn secondary" data-action="scan-stop">הפסקת החיפוש</button>' : '<button type="button" class="btn" data-action="nearby">' + icon('refresh') + 'לחפש שוב</button>';
      return h;
    },
    sig: () => { const s = CB.L().scan || {}; return [s.on, s.error, (s.peers || []).map((p) => p.key + p.name + p.trusted).join(',')].join('|'); },
    leave: () => { if (CB.L().scan && CB.L().scan.on) CB.N.call('stopScan'); }
  };

  function peerRows(list, app) {
    if (!list.length) return app ? '<div class="row"><span class="grow"><span class="s">עוד לא נמצאו טלפונים עם חיברתי פתוחה על "התחלת חיבור".</span></span></div>' : '';
    return list.map((p) => '<button type="button" class="row peer" data-action="peer-connect" data-key="' + esc(p.key) + '" data-trusted="' + (p.trusted ? 1 : 0) + '" data-name="' + esc(p.name) + '">' +
      '<span class="tile' + (app ? '' : ' other') + '">' + icon(app ? 'phone' : 'wifi') + '</span>' +
      '<span class="grow"><span class="t">' + esc(p.name || 'טלפון') + '</span><span class="s">' + (p.trusted ? 'מוכר · מתחבר בלי קוד' : app ? 'לחיצה והקלדת 6 הספרות' : 'אולי לא חיברתי') + ' · ' + esc(CB.viaLabel(p.via)) + '</span></span>' +
      '<span class="chev">' + icon('chevL', 'sm') + '</span></button>').join('');
  }
})();
