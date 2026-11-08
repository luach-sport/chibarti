// The Windows program (pc-app/, built here for Linux) with its window page, against the pretend phone:
// it finds the phone on the network, connects after the phone "scans" its QR code (no code, no approval),
// remembers the phone's certificate, connects again by itself, refuses strangers, and lets the phone control the
// computer only after "לאפשר" (the mouse/keyboard actions are written to a log instead of moving anything).
// Needs: go, javac/java, ffmpeg, Playwright. Run: node tests/program.test.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { startPhone, said, playwright, runner, fakeScreen, ROOT } from './lib/fake-phone.mjs';

const { chromium } = playwright();
const WORK = process.env.PROG_WORK || '/tmp/chibarti-prog-test';
const SHOTS = process.env.SHOTS || '/tmp/chibarti-pc';
mkdirSync(SHOTS, { recursive: true });

const phone = await startPhone(WORK);
const R = runner();
const { step, ok } = R;

// ---------- build and start the program (its data in a folder of its own) ----------
const pcApp = join(ROOT, 'pc-app');
execFileSync('bash', ['-c', 'rm -rf web && mkdir -p web/fonts web/vendor && cp -R ../www/pc web/pc && cp ../www/fonts/Rubik-var.ttf web/fonts/ && cp ../www/icon.png web/ && cp ../www/vendor/qrcode.js web/vendor/'], { cwd: pcApp });
const bin = join(WORK, 'chibarti-pc');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: pcApp, stdio: ['ignore', 'ignore', 'inherit'] });
const home = join(WORK, 'home');
const inputLog = join(WORK, 'input.log');
mkdirSync(home, { recursive: true });
let prog, progSaid, port, token;
async function startProgram() {
  prog = spawn(bin, ['--no-window', '--stay'], { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), CHIBARTI_TEST: '1', CHIBARTI_PROBE: '127.0.0.1', CHIBARTI_INPUT_LOG: inputLog }, stdio: ['ignore', 'pipe', 'ignore'] });
  progSaid = said(prog, 'program');
  const r = await progSaid.expect(/^READY /, 10000);
  [, port, token] = r.split(' ');
}
await startProgram();
const BASE = 'http://127.0.0.1:' + port + '/';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'he-IL' });
await ctx.addInitScript(fakeScreen);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.setDefaultTimeout(10000);
const shot = (n) => page.screenshot({ path: join(SHOTS, n + '.png') });

await step('the program refuses other sites, other host names and requests without its token', async () => {
  const a = await fetch(BASE + 'api/phones');
  ok(a.status === 403, 'no token: ' + a.status);
  const b = await fetch(BASE + 'api/phones', { headers: { 'X-Chibarti': 'wrong' } });
  ok(b.status === 403, 'wrong token: ' + b.status);
  const c = await fetch('http://localhost:' + port + '/api/phones', { headers: { 'X-Chibarti': token } });
  ok(c.status === 200, 'localhost is fine: ' + c.status);
  // a page from another "site" that points its name at this computer (DNS rebinding) gets nothing
  const d = await new Promise((res) => {
    const s = net.connect(+port, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\nHost: evil.example:' + port + '\r\nConnection: close\r\n\r\n'));
    let t = ''; s.on('data', (x) => { t += x; }); s.on('end', () => res(t));
  });
  ok(/^HTTP\/1\.1 403/.test(d), 'other host name: ' + d.slice(0, 20));
  const e = await new Promise((res) => {
    const s = net.connect(+port, '127.0.0.1', () => s.write('GET /ws?t=' + token + '&ip=127.0.0.1&port=' + phone.httpsPort + '&id=x HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nOrigin: https://evil.example\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'));
    let t = ''; s.on('data', (x) => { t += x; s.end(); }); s.on('close', () => res(t));
  });
  ok(/^HTTP\/1\.1 403/.test(e), 'other origin on /ws: ' + e.slice(0, 20));
});

await step('the window shows a QR code and finds the phone on the network', async () => {
  await page.goto(BASE);
  await page.waitForSelector('.qr-box svg');
  await page.waitForFunction(() => document.querySelector('.found li') && document.querySelector('.found li').textContent.includes('Redmi'), null, { timeout: 15000 });
  const q = await page.evaluate(() => window.PC.claimQr());
  ok(/^chibarti:\/\/pc\?v=1&k=[0-9a-f]{32}&n=/.test(q), q);
  await shot('20-program-pair');
});

await step('the phone scans the QR code: connected, no code, no approval', async () => {
  const tok = await page.evaluate(() => window.PC_PROGRAM.claim);
  writeFileSync(join(phone.out, 'claim.txt'), tok);
  await phone.expect(/^CONNECTED claim/, 12000);
  await page.waitForSelector('#desk:not([hidden])');
  const pins = JSON.parse(readFileSync(join(home, '.config', 'Chibarti', 'phones.json'), 'utf8'));
  const p = pins.pins['f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0'];
  ok(p && /^[0-9a-f]{64}$/.test(p.fp) && p.name === 'Redmi Note 8', 'certificate remembered: ' + JSON.stringify(pins));
  await shot('21-program-connected');
});

await step('messages and files work through the program', async () => {
  await page.fill('#say', 'דרך התוכנה');
  await page.press('#say', 'Enter');
  await phone.expect(/^TEXT דרך התוכנה/);
  await page.waitForSelector('.bubble.theirs');
  const f = join(WORK, 'from-program.bin');
  writeFileSync(f, Buffer.alloc(700000, 7));
  await page.setInputFiles('#pick', f);
  ok(/ 700000 ok$/.test(await phone.expect(/^GOT /, 12000)), 'file');
});

await step('the phone controls this computer only after "לאפשר" (whole screen shared)', async () => {
  await page.click('[data-act="share"]');
  await phone.expect(/^MIRROR_OFFER /);
  await phone.expect(/^VIDEO_CONFIG /, 12000);
  // before allowing: the program moves nothing
  const early = await fetch(BASE + 'api/input', { method: 'POST', headers: { 'X-Chibarti': token }, body: '{"t":"k","k":"enter"}' });
  ok(early.status === 409, 'input before allowing: ' + early.status);
  await page.fill('#say', '/control');
  await page.press('#say', 'Enter');
  await page.waitForSelector('[data-act="ctl-allow"]');
  await shot('22-program-control-ask');
  await page.click('[data-act="ctl-allow"]');
  await phone.expect(/^CONTROL_REPLY true/);
  await page.fill('#say', '/inputs');
  await page.press('#say', 'Enter');
  await new Promise((r) => setTimeout(r, 1500));
  const log = existsSync(inputLog) ? readFileSync(inputLog, 'utf8') : '';
  ok(/move 0\.250 0\.500\nbutton right=false down=true\nbutton right=false down=false/.test(log), 'tap → click: ' + log.slice(0, 120));
  ok(/move 0\.600 0\.600\nbutton right=true down=true/.test(log), 'long press → right click');
  ok(/button right=false down=true\nmove 0\.200 0\.200\nmove 0\.300 0\.300\nbutton right=false down=false/.test(log), 'drag');
  ok(/wheel -2\.00/.test(log), 'scroll');
  ok(/key 13 true\nkey 13 false/.test(log), 'enter');
  ok(/char ש\nchar ל\nchar ו\nchar ם/.test(log), 'typing Hebrew');
  await page.waitForSelector('.ctl-ask.on');
  await shot('23-program-controlled');
  await page.click('[data-act="ctl-in-stop"]');
  await phone.expect(/^CONTROL_STOP/);
  const late = await fetch(BASE + 'api/input', { method: 'POST', headers: { 'X-Chibarti': token }, body: '{"t":"k","k":"enter"}' });
  ok(late.status === 409, 'input after stopping: ' + late.status);
  await page.click('.sending [data-act="mirror-stop"]');
  await phone.expect(/^MIRROR_STOP/);
});

await step('next time the program connects by itself (remembered phone)', async () => {
  await page.reload();
  await phone.expect(/^CONNECTED trusted/, 15000);
  await page.waitForSelector('#desk:not([hidden])');
});

await step('a different phone at that address (other certificate) is refused', async () => {
  // as if someone else answered with this phone's name: the remembered certificate doesn't match
  await page.evaluate(() => window.PC.disconnect());
  await phone.expect(/^BYE /);
  prog.kill();
  await new Promise((r) => setTimeout(r, 400));
  const f = join(home, '.config', 'Chibarti', 'phones.json');
  const pins = JSON.parse(readFileSync(f, 'utf8'));
  pins.pins['f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0'].fp = '00'.repeat(32);
  writeFileSync(f, JSON.stringify(pins));
  await startProgram();
  const before = phone.lines.length;
  await page.goto('http://127.0.0.1:' + port + '/');
  await page.waitForSelector('.pair-card .warn-note', { timeout: 12000 });
  ok(!phone.lines.slice(before).some((l) => /^HELLO trusted/.test(l.t)), 'the program must not reach the phone with the remembered key');
  ok(await page.evaluate(() => window.PC.L.state === 'off'), 'not connected');
  await shot('24-program-changed');
});

await step('no errors in the page', async () => { ok(!errors.length, errors.slice(0, 3).join(' | ')); });

await browser.close();
prog.kill();
phone.kill();
rmSync(join(pcApp, 'web'), { recursive: true, force: true });
console.log(`\n${R.passed} passed, ${R.failed} failed · screenshots in ${SHOTS}`);
process.exit(R.failed ? 1 : 0);
