/* The phone controls this computer (only in the חיברתי program: a browser page can't move the mouse). The phone
   asks while it watches this screen; after "לאפשר", its touches arrive as INPUT and the program turns them into
   mouse and keyboard on the main screen. Needs the whole screen shared, so the places match. */
(function () {
  'use strict';
  const PC = window.PC;
  const T = PC.T;
  const S = PC.S;
  const J = (PC.J = { role: 'none' }); // none | asked | controlled
  let queue = Promise.resolve();

  const prog = () => window.PC_PROGRAM;
  PC.programCall = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chibarti': prog().token }, body: JSON.stringify(body || {}) })
    .then((r) => r.ok, () => false);

  PC.on(T.CONTROL_ASK, () => {
    if (S.role !== 'sending') { PC.send(T.CONTROL_REPLY, { accept: false, reason: 'not-sharing' }); return; }
    if (!prog()) { PC.send(T.CONTROL_REPLY, { accept: false, reason: 'browser' }); PC.toast('הטלפון ביקש לשלוט במחשב. זה עובד רק בתוכנת חיברתי למחשב'); return; }
    if (!PC.sharingWholeScreen()) { PC.send(T.CONTROL_REPLY, { accept: false, reason: 'not-screen' }); PC.toast('כדי שהטלפון ישלוט, משתפים את כל המסך (לא חלון)'); return; }
    if (J.role === 'controlled') { PC.send(T.CONTROL_REPLY, { accept: true }); return; }
    J.role = 'asked';
    PC.beep(880);
    PC.attention('הטלפון רוצה לשלוט במחשב');
    PC.render();
  });

  PC.answerControl = async (allow) => {
    if (J.role !== 'asked') return;
    if (allow && !(await PC.programCall('/api/control', { on: true }))) allow = false;
    PC.send(T.CONTROL_REPLY, allow ? { accept: true } : { accept: false, reason: 'declined' });
    J.role = allow ? 'controlled' : 'none';
    PC.render();
  };

  PC.on(T.INPUT, (b) => {
    if (J.role !== 'controlled') return;
    const o = PC.json(b);
    queue = queue.then(() => PC.programCall('/api/input', o));
  });

  PC.controlInStop = (tell) => {
    if (J.role === 'none') return;
    const was = J.role;
    J.role = 'none';
    if (prog()) PC.programCall('/api/control', { on: false });
    if (tell) PC.send(was === 'asked' ? T.CONTROL_REPLY : T.CONTROL_STOP, was === 'asked' ? { accept: false, reason: 'declined' } : {});
    PC.render();
  };

  // CONTROL_STOP ends whichever direction is on
  PC.on(T.CONTROL_STOP, () => {
    const a = PC.K.role !== 'none', b = J.role !== 'none';
    PC.controlOutStop(false);
    PC.controlInStop(false);
    if (a || b) PC.toast('השליטה מרחוק הסתיימה');
  });

  /** Screen sharing / watching ended or the connection closed: control ends with it. */
  PC.controlEnded = () => { PC.controlOutStop(false); PC.controlInStop(false); };

  PC.A['ctl-allow'] = () => PC.answerControl(true);
  PC.A['ctl-deny'] = () => PC.answerControl(false);
  PC.A['ctl-in-stop'] = () => PC.controlInStop(true);
})();
