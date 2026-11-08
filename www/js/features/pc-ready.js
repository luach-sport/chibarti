/* While the app is open, a remembered computer on the same Wi-Fi can connect by itself (from the חיברתי program):
   the phone answers it then without a code. Off when the app is in the background. */
(function () {
  'use strict';
  const CB = window.CB;
  let last = null;

  function sync() {
    const want = !document.hidden && (CB.L().devices || []).some((d) => d.via === 'program') && !CB.connected();
    if (want === last) return;
    last = want;
    CB.N.call('pcReady', { on: want }).catch(() => { last = null; });
  }

  document.addEventListener('visibilitychange', sync);
  setInterval(sync, 4000);
  CB.syncPcReady = sync;
})();
