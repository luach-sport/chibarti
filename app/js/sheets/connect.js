/* Sheets for connecting: type the other phone's 6-digit code, and "something is missing" (Wi-Fi, permission, location). */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const ui = CB.ui;

  CB.SHEETS.pin = {
    title: () => 'הקוד מהטלפון השני',
    init: (d) => { ui.form = { pin: '', bad: !!d.bad }; },
    render: (d) => {
      const pin = ui.form.pin;
      let boxes = '';
      for (let i = 0; i < 6; i++) boxes += '<span class="' + (i === pin.length ? 'cur' : '') + '">' + (pin[i] || '') + '</span>';
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
      return '<p class="fine" style="font-size:14px;text-align:center">בטלפון ' + esc(d.name || 'השני') + ' מופיעות 6 ספרות מתחת לקוד ה-QR.</p>' +
        '<div class="code-boxes' + (ui.form.bad ? ' bad' : '') + '" id="code-boxes" aria-live="polite">' + boxes + '</div>' +
        (ui.form.bad ? '<p class="fine" style="text-align:center;color:var(--red-text)">הקוד לא נכון. בודקים ומקלידים שוב.</p>' : '') +
        '<div class="keypad">' + keys.map((k) => k === '' ? '<button type="button" class="ghost" tabindex="-1" aria-hidden="true"></button>'
          : '<button type="button" data-action="pin-key" data-k="' + k + '"' + (k === 'del' ? ' aria-label="מחיקה"' : '') + '>' + (k === 'del' ? icon('backspace') : k) + '</button>').join('') + '</div>' +
        '<button type="button" class="btn" data-action="pin-go"' + (pin.length === 6 ? '' : ' aria-disabled="true"') + '>' + icon('link') + 'חיבור</button>';
    }
  };

  const NEED = {
    wifi: { ic: 'wifi', t: 'להדליק Wi-Fi', s: 'לא צריך אינטרנט, רק שה-Wi-Fi דלוק', a: 'enable-wifi', b: 'הדלקה' },
    perm: { ic: 'radar', t: 'לאשר חיבור ישיר', s: 'אנדרואיד מבקש אישור לחיבור Wi-Fi ישיר בין טלפונים', a: 'ask-perm', k: 'network', b: 'אישור' },
    location: { ic: 'location', t: 'להדליק מיקום', s: 'באנדרואיד הזה חיבור Wi-Fi ישיר עובד רק כשהמיקום דלוק. חיברתי לא משתמשת במיקום', a: 'open-settings', w: 'location', b: 'פתיחה' }
  };

  CB.SHEETS.needs = {
    title: () => 'עוד צעד קטן',
    render: (d) => {
      const miss = CB.missingFor(ui.env);
      if (!miss.length) return '<div class="notice green">' + icon('check', 'sm') + '<span class="grow">הכל מוכן.</span></div><button type="button" class="btn" data-action="needs-go">' + icon('link') + 'ממשיכים</button>';
      return '<div class="card list">' + miss.map((m) => {
        const n = NEED[m];
        return '<div class="row perm-row"><span class="tile must">' + icon(n.ic) + '</span><span class="grow"><span class="t">' + n.t + '</span><span class="s">' + n.s + '</span></span>' +
          '<button type="button" class="btn small" data-action="' + n.a + '"' + (n.k ? ' data-k="' + n.k + '"' : '') + (n.w ? ' data-what="' + n.w + '"' : '') + '>' + n.b + '</button></div>';
      }).join('') + '</div>' +
        (ui.env && ui.env.p2p === false ? '<p class="fine">בטלפון הזה אין Wi-Fi Direct, אז החיבור יעבור דרך Wi-Fi משותף.</p>' : '') +
        '<button type="button" class="btn secondary" data-action="needs-check">' + icon('refresh') + 'בדיקה שוב</button>';
    },
    onShow: () => {
      // coming back from Android's settings: check again by itself
      CB.needsWatch = setInterval(async () => { if (!CB.sheetIs('needs')) { clearInterval(CB.needsWatch); return; } await CB.loadEnv(); CB.renderSheet(); }, 2000);
    },
    onClose: () => clearInterval(CB.needsWatch)
  };
})();
