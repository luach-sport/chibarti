/* Inside the Windows program: the computer's own hotspot, for a computer whose internet is on Wi-Fi. The computer
   stays on its Wi-Fi (with internet) and shares a small network; the phone joins it (by its name and password, or
   by scanning the Wi-Fi code with its camera), and both are on one network. */
(function () {
  'use strict';
  const PC = window.PC;
  const P = window.PC_PROGRAM;
  if (!P) return;

  const H = (PC.HS = { open: false, busy: false, on: false, ssid: '', pass: '', error: '' });

  const call = (action) => fetch('/api/hotspot', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chibarti': P.token }, body: JSON.stringify({ action }) })
    .then((r) => (r.ok ? r.json() : { error: 'failed' }), () => ({ error: 'failed' }));

  const set = (h) => {
    H.on = !!h.on;
    H.ssid = h.ssid || '';
    H.pass = h.pass || '';
    H.error = h.error || '';
  };

  // A Wi-Fi code that phone cameras and Android's Wi-Fi settings understand.
  const esc = (s) => String(s).replace(/([\;,:"])/g, '\\$1');
  PC.wifiQr = () => 'WIFI:T:WPA;S:' + esc(H.ssid) + ';P:' + esc(H.pass) + ';;';

  const ERRS = {
    'no-internet': 'המחשב לא מחובר עכשיו לאינטרנט, ולכן Windows לא מפעיל נקודה חמה. אפשר לחבר את המחשב לרשת של הטלפון.',
    unsupported: 'במחשב הזה אין נקודה חמה ניידת.',
    powershell: 'Windows לא נתן להפעיל מכאן.',
    WiFiDeviceOff: 'ה-Wi-Fi במחשב כבוי. מדליקים אותו ומנסים שוב.',
    OperationInProgress: 'Windows עוד מפעיל את הנקודה החמה. מנסים שוב בעוד רגע.',
    NetworkLimitedConnectivity: 'החיבור לאינטרנט במחשב מוגבל עכשיו, ולכן Windows לא משתף רשת.'
  };

  PC.hotspotBox = (qr) => {
    if (!H.open) {
      return '<div class="hs-ask"><p>' + PC.icon('wifi', 'sm') + '<span>המחשב מחובר לאינטרנט ב-Wi-Fi? אין צורך להתנתק: מחברים את הטלפון לאותו Wi-Fi, או:</span></p>' +
        '<button class="btn ghost sm" data-act="hs-open">נקודה חמה מהמחשב</button></div>';
    }
    if (H.busy) return '<div class="hs-box"><p><i class="spin"></i>מפעיל נקודה חמה במחשב… (עד חצי דקה)</p></div>';
    if (H.error) {
      return '<div class="hs-box"><p class="err">' + PC.icon('alert', 'sm') + '<span>' + PC.esc(ERRS[H.error.split(' ')[0]] || 'לא הצלחתי להפעיל את הנקודה החמה מכאן.') + '</span></p>' +
        '<p>אפשר להפעיל אותה ב-Windows: <b>הגדרות ← רשת ואינטרנט ← נקודה חמה ניידת</b>, ואז לחבר אליה את הטלפון.</p>' +
        '<div class="hs-acts"><button class="btn sm" data-act="hs-settings">פתיחת ההגדרות</button><button class="btn ghost sm" data-act="hs-on">לנסות שוב</button></div></div>';
    }
    if (!H.on) return '<div class="hs-box"><p>המחשב ישתף רשת קטנה משלו, והאינטרנט במחשב נשאר.</p><div class="hs-acts"><button class="btn sm" data-act="hs-on">הפעלה</button><button class="btn ghost sm" data-act="hs-close">ביטול</button></div></div>';
    return '<div class="hs-box on"><div class="hs-qr">' + qr(PC.wifiQr()) + '</div><div class="hs-text">' +
      '<b>הנקודה החמה של המחשב פועלת</b>' +
      '<p>בטלפון מתחברים ל-Wi-Fi <b class="ltr"><bdi>' + PC.esc(H.ssid) + '</bdi></b>, סיסמה <b class="ltr"><bdi>' + PC.esc(H.pass) + '</bdi></b>. או: סורקים את הקוד הקטן שכאן במצלמה של הטלפון (או בהגדרות ה-Wi-Fi ← סריקת קוד).</p>' +
      '<p>אחר כך בחיברתי: <b>חיבור למחשב</b>. בפעם הראשונה סורקים את הקוד הגדול, ומאז המחשב מוצא את הטלפון לבד.</p>' +
      '<button class="btn ghost sm" data-act="hs-off">כיבוי הנקודה החמה</button></div></div>';
  };

  const run = async (action) => {
    H.open = true;
    H.busy = true;
    PC.render();
    set(await call(action));
    H.busy = false;
    PC.render();
  };
  PC.A['hs-open'] = async () => {
    H.open = true;
    H.busy = true;
    PC.render();
    set(await call('state'));
    H.busy = false;
    if (H.error === 'unsupported') H.error = ''; // shown when turning it on
    PC.render();
  };
  PC.A['hs-on'] = () => run('on');
  PC.A['hs-off'] = async () => { await run('off'); H.open = false; PC.render(); };
  PC.A['hs-close'] = () => { H.open = false; PC.render(); };
  PC.A['hs-settings'] = () => call('settings');

  // Windows turns its hotspot off by itself after a few minutes with nobody on it: keep what's shown true.
  setInterval(async () => {
    if (!H.open || !H.on || H.busy || document.hidden || !document.querySelector('.hs-box.on')) return;
    const h = await call('state');
    if (h.error || !!h.on === H.on) return;
    set(h);
    PC.render();
  }, 30000);
})();
