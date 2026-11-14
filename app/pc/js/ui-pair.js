/* The first screen: type the 6-digit code shown on the phone (or connect at once to a phone that remembers this
   computer). The phone still asks its owner before anything is shared. */
(function () {
  'use strict';
  const PC = window.PC;
  const L = PC.L;
  const P = (PC.P = { pin: '', remember: PC.store.get('remember', true), useCode: false });

  const ERR = {
    'wrong-code': 'הקוד לא נכון. בודקים את 6 הספרות שבטלפון ומנסים שוב.',
    expired: 'הטלפון לא מציע חיבור כרגע. בטלפון: חיבור למחשב, ואז מקלידים את הקוד החדש.',
    declined: 'בטלפון לחצו "לא לאשר".',
    timeout: 'לא אישרו בטלפון בזמן. מנסים שוב ולוחצים "אישור" בטלפון.',
    busy: 'הטלפון כבר מחובר למכשיר אחר.',
    unknown: 'הטלפון כבר לא זוכר את המחשב הזה. מתחברים עם קוד.',
    'not-offering': 'בטלפון פותחים את חיברתי ולוחצים "חיבור למחשב", ואז מתחברים שוב.',
    unreachable: 'אין קשר לטלפון. בודקים שהמחשב מחובר לרשת של הטלפון ושהמסך "חיבור למחשב" פתוח בטלפון.',
    lost: 'החיבור עם הטלפון אבד.',
    bad: 'משהו השתבש. רעננו את הדף ונסו שוב.'
  };

  const remembered = () => !!PC.store.get('pair', '') && !!(PC.store.get('phone', null) || {}).name;

  const features = () => [
    ['files', 'קבצים בשני הכיוונים', 'בכל גודל, נבדקים בסוף שהגיעו שלמים'],
    ['phone', 'המסך של הטלפון כאן', 'בחלון גדול או במסך מלא'],
    ['monitor', 'המסך של המחשב בטלפון', 'עם הקול של המחשב'],
    ['message', 'הודעות וקישורים', 'מעתיקים מהמחשב לטלפון ובחזרה']
  ].map((f) => '<li>' + PC.icon(f[0]) + '<div><b>' + f[1] + '</b><span>' + f[2] + '</span></div></li>').join('');

  PC.part('pair', () => {
    const prog = PC.programPair ? PC.programPair(ERR) : null;
    if (prog) return prog;
    const busy = L.state === 'pairing';
    const phone = PC.store.get('phone', null) || {};
    const quick = remembered() && !P.useCode && !PC.program;
    let form;
    if (quick) {
      form = '<p class="lead">המחשב הזה זוכר את הטלפון. מתחברים בלי קוד (הטלפון צריך להיות על המסך "חיבור למחשב").</p>' +
        '<button class="btn primary big" data-act="quick"' + (busy ? ' disabled' : '') + '>' + (busy ? '<i class="spin"></i>מתחבר…' : PC.icon('link') + PC.esc(PC.pre('התחברות ל', phone.name))) + '</button>' +
        '<button class="btn link" data-act="use-code"' + (busy ? ' disabled' : '') + '>להתחבר עם קוד</button>';
    } else {
      form = (PC.program ? '<button class="btn link" data-act="prog-back">← חזרה לסריקה</button>' : '') +
        '<ol class="steps"><li>' + (P.codeFor ? PC.esc(PC.pre('ב', P.codeFor)) : 'בטלפון') + ' פותחים את <b>חיברתי</b> ולוחצים <b>חיבור למחשב</b></li><li>מקלידים כאן את הקוד שמופיע בטלפון</li></ol>' +
        '<form id="pinForm" class="pin-form" autocomplete="off">' +
        '<input id="pin" class="pin" inputmode="numeric" pattern="[0-9]*" maxlength="7" placeholder="••••••" aria-label="הקוד מהטלפון" dir="ltr"' + (busy ? ' disabled' : '') + '>' +
        '<label class="check"><input id="remember" type="checkbox"' + (busy ? ' disabled' : '') + '><span>לזכור את המחשב הזה (בפעם הבאה בלי קוד)</span></label>' +
        '<button class="btn primary big" type="submit"' + (busy ? ' disabled' : '') + '>' + (busy ? '<i class="spin"></i>מחכים לאישור בטלפון…' : PC.icon('link') + 'התחברות') + '</button>' +
        '</form>' + (remembered() && !PC.program ? '<button class="btn link" data-act="use-quick">' + PC.esc(PC.pre('חזרה להתחברות מהירה ל', phone.name)) + '</button>' : '');
    }
    const note = busy ? '<p class="note">בטלפון יופיע שהמחשב רוצה להתחבר. לוחצים <b>אישור</b>.</p>' : L.error && ERR[L.error] ? '<p class="err" role="alert">' + PC.icon('alert', 'sm') + ERR[L.error] + '</p>' : '';
    return '<div class="pair-card">' +
      '<div class="pair-main">' + PC.logo(64) + '<h1>מחברים את המחשב לטלפון</h1>' + form + note + '</div>' +
      '<aside class="pair-side"><h3>מה אפשר לעשות</h3><ul class="feat">' + features() + '</ul>' +
      '<p class="safe">' + PC.icon('shield', 'sm') + '<span>הכל עובר ישירות בין המחשב לטלפון, בלי אינטרנט ובלי שרת, בחיבור מוצפן. שום דבר לא עובר בלי אישור בטלפון.</span></p></aside>' +
      '</div>';
  }, null, (el) => {
    const pin = el.querySelector('#pin');
    if (pin) {
      pin.value = P.pin;
      const rem = el.querySelector('#remember');
      rem.checked = !!P.remember;
      if (!pin.disabled) setTimeout(() => pin.focus(), 0);
    }
  });

  PC.pinInput = (el) => {
    const v = el.value.replace(/\D/g, '').slice(0, 6);
    if (el.value !== v) el.value = v;
    P.pin = v;
    if (v.length === 6) PC.A.pair();
  };

  PC.A.pair = async () => {
    if (L.state !== 'off' || P.pin.length !== 6) { if (P.pin.length !== 6) PC.toast('מקלידים את 6 הספרות שבטלפון'); return; }
    const rem = PC.$('#remember');
    P.remember = rem ? rem.checked : P.remember;
    PC.store.set('remember', P.remember);
    PC.audioCtx();
    const err = await PC.connect('pin', P.pin, P.remember);
    if (err) { P.pin = ''; PC.redraw('pair'); } else P.pin = '';
  };

  PC.A.quick = async () => {
    if (L.state !== 'off') return;
    PC.audioCtx();
    const err = await PC.connect('trusted', '', true);
    if (err === 'unknown') { PC.store.set('pair', ''); P.useCode = true; PC.render(); }
  };
  PC.A['use-code'] = () => { P.useCode = true; PC.render(); };
  PC.A['use-quick'] = () => { P.useCode = false; PC.render(); };
})();
