// The computer page (www/pc/) against a pretend phone that uses the app's real web server, TLS and WebSocket code
// (tests/java/FakePhone.java): pairing, messages, files both ways, the phone's screen here (H.264 decoded in the
// page), this screen on the phone (H.264 + Opus encoded in the page, then checked with ffmpeg), a dropped
// connection that comes back, a remembered computer, and the phone leaving.
// Needs: javac/java, ffmpeg, Playwright. Run: node tests/pc.test.mjs   (screenshots: $SHOTS or /tmp/chibarti-pc)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { startPhone, playwright, runner, fakeScreen } from './lib/fake-phone.mjs';

const { chromium } = playwright();
const WORK = process.env.PC_WORK || '/tmp/chibarti-pc-test';
const SHOTS = process.env.SHOTS || '/tmp/chibarti-pc';
mkdirSync(SHOTS, { recursive: true });

const phone = await startPhone(WORK);
const { expect, httpPort, httpsPort } = phone;
const R = runner();
const { step, ok } = R;
const BASE = 'https://localhost:' + httpsPort + '/';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 820 }, locale: 'he-IL', acceptDownloads: true });
// The test has no real screen to share: a moving picture and a tone stand in for getDisplayMedia.
await ctx.addInitScript(fakeScreen);
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
  ok((await page.textContent('.bubble.theirs .quote')).includes('שלום מהמחשב'), 'the answer does not show the quoted message');
});

await step('answering a message quotes it (↩ on the message)', async () => {
  await page.hover('.bubble.theirs');
  await page.click('.bubble.theirs .rep');
  await page.waitForSelector('#replyBar .grow');
  ok((await page.textContent('#replyBar')).includes('קיבלתי'), 'no "answering" bar');
  await page.fill('#say', 'תשובה עם ציטוט');
  await page.press('#say', 'Enter');
  const r = await expect(/^REPLY abc123 /);
  ok(r.includes('קיבלתי'), r);
  ok((await page.textContent('#replyBar')) === '', 'the bar stays after sending');
  ok(await page.evaluate(() => [...document.querySelectorAll('.bubble.mine')].some((b) => b.textContent.includes('תשובה עם ציטוט') && b.querySelector('.quote') && b.querySelector('.quote').textContent.includes('קיבלתי'))), 'my message does not show the quote');
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
});

await step('the phone can be controlled from here: tap, drag, wheel, typing, back, home', async () => {
  await page.click('#screenTools [data-act="ctl-ask"]');
  await expect(/^CONTROL_ASK sharing=true/);
  await page.waitForSelector('#screenStage.ctl');
  const box = await page.evaluate(() => { const r = window.PC.viewCanvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.25);
  const tap = JSON.parse((await expect(/^INPUT /)).slice(6));
  ok(tap.t === 'g' && tap.p.length === 1 && Math.abs(tap.p[0][0] - 0.5) < 0.01 && Math.abs(tap.p[0][1] - 0.25) < 0.01, 'tap ' + JSON.stringify(tap));
  await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.8);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * (0.8 - i * 0.05)); await page.waitForTimeout(16); }
  await page.mouse.up();
  const drag = JSON.parse((await expect(/^INPUT /)).slice(6));
  ok(drag.t === 'g' && drag.p.length >= 5 && drag.p[0][1] > 0.75 && drag.p[drag.p.length - 1][1] < 0.35 && drag.p[drag.p.length - 1][2] > 100, 'drag ' + JSON.stringify(drag).slice(0, 120));
  await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.5);
  await page.mouse.wheel(0, 240);
  const w = JSON.parse((await expect(/^INPUT /)).slice(6));
  ok(w.t === 'w' && w.dy > 0, 'wheel ' + JSON.stringify(w));
  // (Playwright inserts non-English letters without key events, so the test types English; a Hebrew keyboard sends keys)
  await page.keyboard.type('Shalom 12');
  const s = JSON.parse((await expect(/^INPUT /)).slice(6));
  ok(s.t === 's' && s.s === 'Shalom 12', 'typing ' + JSON.stringify(s));
  await page.keyboard.press('Enter');
  ok(JSON.parse((await expect(/^INPUT /)).slice(6)).k === 'enter', 'enter');
  await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.5, { button: 'right' });
  ok(JSON.parse((await expect(/^INPUT /)).slice(6)).k === 'back', 'right click = back');
  await page.click('.stage-nav [data-k="home"]');
  ok(JSON.parse((await expect(/^INPUT /)).slice(6)).k === 'home', 'home button');
  await shot('08b-controlling');
  await page.click('#screenTools [data-act="ctl-ask"]');
  await expect(/^CONTROL_STOP/);
  await page.waitForSelector('#screenStage:not(.ctl)');
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
  // a phone can't control a computer from the browser page (only from the program)
  await page.fill('#say', '/control');
  await page.press('#say', 'Enter');
  await expect(/^CONTROL_REPLY false browser/);
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
console.log(`\n${R.passed} passed, ${R.failed} failed · screenshots in ${SHOTS}`);
process.exit(R.failed ? 1 : 0);
