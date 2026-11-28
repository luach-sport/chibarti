/* Light / dark / follow the phone, including the phone's status bar colour. */
(function () {
  'use strict';
  const CB = window.CB;
  const BG = { light: '#F1F6F6', dark: '#0B1415' };

  CB.resolvedTheme = () => {
    const t = CB.state.settings.theme;
    if (t === 'system') return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return t;
  };

  CB.applyTheme = () => {
    const t = CB.resolvedTheme();
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('chibarti.theme', CB.state.settings.theme); } catch (e) { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BG[t]);
    if (CB.isNative()) {
      CB.call('StatusBar', 'setBackgroundColor', { color: BG[t] });
      CB.call('StatusBar', 'setStyle', { style: t === 'dark' ? 'DARK' : 'LIGHT' });
    }
  };

  CB.watchSystemTheme = () => {
    if (!window.matchMedia) return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => { if (CB.state.settings.theme === 'system') CB.applyTheme(); };
    try { mq.addEventListener('change', on); } catch (e) { try { mq.addListener(on); } catch (e2) { /* old WebView */ } }
  };
})();
