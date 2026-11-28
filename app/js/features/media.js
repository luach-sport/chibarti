/* Picked files and photos waiting to be sent, and small previews (made on the phone, kept in memory). */
(function () {
  'use strict';
  const CB = window.CB;
  const ui = CB.ui;
  const cache = {};
  const queue = [];
  let running = 0;

  CB.thumb = (uri, mime, size) => {
    const key = uri + '|' + (size || 240);
    if (cache[key]) return cache[key];
    cache[key] = new Promise((resolve) => {
      queue.push(() => CB.N.call('thumb', { uri, mime, size: size || 240 }).then((r) => resolve((r && r.data) || ''), () => resolve('')));
      pump();
    });
    return cache[key];
  };

  function pump() {
    while (running < 3 && queue.length) {
      running++;
      queue.shift()().then(() => { running--; pump(); }, () => { running--; pump(); });
    }
  }

  /** Fills every <img data-src-uri> and tile[data-thumb] on screen with its preview, without changing any size. */
  CB.loadThumbs = (root) => {
    (root || document).querySelectorAll('img[data-uri]:not([src])').forEach((img) => {
      CB.thumb(img.getAttribute('data-uri'), img.getAttribute('data-mime'), 240).then((d) => {
        if (!d) return;
        img.onload = () => img.classList.add('ok');
        img.src = d;
      });
    });
    (root || document).querySelectorAll('.tile[data-thumb]').forEach((t) => {
      const uri = t.getAttribute('data-thumb');
      t.removeAttribute('data-thumb');
      CB.thumb(uri, t.getAttribute('data-mime'), 120).then((d) => { if (d) t.innerHTML = '<img alt="" src="' + d + '">'; });
    });
  };

  CB.pickedTotal = () => {
    let n = 0, size = 0;
    ui.picked.forEach((f) => { n++; size += Math.max(0, f.size); });
    if (ui.media) ui.media.items.forEach((f) => { if (ui.media.sel[f.uri]) { n++; size += Math.max(0, f.size); } });
    return { n, size };
  };

  CB.pickedList = () => {
    const out = ui.picked.slice();
    if (ui.media) ui.media.items.forEach((f) => { if (ui.media.sel[f.uri]) out.push(f); });
    return out;
  };
})();
