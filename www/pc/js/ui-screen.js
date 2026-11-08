/* The screen panel: show this computer's screen on the phone, or watch the phone's screen here. */
(function () {
  'use strict';
  const PC = window.PC;
  const S = PC.S;

  const ERR = {
    declined: 'בטלפון לחצו "לא עכשיו".',
    busy: 'הטלפון כבר משתף מסך.',
    timeout: 'לא אישרו בטלפון בזמן.',
    stream: 'לא הצלחתי לפתוח את החיבור לתמונה. נסו שוב.',
    capture: 'הדפדפן לא נתן לשתף את המסך.',
    'no-encoder': 'הדפדפן הזה לא יכול לשלוח מסך. פותחים את הדף ב-Chrome או ב-Edge.',
    'no-decoder': 'הדפדפן הזה לא יכול להציג את המסך של הטלפון. פותחים את הדף ב-Chrome או ב-Edge.',
    encode: 'שליחת המסך נעצרה בגלל תקלה בדפדפן. נסו שוב.',
    decode: 'הצגת המסך נעצרה. מבקשים תמונה חדשה…'
  };
  const CTL = {
    declined: 'בטלפון לא אישרו שליטה.',
    old: 'בטלפון הזה אין שליטה מרחוק (צריך אנדרואיד 7 ומעלה).',
    timeout: 'לא אישרו בטלפון בזמן.',
    'not-sharing': 'הטלפון כבר לא משתף את המסך.'
  };
  const ctlErr = () => (PC.K.error && CTL[PC.K.error] ? '<p class="err" role="alert">' + PC.icon('alert', 'sm') + CTL[PC.K.error] + '</p>' : '');
  const navKey = (k, icon, label) => '<button class="nav-key" data-act="ctl-key" data-k="' + k + '" title="' + label + '" aria-label="' + label + '">' + icon + '</button>';
  const NAV = '<div class="stage-nav">' +
    navKey('back', '<svg class="i" viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg>', 'חזרה (קליק ימני)') +
    navKey('home', '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg>', 'מסך הבית') +
    navKey('recents', '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>', 'אפליקציות אחרונות') +
    navKey('notifications', '<svg class="i" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>', 'התראות') + '</div>';
  const phoneName = () => PC.L.phone.name || 'הטלפון';
  const err = () => (S.error && ERR[S.error] ? '<p class="err" role="alert">' + PC.icon('alert', 'sm') + ERR[S.error] + '</p>' : '');

  function idle() {
    const o = PC.shareOpts;
    const q = (v, t) => '<button class="seg' + (o.quality === v ? ' on' : '') + '" data-act="share-quality" data-v="' + v + '">' + t + '</button>';
    const out = PC.canShare()
      ? '<div class="opt-row"><span>איכות</span><div class="segs">' + q('saver', 'חסכונית') + q('standard', 'רגילה') + q('high', 'גבוהה') + '</div></div>' +
        '<label class="check"><input type="checkbox" data-act="share-audio"' + (o.audio ? ' checked' : '') + '><span>עם הקול של המחשב</span></label>' +
        '<button class="btn primary big" data-act="share">' + PC.icon('cast') + 'להציג בטלפון</button>' +
        '<p class="hint">הדפדפן ישאל איזה מסך או חלון לשתף. כדי שיהיה קול, מסמנים שם "שיתוף אודיו".</p>'
      : '<p class="hint warn">' + ERR['no-encoder'] + '</p>';
    const inn = PC.canView()
      ? '<ol class="steps small"><li>' + PC.esc(PC.pre('ב', phoneName())) + ' לוחצים <b>מסך</b> ← <b>התחלת שיתוף</b></li><li>כאן יופיעו הבקשה, ואחריה התמונה</li></ol>' +
        '<p class="hint">קול מהטלפון עובר מאנדרואיד 10. בטלפונים ישנים יותר רואים תמונה בלי קול.</p>'
      : '<p class="hint warn">' + ERR['no-decoder'] + '</p>';
    return err() + '<div class="two">' +
      '<div class="card"><div class="card-ico">' + PC.icon('monitor', 'lg') + '</div><h3>המסך של המחשב בטלפון</h3>' + out + '</div>' +
      '<div class="card"><div class="card-ico">' + PC.icon('phone', 'lg') + '</div><h3>המסך של הטלפון כאן</h3>' + inn + '</div></div>';
  }

  PC.part('screenBody', () => {
    switch (S.role) {
      case 'asked':
        return '<div class="ask">' + PC.icon('phone', 'lg') + '<h3>' + PC.esc(phoneName()) + ' רוצה להציג כאן את המסך שלו</h3>' +
          '<div class="row"><button class="btn primary big" data-act="mirror-yes">' + PC.icon('eye') + 'הצגה</button><button class="btn ghost big" data-act="mirror-no">לא עכשיו</button></div></div>';
      case 'viewing': {
        const on = PC.K.role === 'controlling';
        return ctlErr() + '<div id="screenStage" class="stage' + (on ? ' ctl' : '') + '" tabindex="0"><div class="stage-msg" data-live="stage"></div>' + (on ? NAV : '') + '</div>' +
          (on ? '<p class="hint ctl-hint">לחיצה = נגיעה · גרירה = החלקה · גלגלת = גלילה · קליק ימני = חזרה · מה שמקלידים נכתב בטלפון</p>' : '') + (S.error === 'decode' ? err() : '');
      }
      case 'offering':
        return '<div class="ask">' + PC.icon('cast', 'lg') + '<h3>' + (S.state === 'connecting' ? 'מתחבר לטלפון…' : 'מחכים לאישור בטלפון…') + '</h3>' +
          '<p class="hint">' + PC.esc(PC.pre('ב', phoneName())) + ' לוחצים <b>הצגה</b>.</p><div class="row"><button class="btn ghost" data-act="mirror-stop">ביטול</button></div></div>';
      case 'sending': {
        const J = PC.J.role;
        const ctl = J === 'asked'
          ? '<div class="ctl-ask">' + PC.icon('phone') + '<div><b>' + PC.esc(phoneName()) + ' רוצה לשלוט במחשב</b><span>יוכלו להזיז את העכבר, ללחוץ ולהקליד במסך הראשי, עד שעוצרים.</span></div>' +
            '<div class="row"><button class="btn primary sm" data-act="ctl-allow">לאפשר</button><button class="btn ghost sm" data-act="ctl-deny">לא</button></div></div>'
          : J === 'controlled' ? '<div class="ctl-ask on"><i class="dot pulse"></i><div><b>' + PC.esc(phoneName()) + ' שולט במחשב</b><span>העכבר והמקלדת זזים מהטלפון.</span></div><button class="btn danger sm" data-act="ctl-in-stop">עצירה</button></div>' : '';
        return ctl + '<div class="sending"><div id="previewBox" class="preview"></div><div class="send-info"><span class="chip ok"><i class="dot pulse"></i>' + PC.esc(PC.pre('המסך מוצג ב', phoneName())) + '</span>' +
          '<p class="stats" data-live="out-stats"></p><p class="hint">אפשר לעבור לחלון אחר, השיתוף ממשיך. כדי לעצור: כאן, או "הפסקת השיתוף" בפס של הדפדפן.</p>' +
          (window.PC_PROGRAM && !PC.sharingWholeScreen() ? '<p class="hint">כדי שהטלפון יוכל גם לשלוט במחשב, משתפים את כל המסך ולא חלון.</p>' : '') +
          '<button class="btn danger" data-act="mirror-stop">' + PC.icon('stop', 'sm') + 'הפסקת השיתוף</button></div></div>';
      }
      default:
        return idle();
    }
  }, (el) => {
    const m = el.querySelector('[data-live="stage"]');
    if (m) {
      const t = PC.L.state === 'reconnecting' ? 'החיבור נקטע, מתחבר שוב…' : S.state !== 'live' ? 'מתחבר לתמונה…' : '';
      if (m.textContent !== t) m.textContent = t;
      m.classList.toggle('on', !!t);
    }
    const st = el.querySelector('[data-live="out-stats"]');
    const ltr = (t) => '\u2066' + t + '\u2069';
    if (st) st.textContent = (S.fps ? S.fps + ' תמונות בשנייה' : 'מתחיל…') + (S.kbps ? ' · ' + ltr(S.kbps >= 1000 ? (S.kbps / 1000).toFixed(1) + ' Mbps' : S.kbps + ' kbps') : '') + (S.sound ? ' · עם קול' : '');
  }, (el) => {
    const stage = el.querySelector('#screenStage');
    if (stage) stage.insertBefore(PC.viewCanvas, stage.firstChild);
    const pb = el.querySelector('#previewBox');
    if (pb && PC.previewEl()) { pb.appendChild(PC.previewEl()); PC.previewEl().play().catch(() => {}); }
  });

  PC.part('screenTools', () => {
    if (S.role !== 'viewing') return '';
    const k = PC.K.role;
    const ctl = '<button class="btn ' + (k === 'controlling' ? 'primary' : 'ghost') + ' sm" data-act="ctl-ask"' + (k === 'asking' ? ' title="ביטול הבקשה"' : '') + '>' +
      '<svg class="i sm" viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>' +
      (k === 'controlling' ? 'שולט · הפסקה' : k === 'asking' ? 'מחכים לאישור…' : 'שליטה') + '</button>';
    return ctl + '<span class="chip" dir="ltr" data-live="fps"></span>' +
      (S.sound ? '<button class="icon-btn" data-act="mute" title="' + (S.muted ? 'להפעיל קול' : 'להשתיק') + '" aria-label="קול">' + PC.icon(S.muted ? 'mute' : 'volume') + '</button>' : '') +
      '<button class="icon-btn" data-act="fullscreen" title="מסך מלא" aria-label="מסך מלא">' + PC.icon('full') + '</button>' +
      '<button class="btn ghost sm" data-act="mirror-stop">' + PC.icon('stop', 'sm') + 'הפסקה</button>';
  }, (el) => {
    const f = el.querySelector('[data-live="fps"]');
    if (f) f.textContent = S.state === 'live' ? (S.fps || 0) + ' fps' : '…';
  });

  PC.A['share-quality'] = (b) => PC.setShareOpt('quality', b.getAttribute('data-v'));
  PC.A['share-audio'] = (b) => PC.setShareOpt('audio', b.checked);
  PC.A.share = () => PC.shareScreen();
  PC.A['mirror-yes'] = () => PC.answerMirror(true);
  PC.A['mirror-no'] = () => PC.answerMirror(false);
  PC.A['mirror-stop'] = () => PC.stopMirror(true);
  PC.A.mute = () => PC.toggleMute();
  PC.A.fullscreen = () => PC.fullscreen();
})();
