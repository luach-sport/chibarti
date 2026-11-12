/* Files tab: send (any file, or photos and videos with previews), received, history. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;
  const ui = CB.ui;

  const SEGS = [{ v: 'send', l: 'שליחה' }, { v: 'received', l: 'התקבלו' }, { v: 'history', l: 'היסטוריה' }];

  function seg() {
    return '<div class="seg" role="tablist" aria-label="קבצים">' + SEGS.map((s) => '<button type="button" role="tab" data-action="files-seg" data-v="' + s.v + '" aria-pressed="' + (ui.filesSeg === s.v) + '">' + s.l + '</button>').join('') + '</div>';
  }

  function mediaGrid() {
    const m = ui.media;
    if (!m || !m.items.length) return '';
    let h = '<div class="grid3">';
    m.items.forEach((f, i) => {
      const on = !!m.sel[f.uri], vid = CB.kind(f.mime) === 'video';
      h += '<button type="button" class="cell" data-action="media-toggle" data-i="' + i + '" aria-pressed="' + on + '" aria-label="' + esc(f.name) + '">' +
        '<span class="sq"><span class="ph">' + icon(vid ? 'video' : 'image') + '</span><img alt="" data-uri="' + esc(f.uri) + '" data-mime="' + esc(f.mime) + '"></span>' +
        '<span class="tick">' + (on ? icon('check', 'xs') : '') + '</span>' + (vid ? '<span class="dur">' + icon('play', 'xs') + 'וידאו</span>' : '') + '</button>';
    });
    return h + '</div>';
  }

  function pickedFiles() {
    if (!ui.picked.length) return '';
    return '<div class="card list">' + ui.picked.map((f, i) => '<div class="row file-row">' + CB.tile(f.mime, f.name) +
      '<span class="grow"><span class="t"><bdi>' + esc(f.name) + '</bdi></span><span class="s">' + (f.size >= 0 ? CB.bytes(f.size) : 'גודל לא ידוע') +
      (CB.kind(f.mime, f.name) === 'apk' ? ' · קובץ התקנה: יישמר אצל המקבל, לא יותקן לבד' : '') + '</span></span>' +
      '<span class="acts"><button type="button" class="icon-btn" data-action="picked-remove" data-i="' + i + '" aria-label="הסרה">' + icon('close', 'sm') + '</button></span></div>').join('') + '</div>';
  }

  function sendBar() {
    const t = CB.pickedTotal();
    if (!t.n) return '';
    return '<div class="sel-bar"><span class="grow num" id="sel-sum">' + (t.n === 1 ? 'נבחר קובץ אחד' : 'נבחרו ' + t.n) + ' · ' + CB.bytes(t.size) + '</span>' +
      '<button type="button" class="btn small secondary" data-action="picked-clear">ניקוי</button>' +
      '<button type="button" class="btn small" data-action="send-picked">' + icon('send', 'sm') + 'שליחה</button></div>' +
      (CB.connected() ? '' : '<p class="fine">אפשר לבחור עכשיו, ולשלוח אחרי שהטלפונים מחוברים.</p>');
  }

  function sendSeg() {
    const L = CB.L();
    const xs = (L.transfers || []).slice().reverse();
    let h = '';
    if (!CB.connected()) h += '<button type="button" class="banner" data-action="go-home"><span class="ic">' + icon('link') + '</span><span class="txt"><span class="t">עדיין לא מחוברים</span><span class="s">מחברים את שני הטלפונים, ואז שולחים</span></span><span class="go">לחיבור</span></button>';
    h += '<div class="pick2"><button type="button" class="pickbtn" data-action="pick-files"><span class="tile">' + icon('files') + '</span>בחירת קבצים<small>מסמכים, ZIP, APK, כל קובץ</small></button>' +
      '<button type="button" class="pickbtn" data-action="pick-media"><span class="tile">' + icon('image') + '</span>תמונות וסרטונים<small>רואים ובוחרים לפני ששולחים</small></button></div>';
    h += mediaGrid() + pickedFiles() + sendBar();
    if (xs.length) {
      h += '<div class="sec-head"><h2>העברות</h2>' + (xs.some((t) => !CB.isActive(t)) ? '<button type="button" data-action="xfers-clear">ניקוי שהסתיימו</button>' : '') + '</div>';
      h += xs.map((t) => V.xferCard(t, false)).join('');
    }
    h += '<p class="fine dev-line">' + icon('shield', 'xs') + 'כל קובץ מוצפן בדרך ונבדק בצד השני (SHA-256). שום דבר לא עולה לאינטרנט.</p>';
    return h;
  }

  function receivedSeg() {
    const L = CB.L(), env = ui.env || {};
    const incoming = (L.transfers || []).filter((t) => t.dir === 'in' && CB.isActive(t));
    const got = (ui.history || []).filter((h) => h.dir === 'in' && h.status === 'done').slice().reverse();
    let h = '<div class="notice gray">' + icon('folder', 'sm') + '<span class="grow">' + esc(CB.saveWhereText(env)) + '</span><button type="button" class="link" data-action="save-where">שינוי</button></div>';
    h += incoming.map((t) => V.xferCard(t, false)).join('');
    if (!got.length && !incoming.length) return h + '<div class="empty">' + CB.emptyArt() + '<h2>עוד לא התקבלו קבצים</h2><p>כשהטלפון השני ישלח, תופיע כאן בקשה לאישור, והקבצים יישמרו בטלפון.</p></div>';
    h += '<div class="card list">' + got.slice(0, 60).map(V.histRow).join('') + '</div>';
    return h + '<button type="button" class="btn secondary" data-action="open-downloads">' + icon('folder') + (env.saveMode === 'folder' && env.folder ? 'פתיחת התיקייה' : 'פתיחת תיקיית ההורדות') + '</button>';
  }

  function historySeg() {
    const f = ui.histFilter;
    const all = (ui.history || []).slice().reverse().filter((h) => f === 'all' || (f === 'out' ? h.dir === 'out' : h.dir === 'in'));
    let h = '<div class="chips">' + [['all', 'הכל'], ['out', 'נשלחו'], ['in', 'התקבלו']].map((c) => '<button type="button" class="chip sm' + (f === c[0] ? ' on' : '') + '" data-action="hist-filter" data-v="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>';
    if (!all.length) return h + '<div class="empty">' + CB.emptyArt() + '<h2>אין עדיין היסטוריה</h2><p>כל קובץ שנשלח או התקבל יופיע כאן, עם התאריך והטלפון.</p></div>';
    h += '<div class="card list">';
    let day = '';
    all.slice(0, 150).forEach((x) => {
      const d = CB.dayLabel(x.at);
      if (d !== day) { day = d; h += '<div class="day-label">' + esc(d) + '</div>'; }
      h += V.histRow(x);
    });
    h += '</div><button type="button" class="btn ghost" data-action="hist-clear">' + icon('trash') + 'ניקוי ההיסטוריה</button>';
    return h + '<p class="fine" style="text-align:center">ניקוי ההיסטוריה לא מוחק את הקבצים עצמם.</p>';
  }

  V.files = {
    html: () => {
      let h = '<header class="top"><h1 class="h1">קבצים</h1></header>' + seg();
      if (ui.filesSeg === 'received') h += receivedSeg();
      else if (ui.filesSeg === 'history') h += historySeg();
      else h += sendSeg();
      return h;
    },
    after: () => { CB.loadThumbs(CB.$('#screen')); if (!ui.history) CB.loadHistory(); },
    sig: () => {
      const L = CB.L();
      return [ui.filesSeg, CB.connected(), (L.transfers || []).map((t) => t.tid + t.state + (t.peerPaused ? 'p' : '')).join(','), (ui.history || []).length, ui.histFilter, ui.env && ui.env.folder, ui.env && ui.env.saveMode].join('|');
    },
    live: () => { (CB.L().transfers || []).forEach(V.xferLive); }
  };

  CB.loadHistory = async () => {
    try { const r = await CB.N.call('history'); ui.history = (r && r.items) || []; } catch (e) { ui.history = []; }
    CB.refresh();
  };
})();
