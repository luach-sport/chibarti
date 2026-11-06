/* Short messages at the bottom of the screen. */
(function () {
  'use strict';
  const CB = window.CB;
  let timer;

  CB.toast = (msg, ms) => {
    const root = CB.$('#toast-root');
    root.innerHTML = '<div class="toast">' + CB.esc(msg) + '</div>';
    clearTimeout(timer);
    timer = setTimeout(() => { root.innerHTML = ''; }, ms || 2600);
  };
})();
