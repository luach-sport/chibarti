/* Checks saved data (from this or an older version) and fills in anything missing, so the app always starts. */
(function () {
  'use strict';
  const CB = window.CB;
  const THEMES = { light: 1, dark: 1, system: 1 };

  CB.normalize = (raw) => {
    const d = CB.defaults();
    if (!CB.isObj(raw)) return d;
    const s = CB.isObj(raw.settings) ? raw.settings : {};
    const q = CB.QUALITIES.map((x) => x.v);
    return {
      v: 1,
      createdAt: Number(raw.createdAt) || d.createdAt,
      setupDone: !!raw.setupDone,
      settings: {
        theme: THEMES[s.theme] ? s.theme : 'system',
        quality: q.indexOf(s.quality) >= 0 ? s.quality : 'standard',
        audio: s.audio !== false,
        auto: s.auto !== false,
        haptics: s.haptics !== false
      },
      outbox: Array.isArray(raw.outbox) ? raw.outbox.filter(CB.isObj).slice(-30) : [],
      profile: CB.isObj(raw.profile) ? { name: CB.str(raw.profile.name, 80), email: CB.str(raw.profile.email, 120) } : d.profile,
      updateSeen: Number(raw.updateSeen) || 0,
      readTexts: Number(raw.readTexts) || 0
    };
  };
})();
