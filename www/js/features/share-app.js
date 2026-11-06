/* Sharing the app with friends: a short personal message with the link to the app's site, or the app
   itself as an APK file (Bluetooth, WhatsApp, Nearby Share, file manager…).
   The APK file is the one installed on this phone, so it works without internet. If that copy can't be
   reached, the latest APK is downloaded from GitHub instead. */
(function () {
  'use strict';
  const CB = window.CB;
  const S = (CB.shareApp = {});
  const FILE = 'share/chibarti.apk';

  S.text = 'היי! אני משתמש באפליקציה חיברתי. היא מחברת שני טלפוני אנדרואיד ישירות, בלי אינטרנט: שיקוף מסך, שליחת קבצים ותמונות באיכות מלאה והודעות. אשמח מאוד לשתף אותך:';
  S.message = () => S.text + '\n' + CB.SITE_URL;

  S.link = () => CB.shareText(S.message(), 'שיתוף חיברתי');

  // Where Android installed this app: the line with base.apk in the process memory map.
  async function installedApk() {
    const r = await CB.callRaw('Filesystem', 'readFile', { path: '/proc/self/maps', encoding: 'utf8' });
    const m = String((r && r.data) || '').match(/(\/data\/app\/\S+?\/base\.apk)/);
    if (!m) throw new Error('no base.apk');
    return m[1];
  }

  async function prepareFile(onStatus) {
    try { await CB.callRaw('Filesystem', 'deleteFile', { path: FILE, directory: 'CACHE' }); } catch (e) { /* not there */ }
    await CB.fs.mkdir('share', 'CACHE');
    try {
      await CB.callRaw('Filesystem', 'copy', { from: await installedApk(), to: FILE, toDirectory: 'CACHE' });
    } catch (e) {
      console.warn('apk copy', e && (e.message || e));
      if (!CB.online()) throw new Error('offline');
      onStatus('מוריד את הקובץ…');
      await CB.callRaw('Filesystem', 'downloadFile', { url: CB.APK_URL, path: FILE, directory: 'CACHE', recursive: true });
    }
    const st = await CB.callRaw('Filesystem', 'stat', { path: FILE, directory: 'CACHE' });
    if (!st || st.size < 500000) throw new Error('small file');
    return (await CB.callRaw('Filesystem', 'getUri', { path: FILE, directory: 'CACHE' })).uri;
  }

  // The app file itself (for sending it straight to the connected phone).
  S.file = async () => {
    const uri = await prepareFile(() => {});
    const st = await CB.callRaw('Filesystem', 'stat', { path: FILE, directory: 'CACHE' });
    return { uri, name: 'chibarti.apk', size: st && st.size ? st.size : -1, mime: 'application/vnd.android.package-archive' };
  };

  S.apk = async () => {
    if (!CB.isNative()) { window.open(CB.APK_URL, '_blank'); return true; }
    if (S.busy) return false;
    S.busy = true;
    CB.toast('מכין את הקובץ…', 8000);
    try {
      const uri = await prepareFile((t) => CB.toast(t, 30000));
      const t = CB.$('#toast-root'); if (t) t.innerHTML = '';
      await CB.callRaw('Share', 'share', { title: 'חיברתי', text: S.message(), files: [uri], dialogTitle: 'שליחת האפליקציה כקובץ' });
      return true;
    } catch (e) {
      const msg = String(e && (e.message || e));
      if (/cancel/i.test(msg)) return false;
      console.warn('share apk', msg);
      CB.toast(msg === 'offline' ? 'אין אינטרנט כרגע. אפשר לשלוח קישור לאתר במקום' : 'לא הצלחתי להכין את הקובץ. אפשר לשלוח קישור לאתר במקום', 4000);
      return false;
    } finally {
      S.busy = false;
    }
  };
})();
