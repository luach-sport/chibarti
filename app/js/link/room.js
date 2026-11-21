/* A room: several devices on one phone that offered the connection (the room's host). Android sends the list
   (CB.live.room: everyone, this phone marked "me"); these helpers answer "who else is here" and "am I the host". */
(function () {
  'use strict';
  const CB = window.CB;

  /** Everyone in the room except this phone. */
  CB.roomOthers = () => (CB.L().room || []).filter((m) => !m.me);
  /** More than one other device: a real room (with one other device everything stays as between two phones). */
  CB.inRoom = () => CB.roomOthers().length > 1;
  /** This phone offered the connection: it can add devices, choose who screen sharing goes to, send someone out. */
  CB.isRoomHost = () => !!(CB.L().link && CB.L().link.host);
  CB.roomName = (id) => { const m = (CB.L().room || []).filter((x) => x.id === id)[0]; return m ? m.name : ''; };
  CB.roomCount = () => CB.roomOthers().length + 1;
})();
