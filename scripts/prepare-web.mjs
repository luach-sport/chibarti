// Prepares www/ for packaging: bundles the Capacitor runtime, stamps the version, and (in the APK build) rewrites the
// app's scripts for old Android WebViews (Chrome 61), so the app also runs on old phones that never updated.
import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicKey } from 'node:crypto';
import { build, transform } from 'esbuild';

const root = process.cwd();
const www = join(root, 'www');

await build({
  entryPoints: [join(root, 'scripts', 'cap-entry.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['chrome61'],
  outfile: join(www, 'cap-runtime.js')
});
console.log('cap-runtime.js built');

const version = process.env.APP_VERSION || '1.4';
const buildNo = process.env.GITHUB_RUN_NUMBER || 'dev';
const info = { version, build: buildNo };

// Public half of the release key: the app only accepts in-app updates signed with the matching private key.
const pubFile = process.env.UPDATE_KEY_DIR ? join(process.env.UPDATE_KEY_DIR, 'pub.pem') : '';
if (pubFile && existsSync(pubFile)) {
  const jwk = createPublicKey(readFileSync(pubFile)).export({ format: 'jwk' });
  info.updateKey = Object.fromEntries(Object.entries(jwk).filter(([k]) => ['kty', 'n', 'e', 'crv', 'x', 'y'].includes(k)));
  console.log('update key', jwk.kty, jwk.crv || '');
} else {
  console.log('no update key: in-app updates are off in this build');
}
writeFileSync(join(www, 'js', 'version.js'), 'window.CHIBARTI_VERSION = ' + JSON.stringify(info) + ';\n');
console.log('version', version, 'build', buildNo);

// Old WebViews: lower newer syntax in every script of the app (only in the CI build; the files in git stay readable).
if (process.env.CI) {
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  let n = 0;
  for (const f of walk(join(www, 'js')).filter((p) => p.endsWith('.js'))) {
    const out = await transform(readFileSync(f, 'utf8'), { loader: 'js', target: 'chrome61', charset: 'utf8' });
    writeFileSync(f, out.code);
    n++;
  }
  console.log('scripts made compatible with Chrome 61:', n);
}
