/* The first state of a new install, and the choices for screen sharing. */
(function () {
  'use strict';
  const CB = window.CB;

  CB.QUALITIES = [
    { v: 'low', label: 'חסכונית', sub: '480p' },
    { v: 'standard', label: 'רגילה', sub: '720p' },
    { v: 'high', label: 'חדה', sub: '1080p' },
    { v: 'max', label: 'מקסימום', sub: '1080p · 60' }
  ];

  CB.defaults = () => ({
    v: 1,
    createdAt: Date.now(),
    setupDone: false,
    settings: { theme: 'system', quality: 'standard', audio: true, auto: true, haptics: true },
    outbox: [],
    profile: { name: '', email: '' },
    updateSeen: 0,
    readTexts: 0
  });
})();
