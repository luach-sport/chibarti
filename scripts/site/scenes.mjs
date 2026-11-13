// The screenshots on חיברתי's site, taken by the Itzko site kit (kit/lib/shots.mjs in luach-sport/itzko).
// The app runs in a browser there, so Android's side is the stand-in in js/link/bridge.js (CB.sim): each scene
// sets a pretend state (connected to "Redmi Note 9", a video being sent…) and draws the screen.

const STATE = { v: 1, createdAt: Date.now() - 20 * 864e5, setupDone: true, settings: { theme: 'light', quality: 'standard', audio: true, auto: true, haptics: true }, outbox: [], profile: { name: '', email: '' }, updateSeen: 999999, readTexts: 3 };

export async function prepare(page, { info, base }) {
  await page.evaluate((st) => { localStorage.setItem('chibarti.theme', 'light'); localStorage.setItem('chibarti.state.v1', JSON.stringify(st)); }, STATE);
  await page.reload();
  await page.waitForTimeout(1500);
  return { info, base };
}

export const reset = () => {
  if (!window.__chibarti) return; // the last scenes are the computer's own pages
  const K = window.__chibarti.CB;
  K.closeSheet();
  K.sim.reset();
  K.sim.S.env = null;
  K.ui.stack = []; K.ui.tab = 'home'; K.ui.media = null; K.ui.picked = []; K.ui.filesSeg = 'send'; K.ui.hostFor = '';
  K.render();
  window.scrollTo(0, 0);
};

// Shared pieces of the pretend state (written into each scene's code).
const CONNECTED = `K.sim.set({ mode: 'connected', host: { on: false }, devices: [{ id: 'b1', name: 'Redmi Note 9', model: 'Xiaomi Redmi Note 9', last: Date.now(), since: Date.now() - 9 * 864e5, via: 'wifi-direct' }],
  link: { peerId: 'b1', name: 'Redmi Note 9', model: 'Xiaomi Redmi Note 9', via: 'wifi-direct', host: true, since: Date.now() - 754000, rtt: 14, state: 'active', trusted: true, quality: 'great' } });`;
const SENDING = `K.sim.set({ transfers: [{ tid: 5, dir: 'out', state: 'sending', peer: 'Redmi Note 9', total: 1288490188, done: 824633720, speed: 18800000, eta: 25, startedAt: Date.now() - 40000, peerPaused: false,
  files: [{ fid: 1, name: 'החתונה של דני.mp4', mime: 'video/mp4', size: 1288490188, done: 824633720, state: 1 }] }] });`;
const HISTORY = `K.ui.history = [
  { id: 'h1', dir: 'in', name: 'IMG_20251104_183522.jpg', mime: 'image/jpeg', size: 3120000, status: 'done', peer: 'Redmi Note 9', at: Date.now() - 2 * 864e5, uri: 'x1' },
  { id: 'h2', dir: 'out', name: 'חוזה שכירות.pdf', mime: 'application/pdf', size: 845000, status: 'done', peer: 'Redmi Note 9', at: Date.now() - 864e5, uri: '' },
  { id: 'h3', dir: 'in', name: 'הקלטה מהשיעור.m4a', mime: 'audio/mp4', size: 18400000, status: 'done', peer: 'Redmi Note 9', at: Date.now() - 5 * 3600e3, uri: 'x3' },
  { id: 'h4', dir: 'in', name: 'תמונות טיול.zip', mime: 'application/zip', size: 312000000, status: 'done', peer: 'Redmi Note 9', at: Date.now() - 3 * 3600e3, uri: 'x4' },
  { id: 'h5', dir: 'in', name: 'מצגת לכנס.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 15400000, status: 'done', peer: 'Redmi Note 9', at: Date.now() - 40 * 60e3, uri: 'x5' }];`;
const MEDIA = `K.ui.media = { items: [1, 2, 3, 4, 5, 6].map((i) => ({ uri: 'sim://p' + i, name: 'IMG_' + i + '.jpg', size: 2400000 + i * 310000, mime: i === 3 ? 'video/mp4' : 'image/jpeg' })), sel: { 'sim://p1': true, 'sim://p2': true, 'sim://p4': true, 'sim://p5': true } };`;
const ROOM = `K.sim.set({ mode: 'connected', link: { peerId: 'b1', name: 'Redmi Note 9', model: 'Redmi Note 9', via: 'wifi-direct', kind: 'phone', host: true, since: Date.now() - 754e3, rtt: 9, quality: 'great', state: 'active' },
  room: [{ id: 'me0', name: 'Galaxy A54', host: true, me: true },
    { id: 'b1', name: 'Redmi Note 9', model: 'Xiaomi Redmi Note 9', kind: 'phone', via: 'wifi-direct', main: true, state: 'active' },
    { id: 'b3', name: 'הטאבלט של אבא', model: 'Galaxy Tab A7', kind: 'phone', via: 'wifi-direct', state: 'active' },
    { id: 'c1', name: 'מחשב העבודה', model: 'Windows', kind: 'pc', via: 'program', state: 'active' }] });`;
const KNOWN = `K.sim.set({ devices: [
  { id: 'b1', name: 'Redmi Note 9', model: 'Xiaomi Redmi Note 9', last: Date.now() - 3 * 3600e3, since: Date.now() - 9 * 864e5, via: 'wifi-direct' },
  { id: 'b3', name: 'הטאבלט של אבא', model: 'Galaxy Tab A7', last: Date.now() - 2 * 864e5, since: Date.now() - 30 * 864e5, via: 'hotspot' },
  { id: 'c1', name: 'מחשב העבודה', model: 'Windows', last: Date.now() - 864e5, since: Date.now() - 12 * 864e5, via: 'program' }] });`;
const ENV = `K.sim.S.env = { sdk: 33, release: '13', model: 'Galaxy A54', p2p: true, camera: true, audioCapture: true, wifiOn: true, locationOn: true, locationNeeded: false,
  perms: { nearby: true, notifications: true, audio: false, camera: true }, batteryFree: false, folder: '', folderName: '', saveMode: 'auto' };`;

// This phone shares its screen with the computer (for the remote-control scenes)
const SHARING_TO_PC = `K.sim.set({ mode: 'connected', host: { on: false }, devices: [],
  link: { peerId: 'c1', name: 'מחשב Windows', model: 'Windows · Chrome', via: 'program', kind: 'pc', host: true, since: Date.now() - 380000, rtt: 9, state: 'active', trusted: true, quality: 'great' },
  mirror: { role: 'sending', state: 'live', error: '', width: 720, height: 1600, fps: 30, kbps: 3100, audio: 'none' } });`;

const PC_LINK = `K.sim.set({ mode: 'connected', host: { on: false }, devices: [],
  link: { peerId: 'c1', name: 'מחשב Windows', model: 'Windows · Chrome', via: 'program', kind: 'pc', host: true, since: Date.now() - 380000, rtt: 9, state: 'active', trusted: true, quality: 'great' } });`;

// The computer page itself (www/pc/), at computer size, connected to this phone and showing its screen. Last, because
// it leaves the phone page. Its font and icon are shared with the app (on the phone they're served from the app's root).
async function pcPage(page, arg) {
  const app = arg.base + '/app/';
  await page.route('**/app/pc/fonts/**', (r) => r.continue({ url: r.request().url().replace('/app/pc/fonts/', '/app/fonts/') }));
  await page.route('**/app/pc/icon.png', (r) => r.continue({ url: app + 'icon.png' }));
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto(app + 'pc/index.html');
  await page.waitForTimeout(700);
  await page.evaluate(async (shot) => {
    const PC = window.PC, L = PC.L, S = PC.S, now = Date.now();
    L.state = 'on'; L.phone = { name: 'Galaxy A54' }; L.since = now - 6 * 60e3;
    PC.F.jobs = [
      { tid: 1, out: true, state: 'sending', speed: 9200000, items: [{ fid: 1, name: 'מצגת לכנס.pptx', mime: 'application/vnd.ms-powerpoint', size: 15400000, done: 9900000, st: 1 }] },
      { tid: 2, out: false, state: 'done', speed: 0, items: [{ fid: 1, name: 'IMG_20251104_183522.jpg', mime: 'image/jpeg', size: 3120000, done: 3120000, st: 3 }] }];
    PC.F.received = [{ name: 'IMG_20251104_183522.jpg', size: 3120000, mime: 'image/jpeg', url: 'blob:x', at: now - 120000 }];
    PC.C.msgs = [
      { id: 'a', text: 'הנה הקישור לטופס: https://forms.example.org/r/8841', ts: now - 240000, mine: true },
      { id: 'b', text: 'תודה! שולחת לך את התמונות', ts: now - 200000, mine: false }];
    // the phone's screen: the app's own home screenshot stands in for the live picture
    const img = new Image();
    img.src = shot;
    await img.decode();
    const c = PC.viewCanvas;
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    S.role = 'viewing'; S.state = 'live'; S.fps = 30;
    PC.K.role = 'controlling';
    PC.render();
  }, arg.base + '/shots/home.jpg');
}

// The Windows program's first screen: the QR code to scan and the phone it found (its server is stood in for).
async function pcProgram(page, arg) {
  const app = arg.base + '/app/';
  await page.addInitScript(() => {
    window.PC_PROGRAM = { token: 'site', version: '1.1' };
    const real = window.fetch;
    window.fetch = (u, o) => (String(u).indexOf('/api/') === 0
      ? Promise.resolve(new Response(String(u) === '/api/phones' ? JSON.stringify([{ id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', name: 'Galaxy A54', ip: '192.168.1.23', port: 8443, known: false }]) : '{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : real(u, o));
  });
  await page.goto(app + 'pc/index.html');
  await page.addScriptTag({ url: app + 'vendor/qrcode.js' });
  await page.waitForTimeout(2600);
  await page.evaluate(() => { window.PC.redraw('pair'); });
}

const scene = (name, body, extra) => Object.assign({ name, set: new Function('arg', 'const K = window.__chibarti.CB, ui = K.ui; ' + body) }, extra || {});

export const SCENES = [
  scene('start', "K.render();"),
  scene('home', CONNECTED + SENDING + HISTORY + " K.render();"),
  scene('host', "K.A.host();", { wait: 900 }),
  scene('nearby', "K.A.nearby();", { wait: 900 }),
  scene('pin', "K.A.nearby().then(() => { K.openSheet('pin', { key: 'l:b2', name: 'הטאבלט של אבא' }); K.ui.form.pin = '4821'; K.renderSheet(); });", { wait: 1000 }),
  scene('approve', "K.A.host().then(() => K.sim.set({ requests: [{ rid: 'r1', name: 'Redmi Note 9', model: 'Xiaomi Redmi Note 9', via: 'wifi-direct', at: Date.now() }] }));", { wait: 1100 }),
  scene('cast', CONNECTED + ENV + " ui.tab = 'cast'; K.loadEnv().then(() => K.render());", { wait: 700 }),
  scene('sending', CONNECTED + " K.sim.set({ mirror: { role: 'sending', state: 'live', error: '', width: 720, height: 1600, fps: 30, kbps: 3240, bitrate: 3400, audio: 'on', quality: 'standard' } }); ui.tab = 'cast'; K.render();"),
  scene('mirror-ask', CONNECTED + " K.sim.set({ mirror: { role: 'asked', state: '', error: '', request: { quality: 'high', fps: 30, audio: true } } });", { wait: 900 }),
  scene('files', CONNECTED + SENDING + MEDIA + " ui.tab = 'files'; K.render();"),
  scene('offer', CONNECTED + " K.sim.set({ offers: [{ tid: 9, peer: 'Redmi Note 9', total: 315800000, free: 21400000000, files: [{ name: 'טיול בגליל.mp4', mime: 'video/mp4', size: 300000000 }, { name: 'מצגת לכנס.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 15400000 }, { name: 'Waze.apk', mime: 'application/vnd.android.package-archive', size: 400000 }] }] });", { wait: 900 }),
  scene('received', CONNECTED + HISTORY + " ui.tab = 'files'; ui.filesSeg = 'received'; K.render();"),
  scene('text', CONNECTED + ` ui.texts = [
    { id: '1', text: 'מה הסיסמה של ה-Wi-Fi בסלון?', ts: Date.now() - 300000, mine: false, peer: 'Redmi Note 9' },
    { id: '2', text: 'Cohen-Home-5G', ts: Date.now() - 260000, mine: true, reply: { id: '1', text: 'מה הסיסמה של ה-Wi-Fi בסלון?', name: 'Redmi Note 9', from: 'b1' } },
    { id: '3', text: 'וזה הקישור לטופס: https://forms.example.org/r/8841', ts: Date.now() - 240000, mine: true },
    { id: '4', text: 'תודה! התחברתי', ts: Date.now() - 60000, mine: false, peer: 'Redmi Note 9' }];
    K.sim.set({ textCount: 4 }); ui.tab = 'text'; K.render(); K.startReply('4');`),
  scene('control-guide', SHARING_TO_PC + " K.state.ppOff = true; K.ui.env = { sdk: 33, release: '13', brand: 'samsung' }; K.sim.set({ control: { role: 'setup', error: '', addon: true, service: false, can: true } });", { wait: 900 }),
  scene('diag', "ui.tab = 'settings'; K.render(); K.A['open-diag']();", { wait: 900 }),
  scene('settings', CONNECTED + ENV + " ui.tab = 'settings'; K.render();", { wait: 800 }),
  scene('known', KNOWN + " K.render();", { wait: 500 }),
  scene('room-home', ROOM + " K.render();", { wait: 600 }),
  scene('room', ROOM + " K.pushView({ name: 'room' });", { wait: 600 }),
  scene('send-to', ROOM + " ui.tab = 'files'; ui.filesSeg = 'send'; K.render(); K.openSheet('sendTo', { files: [{ uri: 'sim://d1', name: 'הזמנה לחתונה.pdf', size: 1845000 }, { uri: 'sim://d2', name: 'מפה.jpg', size: 2400000 }] });", { wait: 800 }),
  scene('devices', KNOWN + " K.pushView({ name: 'devices' });", { wait: 600 }),
  scene('save-where', ENV + " ui.tab = 'settings'; K.loadEnv().then(() => { K.render(); K.openSheet('saveWhere'); });", { wait: 800 }),
  scene('pc', ENV + " K.A.pc();", { wait: 900 }),
  scene('control-ask', SHARING_TO_PC + " K.sim.set({ control: { role: 'asked', error: '', service: false, can: true } });", { wait: 900 }),
  scene('control-setup', SHARING_TO_PC + " K.sim.set({ control: { role: 'setup', error: '', service: false, can: true } });", { wait: 900 }),
  scene('controlled', SHARING_TO_PC + " K.sim.set({ control: { role: 'controlled', error: '', service: true, can: true } }); ui.tab = 'cast'; K.render();", { wait: 700 }),
  scene('pc-approve', ENV + " K.A.pc().then(() => K.sim.set({ requests: [{ rid: 'r2', name: 'מחשב Windows', model: 'Windows · Chrome', via: 'pc', kind: 'pc', at: Date.now() }] }));", { wait: 1100 }),
  scene('pc-home', PC_LINK + " K.render();"),
  scene('setup', ENV + " K.pushView({ name: 'setup' });", { wait: 800 }),
  scene('privacy', "ui.tab = 'settings'; K.render(); K.openSheet('privacy');", { wait: 700 }),
  scene('share-app', CONNECTED + " ui.tab = 'settings'; K.render(); K.openSheet('shareApp');", { wait: 700 }),
  scene('feedback', "ui.tab = 'settings'; K.render(); K.state.profile = { name: 'דני כהן', email: 'dani@example.com' }; K.openSheet('feedback');",
    { fill: ['#fbm', 'הייתי רוצה לשלוח תיקייה שלמה בבת אחת'], wait: 600 }),
  scene('update', `ui.tab = 'settings'; K.render();
    const b = parseInt(arg.info.build, 10) || 2;
    K.VERSION.build = String(b - 1 > 0 ? b - 1 : b);
    K.update.info = { version: arg.info.version || '1.0', build: b, notes: (arg.info.notes || []).slice(0, 4), inApp: true };
    K.openSheet('update');`, { wait: 700 }),
  { name: 'pc-page', run: pcPage, wait: 600 },
  { name: 'pc-program', run: pcProgram, wait: 600 }
];
