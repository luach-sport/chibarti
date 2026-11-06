/* A transfer as a card (progress, speed, time left, pause / cancel / open), and a history row. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;
  const ACTIVE = { asking: 1, sending: 1, receiving: 1, paused: 1, interrupted: 1 };
  CB.isActive = (t) => !!ACTIVE[t.state];

  function title(t) {
    const n = t.files.length, out = t.dir === 'out';
    if (n === 1) return t.files[0].name;
    return (out ? 'שליחת ' : 'קבלת ') + n + ' קבצים';
  }

  function meta(t, compact) {
    const pct = CB.pct(t.done, t.total), out = t.dir === 'out';
    switch (t.state) {
      case 'asking': return CB.pre('מחכה לאישור ב', t.peer || 'טלפון השני') + '…';
      case 'sending': case 'receiving':
        if (t.peerPaused) return pct + '% · הושהה בטלפון השני';
        return [pct + '%', compact ? '' : CB.bytes(t.done) + ' מתוך ' + CB.bytes(t.total), CB.speed(t.speed), CB.eta(t.eta)].filter(Boolean).join(' · ');
      case 'paused': return pct + '% · מושהה';
      case 'interrupted': return pct + '% · מחכה שהחיבור יחזור…';
      case 'done': return CB.pre(out ? 'נשלח ל' : 'התקבל מ', t.peer || '') + ' · ' + CB.bytes(t.total) + ' · נבדק';
      case 'partial': return 'חלק מהקבצים לא עברו את הבדיקה';
      case 'declined': return t.reason === 'space' ? 'אין מספיק מקום בטלפון המקבל' : t.reason === 'you' ? 'לא אישרת' : 'לא אושר בטלפון השני';
      case 'cancelled': return 'בוטל' + (t.reason === 'peer' ? ' בטלפון השני' : '');
      default: return t.reason === 'space' ? 'אין מספיק מקום' : t.reason === 'lost' ? 'החיבור אבד באמצע' : 'לא הושלם';
    }
  }

  function barCls(t) {
    if (t.state === 'done') return 'done';
    if (t.state === 'paused' || t.state === 'interrupted' || t.peerPaused) return 'paused';
    if (!CB.isActive(t)) return 'bad';
    return '';
  }

  V.xferCard = (t, compact) => {
    const out = t.dir === 'out', active = CB.isActive(t), n = t.files.length, f = t.files[0] || {};
    const bad = !active && t.state !== 'done';
    let ctl = '';
    if (active && out && t.state !== 'asking') ctl += '<button type="button" class="icon-btn" data-action="xfer-pause" data-tid="' + t.tid + '" data-on="' + (t.state === 'paused' ? 0 : 1) + '" aria-label="' + (t.state === 'paused' ? 'המשך' : 'השהיה') + '">' + icon(t.state === 'paused' ? 'play' : 'pause', 'sm') + '</button>';
    if (active) ctl += '<button type="button" class="icon-btn" data-action="xfer-cancel" data-tid="' + t.tid + '" aria-label="ביטול">' + icon('close', 'sm') + '</button>';
    if (!active && !out && t.state === 'done' && n === 1 && f.uri) ctl += '<button type="button" class="icon-btn" data-action="file-open" data-uri="' + esc(f.uri) + '" data-mime="' + esc(f.mime) + '" aria-label="פתיחה">' + icon('open', 'sm') + '</button>';
    let h = '<div class="card xfer" id="xf-' + t.tid + '"><div class="head">' +
      '<span class="tile ' + (bad ? 'bad' : out ? 'out' : 'in') + '">' + (n === 1 ? CB.fileIcon(f.mime, f.name) : icon(out ? 'upload' : 'download')) + '</span>' +
      '<span class="grow"><span class="name"><bdi>' + esc(title(t)) + '</bdi></span><span class="meta" id="xm-' + t.tid + '" data-c="' + (compact ? 1 : 0) + '">' + esc(meta(t, compact)) + '</span></span>' +
      (ctl ? '<span class="ctl">' + ctl + '</span>' : '') + '</div>';
    if (active || t.state === 'done') h += CB.bar('xb-' + t.tid, t.state === 'done' ? 100 : CB.pct(t.done, t.total), barCls(t));
    if (!compact && n > 1) {
      h += '<div class="files">' + t.files.slice(0, 5).map((x) => '<div><span>' + esc(x.name) + '</span><span class="num">' +
        (x.state === 3 ? '✓' : x.state === 4 ? '✕' : x.size > 0 ? CB.pct(x.done, x.size) + '%' : '') + '</span></div>').join('') +
        (n > 5 ? '<div><span>ועוד ' + (n - 5) + ' קבצים</span><span></span></div>' : '') + '</div>';
    }
    return h + '</div>';
  };

  /** Numbers and bar only (no redraw). */
  V.xferLive = (t) => {
    CB.setWidth('xb-' + t.tid, t.state === 'done' ? 100 : CB.pct(t.done, t.total));
    const el = document.getElementById('xm-' + t.tid);
    if (el) { const m = meta(t, el.getAttribute('data-c') === '1'); if (el.textContent !== m) el.textContent = m; }
  };

  V.histRow = (h) => {
    const ok = h.status === 'done', inb = h.dir === 'in';
    const sub = CB.pre(inb ? 'התקבל מ' : 'נשלח ל', h.peer || '') + ' · ' + CB.bytes(h.size) + ' · ' + CB.ago(h.at);
    const thumb = ok && inb && (CB.kind(h.mime) === 'image' || CB.kind(h.mime) === 'video') ? ' data-thumb="' + esc(h.uri) + '" data-mime="' + esc(h.mime) + '"' : '';
    let acts = '';
    if (ok && inb && h.uri) {
      acts = '<span class="acts"><button type="button" class="icon-btn" data-action="file-share" data-uri="' + esc(h.uri) + '" data-mime="' + esc(h.mime) + '" aria-label="שיתוף">' + icon('share', 'sm') + '</button>' +
        '<button type="button" class="icon-btn" data-action="file-open" data-uri="' + esc(h.uri) + '" data-mime="' + esc(h.mime) + '" aria-label="פתיחה">' + icon('open', 'sm') + '</button></span>';
    }
    return '<div class="row file-row"><span class="tile"' + thumb + '>' + CB.fileIcon(h.mime, h.name) + '</span>' +
      '<span class="grow"><span class="t"><bdi>' + esc(h.name) + '</bdi>' + (ok ? '' : ' <span class="st bad">לא הושלם</span>') + '</span><span class="s">' + esc(sub) + '</span></span>' + acts + '</div>';
  };
})();
