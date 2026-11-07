/* The connection to the phone: a WebSocket over HTTPS to the page's own address. First message HELLO with the
   6-digit code (or this computer's remembered key); the phone answers after the user approves on the phone.
   A dropped connection comes back by itself for 30 s (same session key, no new code). */
(function () {
  'use strict';
  const PC = window.PC;
  const T = PC.T;
  const L = (PC.L = { ws: null, stream: null, state: 'off', phone: {}, key: '', since: 0, lastRx: 0, rtt: -1, error: '' });
  const handlers = {};
  PC.on = (type, fn) => { handlers[type] = fn; };

  PC.myId = () => {
    let id = PC.store.get('id', '');
    if (!/^[0-9a-f]{32}$/.test(id)) { id = PC.hex(PC.rand(16)); PC.store.set('id', id); }
    return id;
  };

  function open(hello, onFirst) {
    const ws = new WebSocket('wss://' + location.host + '/ws');
    ws.binaryType = 'arraybuffer';
    let first = true;
    ws.onopen = () => ws.send(PC.frame(T.HELLO, hello));
    ws.onmessage = (e) => {
      const u = new Uint8Array(e.data), type = u[0], body = u.subarray(1);
      L.lastRx = Date.now();
      if (first) { first = false; onFirst(type, PC.json(body), ws); return; }
      if (type === T.PING) { try { ws.send(PC.frame(T.PONG, body)); } catch (err) { /* closing */ } return; }
      if (type === T.PONG) { const o = PC.json(body); if (o.t) L.rtt = Date.now() - o.t; return; }
      const h = handlers[type];
      if (h) { try { h(body, ws); } catch (err) { console.warn('message', type, err); } }
    };
    return ws;
  }

  /** mode: 'pin' (with the code) or 'trusted' (this computer was remembered). Resolves with null or an error code. */
  PC.connect = (mode, pin, remember) => new Promise((resolve) => {
    L.state = 'pairing';
    L.error = '';
    PC.render();
    const hello = { mode, id: PC.myId(), name: PC.store.get('name', '') || PC.deviceName(), model: PC.deviceModel() };
    if (mode === 'pin') hello.pin = pin;
    else hello.key = PC.store.get('pair', '');
    const ws = open(hello, (type, o, sock) => {
      if (type !== T.APPROVED) { L.state = 'off'; L.error = o.reason || 'declined'; try { sock.close(); } catch (e) { /* gone */ } PC.render(); resolve(L.error); return; }
      if (o.pair) { if (remember) PC.store.set('pair', o.pair); }
      if (mode === 'pin' && !remember) PC.store.set('pair', '');
      PC.store.set('phone', { name: o.name, id: o.id });
      L.key = o.key;
      L.phone = { name: o.name, model: o.model, sdk: o.sdk };
      L.state = 'on';
      L.since = Date.now();
      attach(sock);
      PC.render();
      resolve(null);
    });
    ws.onclose = () => { if (L.state === 'pairing') { L.state = 'off'; L.error = L.error || 'unreachable'; PC.render(); resolve(L.error); } };
  });

  function attach(ws) {
    L.ws = ws;
    ws.onclose = () => { if (L.ws === ws && L.state === 'on') reconnect(); };
  }

  // The phone pings every 2.5 s; silence for 12 s means the connection is gone.
  setInterval(() => {
    if (L.state === 'on' && L.ws && Date.now() - L.lastRx > 12000) { try { L.ws.close(); } catch (e) { /* gone */ } }
    if (L.state === 'on' && L.ws && L.ws.readyState === 1) PC.send(T.PING, { t: Date.now() });
  }, 3000);

  async function reconnect() {
    L.state = 'reconnecting';
    PC.render();
    PC.onLinkLost();
    const until = Date.now() + 30000;
    while (Date.now() < until && L.state === 'reconnecting') {
      const ok = await new Promise((resolve) => {
        const ws = open({ mode: 'resume', id: PC.myId(), key: L.key }, (type, o, sock) => {
          if (type !== T.APPROVED) { resolve(false); try { sock.close(); } catch (e) { /* gone */ } return; }
          attach(sock);
          resolve(true);
        });
        ws.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 5000);
      });
      if (ok) { L.state = 'on'; PC.toast('החיבור חזר'); PC.render(); PC.onResumed(); return; }
      await PC.sleep(2000);
    }
    if (L.state === 'reconnecting') PC.ended('lost');
  }

  /** The second connection, for the screen (opened by the computer when sharing starts in either direction). */
  PC.openStream = () => new Promise((resolve) => {
    const ws = open({ mode: 'stream', id: PC.myId(), key: L.key }, (type, o, sock) => {
      if (type !== T.APPROVED) { resolve(null); return; }
      L.stream = sock;
      resolve(sock);
    });
    ws.onclose = () => { if (L.stream === ws) L.stream = null; };
    setTimeout(() => resolve(null), 8000);
  });

  PC.send = (type, body) => {
    const ws = L.ws;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(PC.frame(type, body));
    return true;
  };

  PC.disconnect = () => {
    PC.send(T.BYE, { reason: 'user' });
    PC.ended('user');
  };

  PC.ended = (why) => {
    const ws = L.ws, st = L.stream;
    L.state = 'off';
    L.ws = null;
    L.stream = null;
    L.error = why === 'user' ? '' : why;
    try { if (ws) ws.close(); } catch (e) { /* gone */ }
    try { if (st) st.close(); } catch (e) { /* gone */ }
    PC.onEnded();
    PC.render();
    if (why === 'lost') PC.toast('החיבור עם הטלפון אבד');
    if (why === 'peer') PC.toast('הטלפון ניתק את החיבור');
  };

  PC.on(T.BYE, () => PC.ended('peer'));
})();
