# Testing guide – חיברתי (Chibarti)

## 1. Automated tests (already run, no phone needed)

| Suite | Command | What it covers | Status when v1.0 was built |
|---|---|---|---|
| Protocol (plain Java) | `bash tests/java/run.sh` | base64url, HKDF (RFC 5869 vector), QR handshake over a real TCP socket, wrong 6-digit code refused and counted, expired secret refused, wrong host id refused, tampered frame detected, replayed frame detected, code expiry after 10 min and renewal after 5 wrong tries, QR payload parse/validation (version, prefix, port, address, token, password, method, expiry), safe file names, 3 MB + empty file with SHA-256, corrupted chunk → file deleted, out-of-order / oversized chunks refused, cancel deletes partial file, resume after a dropped link, chunks over the real encrypted socket, automatic bitrate down/up, video config packet | 19/19 passed locally; also runs in every CI build |
| Screens (Playwright, 320×640) | `node tests/app.test.mjs` (with `www/` served on :8765) | Hebrew sizes/times, Hebrew prefix before Latin names, file kinds, QR drawn and read back by jsQR, host page, approval sheet opens/closes by itself, nearby list, keypad, connected card, progress updated in place (no redraw), photo grid toggle, offer sheet with APK warning, messages keep the draft, no sideways scrolling on every tab/page/sheet, dark theme, no page errors | 32/32 passed locally |
| Java compile check | `javac` against `android.jar` API 34 + Capacitor stubs | every class in `android-native/` compiles | passed locally; the real Gradle build runs in CI |
| Site screenshots | Itzko kit `build.mjs` | all 19 scenes render without app errors | passed locally |

Nothing that needs radio hardware (Wi-Fi Direct, hotspot, MediaProjection, MediaCodec, AudioPlaybackCapture,
camera) can run in these tests. Those parts were compiled and reviewed, **not executed**. They need the checklist below.

## 2. Manual checklist with two physical phones

Use two phones, ideally of different ages (for example Android 13/14 + Android 7/8). Write down model + Android version.
Turn mobile data **off** and keep Wi-Fi **on but not connected** for the "no internet" tests.

### Connecting
- [ ] A: "התחלת חיבור" → QR + 6 digits + "Wi-Fi Direct" chip appear within ~5 s. Permission prompts are explained.
- [ ] B: "סריקת קוד" → camera opens, reads the code within 1–2 s, Home shows the three steps.
- [ ] Android 10+ on B may show "Connect to device?" — accept. Android 6–9 on B joins silently.
- [ ] A: approval sheet shows B's name → "אישור" → both Homes show "מחובר ל-…", via Wi-Fi Direct, quality bars.
- [ ] Decline on A → B shows "הטלפון השני לא אישר". No answer for 60 s → "לא התקבל אישור בזמן".
- [ ] Nearby list: B "חיפוש טלפונים בסביבה" → A appears → type the 6 digits → connects. Wrong digits → "הקוד שגוי"; 5 wrong tries renew the code on A.
- [ ] "לזכור את הטלפון" kept on → disconnect → A starts again → B picks A from the list → connects **without** a code and without approval.
- [ ] Settings → מכשירים מוכרים → "שכחה" → next time a code is needed again.
- [ ] Scan A's QR with B's **system camera** app → the link opens חיברתי and connects.
- [ ] Phone without Wi-Fi Direct (or with it disabled): A falls back to local hotspot (Android 8+) or shows "דרך ה-Wi-Fi הקיים"; B connects.
- [ ] Both phones on the same router with no internet: QR join connects directly over the LAN (fast).
- [ ] Android 6–12: location off → the "עוד צעד קטן" sheet asks to turn it on; after turning it on it continues.

### Reconnection
- [ ] While connected, walk B out of range for ~10 s and back → "החיבור נקטע לרגע…" then "החיבור חזר" (within 30 s).
- [ ] Turn B's Wi-Fi off for a minute → session ends with "החיבור … אבד"; B returns to its normal Wi-Fi (Android 6–9).
- [ ] Screen off on both for 5 minutes while connected → still connected (notification visible). If not, check battery settings.

### Files
- [ ] Send one PDF, one ZIP, one APK, one Office file → B gets the approval sheet with names/sizes; APK warning shown.
- [ ] Accept → progress, speed, time left on both sides; files land in Download/Chibarti; photos in Pictures/Chibarti, videos in Movies/Chibarti.
- [ ] Send a 2–4 GB video → memory stays low (no crash on an old phone); SHA-256 passes ("נבדק").
- [ ] Pause on the sender → receiver shows "הושהה בטלפון השני"; resume continues.
- [ ] Cancel from either side → partial file deleted on the receiver; finished files stay.
- [ ] Mid-transfer, break the connection for ~10 s → transfer continues from the same point after reconnect.
- [ ] Same file sent twice → second copy saved as "name (1).ext".
- [ ] Receiver with almost no free space → offer refused with "אין מספיק מקום".
- [ ] Choose a custom folder in Settings (including an SD card) → files go there.
- [ ] Android 6–9 receiver → storage permission asked once, files saved in public folders.
- [ ] Received APK is never installed automatically; "פתיחה" opens the Downloads app.

### Photos and videos
- [ ] "תמונות וסרטונים" → Android 13+ photo picker (no full-gallery permission); older → document picker.
- [ ] Thumbnails appear without the grid jumping; long-press opens a large preview; tap toggles selection; count updates.

### Screen sharing
- [ ] A shares (each quality: 480p, 720p, 1080p, max/60) → Android consent → B approval sheet → B opens full screen within ~2 s.
- [ ] Latency feels live (target well under 0.5 s on Wi-Fi Direct); B's bar shows resolution, FPS, delay.
- [ ] Rotate A (portrait ↔ landscape) → B's picture changes shape within ~1 s.
- [ ] B rotates its own phone → picture refits; rotate button works.
- [ ] Sound (A on Android 10+): YouTube/music audible on B, roughly in sync; a call or a protected app stays silent (expected).
- [ ] A on Android 6–9 → shares without sound; UI says sound needs Android 10.
- [ ] Move apart to weaken the signal with "איכות אוטומטית" on → picture gets softer but stays live; quality climbs back later.
- [ ] Stop from A (button or notification), from B (✕ or back) → both sides end cleanly.
- [ ] A leaves חיברתי and uses other apps → B keeps seeing A's screen.
- [ ] Android 14 single-app sharing on A → B shows just that app; resizing works.
- [ ] Old phone whose encoder can't do 1080p/60 → it silently uses a smaller size.
- [ ] Then the other direction: B shares to A.

### Text
- [ ] Send Hebrew, English, a link, multi-line text → appear on the other phone; "העתקה" puts it on the clipboard.
- [ ] "הדבקה" reads the clipboard only when pressed. A message arriving while typing doesn't clear the draft.
- [ ] App in background → a notification shows the message.

### General
- [ ] Light/dark/system theme; Hebrew RTL everywhere; small phone (≤ 360 dp wide) and a tablet.
- [ ] History lists everything sent/received with day groups and filter; clearing it keeps the files.
- [ ] Settings → שיתוף האפליקציה → "לשלוח לטלפון המחובר" sends chibarti.apk to the other phone.
- [ ] With internet: "בדיקת עדכונים" works; feedback reaches the developer's e-mail.

## 3. Android versions to cover if possible
Android 6.0 (API 23, the minimum), 8.x (local hotspot appears), 9 (last legacy Wi-Fi join), 10 (P2P join from QR,
sound capture), 12 (Bluetooth/location rule changes), 13 (nearby-devices permission, photo picker), 14 (screen-capture
service rules, single-app sharing).
