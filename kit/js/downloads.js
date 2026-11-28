/* Live download counts. Every element with data-downloads="owner/repo" shows how many times that app's
   install file (.apk) was downloaded, read straight from GitHub's public releases. The number baked in when
   the site was built stays if GitHub can't be reached. Counts the same way as kit/lib/downloads.mjs.
   window.ITZKO_DL.load(repo, fresh) is also used by the numbers page (/itzko/stats/). */
(function () {
  var KEEP = 10 * 60 * 1000; // ask GitHub at most every 10 minutes per app (it allows 60 questions an hour)

  function summarize(releases) {
    var list = (releases || []).filter(function (r) { return !r.draft; }).map(function (r) {
      var sum = function (re) { return (r.assets || []).filter(function (a) { return re.test(a.name); }).reduce(function (n, a) { return n + (a.download_count || 0); }, 0); };
      return { tag: r.tag_name, name: r.name || r.tag_name, date: (r.published_at || r.created_at || '').slice(0, 10), apk: sum(/\.apk$/i), updates: sum(/^bundle\.zip$/i) };
    });
    return {
      total: list.reduce(function (n, r) { return n + r.apk; }, 0),
      updates: list.reduce(function (n, r) { return n + r.updates; }, 0),
      releases: list
    };
  }
  function timesText(n) { return n === 1 ? 'פעם אחת' : n === 2 ? 'פעמיים' : n.toLocaleString('en-US') + ' פעמים'; }

  function cached(repo) {
    try {
      var c = JSON.parse(localStorage.getItem('itzko.dl.' + repo) || 'null');
      return c && Date.now() - c.at < KEEP ? c : null;
    } catch (e) { return null; }
  }
  function remember(repo, data) {
    try { localStorage.setItem('itzko.dl.' + repo, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* private mode */ }
  }

  function load(repo, fresh) {
    var c = !fresh && cached(repo);
    if (c) return Promise.resolve(Object.assign({ checkedAt: c.at }, c.data));
    return fetch('https://api.github.com/repos/' + repo + '/releases?per_page=100', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rel) { var data = summarize(rel); remember(repo, data); return Object.assign({ checkedAt: Date.now() }, data); });
  }
  window.ITZKO_DL = { load: load, timesText: timesText };

  function show(el, total) {
    var n = el.querySelector('.n');
    if (n) n.textContent = timesText(total);
    el.hidden = !(total > 0);
  }
  document.querySelectorAll('[data-downloads]').forEach(function (el) {
    load(el.getAttribute('data-downloads')).then(function (d) { show(el, d.total); }).catch(function () { /* keep the built-in number */ });
  });
})();
