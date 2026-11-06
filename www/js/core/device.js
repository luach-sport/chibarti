/* Opening links, the Android share menu, a light vibration on taps. */
(function () {
  'use strict';
  const CB = window.CB;

  CB.openExternal = async (url) => {
    if (CB.isNative()) {
      try { await CB.callRaw('AppLauncher', 'openUrl', { url }); return true; } catch (e) { console.warn('openUrl', e && e.message); }
    }
    try { window.open(url, '_blank', 'noopener'); return true; } catch (e) { return false; }
  };
  CB.writeClipboard = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* older WebView */ }
    try {
      const t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch (e) { return false; }
  };
  CB.shareText = async (text, title) => {
    if (CB.isNative()) { try { await CB.callRaw('Share', 'share', { text, title, dialogTitle: title || 'שיתוף' }); return true; } catch (e) { return false; } }
    if (navigator.share) { try { await navigator.share({ text, title }); return true; } catch (e) { return false; } }
    const ok = await CB.writeClipboard(text);
    if (ok && CB.toast) CB.toast('הועתק ללוח');
    return ok;
  };
  CB.haptic = (strong) => {
    if (!CB.isNative() || (CB.state && CB.state.settings && CB.state.settings.haptics === false)) return;
    CB.call('Haptics', 'impact', { style: strong ? 'MEDIUM' : 'LIGHT' });
  };
})();
