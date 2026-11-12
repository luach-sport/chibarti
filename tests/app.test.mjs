// Checks חיברתי's screens in a phone-sized browser, with the browser stand-in for Android (CB.sim in js/link/bridge.js):
// sizes and times in Hebrew, the QR code (made and read back by the camera reader), connecting, approvals, files,
// messages, settings, no sideways scrolling on a small phone, and no redraws (jumps) when only numbers change.
// Run: python3 -m http.server 8765 --directory www   then   node tests/app.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(process.env.PW_FROM || '/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8765/index.html';
let failed = 0, passed = 0;
const ok = (cond, name, extra) => { if (cond) passed++; else { failed++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await (await browser.newContext({ viewport: { width: 320, height: 640 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })).newPage();
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE);
await page.waitForTimeout(700);
const ev = (f, a) => page.evaluate(f, a);
const noSideScroll = (name) => ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1).then((v) => ok(v, 'fits 320px: ' + name));

// ---------- words and numbers ----------
const fmt = await ev(() => {
  const K = window.__chibarti.CB, s = (x) => x.replace(/[⁦⁩]/g, '');
  return {
    bytes: [0, 1536, 1048576, 1288490188].map((n) => s(K.bytes(n))),
    eta: [K.eta(25), K.eta(600), K.eta(5000)],
    pre: [K.pre('מחובר ל', 'Redmi'), K.pre('מחובר ל', 'דני')],
    kind: [K.kind('video/mp4'), K.kind('', 'a.APK'), K.kind('application/zip'), K.kind('', 'x.docx'), K.kind('', 'z')]
  };
});
ok(fmt.bytes.join('|') === '0 B|1.5 KB|1 MB|1.2 GB', 'bytes', fmt.bytes);
ok(fmt.eta.join('|') === 'עוד 25 שנ׳|עוד 10 דק׳|עוד 1:23 שע׳', 'eta', fmt.eta);
ok(fmt.pre.join('|') === 'מחובר ל-Redmi|מחובר לדני', 'Hebrew prefix', fmt.pre);
ok(fmt.kind.join('|') === 'video|apk|zip|doc|file', 'file kinds', fmt.kind);

// ---------- the QR code: drawn, then read back by the same reader the camera uses ----------
const qr = await ev(async () => {
  const K = window.__chibarti.CB;
  const text = 'chibarti://join?v=1&i=0123456789abcdef0123456789abcdef&n=Galaxy%20A54&t=Qm9vbS1ib29tLWJvb20tIQ&m=d&s=DIRECT-k7-Galaxy&k=pass1234&a=192.168.49.1%2C10.0.0.7&p=47821&e=2000000000';
  const svg = K.qrSvg(text);
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.onerror = r; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas');
  c.width = c.height = 400;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 400, 400);
  const res = window.jsQR(g.getImageData(0, 0, 400, 400).data, 400, 400);
  return { same: !!res && res.data === text };
});
ok(qr.same, 'QR made and read back');

// ---------- start a connection: the code page ----------
await ev(() => window.__chibarti.A.host());
await page.waitForTimeout(400);
const host = await ev(() => ({ name: window.__chibarti.CB.screenName(), svg: !!document.querySelector('.qr-box svg'), pin: document.getElementById('pin').textContent.replace(/\s/g, '') }));
ok(host.name === 'host' && host.svg && host.pin === '482193', 'host page with QR and code', host);
await noSideScroll('host');

// a phone asks to connect: the approval opens by itself and closes when the request is gone
await ev(() => window.__chibarti.CB.sim.set({ requests: [{ rid: 'r1', name: 'Redmi Note 9', model: 'Xiaomi', via: 'wifi-direct', at: Date.now() }] }));
ok(await ev(() => window.__chibarti.CB.sheetIs('approve')), 'approval sheet opens');
await ev(() => window.__chibarti.CB.sim.set({ requests: [] }));
ok(!(await ev(() => window.__chibarti.CB.sheetIs('approve'))), 'approval sheet closes when the request ends');

// ---------- nearby phones and the 6-digit code ----------
await ev(() => { const K = window.__chibarti.CB; K.sim.reset(); K.ui.stack = []; K.render(); return K.A.nearby(); });
await page.waitForTimeout(300);
const near = await ev(() => document.querySelectorAll('.peer').length);
ok(near === 3, 'nearby list', near);
await noSideScroll('nearby');
await page.click('.peer[data-trusted="0"]');
ok(await ev(() => window.__chibarti.CB.sheetIs('pin')), 'code sheet for an unknown phone');
for (const k of ['4', '8', '2', '1']) await page.click('.keypad button[data-k="' + k + '"]');
const boxes = await ev(() => Array.from(document.querySelectorAll('.code-boxes span')).map((s) => s.textContent).join(''));
ok(boxes === '4821', 'typed digits', boxes);
await page.click('.keypad button[data-k="del"]');
ok(await ev(() => window.__chibarti.CB.ui.form.pin) === '482', 'delete key');

// ---------- connected ----------
await ev(() => {
  const K = window.__chibarti.CB;
  K.closeSheet(); K.ui.stack = []; K.ui.tab = 'home';
  K.sim.set({ mode: 'connected', link: { peerId: 'b1', name: 'Redmi Note 9', model: 'Xiaomi', via: 'wifi-direct', host: true, since: Date.now() - 60000, rtt: 20, state: 'active', quality: 'great' },
    transfers: [{ tid: 5, dir: 'out', state: 'sending', peer: 'Redmi Note 9', total: 1000, done: 100, speed: 5e6, eta: 3, startedAt: Date.now(), files: [{ fid: 1, name: 'a.mp4', mime: 'video/mp4', size: 1000, done: 100, state: 1 }] }] });
  K.render();
});
const home = await ev(() => document.querySelector('#link-card .t').textContent);
ok(home === 'מחובר ל-Redmi Note 9', 'connected card', home);
await noSideScroll('home connected');

// progress changes only update numbers in place (the card element survives: no redraw, no jump)
await ev(() => { window.__card = document.getElementById('link-card'); });
await ev(() => window.__chibarti.CB.sim.set({ transfers: [{ tid: 5, dir: 'out', state: 'sending', peer: 'Redmi Note 9', total: 1000, done: 640, speed: 5e6, eta: 1, startedAt: Date.now(), files: [{ fid: 1, name: 'a.mp4', mime: 'video/mp4', size: 1000, done: 640, state: 1 }] }] }));
const same = await ev(() => ({ same: window.__card === document.getElementById('link-card'), bar: document.getElementById('xb-5').style.width }));
ok(same.same && same.bar === '64%', 'progress updates in place', same);

// ---------- files: choose photos, the count changes without a redraw ----------
await ev(() => { const K = window.__chibarti.CB; K.ui.tab = 'files'; K.render(); return K.A['pick-media'](); });
await page.waitForTimeout(200);
const cells = await ev(() => document.querySelectorAll('.cell').length);
ok(cells === 6, 'photo grid', cells);
const before = await ev(() => document.getElementById('sel-sum').textContent);
await page.click('.cell[data-i="0"]');
const after = await ev(() => ({ text: document.getElementById('sel-sum').textContent, pressed: document.querySelector('.cell[data-i="0"]').getAttribute('aria-pressed') }));
ok(before.indexOf('נבחרו 6') === 0 && after.text.indexOf('נבחרו 5') === 0 && after.pressed === 'false', 'toggle a photo', [before, after]);
await noSideScroll('files');

// files waiting for approval open a sheet by themselves
await ev(() => window.__chibarti.CB.sim.set({ offers: [{ tid: 9, peer: 'Redmi Note 9', total: 400000, free: 1e10, files: [{ name: 'Waze.apk', mime: 'application/vnd.android.package-archive', size: 400000 }] }] }));
const offer = await ev(() => ({ open: window.__chibarti.CB.sheetIs('offer'), apk: !!document.querySelector('#sheet-root .notice.warn') }));
ok(offer.open && offer.apk, 'offer sheet with the APK warning', offer);
await noSideScroll('offer sheet');
await ev(() => { const K = window.__chibarti.CB; K.sim.set({ offers: [] }); });

// ---------- messages: a new message doesn't wipe what's being typed ----------
await ev(() => { const K = window.__chibarti.CB; K.closeSheet(); K.ui.tab = 'text'; K.ui.texts = []; K.render(); });
await page.fill('#composer', 'שלום');
await page.click('[data-action="text-send"]');
await page.fill('#composer', 'עוד אחת');
await ev(() => window.__chibarti.CB.sim.emit('text', { id: 'x', text: 'היי', ts: Date.now(), mine: false, peer: 'Redmi Note 9' }));
const chat = await ev(() => ({ n: document.querySelectorAll('.msg').length, draft: document.getElementById('composer').value }));
ok(chat.n === 2 && chat.draft === 'עוד אחת', 'messages and the draft', chat);
await noSideScroll('text');

// ---------- every tab and page fits a small phone ----------
for (const t of ['home', 'cast', 'files', 'settings']) {
  await ev((tab) => { const K = window.__chibarti.CB; K.ui.stack = []; K.ui.tab = tab; K.render(); }, t);
  await noSideScroll('tab ' + t);
}
for (const v of ['devices', 'setup']) {
  await ev((name) => { const K = window.__chibarti.CB; K.pushView({ name }); }, v);
  await noSideScroll('page ' + v);
}
// ---------- a computer: the steps (network, address, code), its approval, and the connected home ----------
await ev(() => { const K = window.__chibarti.CB; K.sim.reset(); K.closeSheet(); K.ui.stack = []; K.ui.tab = 'home'; K.render(); });
await page.click('[data-action="pc"]');
await page.waitForSelector('#pc-addr');
const pcv = await ev(() => ({ addr: document.getElementById('pc-addr').textContent, pin: document.getElementById('pc-pin').textContent, pass: (document.getElementById('pc-pass') || {}).textContent, other: document.querySelector('.notice.gray b.ltr') && document.querySelector('.notice.gray b.ltr').textContent }));
ok(pcv.addr === '192.168.49.1:8080' && pcv.pin === '482 193' && pcv.pass === 'k7Rw2pQx' && pcv.other === '192.168.1.23:8080', 'computer steps', pcv);
await noSideScroll('computer steps');
await ev(() => window.__chibarti.CB.sim.set({ requests: [{ rid: 'r9', name: 'מחשב Windows', model: 'Windows · Chrome', via: 'pc', kind: 'pc', at: Date.now() }] }));
await page.waitForTimeout(300);
ok(await ev(() => window.__chibarti.CB.sheetIs('approve') && document.querySelector('.sheet').textContent.includes('לזכור את המחשב')), 'computer approval sheet');
await ev(() => { const K = window.__chibarti.CB; K.sim.set({ requests: [], mode: 'connected', link: { peerId: 'c1', name: 'מחשב Windows', model: 'Windows · Chrome', via: 'pc', kind: 'pc', since: Date.now(), quality: 'great' } }); });
await page.waitForTimeout(300);
ok(await ev(() => window.__chibarti.CB.screenName() === 'home' && document.getElementById('link-card').textContent.includes('דפדפן במחשב')), 'connected to a computer');
await noSideScroll('home with a computer');

// ---------- the Windows program: scanning its QR code from "חיבור למחשב" ----------
await ev(() => { const K = window.__chibarti.CB; K.sim.reset(); K.closeSheet(); K.ui.stack = []; K.ui.tab = 'home'; K.render(); });
await page.click('[data-action="pc"]');
await page.waitForSelector('.pc-program');
await ev(() => window.__chibarti.CB.joinWith('chibarti://pc?v=1&k=0123456789abcdef0123456789abcdef&n=' + encodeURIComponent('מחשב Windows')));
await page.waitForTimeout(400);
ok(await ev(() => window.__chibarti.CB.screenName() === 'pc' && document.getElementById('toast-root').textContent.includes('יתחבר')), 'program QR claimed');
ok(await ev(() => { let t = ''; window.__chibarti.CB.toast = (m) => { t = m; }; window.__chibarti.CB.joinWith('chibarti://pc?v=1&k=bad'); return new Promise((r) => setTimeout(() => r(t), 200)); }) === 'הקוד הזה לא מתוכנת חיברתי', 'bad program QR refused');

// ---------- remote control of this phone: the request, the one-time setting, the banner while controlled ----------
await ev(() => { const K = window.__chibarti.CB; K.sim.reset(); K.closeSheet(); K.ui.stack = []; K.ui.tab = 'cast';
  K.sim.set({ mode: 'connected', link: { peerId: 'p1', name: 'Redmi Note 9', model: 'Redmi', via: 'wifi-direct', kind: 'phone', since: Date.now(), quality: 'great' }, mirror: { role: 'sending', state: 'live', error: '', fps: 30, kbps: 2000, audio: 'none' } });
  K.sim.set({ control: { role: 'asked', error: '', service: false, can: true } }); });
await page.waitForTimeout(400);
ok(await ev(() => window.__chibarti.CB.sheetIs('control') && document.querySelector('.sheet').textContent.includes('רוצה לשלוט בטלפון שלך')), 'control request sheet');
await noSideScroll('control request');
await ev(() => window.__chibarti.CB.sim.set({ control: { role: 'install', error: '', addon: false, service: false, can: true } }));
await page.waitForTimeout(300);
ok(await ev(() => window.__chibarti.CB.sheetIs('control') && document.querySelector('.sheet').textContent.includes('התוסף') && !!document.querySelector('[data-action="control-download"]') && !!document.querySelector('[data-action="control-play-protect"]')), 'add-on download guidance');
await noSideScroll('add-on download');
await ev(() => window.__chibarti.CB.sim.set({ control: { role: 'setup', error: '', service: false, can: true } }));
await page.waitForTimeout(300);
ok(await ev(() => window.__chibarti.CB.sheetIs('control') && document.querySelector('.sheet').textContent.includes('הגדרות הנגישות') && document.querySelector('.sheet').textContent.includes('חיברתי – שליטה')), 'control setup guidance');
await ev(() => window.__chibarti.CB.sim.set({ control: { role: 'controlled', error: '', service: true, can: true } }));
await page.waitForTimeout(400);
ok(await ev(() => !window.__chibarti.CB.sheetIs('control') && !!document.querySelector('.ctl-on [data-action="control-stop"]')), 'controlled banner with stop');
await noSideScroll('controlled');

// ---------- messages: answering by dragging a message to the left; the typing bar stays and empties ----------
await ev(() => { const K = window.__chibarti.CB; K.sim.reset(); K.closeSheet(); K.ui.stack = []; K.ui.reply = null;
  K.sim.set({ mode: 'connected', me: { id: '0123456789abcdef0123456789abcdef', name: 'Galaxy A54' }, link: { peerId: 'fedcba9876543210fedcba9876543210', name: 'Redmi Note 9', model: 'Redmi', via: 'wifi-direct', kind: 'phone', since: Date.now(), quality: 'great' } });
  K.ui.texts = [{ id: 'm1', text: 'מה הסיסמה של ה-Wi-Fi בסלון?', ts: Date.now() - 60000, mine: false, peer: 'Redmi Note 9' }];
  K.ui.tab = 'text'; K.render(true); });
await page.waitForTimeout(300);
const swiped = await ev(async () => {
  const m = document.querySelector('#thread .msg[data-id="m1"] .bubble');
  const r = m.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const touch = (type, dx) => {
    const t = new Touch({ identifier: 1, target: m, clientX: x + dx, clientY: y });
    m.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
  };
  touch('touchstart', 0); touch('touchmove', -20); touch('touchmove', -45); touch('touchmove', -66);
  const armed = document.querySelector('#thread .msg[data-id="m1"]').classList.contains('armed');
  touch('touchend', -66);
  await new Promise((r) => setTimeout(r, 50));
  return { armed, bar: (document.getElementById('reply-bar') || {}).textContent || '' };
});
ok(swiped.armed && swiped.bar.includes('בתגובה ל-Redmi Note 9') && swiped.bar.includes('מה הסיסמה'), 'dragging a message to the left answers it', swiped);
await noSideScroll('answering a message');
const box1 = await ev(() => document.getElementById('composer'));
await page.fill('#composer', 'Cohen-Home-5G');
await page.click('[data-action="text-send"]');
await page.waitForTimeout(150);
const sent = await ev(() => { const K = window.__chibarti.CB, t = document.getElementById('composer'); return { box: t.value, focus: document.activeElement === t, reply: K.sim.S.lastSent.reply && K.sim.S.lastSent.reply.id, bar: document.getElementById('reply-bar').textContent, quote: (document.querySelector('#thread .msg.mine .quote') || {}).textContent || '' }; });
ok(sent.box === '' && sent.focus && sent.reply === 'm1' && sent.bar === '' && sent.quote.includes('Redmi Note 9') && sent.quote.includes('מה הסיסמה'), 'sent with the quote; the box is empty and keeps the keyboard', sent);
// the keyboard writes back the word it was still composing: it's removed again
await page.fill('#composer', 'שלום עוד');
await page.click('[data-action="text-send"]');
await ev(() => { const t = document.getElementById('composer'); setTimeout(() => { t.value = 'עוד'; t.dispatchEvent(new Event('input', { bubbles: true })); }, 20); });
await page.waitForTimeout(450);
ok(await ev(() => document.getElementById('composer').value === '' && window.__chibarti.CB.ui.draft === ''), 'a word the keyboard puts back after sending is removed');
await ev(() => window.__chibarti.CB.sim.emit('text', { id: 'm9', text: 'תודה', ts: Date.now(), mine: false, peer: 'Redmi Note 9' }));
await ev(() => window.__chibarti.CB.sim.set({ textCount: 4 }));
await page.waitForTimeout(400);
ok(await ev(() => document.querySelectorAll('#thread .msg').length === 4 && !!document.getElementById('composer')), 'a new message keeps the typing bar');
await page.click('#thread .msg.mine .quote');
await page.waitForTimeout(100);
ok(await ev(() => document.querySelector('#thread .msg[data-id="m1"]').classList.contains('flash')), 'a quote jumps to the original message');

// ---------- remote control: the step-by-step guide for the add-on, and "turn the scanning back on" ----------
await ev(() => { const K = window.__chibarti.CB; K.closeSheet(); K.state.ppOff = false; K.ui.env = Object.assign({}, K.ui.env || {}, { sdk: 33, release: '13', brand: 'samsung' });
  K.sim.set({ mirror: { role: 'sending', state: 'live', error: '' }, control: { role: 'install', error: '', addon: false, service: false, can: true } }); });
await page.waitForTimeout(400);
const g1 = await ev(() => ({ open: window.__chibarti.CB.sheetIs('control'), steps: document.querySelectorAll('.sheet .guide .g').length, now: (document.querySelector('.sheet .guide .g.now .t') || {}).textContent }));
ok(g1.open && g1.steps === 3 && g1.now.includes('Play Protect'), 'add-on guide: three steps, Play Protect first', g1);
await noSideScroll('add-on guide');
await page.click('.sheet [data-action="control-play-protect"]');
await page.waitForTimeout(200);
ok(await ev(() => window.__chibarti.CB.state.ppOff === true && document.querySelectorAll('.sheet .guide .g.done').length === 1 && document.querySelector('.sheet .guide .g.now .t').textContent.includes('מתקינים')), 'step 1 done, now install');
await ev(() => window.__chibarti.CB.sim.set({ control: { role: 'setup', error: '', addon: true, service: false, can: true } }));
await page.waitForTimeout(400);
const g2 = await ev(() => ({ txt: document.querySelector('.sheet').textContent, info: !!document.querySelector('.sheet [data-action="control-app-info"]'), back: !!document.querySelector('.sheet [data-action="pp-back-done"]') }));
ok(g2.back && g2.info && g2.txt.includes('מדליקים בחזרה את סריקת Play Protect') && g2.txt.includes('התרת הגדרות מוגבלות') && g2.txt.includes('הגדרות הנגישות'), 'after installing: scanning back on, restricted settings, accessibility', g2);
await noSideScroll('add-on setup guide');
await page.click('.sheet [data-action="pp-back-done"]');
await page.waitForTimeout(200);
ok(await ev(() => window.__chibarti.CB.state.ppOff === false && !document.querySelector('.sheet [data-action="pp-back-done"]')), 'scanning marked as back on');
await ev(() => { const K = window.__chibarti.CB; K.sim.set({ control: { role: 'none', error: '', addon: false, service: false, can: true } }); K.closeSheet(); K.state.ppOff = true;
  K.sim.set({ control: { role: 'none', error: '', addon: true, service: false, can: true } }); });
await page.waitForTimeout(400);
ok(await ev(() => window.__chibarti.CB.sheetIs('ppBack') && document.querySelector('.sheet').textContent.includes('Play Protect')), 'the reminder pops up by itself once the add-on is there');
await ev(() => { const K = window.__chibarti.CB; K.state.ppOff = false; K.closeSheet(); });

// ---------- the connection log ----------
await ev(() => { const K = window.__chibarti.CB; K.sim.reset(); K.ui.stack = []; K.ui.tab = 'settings'; K.render(); });
await page.waitForTimeout(400);
await page.click('[data-action="open-diag"]');
await page.waitForTimeout(400);
const dg = await ev(() => ({ log: (document.getElementById('diag-log') || {}).textContent || '', send: !!document.querySelector('[data-action="diag-send"]') }));
ok(dg.send && dg.log.includes('group ready') && dg.log.includes('announce network ok'), 'connection log page', dg);
await noSideScroll('connection log');
await page.click('[data-action="diag-send"]');
await page.waitForTimeout(300);
ok(await ev(() => window.__chibarti.CB.sheetIs('feedback') && document.getElementById('fbm').value.includes('יומן חיבור') && document.getElementById('fbm').value.includes('group ready')), 'the log goes into a message to the developer');
await ev(() => window.__chibarti.CB.closeSheet());

// ---------- remembered devices: one tap on Home or in the list connects without a code ----------
const DEVS = [{ id: 'b1', name: 'Redmi Note 9', model: 'Xiaomi Redmi Note 9', last: Date.now() - 36e5, since: Date.now() - 9 * 864e5, via: 'wifi-direct' },
  { id: 'c1', name: 'מחשב העבודה', model: 'Windows', last: Date.now() - 864e5, since: Date.now() - 9 * 864e5, via: 'program' }];
await ev((d) => { const K = window.__chibarti.CB; K.sim.reset(); K.closeSheet(); K.ui.stack = []; K.ui.tab = 'home'; K.sim.set({ devices: d }); K.render(); }, DEVS);
await page.waitForTimeout(300);
const kh = await ev(() => ({ rows: document.querySelectorAll('.dev-row [data-action="known-connect"]').length, text: document.getElementById('screen').textContent }));
ok(kh.rows === 1 && kh.text.includes('מכשירים מוכרים') && kh.text.includes('Redmi Note 9') && !kh.text.includes('מחשב העבודה'), 'Home lists remembered phones', kh);
await noSideScroll('home with remembered phones');
await page.click('.dev-row [data-action="known-connect"]');
await page.waitForTimeout(300);
const kw = await ev(() => ({ card: document.getElementById('link-card').textContent, list: document.querySelectorAll('.dev-row').length }));
ok(kw.card.includes('מחפש את Redmi Note 9') && kw.card.includes('התחלת חיבור') && kw.list === 0, 'searching for the remembered phone', kw);
await page.click('[data-action="known-cancel"]');
await page.waitForTimeout(300);
ok(await ev(() => document.querySelectorAll('.dev-row [data-action="known-connect"]').length === 1 && !document.getElementById('link-card').textContent.includes('מחפש')), 'search cancelled');
await page.click('[data-action="open-devices"]');
await page.waitForTimeout(300);
const dv = await ev(() => ({ phone: !!document.querySelector('[data-action="known-connect"][data-id="b1"]'), pc: document.querySelectorAll('.dev-row [data-action="pc"]').length, forget: document.querySelectorAll('[data-action="forget"]').length }));
ok(dv.phone && dv.pc === 1 && dv.forget === 2, 'devices page: connect and forget', dv);
await noSideScroll('devices page');
await ev(() => window.__chibarti.CB.sim.set({ join: { on: false, step: '', name: '', error: '', pinFor: { key: 'p:aa', name: 'Redmi Note 9' } } }));
await page.waitForTimeout(300);
ok(await ev(() => window.__chibarti.CB.sheetIs('pin') && document.querySelector('.sheet').textContent.includes('Redmi Note 9')), 'a changed key asks for the code once');

// ---------- where received files are saved ----------
await ev(() => { const K = window.__chibarti.CB; K.sim.reset(); K.closeSheet(); K.ui.stack = []; K.ui.tab = 'settings'; K.render(); });
await page.waitForTimeout(400);
await page.click('[data-action="save-where"]');
await page.waitForTimeout(300);
const sw = await ev(() => ({ open: window.__chibarti.CB.sheetIs('saveWhere'), rows: document.querySelectorAll('.sheet [data-action="save-mode"]').length, on: (document.querySelector('.sheet [data-action="save-mode"][aria-pressed="true"]') || {}).dataset }));
ok(sw.open && sw.rows === 3 && sw.on && sw.on.v === 'auto', 'save sheet, by kind by default', sw);
await noSideScroll('save sheet');
await page.click('.sheet [data-action="save-mode"][data-v="downloads"]');
await page.waitForTimeout(300);
ok(await ev(() => (document.querySelector('.sheet [data-action="save-mode"][aria-pressed="true"]') || {}).dataset.v === 'downloads' && window.__chibarti.CB.ui.env.saveMode === 'downloads'), 'all in Download');
await page.click('.sheet [data-action="save-mode"][data-v="folder"]');
await page.waitForTimeout(400);
const sf = await ev(() => ({ v: (document.querySelector('.sheet [data-action="save-mode"][aria-pressed="true"]') || {}).dataset.v, other: !!document.querySelector('.sheet [data-action="pick-folder"]'), txt: document.querySelector('.sheet').textContent }));
ok(sf.v === 'folder' && sf.other && sf.txt.includes('Download/מהטלפון'), 'a picked folder', sf);
await ev(() => window.__chibarti.CB.closeSheet());
await page.waitForTimeout(200);
ok(await ev(() => document.getElementById('screen').textContent.includes('בתיקייה שבחרת: Download/מהטלפון')), 'settings says where');
await ev(() => window.__chibarti.CB.sim.set({ mode: 'connected', link: { peerId: 'p1', name: 'Redmi Note 9', model: 'Redmi', via: 'wifi-direct', kind: 'phone', since: Date.now(), quality: 'great' },
  offers: [{ tid: 77, peer: 'Redmi Note 9', total: 5e6, free: 9e9, files: [{ name: 'סרט.mp4', mime: 'video/mp4', size: 5e6 }] }] }));
await page.waitForTimeout(400);
ok(await ev(() => window.__chibarti.CB.sheetIs('offer') && document.querySelector('.sheet').textContent.includes('יישמר בתיקייה שבחרת')), 'the approval says where it goes');
await page.click('.sheet [data-action="save-where"]');
await page.waitForTimeout(300);
ok(await ev(() => window.__chibarti.CB.sheetIs('saveWhere')), 'change from the approval');
await page.click('.sheet [data-action="save-mode"][data-v="auto"]');
await ev(() => window.__chibarti.CB.closeSheet());
await page.waitForTimeout(300);
ok(await ev(() => window.__chibarti.CB.sheetIs('offer') && document.querySelector('.sheet').textContent.includes('לפי סוג')), 'back to the approval');
await ev(() => { const K = window.__chibarti.CB; K.closeSheet(); K.sim.set({ offers: [] }); K.ui.tab = 'files'; K.ui.filesSeg = 'received'; K.render(true); });
await page.waitForTimeout(300);
ok(await ev(() => !!document.querySelector('#screen .notice [data-action="save-where"]')), 'received files: change where');

await ev(() => { const K = window.__chibarti.CB; K.state.settings.theme = 'dark'; K.applyTheme(); });
ok(await ev(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'dark theme');

ok(errors.length === 0, 'no page errors', errors);
console.log(passed + ' passed, ' + failed + ' failed');
await browser.close();
process.exit(failed ? 1 : 0);
