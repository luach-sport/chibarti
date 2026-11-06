/* Screen sharing: start (Android asks first), answer a request, stop, back to the full-screen view. */
(function () {
  'use strict';
  const CB = window.CB;
  const A = CB.A;

  A['mirror-start'] = async () => {
    if (!CB.connected()) { CB.toast('קודם מחברים את שני הטלפונים'); return; }
    const st = CB.state.settings;
    let audio = st.audio && !!(CB.ui.env && CB.ui.env.audioCapture);
    if (audio && !(await CB.ensureAudioPerm())) audio = false;
    try {
      const r = await CB.N.call('mirrorStart', { quality: st.quality, fps: st.quality === 'max' ? 60 : 30, audio, auto: st.auto });
      if (r && r.ok === false && CB.isNative()) CB.toast('השיתוף בוטל');
    } catch (e) {
      CB.toast(String(e && e.message).indexOf('busy') >= 0 ? 'כבר יש שיתוף מסך פעיל' : 'לא הצלחתי להתחיל שיתוף');
    }
  };
  A['mirror-stop'] = () => CB.N.call('mirrorStop');
  A['mirror-answer'] = async (el) => {
    const accept = el.dataset.accept === '1';
    CB.closeSheet();
    await CB.N.call('mirrorAnswer', { accept });
  };
  A['open-viewer'] = () => CB.N.call('openViewer');
})();
