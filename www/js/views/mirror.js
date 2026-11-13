/* Screen tab: share this phone's screen with the other phone (quality, sound, automatic quality), the live card
   while sharing or watching, and why some sound can't be shared. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;

  function art() {
    return '<div class="mirror-art"><svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<path class="beam" d="M112 40 L208 26 L208 124 L112 110Z"/>' +
      '<rect class="ph" x="58" y="22" width="58" height="106" rx="12"/><rect class="ph" x="204" y="14" width="66" height="122" rx="13"/>' +
      '<path class="ln" d="M70 44h30M70 56h20M218 40h36M218 54h24"/><circle class="sun" cx="87" cy="92" r="11"/><circle class="sun" cx="237" cy="95" r="13"/></svg></div>';
  }

  // In a room: screen sharing goes to the main device; the room's host can choose which.
  function partner() {
    if (!CB.inRoom()) return '';
    if (!CB.isRoomHost()) return '<div class="notice gray">' + icon('info', 'sm') + '<span class="grow">בחדר, שיתוף המסך הוא עם ' + esc(CB.peerName()) + ' (מי שפתח את החדר).</span></div>';
    return '<button type="button" class="banner" data-action="open-room"><span class="ic">' + icon('phones') + '</span><span class="txt"><span class="t">' + esc(CB.pre('עם ', CB.peerName())) + '</span><span class="s">שיתוף המסך הולך למכשיר הראשי בחדר. אפשר להחליף אותו</span></span><span class="go">החלפה</span></button>';
  }

  function idle() {
    const st = CB.state.settings, env = CB.ui.env || {};
    const audioOk = env.audioCapture !== false;
    return partner() + '<div class="mirror-card">' + art() +
      '<h2>' + esc(CB.pre('שיתוף המסך שלי ל', CB.peerName())) + '</h2><p>כל מה שעל המסך שלך יופיע אצל ' + esc(CB.peerName()) + ', בזמן אמת. אנדרואיד ישאל פעם אחת לפני שמתחילים.</p>' +
      '<span class="section-label" style="margin:0">איכות</span><div class="q-grid" role="group" aria-label="איכות">' +
      CB.QUALITIES.map((q) => '<button type="button" data-action="set-quality" data-v="' + q.v + '" aria-pressed="' + (st.quality === q.v) + '"><b>' + q.label + '</b><small>' + q.sub + '</small></button>').join('') + '</div>' +
      '<div>' + CB.toggleRow('toggle-audio', 'גם הקול', audioOk ? 'הקול של סרטונים, משחקים ומוזיקה. שיחות ואפליקציות מוגנות נשארות שקטות.' : 'שיתוף קול אפשרי מאנדרואיד 10. כאן יעבור רק המסך.', audioOk && st.audio, audioOk ? '' : ' aria-disabled="true"') +
      CB.toggleRow('toggle-auto', 'איכות אוטומטית', 'יורדת לבד כשהחיבור חלש ועולה כשהוא חוזר, כדי שהתמונה תישאר חיה', st.auto) + '</div>' +
      '<button type="button" class="btn" data-action="mirror-start">' + icon('cast') + 'התחלת שיתוף</button></div>' +
      '<div class="notice gray">' + icon('info', 'sm') + '<span class="grow">רוצים לראות את המסך של ' + esc(CB.peerName()) + '? לוחצים שם "התחלת שיתוף", וכאן מופיעה בקשה לצפייה.</span></div>';
  }

  function statsHtml(m) {
    const res = m.width && m.height ? Math.min(m.width, m.height) + 'p' : '—';
    return '<div class="stat"><b>' + res + '</b><span>חדות</span></div><div class="stat"><b>' + (m.fps || 0) + '</b><span>תמונות בשנייה</span></div>' +
      '<div class="stat"><b>' + (m.kbps ? (m.kbps / 1000).toFixed(1) : '0') + '</b><span>Mbps</span></div>';
  }

  const AUDIO = { on: 'הקול משותף גם הוא.', off: 'בלי קול.', unsupported: 'שיתוף קול אפשרי רק מאנדרואיד 10.', 'no-permission': 'בלי קול: לא ניתן אישור למיקרופון (כך אנדרואיד קורא לשיתוף קול).', failed: 'הקול לא זמין כרגע במכשיר הזה.' };

  function live(m) {
    if (m.role === 'offering') {
      return '<div class="live-card"><div class="top-line"><span class="rec" style="background:var(--sun)"></span><h2>' + esc(CB.pre('מחכה שיאשרו ב', CB.peerName())) + '</h2></div>' +
        '<p class="note">הבקשה הופיעה בטלפון השני. כשיאשרו שם, המסך שלך יופיע אצלם.</p><div style="flex:1"></div>' +
        '<button type="button" class="hbtn" data-action="mirror-stop">' + icon('close') + 'ביטול</button></div>';
    }
    if (m.role === 'sending') {
      const ctl = (CB.L().control || {}).role;
      const banner = ctl === 'controlled'
        ? '<div class="notice warn ctl-on">' + icon('hand', 'sm') + '<span class="grow"><b>' + esc(CB.peerName()) + ' שולט בטלפון שלך</b><br>לוחץ, גולל וכותב כאן.</span><button type="button" class="btn small" data-action="control-stop">עצירה</button></div>'
        : ctl === 'asked' || ctl === 'install' || ctl === 'setup' ? '<div class="notice gray">' + icon('hand', 'sm') + '<span class="grow">' + esc(CB.peerName()) + ' מבקש לשלוט בטלפון</span><button type="button" class="btn small secondary" data-action="open-sheet" data-sheet="control">לבקשה</button></div>' : '';
      return banner + '<div class="live-card"><div class="top-line"><span class="rec"></span><h2>המסך שלך אצל ' + esc(CB.peerName()) + '</h2></div>' +
        '<div class="stats" id="mstats">' + statsHtml(m) + '</div><p class="note" id="mnote">' + esc(AUDIO[m.audio] || '') + (m.state !== 'live' ? ' מתחבר…' : '') + '</p>' +
        '<button type="button" class="hbtn" data-action="mirror-stop">' + icon('stop') + 'עצירת השיתוף</button></div>' +
        '<p class="fine">אפשר לצאת מחיברתי ולהשתמש בטלפון כרגיל: הכל ממשיך להופיע אצל ' + esc(CB.peerName()) + '. לעצירה: כאן או מההתראה.</p>';
    }
    if (m.role === 'viewing' || m.role === 'asked') {
      return '<div class="live-card"><div class="top-line"><span class="rec" style="background:var(--sun)"></span><h2>' + (m.role === 'asked' ? esc(CB.peerName()) + ' רוצה להראות לך את המסך' : 'צופה במסך של ' + esc(CB.peerName())) + '</h2></div>' +
        '<p class="note">' + (m.role === 'asked' ? 'מאשרים כדי לצפות.' : 'המסך פתוח במסך מלא. אם יצאת ממנו, חוזרים בכפתור.') + '</p><div style="flex:1"></div>' +
        (m.role === 'asked' ? '<button type="button" class="hbtn soft" data-action="open-sheet" data-sheet="mirrorAsk">לבקשה</button>'
          : '<button type="button" class="hbtn soft" data-action="open-viewer">' + icon('eye') + 'חזרה לצפייה</button><button type="button" class="hbtn" data-action="mirror-stop">' + icon('stop') + 'הפסקת הצפייה</button>') + '</div>';
    }
    return '';
  }

  V.cast = {
    html: () => {
      let h = '<header class="top"><h1 class="h1">שיקוף מסך</h1></header>';
      if (!CB.connected()) return h + CB.needConnection('כששני הטלפונים מחוברים, אפשר להציג את המסך של אחד מהם על השני, עם קול, בלי אינטרנט.');
      const m = CB.L().mirror || { role: 'none' };
      if (m.error === 'capture') h += '<div class="notice warn">' + icon('alert', 'sm') + '<span class="grow">צילום המסך לא הצליח במכשיר הזה. נסו איכות נמוכה יותר.</span></div>';
      return h + (m.role === 'none' ? idle() : live(m));
    },
    sig: () => { const m = CB.L().mirror || {}; return [CB.connected(), CB.inRoom(), m.role, m.role === 'sending' ? m.state : '', m.error, CB.peerName(), CB.ui.env && CB.ui.env.audioCapture, (CB.L().control || {}).role].join('|'); },
    live: () => {
      const m = CB.L().mirror || {};
      if (m.role === 'sending') { CB.part('mstats', statsHtml(m)); CB.setText('mnote', (AUDIO[m.audio] || '') + (m.state !== 'live' ? ' מתחבר…' : '')); }
    }
  };
})();
