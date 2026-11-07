# Claude handoff – חיברתי (Chibarti)

Everything needed to continue this project without the original prompt.

## Product
Two Android phones connect **directly** (no internet, router or server): screen mirroring with sound, file transfer of any
size, photos/videos in original quality, text messages with copy. Every new connection, every file offer and every screen
share needs explicit approval on the receiving phone. Hebrew RTL, light/dark, the Itzko family design (same as קמתי,
שמרתי, MyCar). Owner: Itzko (GitHub `luach-sport`). Android 6.0 (API 23) and up; no iPhone version (impossible there).

- Repo: https://github.com/luach-sport/chibarti · Site: https://luach-sport.github.io/chibarti/
- APK: https://github.com/luach-sport/chibarti/releases/latest/download/chibarti.apk
- Listed on the main Itzko site through `apps.json` in `luach-sport/itzko`.

## Decisions taken (and why)
- **Capacitor 7 + plain JS UI + native Java**, like the owner's other apps (shared site kit, in-app updates, feedback,
  APK sharing all reused). All real work (network, crypto, files, capture, codecs) is native Java; the WebView is only UI.
  The original brief asked for Kotlin/Compose/Room/DataStore; the owner asked to match the other apps instead.
- **minSdk 23** (Capacitor 7's floor). JS is lowered to Chrome 61 syntax at build time; `compat.css` handles old flex.
- **Own encrypted channel instead of TLS**: no certificates to manage on phones; ECDH P-256 ephemeral keys + HKDF-SHA256
  mixed with the pairing secret, both sides prove the secret (HMAC transcript), then AES-256-GCM per frame with counters
  (tamper/replay/reorder detection). Fully unit-tested on a PC.
- **One main connection + one stream connection** per session: files/messages never delay video.
- Single peer at a time (two phones). Either phone can share its screen to the other.

## Architecture
```
www/ (UI, window.CB)                      android-native/ (Java, package com.luachsport.chibarti)
 link/bridge.js  CB.N.call / CB.N.on  ⇄  ChibartiPlugin  (Capacitor plugin "Chibarti"; events: state, notice, text, link)
 link/live.js    CB.live snapshot     ⇠  Hub             (one session; snapshot() at ≤6/s; notices)
                                           ├ Connect      host side: Wi-Fi Direct group → LocalOnlyHotspot → LAN; Server; approvals
                                           │  ├ Joiner    join from QR (LAN first, P2P join API29+, WifiJoin legacy/specifier), nearby list, reconnect, stream link
                                           │  ├ WifiDirect, WifiJoin, LanBeacon (UDP 47820), Server (TCP 47821), Pairing, QrPayload
                                           ├ Session      main SecureLink (control before bulk, 8-chunk bulk window), ping/RTT, resume
                                           ├ Transfers    OutgoingJob / IncomingJob (64 KB chunks, SHA-256, pause, cancel, resume offsets), Saver, History
                                           └ Mirror       ScreenSender (MediaProjection → VirtualDisplay → VideoEncoder H.264 → queue → stream link,
                                                          RateControl, rotation), AudioSender (AAC, API 29+);
                                                          viewer: MirrorRx → ViewerActivity (VideoDecoder → SurfaceView, AudioPlayer → AudioTrack)
 LinkService: foreground service (connectedDevice | mediaProjection), Wi-Fi + wake locks, notifications/alerts.
```
Wire protocol (`Proto.java`): handshake `CHB1` (mode QR=1, PIN=2, TRUSTED=3, RESUME=4, STREAM=5), then frames
`[len][AES-GCM(type + body)]`. Control bodies are JSON (HELLO, APPROVED, DENIED, PING/PONG, BYE, TEXT, OFFER, OFFER_REPLY,
FILE_END, FILE_ACK, CANCEL, PAUSE, RESUME, MIRROR_*, KEY_REQUEST); CHUNK and media frames are binary.
QR content: `chibarti://join?v=1&i=<id>&n=<name>&t=<16-byte token>&m=<d|h|l>&s=<ssid>&k=<pass>&a=<ips>&p=<port>&e=<expiry>`.

Computer (browser, no install): while hosting, `Connect.startWeb()` runs `WebServer` (8080 plain → explanation page and a
link to 8443; 8443 HTTPS with the phone's own ECDSA certificate from `Tls`, persisted in files/tls). It serves `www/pc/`
(from the in-app update folder when there is one, else the APK assets; `fonts/`, `icon.png`, `logo.svg` from the app
root) and upgrades `/ws` to `WsLink` (implements `Link`, so `Session` doesn't care). First message HELLO
`{mode: pin|trusted|resume|stream, id (32 hex, kept in the browser), name, model, pin | key}`; `Connect.pcAccepted`
checks the code (counted like phones) or the remembered key, asks on the phone (`kind: "pc"`), answers APPROVED with a
session key (resume/stream) and a pair key (remember). The computer is always the joiner, so it opens the stream
connection (after MIRROR_REPLY in either direction, and again after a resume). Phone→computer video: the phone's
H.264 Annex B, decoded with WebCodecs (SPS/PPS from VIDEO_CONFIG prepended to key frames), AAC with AudioDecoder,
played with Web Audio. Computer→phone: getDisplayMedia → MediaStreamTrackProcessor (Chrome/Edge; other browsers copy
a video element to a canvas) → VideoEncoder H.264 constrained baseline, annexb, realtime; frames are skipped *before*
encoding when the socket backs up, bitrate lowered / raised every 2 s; VIDEO_CONFIG only when SPS/PPS/size change.
Sound: AudioEncoder Opus → `AUDIO_OPUS_CONFIG` (OpusHead) → `AudioPlayer` with csd-1/csd-2 (pre-skip, pre-roll).
Received files: in memory then a download, or straight into a folder (File System Access, Chrome/Edge).
Limits: TLS is self-signed (one browser warning; the phone shows its fingerprint), and the PIN goes inside TLS, so an
attacker who can intercept the computer's first connection and whom the user lets through the warning could relay it —
the phone's approval with the computer's name is the last check.

## Implemented
Everything listed in README "מה יש באפליקציה": QR + PIN pairing with expiry and brute-force renewal, approval, trusted
devices with per-device keys, nearby discovery (Wi-Fi Direct DNS-SD + LAN beacons), three network paths, auto-reconnect
(30 s) with transfer resume, file transfer with approval/free-space check/SHA-256/pause/cancel/duplicates/destination
choice/history, media picker with thumbnails and preview, screen mirroring both directions with quality presets,
adaptive bitrate, frame dropping instead of lag, rotation and Android 14 content resize, audio capture (API 29+) with
timestamp-based late-drop sync, full-screen viewer, text with copy/paste-on-demand, device rename/forget, permissions
page, privacy page, settings, in-app updates, feedback, app sharing (also straight to the connected phone), site.

## Not done / limitations
- **Nothing radio-related has run on a real phone yet** (no devices in the build environment). Expect device-specific
  fixes in Wi-Fi Direct (OEM quirks), the legacy Wi-Fi join on Android 6–9, and codec setup on some chips. See TESTING_GUIDE.md.
- 6-digit PIN mode: a powerful active attacker inside the Wi-Fi group could brute-force the PIN offline from one failed
  exchange (no PAKE). Mitigations: 10-minute expiry, one-time use, explicit approval with the device name. QR mode uses a
  128-bit token and is not affected. A SPAKE2 handshake would remove this.
- Bluetooth is not used at all (the brief allowed it only as optional discovery help).
- One peer at a time (a phone or a computer); no group/multi-device sharing.
- Computer page: needs a browser with WebCodecs for the screen (Chrome/Edge 94+, Firefox 130+, Safari 16.4+ for viewing); files and messages work everywhere. Phone sound to the computer needs Android 10+.
- A/V sync is "near" (both played immediately, stale audio dropped); no lip-sync buffer.
- Transfer resume works while both apps stay alive; if a process is killed the transfer restarts.
- English UI not included (the owner's apps are Hebrew-only).
- No Room/DataStore: small JSON files and SharedPreferences (History, Ids) are enough here.

## Android restrictions to remember
- API 33+: `NEARBY_WIFI_DEVICES` (neverForLocation). API 23–32: fine location permission **and** location switched on for
  Wi-Fi Direct discovery. Wi-Fi must be on.
- API 29+: apps can't add Wi-Fi networks silently → P2P join with `WifiP2pConfig.Builder`, fallback `WifiNetworkSpecifier`
  (system dialog; sockets must be bound to that Network). API ≤28: `WifiManager.addNetwork` (removed on disconnect).
- API 34: start the foreground service with type `mediaProjection` **before** `getMediaProjection`, register the
  projection callback before `createVirtualDisplay`, one VirtualDisplay per token (rotation uses `resize` + `setSurface`).
- Audio capture: API 29+ only, needs RECORD_AUDIO, and apps that opt out stay silent (Android's rule; not bypassed).
- Storage: API 29+ MediaStore with IS_PENDING (no permission); API ≤28 WRITE_EXTERNAL_STORAGE + legacy storage.
- Received APKs are never installed; opening one shows the Downloads app.

## How to work on it
Read `CLAUDE.md` (house rules: small files, update `site/parts/` with every UI change, `release-notes.txt`).
Build: `BUILD_INSTRUCTIONS.md`. Tests: `TESTING_GUIDE.md`.

## Recommended next tasks
1. Run the TESTING_GUIDE checklist on 2–3 real phones (old + new); fix what breaks (likely Wi-Fi Direct/OEM and codecs).
2. Add a SPAKE2 (PAKE) handshake for PIN mode.
3. Send a whole folder (SAF tree) as one transfer; receive into a sub-folder.
4. Optional tight A/V sync (small jitter buffer with render timestamps).
5. Bluetooth-assisted discovery for phones where Wi-Fi Direct service discovery is unreliable.
6. Instrumentation tests on a device farm for `WifiDirect`/`VideoEncoder` (they need hardware).
