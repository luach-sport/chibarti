/* One transfer in a big window (tap on a transfer): percent, megabytes sent out of all, speed, time left and every
   file, like copying in a file manager. Updates in place while it runs. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;

  const find = (tid) => (CB.L().transfers || []).filter((t) => String(t.tid) === String(tid))[0];

  const STATE = { asking: 'מחכה לאישור', sending: 'שולח', receiving: 'מקבל', paused: 'מושהה', interrupted: 'מחכה שהחיבור יחזור', done: 'הסתיים ונבדק', partial: 'חלק מהקבצים לא עברו', declined: 'לא אושר', cancelled: 'בוטל', failed: 'לא הושלם' };

  function nums(t) {
    const pct = t.state === 'done' ? 100 : CB.pct(t.done, t.total);
    const left = t.eta > 0 ? CB.eta(t.eta) : '';
    return { pct, done: CB.bytes(t.done), total: t.total > 0 ? CB.bytes(t.total) : '', speed: CB.isActive(t) && t.speed > 0 ? CB.speed(t.speed) : '', left };
  }

  function fileLine(x, i) {
    const p = x.state === 3 ? 100 : CB.pct(x.done, x.size);
    const mark = x.state === 3 ? '✓' : x.state === 4 ? '✕' : p + '%';
    return '<div class="xd-file"><div class="xd-fhead"><span class="grow"><bdi>' + esc(x.name) + '</bdi></span><span class="num" id="xdf-n' + i + '">' + mark + '</span></div>' +
      '<div class="xd-fsub num" id="xdf-s' + i + '">' + esc(CB.bytes(x.done) + (x.size > 0 ? ' מתוך ' + CB.bytes(x.size) : '')) + '</div>' +
      CB.bar('xdf-b' + i, p, x.state === 4 ? 'bad' : x.state === 3 ? 'done' : '') + '</div>';
  }

  CB.SHEETS.xfer = {
    title: (d) => { const t = find(d.tid); return t ? (t.dir === 'out' ? CB.pre('שליחה ל', t.peer || 'המכשיר השני') : CB.pre('קבלה מ', t.peer || 'המכשיר השני')) : 'העברה'; },
    init: (d) => { const t = find(d.tid); d.state = t ? t.state : ''; d.n = t ? t.files.length : 0; },
    render: (d) => {
      const t = find(d.tid);
      if (!t) return '<p class="fine">ההעברה כבר לא ברשימה.</p>';
      const n = nums(t), active = CB.isActive(t), out = t.dir === 'out';
      let h = '<div class="xd-top"><div class="xd-pct num" id="xd-pct">' + n.pct + '%</div>' +
        '<div class="xd-state" id="xd-state">' + esc(STATE[t.state] || '') + '</div></div>' +
        CB.bar('xd-bar', n.pct, t.state === 'done' ? 'done' : active ? (t.state === 'paused' || t.state === 'interrupted' ? 'paused' : '') : 'bad') +
        '<div class="xd-grid">' +
        '<div><span class="lbl">' + (out ? 'נשלח' : 'התקבל') + '</span><span class="v num" id="xd-done">' + esc(n.done) + '</span></div>' +
        '<div><span class="lbl">מתוך</span><span class="v num" id="xd-total">' + esc(n.total || '—') + '</span></div>' +
        '<div><span class="lbl">מהירות</span><span class="v num" id="xd-speed">' + esc(n.speed || '—') + '</span></div>' +
        '<div><span class="lbl">נשאר</span><span class="v num" id="xd-left">' + esc(n.left || '—') + '</span></div></div>';
      h += '<div class="xd-files">' + t.files.slice(0, 50).map(fileLine).join('') +
        (t.files.length > 50 ? '<p class="fine">ועוד ' + (t.files.length - 50) + ' קבצים</p>' : '') + '</div>';
      let acts = '';
      if (active && out && t.state !== 'asking') acts += '<button type="button" class="btn secondary" data-action="xfer-pause" data-tid="' + t.tid + '" data-on="' + (t.state === 'paused' ? 0 : 1) + '">' + icon(t.state === 'paused' ? 'play' : 'pause') + (t.state === 'paused' ? 'המשך' : 'השהיה') + '</button>';
      if (active) acts += '<button type="button" class="btn secondary" data-action="xfer-cancel" data-tid="' + t.tid + '">' + icon('close') + 'ביטול</button>';
      const f = t.files[0] || {};
      if (!active && !out && t.state === 'done' && t.files.length === 1 && f.uri) acts += '<button type="button" class="btn" data-action="file-open" data-uri="' + esc(f.uri) + '" data-mime="' + esc(f.mime) + '">' + icon('open') + 'פתיחה</button>';
      acts += '<button type="button" class="btn ghost" data-action="close-sheet">סגירה</button>';
      return h + '<div class="xd-acts">' + acts + '</div>';
    },
    live: (d) => {
      const t = find(d.tid);
      if (!t || t.state !== d.state || t.files.length !== d.n) { d.state = t ? t.state : ''; d.n = t ? t.files.length : 0; CB.renderSheet(); return; }
      const n = nums(t);
      CB.setText('xd-pct', n.pct + '%');
      CB.setWidth('xd-bar', n.pct);
      CB.setText('xd-done', n.done);
      CB.setText('xd-total', n.total || '—');
      CB.setText('xd-speed', n.speed || '—');
      CB.setText('xd-left', n.left || '—');
      t.files.slice(0, 50).forEach((x, i) => {
        const p = x.state === 3 ? 100 : CB.pct(x.done, x.size);
        CB.setText('xdf-n' + i, x.state === 3 ? '✓' : x.state === 4 ? '✕' : p + '%');
        CB.setText('xdf-s' + i, CB.bytes(x.done) + (x.size > 0 ? ' מתוך ' + CB.bytes(x.size) : ''));
        CB.setWidth('xdf-b' + i, p);
      });
    }
  };

  CB.A['xfer-open'] = (el, e) => {
    if (e && e.target && e.target.closest && e.target.closest('button')) return;
    CB.openSheet('xfer', { tid: el.dataset.tid });
  };
})();
