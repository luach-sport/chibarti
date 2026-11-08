// Builds the in-app update for this release: a zip of the web app plus a signed update.json.
// The app verifies the signature with the public key it was built with, then the native updater
// checks the zip's SHA-256 before switching to it.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const env = process.env;
const repo = env.GITHUB_REPOSITORY || 'luach-sport/chibarti';
const build = parseInt(env.GITHUB_RUN_NUMBER || '0', 10);
const version = env.APP_VERSION || '1.2';
const tag = env.TAG;
const keyDir = env.UPDATE_KEY_DIR;
const out = join(root, 'dist');
if (!tag || !build || !keyDir) throw new Error('TAG, GITHUB_RUN_NUMBER and UPDATE_KEY_DIR are required');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1) the web app as a zip (index.html at the zip root)
const zip = join(out, 'bundle.zip');
execFileSync('zip', ['-q', '-r', '-X', zip, '.'], { cwd: join(root, 'www'), stdio: 'inherit' });
const zipBytes = readFileSync(zip);
const sha256 = createHash('sha256').update(zipBytes).digest('hex');

// 2) fingerprint of everything native (including the app's own Java code in android-native/); when it changes,
//    older APKs must install the new APK instead
const files = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
const nativeInputs = ['capacitor.config.json', 'scripts/patch-android.sh', ...files(join(root, 'android-res')).map((p) => relative(root, p)), ...files(join(root, 'android-native')).map((p) => relative(root, p))].sort();
const h = createHash('sha256');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
h.update(JSON.stringify(Object.keys(pkg.dependencies || {}).sort().map((k) => [k, pkg.dependencies[k]])));
for (const f of nativeInputs) { h.update(f); h.update(readFileSync(join(root, f))); }
h.update(readFileSync(join(root, '.github/workflows/build.yml'), 'utf8').match(/java-version:\s*\S+/)?.[0] || '');
const nativeKey = h.digest('hex').slice(0, 24);

let minNative = build;
const prevFile = env.PREV_UPDATE && existsSync(env.PREV_UPDATE) ? env.PREV_UPDATE : null;
if (prevFile) {
  try {
    const prev = JSON.parse(JSON.parse(readFileSync(prevFile, 'utf8')).payload);
    if (prev.nativeKey === nativeKey && prev.minNative) minNative = prev.minNative;
  } catch (e) { console.log('previous update.json unreadable, starting fresh'); }
}

// 3) release notes: lines from release-notes.txt
const notes = existsSync(join(root, 'release-notes.txt'))
  ? readFileSync(join(root, 'release-notes.txt'), 'utf8').split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 8)
  : [];

const payload = JSON.stringify({
  app: 'com.luachsport.chibarti', version, build, minNative, nativeKey,
  url: `https://github.com/${repo}/releases/download/${tag}/bundle.zip`,
  sha256, size: zipBytes.length, notes, date: new Date().toISOString()
});
const priv = createPrivateKey(readFileSync(join(keyDir, 'key.pem')));
const opts = { key: priv, dsaEncoding: 'ieee-p1363' };
const sig = sign('sha256', Buffer.from(payload), opts).toString('base64');
const pub = createPublicKey(readFileSync(join(keyDir, 'pub.pem')));
if (!verify('sha256', Buffer.from(payload), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64'))) throw new Error('signature self-check failed');
writeFileSync(join(out, 'update.json'), JSON.stringify({ payload, sig }) + '\n');
console.log('update', version, 'build', build, 'minNative', minNative, 'native', nativeKey, 'zip', zipBytes.length, 'bytes', sha256);
