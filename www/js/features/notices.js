/* Short messages for what happened (from Android), and plain-language explanations of every connection problem. */
(function () {
  'use strict';
  const CB = window.CB;

  const JOIN = {
    'qr-not-ours': 'זה לא קוד של חיברתי',
    'qr-expired': 'הקוד כבר לא בתוקף. בטלפון השני יש כבר קוד חדש, סורקים שוב',
    expired: 'הקוד כבר לא בתוקף. בטלפון השני יש כבר קוד חדש, סורקים שוב',
    'qr-self': 'זה הקוד של הטלפון הזה עצמו. סורקים את הקוד שעל הטלפון השני',
    busy: 'הטלפון השני כבר מחובר למכשיר אחר',
    declined: 'הטלפון השני לא אישר את החיבור',
    timeout: 'לא התקבל אישור בזמן. נסו שוב, ובטלפון השני לוחצים "אישור"',
    unreachable: 'לא הצלחתי להגיע לטלפון השני. קרבו את הטלפונים ונסו שוב',
    'lan-unreachable': 'שני הטלפונים צריכים להיות על אותה רשת Wi-Fi (גם בלי אינטרנט)',
    'p2p-failed': 'החיבור הישיר (Wi-Fi Direct) לא הצליח. קרבו את הטלפונים ונסו שוב, או סרקו את הקוד',
    'wifi-declined': 'לא אושר החיבור לרשת של הטלפון השני',
    'wrong-code': 'הקוד שגוי. בדקו את 6 הספרות שעל הטלפון השני',
    'need-pin': 'צריך את הקוד שמופיע בטלפון השני',
    unknown: 'הטלפון השני לא מכיר את הטלפון הזה. מתחברים עם קוד',
    version: 'יש לעדכן את חיברתי באחד הטלפונים',
    gone: 'הטלפון כבר לא נמצא ברשימה. מחפשים שוב',
    full: 'החדר בטלפון השני מלא (עד 7 מכשירים)',
    permission: 'חסר אישור של אנדרואיד לחיבור ישיר. פותחים "חיבור והרשאות" בהגדרות'
  };

  CB.joinError = (code) => {
    code = String(code || '');
    if (!code || code === 'cancelled') return '';
    if (JOIN[code]) return JOIN[code];
    if (code.indexOf('qr-') === 0) return 'הקוד לא נקרא כמו שצריך. נסו לסרוק שוב';
    return 'החיבור לא הצליח. נסו שוב';
  };

  CB.hostError = (code) => {
    code = String(code || '');
    if (!code) return '';
    if (code.indexOf('lan-only') === 0) return 'Wi-Fi Direct לא זמין כאן, אז החיבור עובר דרך ה-Wi-Fi שהטלפון מחובר אליו (גם בלי אינטרנט). הטלפון השני צריך להיות על אותה רשת.';
    if (code.indexOf('no-network') === 0) return 'לא הצלחתי ליצור רשת: Wi-Fi Direct לא עבד וגם אין Wi-Fi. מדליקים Wi-Fi ומנסים שוב.';
    if (code === 'wifi-off') return 'ה-Wi-Fi כבוי. מדליקים אותו כדי שהטלפון השני יוכל להתחבר.';
    return 'לא הצלחתי להכין את החיבור. נסו שוב.';
  };

  const NOTE = {
    connected: (d) => CB.pre('מחובר ל', d),
    reconnecting: () => 'החיבור נקטע לרגע, מתחבר שוב…',
    resumed: () => 'החיבור חזר',
    disconnected: () => 'החיבור נותק',
    'peer-left': (d) => d + ' ניתק את החיבור',
    lost: (d) => 'החיבור עם ' + d + ' אבד. מתחברים שוב מהמסך הראשי',
    'pin-renewed': () => 'אחרי כמה ניסיונות שגויים הוחלף הקוד',
    received: (d) => (d === '1' ? 'הקובץ התקבל ונבדק' : d + ' הקבצים התקבלו ונבדקו'),
    sent: (d) => (d === '1' ? 'הקובץ נשלח ונבדק' : d + ' הקבצים נשלחו ונבדקו'),
    'no-space': () => 'אין מספיק מקום בטלפון לקבצים האלה',
    'mirror-declined': () => 'השיתוף לא אושר בטלפון השני',
    'mirror-ended': () => 'שיתוף המסך הסתיים',
    'control-on': (n) => CB.pre('', n || 'המכשיר השני') + ' שולט עכשיו בטלפון',
    'control-off': () => 'השליטה מרחוק הסתיימה',
    'mirror-stopped': () => 'הטלפון השני הפסיק לצפות',
    'capture-failed': () => 'אנדרואיד לא אישר צילום של המסך',
    'host-failed': (d) => CB.hostError(d),
    'member-removed': (d) => (d || 'המכשיר') + ' הוצא מהחדר',
    removed: (d) => 'הוצאת מהחדר של ' + (d || 'הטלפון השני'),
    'room-full': () => 'החדר מלא: עד 7 מכשירים',
    'known-not-found': (d) => (d || 'המכשיר') + ' לא נמצא. בטלפון השני לוחצים "התחלת חיבור" ומנסים שוב'
  };

  CB.onNotice = (code, detail) => {
    if (code === 'join-failed') {
      const m = CB.joinError(detail);
      if (m) { CB.toast(m, 4200); CB.haptic(true); }
      return;
    }
    const f = NOTE[code];
    if (f) CB.toast(f(detail || ''), code === 'lost' || code === 'host-failed' || code === 'known-not-found' ? 4200 : 2600);
    if (code === 'received' || code === 'sent') { CB.ui.history = null; CB.haptic(true); }
  };
})();
