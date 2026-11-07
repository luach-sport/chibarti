// The computer page (www/pc/) against a pretend phone that uses the app's real web server, TLS and WebSocket code
// (tests/java/FakePhone.java): pairing, messages, files both ways, the phone's screen here (H.264 decoded in the
// page), this screen on the phone (H.264 + Opus encoded in the page, then checked with ffmpeg), a dropped
// connection that comes back, a remembered computer, and the phone leaving.
// Needs: javac/java, ffmpeg, Playwright. Run: node tests/pc.test.mjs   (screenshots: $SHOTS or /tmp/chibarti-pc)
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright')); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = process.env.PC_WORK || '/tmp/chibarti-pc-test';
const SHOTS = process.env.SHOTS || '/tmp/chibarti-pc';
const JSON_DIR = process.env.JSON_JAVA_DIR || '/home/claude/deps/json-java';
rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, 'classes'), { recursive: true });
mkdirSync(SHOTS, { recursive: true });

// ---------- build the pretend phone and a test picture ----------
const java = ['Link', 'Crypto', 'Proto', 'Handshake', 'SecureLink', 'Tls', 'WebServer', 'WsLink'].map((c) => join(ROOT, 'android-native', c + '.java'));
const jsonSrc = execFileSync('find', [join(JSON_DIR, 'src/main/java/org/json'), '-name', '*.java']).toString().trim().split('\n');
execFileSync('javac', ['-encoding', 'UTF-8', '-nowarn', '-d', join(WORK, 'classes'), ...jsonSrc, ...java, join(ROOT, 'tests/java/FakePhone.java')], { stdio: ['ignore', 'ignore', 'inherit'] });
const h264 = join(WORK, 'phone.h264');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30', '-t', '4', '-c:v', 'libx264', '-profile:v', 'baseline', '-bf', '0', '-g', '30', '-pix_fmt', 'yuv420p', '-f', 'h264', h264]);

const phone = spawn('java', ['-cp', join(WORK, 'classes'), 'com.luachsport.chibarti.FakePhone', join(ROOT, 'www'), join(WORK, 'out'), h264], { stdio: ['ignore', 'pipe', 'inherit'] });
const lines = [];   // what the phone said: { t: text, used: true once a step has counted it }
const waiters = [];
let buf = '';
phone.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = { t: buf.slice(0, i).trim(), used: false };
    buf = buf.slice(i + 1);
    lines.push(l);
    if (process.env.VERBOSE) console.log('  phone:', l.t);
    const w = waiters.find((x) => x.re.test(l.t));
    if (w) { waiters.splice(waiters.indexOf(w), 1); l.used = true; w.res(l.t); }
  }
});
/** Waits until the phone says a line matching re (each line counts once). */
const expect = (re, ms = 8000) => {
  const have = lines.find((l) => !l.used && re.test(l.t));
  if (have) { have.used = true; return Promise.resolve(have.t); }
  return new Promise((res, rej) => {
    const w = { re, res };
    waiters.push(w);
    setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); rej(new Error('phone never said ' + re)); } }, ms);
  });
};

let failed = 0, passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', e.message.split('\n')[0]); }
}
const ok = (c, msg) => { if (!c) throw new Error(msg); };

const ready = await expect(/^READY /, 15000);
const [, httpPort, httpsPort] = ready.split(' ');
const BASE = 'https://localhost:' + httpsPort + '/';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 820 }, locale: 'he-IL', acceptDownloads: true });
// The test has no real screen to share: a moving picture and a tone stand in for getDisplayMedia.
await ctx.addInitScript(() => {
  navigator.mediaDevices.getDisplayMedia = async () => {
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 900;
    const x = c.getContext('2d');
    let n = 0;
    (function draw() {
      n++;
      x.fillStyle = '#0A8F94'; x.fillRect(0, 0, 1600, 900);
      x.fillStyle = '#FFD27A'; x.fillRect((n * 12) % 1500, 300, 100, 300);
      x.fillStyle = '#fff'; x.font = '80px sans-serif'; x.fillText('PC ' + n, 100, 150);
      setTimeout(draw, 33);
    })();
    const s = c.captureStream(30);
    const ac = new AudioContext();
    const o = ac.createOscillator(), d = ac.createMediaStreamDestination();
    o.connect(d); o.start();
    s.addTrack(d.stream.getAudioTracks()[0]);
    return s;
  };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CERT/.test(m.text())) errors.push(m.text()); });
page.setDefaultTimeout(8000);
const shot = (n) => page.screenshot({ path: join(SHOTS, n + '.png') });

await step('port 8080 explains the browser warning and points to the secure page', async () => {
  const r = await fetch('http://localhost:' + httpPort + '/');
  const t = await r.text();
  ok(t.includes('המשך לחיבור') && t.includes(':' + httpsPort + '/'), 'no explanation page');
});

await step('the page opens over HTTPS and asks for the code', async () => {
  await page.goto(BASE);
  await page.waitForSelector('#pin');
  ok(await page.evaluate(() => isSecureContext && typeof VideoDecoder === 'function'), 'not a secure page');
  await shot('01-pair');
});

await step('a wrong code is refused with a clear message', async () => {
  await page.fill('#pin', '111111');
  await page.waitForSelector('.err');
  ok((await page.textContent('.err')).includes('הקוד לא נכון'), 'no wrong-code message');
  await shot('02-wrong-code');
});

await step('the right code connects (remembered)', async () => {
  await page.fill('#pin', '246810');
  await page.waitForSelector('#desk:not([hidden])');
  await expect(/^CONNECTED pin/);
  ok((await page.textContent('#status')).includes('Redmi'), 'phone name missing');
  await shot('03-connected');
});

await step('a message goes to the phone and the answer comes back', async () => {
  await page.fill('#say', 'שלום מהמחשב https://example.com');
  await page.press('#say', 'Enter');
  await expect(/^TEXT שלום מהמחשב/);
  await page.waitForSelector('.bubble.theirs');
  ok((await page.textContent('.bubble.theirs')).includes('קיבלתי'), 'no echo');
  ok(await page.$('.bubble.mine a[href="https://example.com"]'), 'link not clickable');
});

await step('a 3 MB file goes to the phone and is checked there', async () => {
  const f = join(WORK, 'מסמך מהמחשב.bin');
  writeFileSync(f, Buffer.from(Array.from({ length: 3 * 1048576 + 17 }, (_, i) => (i * 7 + (i >> 11)) & 255)));
  await page.setInputFiles('#pick', f);
  if (process.env.VERBOSE) console.log(await page.evaluate(() => JSON.stringify(window.PC.F.jobs.map((j) => ({ s: j.state, n: j.items.length })))));
  const got = await expect(/^GOT /, 15000);
  ok(/ 3145745 ok$/.test(got), got);
  const saved = readFileSync(join(WORK, 'out', 'in-1.bin'));
  ok(createHash('sha256').update(saved).digest('hex') === createHash('sha256').update(readFileSync(f)).digest('hex'), 'different bytes on the phone');
  await page.waitForFunction(() => document.querySelector('.job.ok'));
  await shot('04-sent');
});

await step('a file from the phone: asked, accepted, saved and checked', async () => {
  await page.fill('#say', '/send 2500000');
  await page.press('#say', 'Enter');
  await page.waitForSelector('.offer');
  await shot('05-offer');
  const dl = page.waitForEvent('download', { timeout: 15000 });
  await page.click('[data-act="offer-yes"]');
  const d = await dl;
  const p = join(WORK, 'from-phone.bin');
  await d.saveAs(p);
  const b = readFileSync(p);
  ok(b.length === 2500000, 'size ' + b.length);
  let good = true;
  for (let i = 0; i < b.length; i += 997) if (b[i] !== ((i * 31 + Math.floor(i / 512)) & 255)) { good = false; break; }
  ok(good, 'different bytes');
  ok(d.suggestedFilename() === 'סרטון מהטלפון.bin', 'name ' + d.suggestedFilename());
  await expect(/^ACK 1 true/);
  await page.waitForFunction(() => document.querySelectorAll('.job.ok').length === 2);
  await shot('06-received');
});

await step("the phone's screen shows here (H.264 decoded in the page)", async () => {
  await page.fill('#say', '/share');
  await page.press('#say', 'Enter');
  await page.waitForSelector('[data-act="mirror-yes"]');
  await shot('07-mirror-ask');
  await page.click('[data-act="mirror-yes"]');
  await expect(/^SHARING /);
  await page.waitForFunction(() => window.PC.S.state === 'live' && window.PC.S.fps > 10, null, { timeout: 10000 });
  const lit = await page.evaluate(() => {
    const c = window.PC.viewCanvas, x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4000) s += d[i] + d[i + 1] + d[i + 2];
    return { w: c.width, h: c.height, s };
  });
  ok(lit.w === 720 && lit.h === 1280 && lit.s > 1000, 'picture ' + JSON.stringify(lit));
  await page.waitForTimeout(600);
  await shot('08-phone-screen');
  await page.click('#screenTools [data-act="mirror-stop"]');
  await expect(/^MIRROR_STOP/);
  await expect(/^SHARE-ENDED/);
});

await step("this screen with its sound goes to the phone (H.264 + Opus), and ffmpeg can play it", async () => {
  await page.waitForSelector('[data-act="share"]');
  await page.click('[data-act="share"]');
  const offer = await expect(/^MIRROR_OFFER /);
  ok(/"audio":true/.test(offer), offer);
  await expect(/^VIDEO_CONFIG 1280x720 7 8/, 10000);
  await expect(/^AUDIO_OPUS_CONFIG 48000 \d OpusHead 19/, 10000);
  await expect(/^STREAM v=90 /, 15000);
  await page.waitForSelector('.sending');
  await page.waitForTimeout(500);
  await shot('09-sharing');
  await page.click('.sending [data-act="mirror-stop"]');
  const stop = await expect(/^MIRROR_STOP/);
  const m = /v=(\d+) k=(\d+) a=(\d+)/.exec(stop);
  ok(m && +m[1] >= 90 && +m[2] >= 1 && +m[3] >= 20, stop);
  // e.g. "Constrained Baseline,1280,720,95"
  const probe = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=profile,width,height,nb_read_frames', '-of', 'csv=p=0', join(WORK, 'out', 'from-pc.h264')]).toString().trim();
  const parts = probe.split(',');
  ok(parts.includes('1280') && parts.includes('720') && +parts[parts.length - 1] >= 80, 'ffprobe: ' + probe);
});

await step('a dropped connection comes back by itself', async () => {
  await page.fill('#say', '/drop');
  await page.press('#say', 'Enter');
  await page.waitForFunction(() => window.PC.L.state === 'reconnecting', null, { timeout: 8000 }).catch(() => {});
  await expect(/^HELLO resume/, 12000);
  await page.waitForFunction(() => window.PC.L.state === 'on', null, { timeout: 10000 });
  await page.fill('#say', 'אחרי החזרה');
  await page.press('#say', 'Enter');
  await expect(/^TEXT אחרי החזרה/);
});

await step('a remembered computer connects again without a code', async () => {
  await page.reload();
  await expect(/^CONNECTED trusted/, 10000);
  await page.waitForSelector('#desk:not([hidden])');
});

await step('when the phone disconnects, the page says so and offers to connect again', async () => {
  await page.fill('#say', '/bye');
  await page.press('#say', 'Enter');
  await page.waitForSelector('#pair:not([hidden])');
  ok(await page.$('[data-act="quick"]'), 'no quick reconnect button');
  await shot('10-after-bye');
});

await step('narrow window: everything stacks, nothing overflows', async () => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.click('[data-act="quick"]');
  await page.waitForSelector('#desk:not([hidden])');
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!over, 'horizontal scroll');
  await shot('11-narrow');
});

await step('no errors in the page', async () => { ok(!errors.length, errors.slice(0, 3).join(' | ')); });

await browser.close();
phone.kill();
console.log(`\n${passed} passed, ${failed} failed · screenshots in ${SHOTS}`);
process.exit(failed ? 1 : 0);
