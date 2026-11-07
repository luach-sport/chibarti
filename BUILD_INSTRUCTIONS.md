# Build instructions – חיברתי (Chibarti)

The normal way: **push to `main`**. GitHub Actions (`.github/workflows/build.yml`) runs the protocol tests, builds a signed APK
and publishes it as a GitHub Release with an in-app update bundle. The site (`site.yml`) rebuilds itself after every release.

Download link (always the latest): https://github.com/luach-sport/chibarti/releases/latest/download/chibarti.apk

## What the CI build does
1. `npm install` (Capacitor 7: `@capacitor/android`, core plugins, `@capgo/capacitor-updater`, esbuild).
2. `bash tests/java/run.sh` – plain-Java protocol tests (fails the build if any test fails).
3. Extracts the release key (only if the secret `CHIBARTI_KEY_PASS` exists) for signing the in-app update manifest.
4. `node scripts/prepare-web.mjs` – bundles the Capacitor runtime into `www/cap-runtime.js`, writes `www/js/version.js`,
   and (because `CI` is set) lowers the syntax of every `www/js/**/*.js` to Chrome 61 for old Android WebViews.
5. `npx cap add android` – generates the Android project from Capacitor's template (not kept in git).
6. `bash scripts/patch-android.sh` – icons, Hebrew name, copies `android-native/*.java` into
   `com.luachsport.chibarti`, manifest (permissions, `LinkService`, `ViewerActivity`, `chibarti://join` links,
   legacy storage), minSdk 23 / targetSdk 34, version code = run number, release signing.
7. `npx cap sync android`, then `./gradlew assembleRelease` (or `assembleDebug` without the secret).
8. Publishes `chibarti.apk`, `bundle.zip`, `update.json` as release `v<APP_VERSION>-build<run>`.

## Build locally (a computer with Android Studio)
Requirements: Node 22, JDK 21, Android SDK (platform 35, build-tools), Android Studio optional.

```bash
npm install
node scripts/prepare-web.mjs          # add CI=1 to also lower the JS syntax for old WebViews
npx cap add android
bash scripts/patch-android.sh
npx cap sync android
cd android && ./gradlew assembleDebug  # → app/build/outputs/apk/debug/app-debug.apk
```

To open in Android Studio after these steps: **File → Open → `android/`**. The Java sources you edit live in
`android-native/` (they are copied in by the patch script), so edit there and re-run steps 4–5.

Release signing locally (optional): put the password in the environment and build release:
```bash
export CHIBARTI_STORE_PASSWORD=… CHIBARTI_KEY_PASSWORD=… CHIBARTI_KEY_ALIAS=chibarti
cp signing/release.jks android/app/release.jks
cd android && ./gradlew assembleRelease
```
The password exists only in GitHub Secrets (`CHIBARTI_KEY_PASS`) and with the owner. It is never in the repo.

## Checks that run without Android
```bash
bash tests/java/run.sh                                    # 19 protocol tests (JDK only)
python3 -m http.server 8765 --directory www &             # the screens with a fake Android
node tests/app.test.mjs                                   # 32 screen tests (Playwright)
javac -cp android.jar:<capacitor stubs> android-native/*.java   # compile check against API 34
node <path to luach-sport/itzko>/kit/lib/build.mjs        # the site, into _site/
```

## Versions
- Product version: `APP_VERSION` in `.github/workflows/build.yml` (now `1.0`).
- Build number: the GitHub run number (also the Android `versionCode`, so every APK installs over the last one).
- Write the changes for each release in `release-notes.txt` (Hebrew, one line each); they appear in the release,
  in the in-app "new version" sheet, and on the site.
