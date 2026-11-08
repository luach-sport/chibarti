// Starts the pretend phone (tests/java/FakePhone.java: the app's real WebServer, Tls and WsLink) and waits for what
// it says. Used by tests/pc.test.mjs (the page in a browser) and tests/program.test.mjs (the Windows program).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function playwright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch (e) { return createRequire('/opt/npm-tools/node_modules/')('playwright'); }
}

/** Builds the phone and a 4-second test video, starts it; resolves when it listens. */
export async function startPhone(work) {
  const JSON_DIR = process.env.JSON_JAVA_DIR || '/home/claude/deps/json-java';
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'classes'), { recursive: true });
  const java = ['Link', 'Crypto', 'Proto', 'Handshake', 'SecureLink', 'Tls', 'WebServer', 'WsLink'].map((c) => join(ROOT, 'android-native', c + '.java'));
  const jsonSrc = execFileSync('find', [join(JSON_DIR, 'src/main/java/org/json'), '-name', '*.java']).toString().trim().split('\n');
  execFileSync('javac', ['-encoding', 'UTF-8', '-nowarn', '-d', join(work, 'classes'), ...jsonSrc, ...java, join(ROOT, 'tests/java/FakePhone.java')], { stdio: ['ignore', 'ignore', 'inherit'] });
  const h264 = join(work, 'phone.h264');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30', '-t', '4', '-c:v', 'libx264', '-profile:v', 'baseline', '-bf', '0', '-g', '30', '-pix_fmt', 'yuv420p', '-f', 'h264', h264]);
  const proc = spawn('java', ['-cp', join(work, 'classes'), 'com.luachsport.chibarti.FakePhone', join(ROOT, 'www'), join(work, 'out'), h264], { stdio: ['ignore', 'pipe', 'inherit'] });
  const p = said(proc, 'phone');
  const ready = await p.expect(/^READY /, 15000);
  const [, httpPort, httpsPort] = ready.split(' ');
  return { ...p, proc, httpPort, httpsPort, out: join(work, 'out'), kill: () => proc.kill() };
}

/** Lines a process prints; expect(re) waits for the next one that matches (each line counts once). */
export function said(proc, label) {
  const lines = [], waiters = [];
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = { t: buf.slice(0, i).trim(), used: false };
      buf = buf.slice(i + 1);
      lines.push(l);
      if (process.env.VERBOSE) console.log('  ' + label + ':', l.t);
      const w = waiters.find((x) => x.re.test(l.t));
      if (w) { waiters.splice(waiters.indexOf(w), 1); l.used = true; w.res(l.t); }
    }
  });
  const expect = (re, ms = 8000) => {
    const have = lines.find((l) => !l.used && re.test(l.t));
    if (have) { have.used = true; return Promise.resolve(have.t); }
    return new Promise((res, rej) => {
      const w = { re, res };
      waiters.push(w);
      setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); rej(new Error(label + ' never said ' + re)); } }, ms);
    });
  };
  return { expect, lines };
}

/** A tiny runner: named steps, a count, and a failure line for each. */
export function runner() {
  const r = { passed: 0, failed: 0 };
  r.step = async (name, fn) => {
    try { await fn(); r.passed++; console.log('✓', name); } catch (e) { r.failed++; console.log('✗', name, '\n   ', String(e.message).split('\n')[0]); }
  };
  r.ok = (c, msg) => { if (!c) throw new Error(msg); };
  return r;
}

/** Stands in for getDisplayMedia (no real screen in the tests): a moving picture and a tone. */
export function fakeScreen() {
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
}
