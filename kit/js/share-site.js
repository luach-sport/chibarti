/* "Share the site" buttons ([data-share]). On a phone: the phone's own share menu, with a short personal
   message and the link. On a computer: a small menu with WhatsApp, Telegram, e-mail and copy. */
(function () {
  var S = window.ITZKO || {};
  var text = S.shareText || '';
  var url = S.url || location.href;
  var title = S.title || document.title;
  var full = text ? text + '\n' + url : url;

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast-mini';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2400);
  }
  function copy() {
    var done = function () { toast('ההודעה והקישור הועתקו. אפשר להדביק בכל מקום'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(full).then(done, fallback); return; }
    } catch (e) { /* use the fallback */ }
    fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = full;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { prompt('העתיקו את ההודעה:', full); }
      ta.remove();
    }
  }
  function item(href, color, letter, label) {
    return '<a href="' + href + '" target="_blank" rel="noopener"><span class="dot" style="background:' + color + '">' + letter + '</span>' + label + '</a>';
  }
  function panelFor(wrap) {
    var p = document.createElement('div');
    p.className = 'share-panel';
    p.setAttribute('role', 'menu');
    var enc = encodeURIComponent;
    p.innerHTML = item('https://wa.me/?text=' + enc(full), '#1FA855', 'W', 'וואטסאפ') +
      item('https://t.me/share/url?url=' + enc(url) + '&text=' + enc(text), '#2AA3DF', 'T', 'טלגרם') +
      item('mailto:?subject=' + enc(title) + '&body=' + enc(full), '#596070', '@', 'מייל') +
      '<button type="button" data-copy><span class="dot" style="background:#16181D">⧉</span>העתקת ההודעה והקישור</button>';
    p.querySelector('[data-copy]').addEventListener('click', function () { copy(); p.remove(); });
    wrap.appendChild(p);
    setTimeout(function () {
      document.addEventListener('click', function close(e) {
        if (!p.contains(e.target)) { p.remove(); document.removeEventListener('click', close); }
      });
    }, 0);
  }
  var phone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  document.querySelectorAll('[data-share]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (phone && navigator.share) {
        navigator.share({ title: title, text: text, url: url }).catch(function () { /* closed */ });
        return;
      }
      var wrap = btn.closest('.share-wrap') || btn.parentNode;
      var open = wrap.querySelector('.share-panel');
      if (open) open.remove(); else panelFor(wrap);
    });
  });
})();
