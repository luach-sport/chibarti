/* The app's own data (CB.state: settings, feedback outbox) and what is on screen (CB.ui).
   Everything about the connection lives on the Android side and arrives as CB.live (js/link/live.js). */
(function () {
  'use strict';
  const CB = window.CB;

  CB.save = (now) => CB.saveState(CB.state, now);

  CB.ui = {
    tab: 'home', stack: [], scroll: {}, sheet: null, form: {},
    filesSeg: 'send', histFilter: 'all', env: null, picked: [], media: null, history: null, texts: null, draft: ''
  };
  CB.view = () => CB.ui.stack[CB.ui.stack.length - 1] || null;
})();
