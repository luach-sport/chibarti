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

await ev(() => { const K = window.__chibarti.CB; K.state.settings.theme = 'dark'; K.applyTheme(); });
ok(await ev(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'dark theme');

ok(errors.length === 0, 'no page errors', errors);
console.log(passed + ' passed, ' + failed + ' failed');
await browser.close();
process.exit(failed ? 1 : 0);
