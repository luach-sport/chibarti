/* Online / offline status. */
(function () {
  'use strict';
  const CB = window.CB;

  let online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const netListeners = [];
  CB.online = () => online;
  CB.onNetwork = (cb) => netListeners.push(cb);
  function setOnline(v) {
    v = !!v;
    if (v === online) return;
    online = v;
    netListeners.forEach((cb) => { try { cb(v); } catch (e) { console.warn(e); } });
  }
  CB.initNetwork = async () => {
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
    if (CB.isNative()) {
      const st = await CB.call('Network', 'getStatus');
      if (st && typeof st.connected === 'boolean') online = st.connected;
      CB.listen('Network', 'networkStatusChange', (s) => setOnline(s && s.connected));
    }
  };
})();
