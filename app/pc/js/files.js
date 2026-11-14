/* Files between the computer and the phone, the same way phones send them to each other: an offer the other side
   approves, 64 KB pieces in order, and a SHA-256 checked at the end. Big files are read piece by piece from disk. */
(function () {
  'use strict';
  const PC = window.PC;
  const T = PC.T;
  const CH = 64 * 1024;
  const F = (PC.F = { jobs: [], offers: [], received: [] });
  let nextTid = 1 + Math.floor(Math.random() * 1e6);

  const active = (j) => ['asking', 'sending', 'receiving', 'paused', 'interrupted'].indexOf(j.state) >= 0;
  PC.activeJob = active;

  // ---------- computer → phone ----------
  PC.sendFiles = (list) => {
    if (PC.L.state !== 'on') { PC.toast('קודם מתחברים לטלפון'); return; }
    const files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    const j = { tid: nextTid++, out: true, state: 'asking', items: files.slice(0, 500).map((f, i) => ({ fid: i + 1, file: f, name: f.name, size: f.size, mime: f.type || '', done: 0, st: 0 })), speed: 0, at: Date.now() };
    F.jobs.unshift(j);
    offer(j, false);
    PC.render();
  };

  function offer(j, resume) {
    const files = j.items.filter((x) => !resume || x.st < 3).map((x) => ({ fid: x.fid, name: x.name, mime: x.mime, size: x.size }));
    PC.send(T.OFFER, { tid: j.tid, files, total: total(j), resume });
  }

  const total = (j) => j.items.reduce((s, x) => s + Math.max(0, x.size), 0);
  const done = (j) => j.items.reduce((s, x) => s + x.done, 0);
  PC.jobTotal = total;
  PC.jobDone = done;

  async function run(j, offsets) {
    j.state = 'sending';
    j.gen = (j.gen || 0) + 1;
    const gen = j.gen;
    PC.render();
    for (const it of j.items) {
      if (it.st >= 2) continue;
      const v = offsets && offsets[String(it.fid)];
      if (v === -1) { it.st = 3; it.done = it.size; continue; }
      if (v === -2) { it.st = 4; continue; }
      const start = v > 0 ? v : 0;
      const sha = new PC.Sha256();
      for (let o = 0; o < start; o += CH) sha.update(new Uint8Array(await it.file.slice(o, Math.min(start, o + CH)).arrayBuffer()));
      it.done = start;
      for (let off = start; off < it.size; off += CH) {
        while ((j.paused || (PC.L.ws && PC.L.ws.bufferedAmount > 4 * 1048576)) && j.gen === gen && active(j)) await PC.sleep(25);
        if (j.gen !== gen || !active(j)) return;
        const ws = PC.L.ws;
        if (!ws || ws.readyState !== 1) { j.state = 'interrupted'; PC.render(); return; }
        const data = new Uint8Array(await it.file.slice(off, Math.min(it.size, off + CH)).arrayBuffer());
        sha.update(data);
        ws.send(PC.frame(T.CHUNK, PC.chunk(j.tid, it.fid, off, data)));
        it.done = off + data.length;
        tick(j);
      }
      it.st = 2;
      PC.send(T.FILE_END, { tid: j.tid, fid: it.fid, size: it.size, sha: sha.hex() });
    }
  }

  function tick(j) {
    const now = Date.now();
    if (!j.sAt) { j.sAt = now; j.sBytes = done(j); return; }
    if (now - j.sAt >= 700) {
      const inst = (done(j) - j.sBytes) * 1000 / (now - j.sAt);
      j.speed = j.speed ? j.speed * 0.6 + inst * 0.4 : inst;
      j.sAt = now;
      j.sBytes = done(j);
      PC.live();
    }
  }

  PC.on(T.OFFER_REPLY, (b) => {
    const o = PC.json(b), j = F.jobs.filter((x) => x.tid === o.tid && x.out)[0];
    if (!j) return;
    if (!o.accept) { j.state = 'declined'; j.reason = o.reason || 'peer'; PC.render(); return; }
    run(j, o.offsets || null);
  });

  PC.on(T.FILE_ACK, (b) => {
    const o = PC.json(b), j = F.jobs.filter((x) => x.tid === o.tid && x.out)[0];
    if (!j) return;
    j.items.forEach((x) => { if (x.fid === o.fid) { x.st = o.ok ? 3 : 4; if (o.ok) x.done = x.size; } });
    if (j.items.every((x) => x.st >= 3)) { j.state = j.items.every((x) => x.st === 3) ? 'done' : 'partial'; j.speed = 0; if (j.state === 'done') PC.toast(j.items.length === 1 ? 'הקובץ נשלח ונבדק' : j.items.length + ' הקבצים נשלחו ונבדקו'); }
    PC.render();
  });

  PC.pauseJob = (tid, on) => {
    const j = F.jobs.filter((x) => x.tid === tid)[0];
    if (!j || !j.out || !active(j)) return;
    j.paused = on;
    j.state = on ? 'paused' : 'sending';
    PC.send(on ? T.PAUSE : T.RESUME, { tid });
    PC.render();
  };

  PC.cancelJob = (tid) => {
    const j = F.jobs.filter((x) => x.tid === tid)[0];
    if (!j || !active(j)) return;
    PC.send(T.CANCEL, { tid, reason: 'user' });
    j.state = 'cancelled';
    j.reason = 'you';
    if (!j.out) j.items.forEach((x) => { if (x.st < 3 && x.sink) x.sink.abort(); });
    PC.render();
  };

  // ---------- phone → computer ----------
  PC.on(T.OFFER, (b) => {
    const o = PC.json(b);
    const old = F.jobs.filter((x) => x.tid === o.tid && !x.out)[0];
    if (old && o.resume && old.state === 'interrupted') {
      const at = {};
      old.items.forEach((x) => { at[String(x.fid)] = x.st === 3 ? -1 : x.st === 4 ? -2 : x.done; });
      old.state = 'receiving';
      PC.send(T.OFFER_REPLY, { tid: o.tid, accept: true, offsets: at });
      PC.render();
      return;
    }
    if (old) return;
    F.offers.push(o);
    PC.render();
    PC.beep();
  });

  PC.answerOffer = (tid, accept) => {
    const o = F.offers.filter((x) => x.tid === tid)[0];
    F.offers = F.offers.filter((x) => x.tid !== tid);
    if (!o) return;
    PC.send(T.OFFER_REPLY, { tid, accept });
    if (accept) {
      const dir = F.dir;
      F.jobs.unshift({ tid, out: false, state: 'receiving', at: Date.now(), speed: 0, dir: dir ? dir.name : '',
        items: (o.files || []).map((f) => {
          const it = { fid: f.fid, name: f.name, mime: f.mime, size: f.size, done: 0, st: 0, sha: new PC.Sha256() };
          it.sink = dir ? dirSink(dir, it) : memSink(it);
          it.chain = it.sink.ready;
          return it;
        }) });
    }
    PC.render();
  };

  // Where a received file goes: memory, then a normal download; or straight into a folder the user picked (Chrome, Edge).
  function memSink(it) {
    let parts = [];
    return {
      ready: Promise.resolve(),
      write: (u8) => { parts.push(u8); },
      finish: () => { const url = URL.createObjectURL(new Blob(parts, { type: it.mime || 'application/octet-stream' })); parts = null; PC.save(url, it.name); return { url }; },
      abort: () => { parts = []; }
    };
  }

  function dirSink(dir, it) {
    let w = null;
    const ready = uniqueName(dir, safe(it.name)).then((n) => { it.saved = n; return dir.getFileHandle(n, { create: true }); })
      .then((h) => h.createWritable()).then((x) => { w = x; });
    return {
      ready,
      write: (u8) => w.write(u8),
      finish: () => w.close().then(() => ({ url: '', folder: dir.name })),
      abort: () => { if (w) w.abort().catch(() => {}); }
    };
  }

  const safe = (n) => String(n || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').slice(0, 180) || 'file';

  async function uniqueName(dir, name) {
    const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 0; i < 1000; i++) {
      const n = i ? base + ' (' + i + ')' + ext : name;
      try { await dir.getFileHandle(n); } catch (e) { return n; }
    }
    return Date.now() + '-' + name;
  }

  PC.canPickFolder = () => typeof window.showDirectoryPicker === 'function';
  PC.pickFolder = async () => {
    try { F.dir = await window.showDirectoryPicker({ id: 'chibarti', mode: 'readwrite' }); PC.toast('קבצים מהטלפון יישמרו בתיקייה ' + F.dir.name); }
    catch (e) { /* the user closed the picker */ }
    PC.render();
  };
  PC.forgetFolder = () => { F.dir = null; PC.render(); };

  PC.on(T.CHUNK, (b) => {
    const c = PC.readChunk(b), j = F.jobs.filter((x) => x.tid === c.tid && !x.out)[0];
    if (!j || j.state !== 'receiving') return;
    const it = j.items.filter((x) => x.fid === c.fid)[0];
    if (!it || it.st >= 3 || c.off !== it.done || (it.size >= 0 && it.done + c.data.length > it.size)) {
      PC.send(T.CANCEL, { tid: c.tid, reason: 'out-of-order' });
      fail(j);
      return;
    }
    const copy = c.data.slice();
    it.sha.update(copy);
    it.done += copy.length;
    it.chain = it.chain.then(() => it.sink.write(copy));
    it.chain.catch(() => { if (j.state === 'receiving') { PC.send(T.CANCEL, { tid: j.tid, reason: 'write' }); fail(j); PC.toast('לא הצלחתי לשמור בתיקייה'); } });
    tick(j);
  });

  function fail(j) {
    j.state = 'failed';
    j.items.forEach((x) => { if (x.st < 3 && x.sink) x.sink.abort(); });
    PC.render();
  }

  PC.on(T.FILE_END, (b) => {
    const o = PC.json(b), j = F.jobs.filter((x) => x.tid === o.tid && !x.out)[0];
    if (!j) return;
    const it = j.items.filter((x) => x.fid === o.fid)[0];
    if (!it) return;
    if (it.st >= 2) { if (it.st >= 3) PC.send(T.FILE_ACK, { tid: o.tid, fid: o.fid, ok: it.st === 3, error: it.st === 3 ? '' : 'hash' }); return; }
    it.st = 2;
    const ok = o.size === it.done && it.sha.hex() === String(o.sha || '').toLowerCase();
    const end = (good, res) => {
      it.st = good ? 3 : 4;
      if (good) F.received.unshift({ name: it.saved || it.name, size: it.size, mime: it.mime, url: res.url || '', folder: res.folder || '', at: Date.now() });
      PC.send(T.FILE_ACK, { tid: o.tid, fid: o.fid, ok: good, error: good ? '' : ok ? 'write' : 'hash' });
      if (j.items.every((x) => x.st >= 3)) { j.state = j.items.every((x) => x.st === 3) ? 'done' : 'partial'; j.speed = 0; if (j.state === 'done') PC.toast(j.items.length === 1 ? 'הקובץ התקבל ונבדק' : j.items.length + ' קבצים התקבלו ונבדקו'); }
      PC.render();
    };
    if (!ok) { it.sink.abort(); end(false, {}); return; }
    it.chain.then(() => it.sink.finish()).then((res) => end(true, res || {}), () => { it.sink.abort(); end(false, {}); });
  });

  PC.save = (url, name) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  PC.on(T.CANCEL, (b) => {
    const o = PC.json(b), j = F.jobs.filter((x) => x.tid === o.tid)[0];
    F.offers = F.offers.filter((x) => x.tid !== o.tid);
    if (j && active(j)) { j.state = 'cancelled'; j.reason = 'peer'; if (!j.out) j.items.forEach((x) => { if (x.st < 3 && x.sink) x.sink.abort(); }); }
    PC.render();
  });

  PC.on(T.PAUSE, (b) => { const o = PC.json(b), j = F.jobs.filter((x) => x.tid === o.tid)[0]; if (j) { j.peerPaused = true; PC.render(); } });
  PC.on(T.RESUME, (b) => { const o = PC.json(b), j = F.jobs.filter((x) => x.tid === o.tid)[0]; if (j) { j.peerPaused = false; PC.render(); } });

  // ---------- the connection dropped / came back ----------
  PC.filesLinkLost = () => {
    F.jobs.forEach((j) => {
      if (['sending', 'receiving', 'paused', 'asking'].indexOf(j.state) < 0) return;
      j.state = 'interrupted';
      if (j.out) j.items.forEach((x) => { if (x.st === 2) x.st = 1; });
    });
  };
  PC.filesResumed = () => { F.jobs.forEach((j) => { if (j.out && j.state === 'interrupted') { j.state = 'asking'; offer(j, true); } }); };
  PC.filesEnded = () => { F.jobs.forEach((j) => { if (active(j)) { j.state = 'failed'; j.reason = 'lost'; if (!j.out) j.items.forEach((x) => { if (x.st < 3 && x.sink) x.sink.abort(); }); } }); F.offers = []; };
})();
