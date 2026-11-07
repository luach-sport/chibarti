# חיברתי – הוראות לעבודה על הפרויקט

## כלל ראשון: הרבה קבצים קטנים
כמו בכל הפרויקטים של המפתח: כל יכולת בקובץ קטן משלה, לא קובץ אחד ענק. כשמוסיפים מסך או יכולת, יוצרים קובץ חדש בתיקייה המתאימה ומוסיפים אותו ל-`www/index.html` (הסדר שם קובע).

## מה זה
שני טלפוני אנדרואיד מתחברים ישירות (Wi-Fi Direct, ובלעדיו נקודה חמה מקומית או Wi-Fi משותף), בלי אינטרנט ובלי שרת: שיקוף מסך עם קול, קבצים בכל גודל, תמונות וסרטונים, הודעות. מוצפן, ורק באישור. גם מחשב מתחבר, מהדפדפן ובלי התקנה ("חיבור למחשב"). אנדרואיד 6 (API 23) ומעלה. אין גרסה לאייפון (אפל לא מאפשרת רשת ישירה ושידור מסך; כך כתוב גם באתר). הסבר טכני מלא: `CLAUDE_HANDOFF.md`.

## איך זה בנוי
- `www/js/` – הכל תחת `window.CB`:
  - `core/` – הגדרות, עזרים (גדלים, זמנים, `CB.pre` לתחילית עברית לפני שם לועזי), אייקונים ולוגו, גשר ל-Capacitor, רשת, שמירה, שיתוף.
  - `data/` – ההגדרות של האפליקציה עצמה (מראה, איכות, קול) ופניות.
  - `link/` – הגשר לחלק של אנדרואיד (`bridge.js`: `CB.N.call` / `CB.N.on`, ותחליף בדפדפן `CB.sim` לצילומים ולבדיקות), `live.js` (המצב מאנדרואיד `CB.live`, ובקשות שנפתחות לבד), הרשאות, ציור QR וסורק המצלמה.
  - `ui/render.js` – `CB.render()` מצייר מסך; `CB.refresh()` מצייר מחדש רק כשהמבנה השתנה (`view.sig()`), אחרת מעדכן מספרים במקום (`view.live()`), כדי שלא יהיו קפיצות.
  - `views/` (בית, חיבור/סריקה/בסביבה, מסך, קבצים, הודעות, הגדרות), `sheets/` (אישורים, קוד, הרשאות חסרות ועוד), `features/`, `actions/` (כל כפתור הוא `data-action="שם"` והפעולה היא `CB.A['שם']`), `app/`.
  - `vendor/` – qrcode-generator (MIT) ו-jsQR (Apache-2.0), מוקטנים.
- `android-native/` – Java, מועתק לפרויקט האנדרואיד ב-`scripts/patch-android.sh`. הקבצים "הטהורים" (בלי אנדרואיד) נבדקים על מחשב: `Crypto`, `SecureLink`, `Handshake`, `Proto`, `Pairing`, `QrPayload`, `OutgoingJob`, `IncomingJob`, `RateControl`, `Tls`, `WsLink`, `WebServer`.
- **חיבור למחשב**: כשהטלפון מציע חיבור הוא גם שרת אינטרנט קטן (`WebServer`): פורט 8080 מסביר את אזהרת הדפדפן ומעביר ל-8443 (HTTPS עם תעודה שהטלפון יוצר לעצמו, `Tls`), שמגיש את `www/pc/` (מהקבצים העדכניים, גם אחרי עדכון פנימי) ו-WebSocket ב-`/ws` (`WsLink`, אותו ממשק `Link` כמו בין טלפונים). `Connect.pcAccepted`: קוד 6 ספרות או מחשב מוכר, ואישור בטלפון. אותן הודעות של `Proto` בדיוק; בכיוון מחשב→טלפון הקול ב-Opus (`AUDIO_OPUS_CONFIG`). בצד המחשב הכל תחת `window.PC` בקבצים קטנים ב-`www/pc/js/`, בלי `prepare-web` (דפדפן מחשב חדש).
- שינוי ב-`android-native/`, `android-res/`, `scripts/patch-android.sh`, `capacitor.config.json` או בתוספים ב-`package.json` מחייב APK חדש. האפליקציה מזהה את זה לבד (`nativeKey` ב-`scripts/make-update.mjs`) ומציעה להוריד APK במקום עדכון פנימי.
- `scripts/prepare-web.mjs` בבנייה ב-CI ממיר את ה-JavaScript לגרסה שרצה גם ב-WebView ישן (Chrome 61). `www/css/compat.css` נותן רווחים בטלפונים שלא מכירים `gap` ב-flex. בקוד עצמו לא משתמשים ב-`?.`, `??` ו-`catch {}` בלי משתנה.

## בדיקות
- `bash tests/java/run.sh` – 22 בדיקות של הפרוטוקול והשרת למחשב (מוריד org.json מ-GitHub בפעם הראשונה).
- `node tests/pc.test.mjs` – הדף של המחשב מול טלפון מדומה (`tests/java/FakePhone.java`) עם `WebServer`/`Tls`/`WsLink` האמיתיים: קוד, הודעות, קבצים בשני הכיוונים, מסך בשני הכיוונים (נבדק ב-ffmpeg), ניתוק וחזרה, מחשב מוכר. צריך java, ffmpeg ו-Playwright.
- `python3 -m http.server 8765 --directory www` ואז `node tests/app.test.mjs` – בדיקות המסכים (Playwright, טלפון ברוחב 320).
- קומפילציה של ה-Java בלי Android SDK: `javac` מול `android.jar` (API 34) עם תחליפים קטנים למחלקות של Capacitor. הבנייה האמיתית ב-GitHub Actions, ושגיאות קומפילציה מופיעות שם כהערות על הריצה.
- מה שאפשר לבדוק רק בשני טלפונים אמיתיים: `TESTING_GUIDE.md`.

## אתר ההסבר
- https://luach-sport.github.io/chibarti/ (`.github/workflows/site.yml`, לענף `gh-pages`), בנוי מהערכה המשותפת `luach-sport/itzko` (`kit/`). האפליקציה רשומה ב-`apps.json` שם.
- כאן: `site/site.json`, `site/parts/` (פרק לכל מסך), `site/css/brand.css`.
- **בכל שינוי באפליקציה שמוסיף, משנה או מוריד מסך, כפתור או יכולת, מעדכנים באותו commit גם את הפרק המתאים ב-`site/parts/`.**
- צילומי המסך נוצרים לבד (`scripts/site/scenes.mjs`, עם `CB.sim`). לא מעלים צילומים ידנית.
- לבנות מקומית: `node <itzko>/kit/lib/build.mjs` מתוך תיקיית הריפו (התוצאה ב-`_site/`).

## חשוב לדעת
- **מה חדש**: לפני כל גרסה כותבים את השינויים ב-`release-notes.txt` (שורה לכל שינוי, בשפה פשוטה).
- מספר גרסה: `APP_VERSION` ב-`.github/workflows/build.yml` (וברירות המחדל ב-`scripts/prepare-web.mjs`, `scripts/make-update.mjs`, `www/js/core/config.js`).
- חתימה: `signing/release.jks`, הסיסמה רק ב-GitHub Secrets בשם `CHIBARTI_KEY_PASS`.
- פניות נשלחות לסקריפט Google Apps Script של המפתח (אותו של MyCar, שמרתי וקמתי), עם `app: 'chibarti'`. כדי שבנושא המייל יהיה כתוב "חיברתי", מוסיפים בסקריפט ב-`Settings.gs`: `chibarti: 'חיברתי'` לרשימת `APPS`.
- קרדיט: "פותח על ידי Itzko" בתחתית מסך ההגדרות. לא מורידים.
