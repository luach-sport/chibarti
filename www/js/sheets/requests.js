/* Sheets that need an answer from this phone: a phone asks to connect, files waiting for approval, a screen to watch. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const ui = CB.ui;

  const reqOf = (rid) => (CB.L().requests || []).filter((r) => r.rid === rid)[0];

  CB.SHEETS.approve = {
    title: () => 'בקשת חיבור',
    init: () => { ui.form = { remember: true }; },
    render: (d) => {
      const r = reqOf(d.rid) || {}, pc = r.kind === 'pc';
      return '<div class="req-head"><span class="avatar">' + icon(pc ? 'monitor' : 'phone', 'lg') + '</span><h3>' + esc(r.name || (pc ? 'מחשב' : 'טלפון')) + ' רוצה להתחבר</h3>' +
        '<p>' + (pc ? 'מחשב, דרך הדפדפן' : esc(r.model || '') + (r.via ? ' · ' + esc(CB.viaLabel(r.via)) : '')) + '<br>מאשרים רק אם זה ה' + (pc ? 'מחשב' : 'טלפון') + ' שאתם מחברים עכשיו.</p></div>' +
        '<button type="button" class="check-row" role="checkbox" aria-checked="' + !!ui.form.remember + '" data-action="toggle-remember"><span class="box">' + (ui.form.remember ? icon('check', 'xs') : '') + '</span>' +
        '<span class="grow">לזכור את ה' + (pc ? 'מחשב' : 'טלפון') + ' הזה (בפעם הבאה בלי קוד)</span></button>' +
        '<div class="btn-row"><button type="button" class="btn secondary" data-action="approve" data-allow="0">דחייה</button><button type="button" class="btn" data-action="approve" data-allow="1">' + icon('check') + 'אישור</button></div>';
    }
  };

  const offerOf = (tid) => (CB.L().offers || []).filter((o) => o.tid === tid)[0];

  CB.SHEETS.offer = {
    title: () => 'קבצים בדרך אליך',
    render: (d) => {
      const o = offerOf(d.tid) || { files: [], total: 0 };
      const n = o.files.length, apk = o.files.some((f) => CB.kind(f.mime, f.name) === 'apk');
      const room = o.free > 0 && o.free < 1e17 ? o.free > o.total + 50 * 1048576 : true;
      return '<div class="req-head"><span class="avatar">' + icon('download', 'lg') + '</span><h3>' + esc(o.peer || 'הטלפון השני') + ' רוצה לשלוח ' + (n === 1 ? 'קובץ' : n + ' קבצים') + '</h3>' +
        '<p class="num">סך הכל ' + CB.bytes(o.total) + (o.free > 0 && o.free < 1e17 ? ' · פנוי אצלך ' + CB.bytes(o.free) : '') + '</p></div>' +
        '<div class="card list offer-list">' + o.files.map((f) => '<div class="row">' + CB.tile(f.mime, f.name) + '<span class="grow"><span class="t"><bdi>' + esc(f.name) + '</bdi></span><span class="s num">' + (f.size >= 0 ? CB.bytes(f.size) : '') + '</span></span></div>').join('') + '</div>' +
        (apk ? '<div class="notice warn">' + icon('apk', 'sm') + '<span class="grow">יש כאן קובץ התקנה (APK). הוא רק יישמר בתיקיית ההורדות, לא יותקן. מתקינים רק ממי שסומכים עליו.</span></div>' : '') +
        (room ? '' : '<div class="notice warn">' + icon('alert', 'sm') + '<span class="grow">אין מספיק מקום בטלפון. מפנים מקום ומבקשים לשלוח שוב.</span></div>') +
        '<div class="notice gray">' + icon('folder', 'sm') + '<span class="grow">יישמר ' + esc(CB.saveWhereText(ui.env, true)) + '</span><button type="button" class="link" data-action="save-where" data-tid="' + o.tid + '">שינוי</button></div>' +
        '<div class="btn-row"><button type="button" class="btn secondary" data-action="offer-answer" data-accept="0">לא עכשיו</button><button type="button" class="btn" data-action="offer-answer" data-accept="1"' + (room ? '' : ' aria-disabled="true"') + '>' + icon('download') + 'קבלה</button></div>';
    }
  };

  CB.SHEETS.mirrorAsk = {
    title: () => 'שיתוף מסך',
    render: () => {
      const m = CB.L().mirror || {}, r = m.request || {};
      const q = CB.QUALITIES.filter((x) => x.v === r.quality)[0];
      return '<div class="req-head"><span class="avatar">' + icon('cast', 'lg') + '</span><h3>' + esc(CB.peerName()) + ' רוצה להראות לך את המסך שלו</h3>' +
        '<p>' + (q ? 'איכות ' + q.label + ' (' + q.sub + ')' : '') + (r.audio ? ' · עם קול' : '') + '<br>המסך ייפתח במסך מלא. סוגרים מתי שרוצים.</p></div>' +
        '<div class="btn-row"><button type="button" class="btn secondary" data-action="mirror-answer" data-accept="0">לא עכשיו</button><button type="button" class="btn" data-action="mirror-answer" data-accept="1">' + icon('eye') + 'צפייה</button></div>';
    }
  };
})();
