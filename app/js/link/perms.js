/* Before connecting: Wi-Fi on, Android's permission for direct Wi-Fi (Android 13+: "nearby devices";
   older: location, which Android requires for Wi-Fi Direct; nothing is located), and on Android 6-12 the
   location switch itself. Anything missing opens a sheet that explains it and fixes it with one tap. */
(function () {
  'use strict';
  const CB = window.CB;
  const ui = CB.ui;

  CB.loadEnv = async () => {
    try { ui.env = await CB.N.call('env'); } catch (e) { ui.env = ui.env || null; }
    return ui.env;
  };

  CB.missingFor = (e) => {
    const miss = [];
    if (!e) return miss;
    if (!e.wifiOn) miss.push('wifi');
    const key = e.sdk >= 33 ? 'nearby' : 'location';
    if (e.perms && e.perms[key] === false) miss.push('perm');
    if (e.locationNeeded && !e.locationOn) miss.push('location');
    return miss;
  };

  /** Resolves true when everything needed for a direct connection is there; otherwise explains and returns false. */
  CB.ensureNetwork = async (then) => {
    let e = await CB.loadEnv();
    if (!e) return true;
    const key = e.sdk >= 33 ? 'nearby' : 'location';
    if (e.perms && e.perms[key] === false) {
      const which = ['network'];
      if (e.perms.notifications === false) which.push('notifications');
      try { e = ui.env = await CB.N.call('requestPerms', { which }); } catch (err) { /* answered below */ }
    }
    const miss = CB.missingFor(e);
    if (!miss.length) return true;
    CB.openSheet('needs', { miss, then });
    return false;
  };

  CB.ensureCamera = async () => {
    let e = await CB.loadEnv();
    if (!e || !e.perms || e.perms.camera !== false) return true;
    try { e = ui.env = await CB.N.call('requestPerms', { which: ['camera'] }); } catch (err) { /* below */ }
    return !!(e && e.perms && e.perms.camera);
  };

  CB.ensureAudioPerm = async () => {
    let e = await CB.loadEnv();
    if (!e || !e.audioCapture) return false;
    if (e.perms && e.perms.audio) return true;
    try { e = ui.env = await CB.N.call('requestPerms', { which: ['audio'] }); } catch (err) { /* below */ }
    return !!(e && e.perms && e.perms.audio);
  };
})();
