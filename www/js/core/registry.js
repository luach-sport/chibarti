/* Registries the other files fill in: screens (views), bottom sheets (SHEETS), button actions (A) and tasks (TASKS). */
(function () {
  'use strict';
  const CB = window.CB;
  CB.views = CB.views || {};
  CB.SHEETS = CB.SHEETS || {};
  CB.A = CB.A || {};
  CB.TASKS = CB.TASKS || {};
  CB.$ = (sel, root) => (root || document).querySelector(sel);
})();
