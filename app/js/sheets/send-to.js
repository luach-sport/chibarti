/* In a room: who gets the files — everyone, or one device. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const ui = CB.ui;

  CB.SHEETS.sendTo = {
    title: () => 'למי לשלוח?',
    render: (d) => {
      const others = CB.roomOthers(), n = (d.files || []).length;
      return '<p class="fine" style="font-size:14px">' + (n === 1 ? 'קובץ אחד' : n + ' קבצים') + ' · ' + CB.bytes((d.files || []).reduce((s, f) => s + Math.max(0, f.size || 0), 0)) + '. כל מכשיר מאשר לבד.</p>' +
        '<div class="card list">' +
        '<button type="button" class="row" data-action="send-to" data-to="*"><span class="tile ok">' + icon('phones') + '</span><span class="grow"><span class="t">לכולם</span><span class="s">' + others.length + ' מכשירים בחדר</span></span><span class="chev">' + icon('chevL', 'sm') + '</span></button>' +
        others.map((m) => '<button type="button" class="row" data-action="send-to" data-to="' + esc(m.id) + '"><span class="tile">' + icon(m.kind === 'pc' ? 'monitor' : 'phone') + '</span><span class="grow"><span class="t">' + esc(m.name || 'מכשיר') + (m.host ? ' <span class="badge">מארח</span>' : '') + '</span>' + (m.model ? '<span class="s">' + esc(m.model) + '</span>' : '') + '</span><span class="chev">' + icon('chevL', 'sm') + '</span></button>').join('') +
        '</div>';
    }
  };

  CB.A['send-to'] = async (el) => {
    const d = ui.sheet && ui.sheet.data;
    if (!d) return;
    const to = el.dataset.to === '*' ? CB.roomOthers().map((m) => m.id) : [el.dataset.to];
    CB.closeSheet();
    await CB.sendPicked(d.files, to);
  };
})();
