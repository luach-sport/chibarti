/* Home: the connection card (start / scan / searching / connected), quick actions, transfers in progress, recent. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;

  const VIA = { 'wifi-direct': 'Wi-Fi Direct', wifi: 'אותו Wi-Fi', hotspot: 'נקודה חמה', pc: 'דפדפן במחשב' };
  CB.viaLabel = (v) => VIA[v] || 'Wi-Fi';

  // Two phones (or this phone and a computer); "on" = connected (a solid line with data flowing), otherwise waves.
  function duo(on, pc) {
    const phone = (x) => '<rect class="ph" x="' + x + '" y="6" width="46" height="80" rx="11"/><rect class="scr" x="' + (x + 5) + '" y="14" width="36" height="58" rx="5"/>' +
      '<rect class="face" x="' + (x + 9) + '" y="22" width="22" height="4" rx="2" opacity=".5"/><rect class="face" x="' + (x + 9) + '" y="31" width="14" height="4" rx="2" opacity=".35"/>';
    const monitor = '<rect class="ph" x="6" y="8" width="96" height="64" rx="9"/><rect class="scr" x="12" y="14" width="84" height="50" rx="4"/>' +
      '<rect class="face" x="20" y="24" width="34" height="4" rx="2" opacity=".5"/><rect class="face" x="20" y="33" width="22" height="4" rx="2" opacity=".35"/>' +
      '<path class="stand" d="M54 72v10M38 84h32"/>';
    let mid = '<line class="wire" x1="' + (pc ? 100 : 76) + '" y1="46" x2="244" y2="46"/>';
    if (on) mid += '<circle class="flow" cx="236" cy="46" r="5" style="--flow:-152px"/><circle class="flow f2" cx="236" cy="46" r="5" style="--flow:-152px"/>';
    else mid += '<path class="wave" d="M146 40q14-14 28 0"/><path class="wave w2" d="M138 32q22-22 44 0"/><path class="wave w3" d="M130 24q30-30 60 0"/><circle cx="160" cy="46" r="4" fill="#FFD27A"/>';
    return '<div class="duo' + (on ? ' on' : '') + '"><svg viewBox="0 0 320 92" aria-hidden="true">' + mid + phone(250) + (pc ? monitor : phone(24)) + '</svg></div>';
  }

  function bars(q) {
    const n = q === 'great' ? 3 : q === 'good' ? 2 : q === 'weak' ? 1 : 0;
    return '<span class="bars" aria-hidden="true"><i' + (n >= 1 ? ' class="on"' : '') + '></i><i' + (n >= 2 ? ' class="on"' : '') + '></i><i' + (n >= 3 ? ' class="on"' : '') + '></i></span>';
  }
  const Q_LABEL = { great: 'קליטה מצוינת', good: 'קליטה טובה', weak: 'קליטה חלשה' };

  function card() {
    const L = CB.L(), mode = L.mode;
    if (mode === 'connected' || mode === 'reconnecting') {
      const l = L.link || {};
      const re = mode === 'reconnecting', pc = l.kind === 'pc';
      return duo(!re, pc) +
        '<h2 class="t">' + esc(CB.pre(re ? 'מתחבר שוב ל' : 'מחובר ל', l.name || (pc ? 'מחשב' : 'טלפון'))) + '</h2>' +
        '<p class="s" id="lc-sub">' + (re ? 'החיבור נקטע לרגע. ההעברות ימשיכו מאותה נקודה.' : pc ? 'קבצים, מסך והודעות, ישירות מהדפדפן במחשב' : esc(l.model || '')) + '</p>' +
        '<div class="chips"><span class="hchip">' + icon(pc ? 'monitor' : l.via === 'wifi-direct' ? 'phones' : 'wifi', 'xs') + esc(CB.viaLabel(l.via)) + '</span>' +
        '<span class="hchip" id="lc-q">' + bars(l.quality) + esc(Q_LABEL[l.quality] || 'בודק קליטה…') + '</span>' +
        '<span class="hchip num" id="lc-since">' + icon('clock', 'xs') + CB.duration(Date.now() - (l.since || Date.now())) + '</span>' +
        '<span class="hchip">' + icon('lock', 'xs') + 'מוצפן</span></div>' +
        '<div class="acts one"><button type="button" class="hbtn ghost" data-action="disconnect">' + icon('unlink') + 'ניתוק</button></div>';
    }
    if (mode === 'joining') {
      const st = L.join.step || 'connecting';
      const order = ['network', 'connecting', 'approval'];
      const at = Math.max(0, order.indexOf(st));
      const names = ['מתחבר לרשת של הטלפון השני', 'יוצר חיבור מוצפן', 'מחכה לאישור בטלפון השני'];
      return duo(false) + '<h2 class="t">' + esc(CB.pre('מתחבר ל', L.join.name || 'טלפון השני')) + '</h2>' +
        '<div class="steps">' + names.map((n, i) => '<div class="step ' + (i < at ? 'done' : i === at ? 'now' : '') + '"><span class="dot">' + (i < at ? icon('check', 'xs') : '') + '</span>' + n + '</div>').join('') + '</div>' +
        '<div class="acts one"><button type="button" class="hbtn ghost" data-action="cancel-join">ביטול</button></div>';
    }
    if (mode === 'hosting' && CB.ui.hostFor === 'pc') {
      return duo(false, true) + '<h2 class="t">מחכה למחשב</h2><p class="s">במחשב נכנסים בדפדפן לכתובת שבהוראות ומקלידים את הקוד.</p>' +
        '<div class="acts"><button type="button" class="hbtn" data-action="show-host">' + icon('monitor') + 'ההוראות והקוד</button>' +
        '<button type="button" class="hbtn ghost" data-action="stop-host">ביטול</button></div>';
    }
    if (mode === 'hosting') {
      return duo(false) + '<h2 class="t">מחכה לטלפון השני</h2><p class="s">הקוד מוכן. בטלפון השני סורקים אותו או מקלידים את 6 הספרות.</p>' +
        '<div class="acts"><button type="button" class="hbtn" data-action="show-host">' + icon('qr') + 'הצגת הקוד</button>' +
        '<button type="button" class="hbtn ghost" data-action="stop-host">ביטול</button></div>';
    }
    const err = L.join && L.join.error ? CB.joinError(L.join.error) : '';
    return duo(false) + '<h2 class="t">שני טלפונים, בלי אינטרנט</h2>' +
      '<p class="s">מסך, קבצים והודעות עוברים ישירות ביניהם. בלי ראוטר ובלי שרת.</p>' +
      (err ? '<div class="err">' + esc(err) + '</div>' : '') +
      '<div class="acts"><button type="button" class="hbtn" data-action="host">' + icon('qr') + 'התחלת חיבור</button>' +
      '<button type="button" class="hbtn ghost" data-action="scan">' + icon('scan') + 'סריקת קוד</button></div>' +
      '<div class="mores"><button type="button" class="more" data-action="nearby">' + icon('radar', 'xs') + 'אין מצלמה? חיפוש בסביבה</button>' +
      '<button type="button" class="more" data-action="pc">' + icon('monitor', 'xs') + 'חיבור למחשב</button></div>';
  }

  function quick() {
    const on = CB.connected(), L = CB.L(), role = L.mirror ? L.mirror.role : 'none';
    const qa = (tab, ic, t, s, extra, live) => '<button type="button" class="qa' + (on ? '' : ' off') + '" data-action="quick" data-tab="' + tab + '"' + (extra || '') + '>' +
      (live ? '<span class="live" aria-hidden="true"></span>' : '') + '<span class="tile">' + icon(ic) + '</span><span class="t">' + t + '</span><span class="s">' + s + '</span></button>';
    const castSub = role === 'sending' ? 'משתף עכשיו' : role === 'viewing' ? 'צופה עכשיו' : on ? 'המסך שלך אצל ' + esc(CB.peerName()) : 'אחרי החיבור';
    return '<div class="quick">' +
      qa('cast', 'cast', 'שיקוף מסך', castSub, '', role === 'sending' || role === 'viewing') +
      qa('files', 'files', 'שליחת קבצים', 'כל סוג, כל גודל', ' data-seg="send"') +
      qa('files', 'image', 'תמונות וסרטונים', 'באיכות המקורית', ' data-seg="send" data-media="1"') +
      qa('text', 'message', 'הודעה', 'טקסט והעתקה ללוח') + '</div>';
  }

  function active() {
    const list = (CB.L().transfers || []).filter((t) => ['asking', 'sending', 'receiving', 'paused', 'interrupted'].indexOf(t.state) >= 0);
    if (!list.length) return '';
    return '<div class="sec-head"><h2>העברות עכשיו</h2><button type="button" data-action="tab" data-tab="files">הכל</button></div>' +
      list.slice(0, 2).map((t) => V.xferCard(t, true)).join('');
  }

  function recent() {
    const h = (CB.ui.history || []).slice(-3).reverse();
    if (!h.length) return '';
    return '<div class="sec-head"><h2>אחרונים</h2><button type="button" data-action="go-files" data-seg="history">היסטוריה</button></div>' +
      '<div class="card list">' + h.map(V.histRow).join('') + '</div>';
  }

  V.home = {
    html: () => {
      const me = CB.L().me || {};
      return '<header class="top"><div class="brand">' + CB.logo(42) + '<div class="name"><h1 class="h1">חיברתי</h1>' +
        '<span class="me">הטלפון הזה: ' + esc(me.name || '') + '</span></div></div>' +
        '<button type="button" class="icon-btn" aria-label="המכשירים שלי" data-action="open-devices">' + icon('phones') + '</button></header>' +
        '<section class="link-card" id="link-card" aria-live="polite">' + card() + '</section>' + quick() + active() + recent();
    },
    sig: () => {
      const L = CB.L();
      const t = (L.transfers || []).filter((x) => ['asking', 'sending', 'receiving', 'paused', 'interrupted'].indexOf(x.state) >= 0).map((x) => x.tid + x.state).join(',');
      return [L.mode, CB.ui.hostFor, L.join && L.join.step, L.join && L.join.error, L.host && L.host.ready, L.link && L.link.name, L.link && L.link.via, L.mirror && L.mirror.role, t, (CB.ui.history || []).length, L.me && L.me.name].join('|');
    },
    live: () => {
      const L = CB.L(), l = L.link;
      if (l) {
        CB.part('lc-q', bars(l.quality) + esc(Q_LABEL[l.quality] || 'בודק קליטה…'));
        CB.part('lc-since', icon('clock', 'xs') + CB.duration(Date.now() - (l.since || Date.now())));
      }
      (L.transfers || []).forEach(V.xferLive);
    }
  };
})();
