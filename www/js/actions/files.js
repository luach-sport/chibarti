/* Files: pick, choose photos, send, pause, cancel, open, share, folder, history. */
(function () {
  'use strict';
  const CB = window.CB;
  const A = CB.A;
  const ui = CB.ui;

  A['files-seg'] = (el) => { ui.filesSeg = el.dataset.v; CB.render(true); if (ui.filesSeg !== 'send') CB.loadHistory(); };

  A['pick-files'] = async () => {
    const r = await CB.N.call('pickFiles', { media: false }).catch(() => null);
    const files = (r && r.files) || [];
    if (!files.length) return;
    const have = {};
    ui.picked.forEach((f) => { have[f.uri] = 1; });
    files.forEach((f) => { if (!have[f.uri]) ui.picked.push(f); });
    CB.render(true);
  };

  A['pick-media'] = async () => {
    const r = await CB.N.call('pickFiles', { media: true }).catch(() => null);
    const files = (r && r.files) || [];
    if (!files.length) return;
    if (!ui.media) ui.media = { items: [], sel: {} };
    files.forEach((f) => { if (!ui.media.sel.hasOwnProperty(f.uri)) ui.media.items.push(f); ui.media.sel[f.uri] = true; });
    if (ui.tab !== 'files') { ui.tab = 'files'; ui.filesSeg = 'send'; }
    CB.render(true);
  };

  A['media-toggle'] = (el, e) => {
    const f = ui.media.items[+el.dataset.i];
    if (!f) return;
    ui.media.sel[f.uri] = !ui.media.sel[f.uri];
    el.setAttribute('aria-pressed', String(ui.media.sel[f.uri]));
    el.querySelector('.tick').innerHTML = ui.media.sel[f.uri] ? CB.icon('check', 'xs') : '';
    const t = CB.pickedTotal();
    CB.setText('sel-sum', (t.n === 1 ? 'נבחר קובץ אחד' : 'נבחרו ' + t.n) + ' · ' + CB.bytes(t.size));
    CB.haptic();
  };

  // Holding a photo opens a large preview.
  CB.onLongPress = (el) => {
    if (el.dataset.action !== 'media-toggle') return false;
    const f = ui.media.items[+el.dataset.i];
    if (f) CB.openSheet('preview', f);
    return true;
  };

  A['picked-remove'] = (el) => { ui.picked.splice(+el.dataset.i, 1); CB.render(true); };
  A['picked-clear'] = () => { ui.picked = []; ui.media = null; CB.render(true); };

  A['send-picked'] = async () => {
    if (!CB.connected()) { CB.toast('קודם מחברים את שני הטלפונים'); return; }
    const files = CB.pickedList();
    if (!files.length) { CB.toast('לא נבחרו קבצים'); return; }
    try {
      await CB.N.call('sendFiles', { files });
      ui.picked = [];
      ui.media = null;
      CB.haptic(true);
      CB.render(true);
    } catch (e) { CB.toast('לא הצלחתי להתחיל את השליחה'); }
  };

  A['xfer-pause'] = (el) => CB.N.call('pauseTransfer', { tid: +el.dataset.tid, on: el.dataset.on === '1' });
  A['xfer-cancel'] = (el) => CB.confirm('ביטול ההעברה', 'לעצור את ההעברה? קבצים שכבר הגיעו נשארים, והחלקי נמחק.', 'עצירה', () => CB.N.call('cancelTransfer', { tid: +el.dataset.tid }), true);
  A['xfers-clear'] = () => CB.N.call('clearTransfers');

  A['offer-answer'] = async (el) => {
    const d = ui.sheet && ui.sheet.data;
    if (!d) return;
    const accept = el.dataset.accept === '1';
    if (accept) {
      const e = ui.env || (await CB.loadEnv()) || {};
      if (e.perms && e.perms.storage === false) await CB.N.call('requestPerms', { which: ['storage'] }).catch(() => null);
    }
    await CB.N.call('answerOffer', { tid: d.tid, accept });
    CB.closeSheet();
    if (accept) { ui.stack = []; ui.tab = 'files'; ui.filesSeg = 'received'; CB.render(); }
  };

  A['file-open'] = async (el) => {
    try {
      const r = await CB.N.call('open', { uri: el.dataset.uri, mime: el.dataset.mime });
      if (r && r.apk) CB.toast('קובץ ההתקנה נמצא בהורדות. מתקינים רק אם סומכים על מי ששלח', 4200);
    } catch (e) { CB.toast('אין אפליקציה שפותחת את הקובץ הזה'); }
  };
  A['file-share'] = (el) => CB.N.call('share', { uri: el.dataset.uri, mime: el.dataset.mime }).catch(() => CB.toast('לא הצלחתי לשתף'));
  A['open-downloads'] = () => CB.N.call('openDownloads').catch(() => CB.toast('לא הצלחתי לפתוח'));

  A['pick-folder'] = async () => {
    const r = await CB.N.call('pickFolder').catch(() => null);
    if (r && r.uri) { await CB.loadEnv(); CB.toast('קבצים חדשים יישמרו בתיקייה שבחרת'); CB.render(true); }
  };
  A['reset-folder'] = async () => { await CB.N.call('setFolder', { uri: '' }); await CB.loadEnv(); CB.render(true); };

  A['hist-filter'] = (el) => { ui.histFilter = el.dataset.v; CB.render(true); };
  A['hist-clear'] = () => CB.confirm('ניקוי ההיסטוריה', 'למחוק את רשימת ההעברות? הקבצים עצמם נשארים בטלפון.', 'ניקוי', async () => {
    await CB.N.call('historyClear');
    ui.history = [];
    CB.render(true);
  }, true);
})();
