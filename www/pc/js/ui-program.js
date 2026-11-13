/* The first screen inside the program: a QR code to scan with the phone (no typing), the phones found on the
   network, and the 6-digit code as the other way. */
(function () {
  'use strict';
  const PC = window.PC;
  const P = window.PC_PROGRAM;
  if (!P) return;

  const qr = (text) => {
    if (!window.qrcode) return '';
    const q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + 2) + ' ' + (r + 2) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges" role="img" aria-label="קוד לסריקה בטלפון"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#0F1A1B"/></svg>';
  };

  PC.programPair = (ERR) => {
    const L = PC.L, mine = PC.store.get('phone', null) || {}, pair = PC.store.get('pair', '');
    if (PC.P.useCode) return null; // the regular 6-digit form (for the phone chosen below)
    const busy = L.state === 'pairing';
    const found = P.found.map((ph) => {
      const known = pair && ph.id === mine.id;
      return '<li>' + PC.icon('phone') + '<div><b><bdi>' + PC.esc(ph.name) + '</bdi></b><span>' + (known ? 'מתחבר…' : 'מציע חיבור') + '</span></div>' +
        (known ? '<i class="spin"></i>' : '<button class="btn ghost sm" data-act="prog-code" data-id="' + PC.esc(ph.id) + '">עם קוד</button>') + '</li>';
    }).join('');
    const err = L.error && ERR[L.error] && L.error !== 'unknown' ? '<p class="err" role="alert">' + PC.icon('alert', 'sm') + ERR[L.error] + '</p>' : '';
    const note = P.note === 'changed' ? '<p class="err warn-note" role="alert">' + PC.icon('alert', 'sm') + '<span>' + PC.esc(mine.name || 'הטלפון') + ' נראה אחרת ממה שהמחשב זוכר (אולי חיברתי הותקנה מחדש). כדי להתחבר שוב, סורקים את הקוד או מתחברים עם קוד.</span></p>' : '';
    return '<div class="pair-card prog">' +
      '<div class="pair-main"><h1>' + (pair && mine.name ? PC.esc(PC.pre('מתחברים ל', mine.name)) : 'מחברים את הטלפון') + '</h1>' +
      '<ol class="steps"><li>בטלפון פותחים את <b>חיברתי</b> ולוחצים <b>חיבור למחשב</b></li>' +
      (pair ? '<li>זהו. המחשב מתחבר לבד כשהטלפון נמצא ברשת</li>' : '<li>לוחצים <b>יש לך את תוכנת חיברתי במחשב?</b> וסורקים את הקוד שכאן</li>') + '</ol>' +
      '<div class="found"><h3>' + (P.found.length ? 'טלפונים ברשת' : busy ? 'מתחבר…' : 'מחפש את הטלפון ברשת…') + '</h3>' + (found ? '<ul>' + found + '</ul>' : '<p class="note"><i class="spin"></i>המחשב והטלפון צריכים להיות על אותו Wi-Fi.</p>') + '</div>' +
      (found && !(PC.HS && PC.HS.open) ? '' : PC.hotspotBox ? PC.hotspotBox(qr) : '') +
      note + err + '</div>' +
      '<aside class="pair-side qr-side"><div class="qr-box">' + qr(PC.claimQr()) + '</div><p>סורקים בטלפון, מתוך <b>חיבור למחשב</b></p>' +
      '<p class="safe">' + PC.icon('shield', 'sm') + '<span>ישירות בין המחשב לטלפון, בלי אינטרנט, בחיבור מוצפן.</span></p></aside></div>';
  };
})();
