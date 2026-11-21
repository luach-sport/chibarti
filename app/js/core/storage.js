/* Saving the app data: two files written in turns, so a crash never loses everything. */
(function () {
  'use strict';
  const CB = window.CB;

  // The app's own settings and feedback outbox live in a file in the app's private data folder. Two files are written in turns
  // (state-a / state-b) with a sequence number, so a crash mid-write never loses everything.
  const DIR = 'DATA';
  const BASE = 'chibarti';
  const LS_KEY = 'chibarti.state.v1';
  let seq = 0, slot = 'a';
  async function readFile(path) {
    try {
      const r = await CB.callRaw('Filesystem', 'readFile', { path: BASE + '/' + path, directory: DIR, encoding: 'utf8' });
      return r && typeof r.data === 'string' ? r.data : null;
    } catch (e) { return null; }
  }
  CB.loadState = async () => {
    if (CB.isNative()) {
      const docs = [];
      for (const s of ['a', 'b']) {
        const raw = await readFile('state-' + s + '.json');
        if (!raw) continue;
        try { const d = JSON.parse(raw); if (d && d.state) docs.push({ s, d }); } catch (e) { console.warn('state file', s, 'unreadable'); }
      }
      docs.sort((x, y) => (y.d.seq || 0) - (x.d.seq || 0));
      if (docs.length) {
        seq = docs[0].d.seq || 0;
        slot = docs[0].s === 'a' ? 'b' : 'a';
        return docs[0].d.state;
      }
      return null;
    }
    try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  };
  let saveTimer = null, writing = Promise.resolve();
  CB.saveState = (obj, now) => {
    const write = () => {
      saveTimer = null;
      const doc = { seq: ++seq, savedAt: Date.now(), app: CB.APP_ID, state: obj };
      const raw = JSON.stringify(doc);
      if (!CB.isNative()) { try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) { console.warn('save', e); } return writing; }
      const target = 'state-' + slot + '.json';
      slot = slot === 'a' ? 'b' : 'a';
      writing = writing.then(() => CB.callRaw('Filesystem', 'writeFile', { path: BASE + '/' + target, data: raw, directory: DIR, encoding: 'utf8', recursive: true }))
        .catch((e) => console.warn('save failed', e && e.message));
      return writing;
    };
    clearTimeout(saveTimer);
    if (now) return write();
    saveTimer = setTimeout(write, 300);
    return writing;
  };
  CB.flushSave = () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; return CB.saveState(CB.state, true); } return writing; };
})();

/* Small file helpers on top of Capacitor's Filesystem plugin. */
(function () {
  'use strict';
  const CB = window.CB;
  CB.fs = {
    mkdir: async (path, directory) => {
      try { await CB.callRaw('Filesystem', 'mkdir', { path, directory, recursive: true }); } catch (e) { /* already there */ }
    }
  };
})();
