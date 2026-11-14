/* Keeps "more apps by Itzko" and the versions on the main Itzko site up to date without rebuilding:
   every site lives on the same address (luach-sport.github.io), so the page can read the latest list of
   apps (/itzko/apps.json) and each app's current version (/<app>/version.json). The built-in list stays if
   anything fails. */
(function () {
  if (!/\.github\.io$/.test(location.hostname)) return;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var get = function (path) { return fetch(location.origin + path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };

  var grid = document.querySelector('[data-more-apps]');
  if (grid) {
    get('/itzko/apps.json').then(function (apps) {
      var me = grid.getAttribute('data-more-apps');
      var cards = apps.filter(function (a) { return a.id !== me; }).map(function (a) {
        return '<a class="app-card" href="' + esc(a.site) + '"><img src="' + esc(a.site) + 'icon.png" alt="" width="52" height="52" loading="lazy">' +
          '<span class="txt"><b>' + esc(a.name) + '</b><small>' + esc(a.short) + '</small><span class="go">לאתר של ' + esc(a.name) + ' ←</span></span></a>';
      });
      if (cards.length) grid.innerHTML = cards.join('');
    }).catch(function () { /* keep the built-in list */ });
  }

  document.querySelectorAll('[data-app-version]').forEach(function (el) {
    get('/' + el.getAttribute('data-app-version') + '/version.json').then(function (v) {
      if (v && v.version) el.textContent = 'גרסה ' + v.version + (v.build ? ' (בנייה ' + v.build + ')' : '');
    }).catch(function () { /* keep the built-in version */ });
  });
})();
