/* Settings actions: this phone's name. */
(function () {
  'use strict';
  const CB = window.CB;
  const A = CB.A;
  const ui = CB.ui;

  A['rename-save'] = async () => {
    const name = String(ui.form.name || '').trim();
    if (name.length < 2) { CB.toast('שם של לפחות 2 אותיות'); return; }
    await CB.N.call('setName', { name });
    CB.closeSheet();
    CB.toast('השם נשמר');
  };
  A['rename-reset'] = async () => { await CB.N.call('setName', { name: '' }); CB.closeSheet(); };
})();
