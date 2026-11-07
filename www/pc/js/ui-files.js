/* The files panel: requests from the phone, transfers in both directions (progress in place), and what arrived. */
(function () {
  'use strict';
  const PC = window.PC;
  const F = PC.F;

  const OUT = { asking: 'מחכים לאישור בטלפון', sending: 'שולח', paused: 'מושהה', interrupted: 'מחכה שהחיבור יחזור', done: 'נשלח ונבדק', partial: 'חלק מהקבצים לא נשלחו', cancelled: 'בוטל', failed: 'נכשל' };
  const IN = { receiving: 'מקבל', paused: 'מושהה', interrupted: 'מחכה שהחיבור יחזור', done: 'התקבל ונבדק', partial: 'חלק מהקבצים לא התקבלו', cancelled: 'בוטל', failed: 'נכשל' };

  function stateText(j) {
    if (j.state === 'declined') return j.reason === 'space' ? 'אין מספיק מקום בטלפון' : 'בטלפון לא אישרו';
    if (j.state === 'cancelled') return j.reason === 'peer' ? 'בוטל בטלפון' : 'בוטל';
    if (j.peerPaused && PC.activeJob(j)) return 'הושהה בטלפון';
    return (j.out ? OUT : IN)[j.state] || '';
  }

  const title = (items) => '<bdi>' + PC.esc(items[0] ? items[0].name : '') + '</bdi>' + (items.length > 1 ? ' <span class="more">ועוד ' + (items.length - 1) + '</span>' : '');
  const icon = (items) => (items.length > 1 ? PC.icon('files') : PC.icon(PC.kind(items[0] && items[0].mime, items[0] && items[0].name)));

  function offer(o) {
    const files = o.files || [];
    const names = files.slice(0, 3).map((f) => '<li><bdi>' + PC.esc(f.name) + '</bdi> <span>' + PC.bytes(f.size) + '</span></li>').join('') + (files.length > 3 ? '<li class="more">ועוד ' + (files.length - 3) + '</li>' : '');
    return '<div class="offer"><div class="offer-top">' + PC.icon('download') + '<div><b>' + PC.esc(PC.pre(files.length === 1 ? 'קובץ מ' : files.length + ' קבצים מ', PC.L.phone.name || 'הטלפון')) + '</b><span>' + PC.bytes(o.total) +
      (F.dir ? ' · יישמרו בתיקייה ' + PC.esc(F.dir.name) : '') + '</span></div></div><ul class="names">' + names + '</ul>' +
      '<div class="row"><button class="btn primary" data-act="offer-yes" data-tid="' + o.tid + '">' + PC.icon('check', 'sm') + 'קבלה</button><button class="btn ghost" data-act="offer-no" data-tid="' + o.tid + '">לא עכשיו</button></div></div>';
  }

  function job(j) {
    const act = PC.activeJob(j);
    const btns = (j.out && act && j.state !== 'asking' && j.state !== 'interrupted' ? '<button class="icon-btn" data-act="job-pause" data-tid="' + j.tid + '" aria-label="' + (j.state === 'paused' ? 'המשך' : 'השהיה') + '">' + PC.icon(j.state === 'paused' ? 'play' : 'pause', 'sm') + '</button>' : '') +
      (act ? '<button class="icon-btn" data-act="job-cancel" data-tid="' + j.tid + '" aria-label="ביטול">' + PC.icon('close', 'sm') + '</button>' : '');
    const cls = j.state === 'done' ? ' ok' : act ? '' : ' end';
    return '<div class="job' + cls + '" data-job="' + j.tid + '"><span class="dir">' + PC.icon(j.out ? 'upload' : 'download', 'xs') + '</span>' + icon(j.items) +
      '<div class="job-main"><div class="job-top"><b class="name">' + title(j.items) + '</b></div>' +
      '<div class="bar"><i></i></div><div class="job-meta"><span class="st">' + stateText(j) + (j.dir && j.state === 'done' ? ' · בתיקייה ' + PC.esc(j.dir) : '') + '<span data-live="pct"></span></span><span data-live="meta"></span></div></div>' +
      '<div class="job-btns">' + btns + '</div></div>';
  }

  function received(r, i) {
    return '<li>' + PC.icon(PC.kind(r.mime, r.name), 'sm') + '<bdi class="name">' + PC.esc(r.name) + '</bdi><span class="sz">' + PC.bytes(r.size) + ' · ' + PC.time(r.at) + '</span>' +
      (r.url ? '<button class="btn link sm" data-act="save-again" data-i="' + i + '">שמירה</button>' : '<span class="sz">' + PC.icon('folder', 'xs') + PC.esc(r.folder) + '</span>') + '</li>';
  }

  PC.part('filesBody', () => {
    const jobs = F.jobs.filter((j, i) => PC.activeJob(j) || i < 12);
    const ended = F.jobs.some((j) => !PC.activeJob(j));
    let h = F.offers.map(offer).join('');
    if (jobs.length) h += '<div class="list-head"><h4>העברות</h4>' + (ended ? '<button class="btn link sm" data-act="clear-jobs">ניקוי</button>' : '') + '</div>' + jobs.map(job).join('');
    if (F.received.length) h += '<div class="list-head"><h4>התקבלו מהטלפון</h4></div><ul class="got">' + F.received.slice(0, 40).map(received).join('') + '</ul>';
    if (!h) h = '<p class="empty">' + PC.icon('files', 'lg') + '<span>קבצים שתשלחו או שיגיעו מהטלפון יופיעו כאן.<br>בטלפון: <b>קבצים</b> ← <b>בחירת קבצים</b> ← <b>שליחה</b>.</span></p>';
    return h;
  }, (el) => {
    F.jobs.forEach((j) => {
      const row = el.querySelector('[data-job="' + j.tid + '"]');
      if (!row) return;
      const t = PC.jobTotal(j), d = PC.jobDone(j);
      const p = j.state === 'done' ? 100 : PC.pct(d, t);
      const bar = row.querySelector('.bar i');
      if (bar) bar.style.width = p + '%';
      const meta = row.querySelector('[data-live="meta"]');
      const pc = row.querySelector('[data-live="pct"]');
      if (pc) { const v = PC.activeJob(j) && t > 0 ? ' · ' + p + '%' : ''; if (pc.textContent !== v) pc.textContent = v; }
      if (!meta) return;
      let txt = '';
      if (j.state === 'sending' || j.state === 'receiving') {
        txt = PC.bytes(d) + ' מתוך ' + PC.bytes(t);
        if (j.speed > 0) txt += ' · ' + PC.bytes(j.speed).replace('\u2069', '/s\u2069') + ' · ' + PC.eta((t - d) / j.speed);
      } else if (PC.activeJob(j)) txt = PC.bytes(d) + ' מתוך ' + PC.bytes(t);
      else txt = PC.bytes(t);
      if (meta.textContent !== txt) meta.textContent = txt;
    });
  });

  PC.part('filesTools', () => {
    if (!PC.canPickFolder()) return '';
    return F.dir
      ? '<span class="chip">' + PC.icon('folder', 'xs') + PC.esc(F.dir.name) + '</span><button class="btn link sm" data-act="folder-off">בלי תיקייה</button>'
      : '<button class="btn ghost sm" data-act="folder" title="קבצים מהטלפון יישמרו ישר לתיקייה הזאת">' + PC.icon('folder', 'sm') + 'תיקייה לשמירה</button>';
  });

  PC.A['offer-yes'] = (b) => PC.answerOffer(Number(b.getAttribute('data-tid')), true);
  PC.A['offer-no'] = (b) => PC.answerOffer(Number(b.getAttribute('data-tid')), false);
  PC.A['job-pause'] = (b) => { const tid = Number(b.getAttribute('data-tid')), j = F.jobs.filter((x) => x.tid === tid)[0]; if (j) PC.pauseJob(tid, j.state !== 'paused'); };
  PC.A['job-cancel'] = (b) => PC.cancelJob(Number(b.getAttribute('data-tid')));
  PC.A['clear-jobs'] = () => { F.jobs = F.jobs.filter((j) => PC.activeJob(j)); PC.render(); };
  PC.A['save-again'] = (b) => { const r = F.received[Number(b.getAttribute('data-i'))]; if (r && r.url) PC.save(r.url, r.name); };
  PC.A.folder = () => PC.pickFolder();
  PC.A['folder-off'] = () => PC.forgetFolder();
})();
