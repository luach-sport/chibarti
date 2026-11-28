/* Bridge to the Android side (Capacitor plugins). In a browser (the site's screenshots, tests) there is no plugin. */
(function () {
  'use strict';
  const CB = window.CB;

  CB.capacitor = () => { const rt = window.ChibartiCap; return (rt && rt.Capacitor) || window.Capacitor || null; };
  CB.isNative = () => {
    const C = CB.capacitor();
    if (!C) return false;
    try { return typeof C.isNativePlatform === 'function' ? !!C.isNativePlatform() : C.platform === 'android'; } catch (e) { return false; }
  };
  const pluginCache = {};
  CB.plugin = (name) => {
    if (!CB.isNative()) return null;
    if (Object.prototype.hasOwnProperty.call(pluginCache, name)) return pluginCache[name];
    let p = null;
    try {
      const rt = window.ChibartiCap;
      if (rt && typeof rt.registerPlugin === 'function') p = rt.registerPlugin(name);
      else if (window.Capacitor && window.Capacitor.Plugins) p = window.Capacitor.Plugins[name] || null;
    } catch (e) { p = null; }
    pluginCache[name] = p;
    return p;
  };
  CB.callRaw = async (name, method, args) => {
    const p = CB.plugin(name);
    if (!p || typeof p[method] !== 'function') throw new Error('no-plugin ' + name + '.' + method);
    return p[method](args);
  };
  CB.call = async (name, method, args) => {
    try { return await CB.callRaw(name, method, args); } catch (e) { console.warn('[native]', name, method, e && (e.message || e)); return undefined; }
  };
  CB.listen = async (name, event, cb) => {
    const p = CB.plugin(name);
    if (!p) return;
    try { await p.addListener(event, cb); } catch (e) { console.warn('[native] listen', name, event, e && e.message); }
  };
})();
