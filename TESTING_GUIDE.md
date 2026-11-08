# Testing guide – חיברתי (Chibarti)

## 1. Automated tests (already run, no phone needed)

| Suite | Command | What it covers | Status when v1.0 was built |
|---|---|---|---|
| Protocol (plain Java) | `bash tests/java/run.sh` | base64url, HKDF (RFC 5869 vector), QR handshake over a real TCP socket, wrong 6-digit code refused and counted, expired secret refused, wrong host id refused, tampered frame detected, replayed frame detected, code expiry after 10 min and renewal after 5 wrong tries, QR payload parse/validation (version, prefix, port, address, token, password, method, expiry), safe file names, 3 MB + empty file with SHA-256, corrupted chunk → file deleted, out-of-order / oversized chunks refused, cancel deletes partial file, resume after a dropped link, chunks over the real encrypted socket, automatic bitrate down/up, video config packet; for the computer: WebSocket accept key (RFC 6455), the phone's certificate kept and valid, a masked fragmented WebSocket message both ways over TLS with one clean close | 22/22 passed locally; also runs in every CI build |
| Screens (Playwright, 320×640) | `node tests/app.test.mjs` (with `www/` served on :8765) | Hebrew sizes/times, Hebrew prefix before Latin names, file kinds, QR drawn and read back by jsQR, host page, approval sheet opens/closes by itself, nearby list, keypad, connected card, progress updated in place (no redraw), photo grid toggle, offer sheet with APK warning, messages keep the draft, no sideways scrolling on every tab/page/sheet, dark theme, no page errors | 44/44 passed locally (incl. "חיבור למחשב", the program's QR, remote-control request / setup / controlled banner) |
| Java compile check | `javac` against `android.jar` API 34 + Capacitor stubs | every class in `android-native/` compiles | passed locally; the real Gradle build runs in CI |
| Computer page (Playwright, 1366×820) | `node tests/pc.test.mjs` | the page in `www/pc/` against `tests/java/FakePhone.java`, which runs the app's real `WebServer` + `Tls` + `WsLink`: port 8080 explanation, HTTPS + secure context, wrong / right code, messages with links, 3 MB to the phone (SHA-256 checked), 2.5 MB from the phone (download checked byte by byte), the phone's H.264 picture decoded and drawn, this screen + sound encoded (H.264 + Opus) and the recording verified by ffprobe, dropped link resumed, remembered computer, phone leaving, narrow window | 15/15 passed (v1.2 adds controlling the phone: tap, drag, wheel, typing, Enter, right click = back, home) |
| Windows program, unit (Go) | `cd pc-app && go test ./...` | WebSocket both ways (1 B – 3 MB messages, RFC accept key), the built-in page with the token, other host names refused, input refused while control is off, tap / long press / drag / scroll / keys / Hebrew + emoji typing turned into mouse and keyboard actions, only private network addresses | passes locally and in every CI build |
| Windows program with its window (Playwright) | `node tests/program.test.mjs` | the program built for Linux against `FakePhone`: no token / wrong token / other host name / other origin on the relay refused, QR shown, phone found on the network, phone "scans" → connected with no code and no approval, certificate remembered, messages and files through the relay, phone controls the computer only after "לאפשר" (actions logged instead of moved), connects by itself next time, a phone with another certificate is refused | 8/8 passed for v1.2 |
| Site screenshots | Itzko kit `build.mjs` | all scenes render without app errors (incl. the computer page at 1280×760) | passed locally |

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

### Computer (one phone + a Windows / Mac computer with Chrome or Edge)
- [ ] Home → "חיבור למחשב": network name, password, address (192.168.49.1:8080) and code appear.
- [ ] Computer joins the phone's Wi-Fi (DIRECT-…); opening the address shows the explanation page, then the "not private" warning; Advanced → Continue opens the page.
- [ ] Wrong code → clear message; right code → the phone asks "מחשב Windows רוצה להתחבר"; approve → both sides connected.
- [ ] Same Wi-Fi path: with the phone on a home Wi-Fi, the computer on the same Wi-Fi opens the second address shown.
- [ ] Drag a 2 GB file onto the page → arrives on the phone, checked. Phone → computer: a video arrives as a download (or into the chosen folder in Chrome/Edge).
- [ ] Phone "מסך → התחלת שיתוף" → the computer asks → the picture appears, full screen works (no sound from Android 9; sound from Android 10+).
- [ ] Computer "להציג בטלפון" with "שיתוף אודיו" → the phone asks → full-screen picture with the computer's sound; switching windows on the computer keeps it running.
- [ ] Turn the phone's Wi-Fi off/on for a few seconds → the page shows "מתחבר שוב" and continues; a transfer resumes.
- [ ] Reload the page with "לזכור" on → connects without a code (the phone on "חיבור למחשב").
- [ ] After an in-app update, the computer page served is the updated one.

### Windows program (a Windows 10/11 computer + a phone)
- [ ] Download chibarti-pc.exe from the site; SmartScreen: "More info" → "Run anyway". A window opens (Edge app window, no address bar) with a QR code.
- [ ] Phone: "חיבור למחשב" → "יש לך את תוכנת חיברתי במחשב?" → scan. Same Wi-Fi: connects within a few seconds, no approval tap.
- [ ] No firewall question appears. Close the window → the program exits within ~15 s (Task Manager).
- [ ] Next day: open the program, open חיברתי on the phone (no button) → connects by itself (same Wi-Fi).
- [ ] No shared Wi-Fi: connect the computer to the phone's DIRECT-… network → the program finds 192.168.49.1.
- [ ] Reinstall the app on the phone → the program says the phone looks different; scanning again fixes it.

### Remote control
- [ ] Updating the app itself (1.1 → 1.3) is not blocked by Play Protect (the app has no accessibility service).
- [ ] Phone A shares, phone B watches → B taps ☝ "שליטה" → A: "לאפשר שליטה" → the add-on sheet → download chibarti-control.apk → install (if Play Protect blocks: Play Protect ⚙ → turn off "scan apps", install, turn it back on) → back to חיברתי: the sheet moves to "turn it on" → "הפעלה" opens the add-on's screen → Accessibility → "חיברתי – שליטה" on → back: B gets the answer by itself → B can tap, swipe, long-press, use ◁ ○ ▢, type with ⌨ (Hebrew too).
- [ ] Android 13+ on A: if the switch is grey, the add-on's App info → ⋮ → "Allow restricted settings".
- [ ] Computer watches a phone → "שליטה" → mouse click / drag / wheel / right click (back) / typing on the keyboard.
- [ ] Phone watches the computer (program, whole screen shared) → "שליטה" → the computer asks "לאפשר" → taps click, long press right-clicks, drag drags, ⌨ types, Esc / ⊞ / ↵ / ⌫ keys work. With a window shared instead of the whole screen, the phone is told to share the whole screen.
- [ ] Stop from either side, from the notification, or by ending screen sharing → control ends; inputs no longer arrive.

## 3. Android versions to cover if possible
Android 6.0 (API 23, the minimum), 8.x (local hotspot appears), 9 (last legacy Wi-Fi join), 10 (P2P join from QR,
sound capture), 12 (Bluetooth/location rule changes), 13 (nearby-devices permission, photo picker), 14 (screen-capture
service rules, single-app sharing).
