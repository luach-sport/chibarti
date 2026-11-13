/* The room page: who is connected, which one screen sharing goes to ("ראשי"), and for the room's host: add a device,
   choose the main one, send one out. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;

  V.room = {
    html: () => {
      const L = CB.L(), host = CB.isRoomHost(), list = L.room || [], mirrorOn = (L.mirror || {}).role !== 'none';
      let h = '<div class="bar-top"><button type="button" class="icon-btn" aria-label="חזרה" data-action="back">' + icon('back') + '</button><h1 class="grow">החדר</h1></div>';
      h += '<p class="fine" style="font-size:14px">' + (host ? 'כל המכשירים מחוברים לטלפון הזה. הודעות עוברות לכולם, קבצים לכולם או למכשיר אחד, ושיתוף מסך הולך למכשיר הראשי.' : 'כולם מחוברים ל' + esc(CB.peerName()) + '. הודעות עוברות לכולם, וקבצים לכולם או למכשיר אחד.') + '</p>';
      h += '<div class="card list">' + list.map((m) => {
        const pc = m.kind === 'pc';
        let acts = '';
        if (host && !m.me) {
          if (!m.main && !mirrorOn) acts += '<button type="button" class="btn small secondary" data-action="room-main" data-id="' + esc(m.id) + '">' + icon('cast', 'sm') + 'לראשי</button>';
          acts += '<button type="button" class="icon-btn" data-action="room-remove" data-id="' + esc(m.id) + '" data-name="' + esc(m.name) + '" aria-label="הוצאה מהחדר">' + icon('close', 'sm') + '</button>';
        }
        const tags = (m.me ? ' <span class="badge">אני</span>' : '') + (m.host ? ' <span class="badge">מארח</span>' : '') + (m.main ? ' <span class="badge green">ראשי</span>' : '') + (m.state === 'reconnecting' ? ' <span class="badge">מתחבר שוב…</span>' : '');
        return '<div class="row dev-row' + (acts.indexOf('room-main') >= 0 ? ' stack' : '') + '"><span class="tile' + (m.me ? ' ok' : '') + '">' + icon(pc ? 'monitor' : 'phone') + '</span>' +
          '<span class="grow"><span class="t">' + esc(m.name || (pc ? 'מחשב' : 'טלפון')) + tags + '</span><span class="s">' + esc(m.model || '') + (m.via ? ' · ' + esc(CB.viaLabel(m.via)) : '') + '</span></span>' +
          (acts ? '<span class="acts">' + acts + '</span>' : '') + '</div>';
      }).join('') + '</div>';
      if (host) h += '<button type="button" class="btn" data-action="add-member"' + (CB.roomCount() >= 8 ? ' aria-disabled="true"' : '') + '>' + icon('plus') + 'הוספת מכשיר</button>' +
        '<p class="fine" style="text-align:center">עד 7 מכשירים מחוברים לטלפון הזה, כל אחד מאשרים פעם אחת.</p>';
      return h + '<button type="button" class="btn ghost" data-action="disconnect">' + icon('unlink') + (host ? 'סגירת החדר' : 'יציאה מהחדר') + '</button>';
    },
    sig: () => JSON.stringify(CB.L().room || []) + ((CB.L().mirror || {}).role || '')
  };

  const A = CB.A;
  A['open-room'] = () => CB.pushView({ name: 'room' });
  A['add-member'] = async () => {
    CB.haptic();
    CB.ui.hostFor = 'phone';
    await CB.N.call('host');
    if (CB.screenName() !== 'host') CB.pushView({ name: 'host' });
  };
  A['room-main'] = (el) => CB.N.call('setMain', { id: el.dataset.id }).catch(() => CB.toast('אפשר להחליף רק כשאין שיתוף מסך'));
  A['room-remove'] = (el) => CB.confirm('הוצאה מהחדר', 'להוציא את ' + (el.dataset.name || 'המכשיר') + ' מהחדר? הוא יוכל להצטרף שוב רק בקוד חדש.', 'הוצאה', () => CB.N.call('removeMember', { id: el.dataset.id }), true);
})();
