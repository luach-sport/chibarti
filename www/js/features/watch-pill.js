/* While watching the other device's screen in the small window (or after "minimize"), a pill above the tabs brings the
   big view back. The app stays usable meanwhile: files, messages, the room. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const base = CB.tabBadges;

  function pill() {
    const L = CB.L(), m = L.mirror || {};
    let el = document.getElementById('watch-pill');
    const on = m.role === 'viewing';
    if (!on) { if (el) el.remove(); document.body.classList.remove('watching'); return; }
    const text = 'צופה במסך של ' + (m.peer || CB.peerName() || 'המכשיר השני');
    if (!el) {
      el = document.createElement('div');
      el.id = 'watch-pill';
      el.innerHTML = '<button type="button" class="wp-open" data-action="open-viewer"><span class="live" aria-hidden="true"></span><span class="t"></span><span class="go">' + icon('eye', 'xs') + 'חזרה למסך</span></button>';
      document.body.appendChild(el);
    }
    const t = el.querySelector('.t');
    if (t.textContent !== text) t.textContent = text;
    document.body.classList.add('watching');
  }

  CB.tabBadges = function () { base.apply(this, arguments); try { pill(); } catch (e) { /* never break the screen */ } };
})();
