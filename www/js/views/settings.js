/* Settings: this phone's name, look, screen sharing defaults, where files are saved, known phones, connection
   and permissions, privacy, feedback, updates, sharing the app and the credit. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;

  V.settings = {
    html: () => {
      const st = CB.state.settings, env = CB.ui.env || {}, me = CB.L().me || {};
      const themes = [{ v: 'light', l: 'בהיר' }, { v: 'dark', l: 'כהה' }, { v: 'system', l: 'לפי הטלפון' }];
      const q = CB.QUALITIES.filter((x) => x.v === st.quality)[0] || CB.QUALITIES[1];
      const miss = CB.missingFor(env).length;
      const devices = (CB.L().devices || []).length;
      let h = '<header class="top"><h1 class="h1">הגדרות</h1></header>';
      h += '<span class="section-label">הטלפון הזה</span><div class="card list">' +
        CB.navRow('open-sheet', 'phone', 'השם שהטלפון השני רואה', me.name || '', '', ' data-sheet="rename"') +
        CB.navRow('open-devices', 'phones', 'מכשירים מוכרים', devices ? devices + ' מכשירים · מתחברים בלי קוד' : 'עוד אין. אחרי חיבור ראשון הם נשמרים כאן') + '</div>';
      h += '<span class="section-label">מראה</span><div class="seg" role="group" aria-label="מראה">' + themes.map((t) => '<button type="button" data-action="set-theme" data-v="' + t.v + '" aria-pressed="' + (st.theme === t.v) + '">' + t.l + '</button>').join('') + '</div>';
      h += '<span class="section-label">שיקוף מסך</span><div class="card list">' +
        CB.navRow('tab', 'gauge', 'איכות', q.label + ' · ' + q.sub, '', ' data-tab="cast"') + '</div>' +
        '<div class="card" style="padding:0 14px">' + CB.toggleRow('toggle-audio', 'גם הקול', env.audioCapture === false ? 'אפשרי מאנדרואיד 10' : 'כשמשתפים מסך', env.audioCapture !== false && st.audio) +
        CB.toggleRow('toggle-auto', 'איכות אוטומטית', 'לפי החיבור בפועל', st.auto) + CB.toggleRow('toggle-haptics', 'רטט קל בלחיצות ובבקשות', '', st.haptics) + '</div>';
      h += '<span class="section-label">קבצים שמתקבלים</span><div class="card list">' +
        CB.navRow('pick-folder', 'folder', 'איפה לשמור', env.folder ? 'בתיקייה: ' + (env.folderName || '') : 'אוטומטית לפי סוג: תמונות, סרטונים, מוזיקה והורדות') +
        (env.folder ? CB.navRow('reset-folder', 'refresh', 'חזרה לשמירה האוטומטית', '') : '') + '</div>';
      h += '<span class="section-label">חיבור</span><div class="card list">' +
        CB.navRow('open-setup', miss ? 'alert' : 'shield', 'חיבור והרשאות', miss ? 'חסר משהו כדי להתחבר. לחיצה לתיקון' : 'הכל מוכן') +
        CB.navRow('open-sheet', 'lock', 'פרטיות ואבטחה', 'מוצפן, ישיר, בלי אינטרנט ובלי שרת', '', ' data-sheet="privacy"') +
        CB.navRow('open-settings', 'battery', 'חיסכון בסוללה', env.batteryFree ? 'לא מגביל את חיברתי' : 'מומלץ: לא להגביל, כדי שהחיבור לא ייקטע ברקע', '', ' data-what="battery"') + '</div>';
      h += '<span class="section-label">כללי</span><div class="card list">' +
        CB.navRow('open-sheet', 'message', 'פנייה / הצעת ייעול', 'מה להוסיף? מה לשפר? הפנייה מגיעה ישירות למפתח', '', ' data-sheet="feedback"') +
        V.updateRow() +
        CB.navRow('open-sheet', 'share', 'שיתוף האפליקציה', 'קישור לאתר, או הקובץ עצמו בבלוטות\' ובוואטסאפ', '', ' data-sheet="shareApp"') +
        CB.navRow('open-url', 'book', 'אתר ההסבר', 'כל המסכים והכפתורים, עם צילומים', '', ' data-url="' + esc(CB.SITE_URL) + '"') + '</div>';
      h += '<p class="fine dev-line">' + icon('phone', 'xs') + 'במכשיר הזה: אנדרואיד ' + esc(env.release || '') + (env.p2p === false ? ' · בלי Wi-Fi Direct' : ' · Wi-Fi Direct') + (env.model ? ' · ' + esc(env.model) : '') + '</p>';
      h += '<div class="credit">' + CB.logo(44) + '<span class="n">חיברתי · גרסה ' + esc(CB.VERSION.version) + (CB.VERSION.build && CB.VERSION.build !== 'dev' ? ' (בנייה ' + esc(CB.VERSION.build) + ')' : '') + '</span><span class="by">פותח על ידי <b>Itzko</b></span></div>';
      return h;
    },
    after: () => { CB.loadEnv().then(() => CB.refresh()); },
    sig: () => { const e = CB.ui.env || {}; return [JSON.stringify(e), (CB.L().devices || []).length, CB.L().me && CB.L().me.name, CB.update.state, !!CB.update.info].join('|'); }
  };

  V.updateRow = () => {
    const U = CB.update;
    if (!CB.canSelfUpdate()) return '';
    if (U.info) return CB.navRow('open-sheet', 'sparkle', 'יש גרסה חדשה: ' + U.info.version + ' (בנייה ' + U.info.build + ')', 'לחיצה לעדכון', '', ' data-sheet="update"');
    return CB.navRow('check-update', 'refresh', U.state === 'checking' ? 'בודק…' : 'בדיקת עדכונים', 'אצלך גרסה ' + CB.VERSION.version + ' (בנייה ' + CB.VERSION.build + ')');
  };

  // ---------- known phones ----------
  V.devices = {
    html: () => {
      const list = (CB.L().devices || []).slice().sort((a, b) => (b.last || 0) - (a.last || 0));
      let h = '<div class="bar-top"><button type="button" class="icon-btn" aria-label="חזרה" data-action="back">' + icon('back') + '</button><h1 class="grow">מכשירים מוכרים</h1></div>';
      h += '<p class="fine" style="font-size:14px">טלפון שאישרת פעם אחת נשמר כאן עם מפתח סודי משלו. בפעם הבאה הוא מתחבר בלי קוד, כשאחד הטלפונים לוחץ "התחלת חיבור" והשני בוחר אותו מהרשימה.</p>';
      const link = CB.L().link;
      if (!list.length) return h + '<div class="empty">' + CB.emptyArt() + '<h2>עוד אין מכשירים מוכרים</h2><p>אחרי החיבור הראשון, אם משאירים את "לזכור את המכשיר", הוא יופיע כאן.</p></div>';
      h += '<div class="card list">' + list.map((d) => {
        const now = link && link.peerId === d.id;
        return '<div class="row"><span class="tile' + (now ? ' ok' : '') + '">' + icon('phone') + '</span><span class="grow"><span class="t">' + esc(d.name || 'טלפון') + (now ? ' <span class="badge green">מחובר עכשיו</span>' : '') + '</span>' +
          '<span class="s">' + esc(d.model || '') + (d.last ? ' · חיבור אחרון: ' + esc(CB.ago(d.last)) : '') + (d.via ? ' · ' + esc(CB.viaLabel(d.via)) : '') + '</span></span>' +
          (now ? '<button type="button" class="btn small secondary" data-action="disconnect">ניתוק</button>' : '<button type="button" class="btn small secondary" data-action="forget" data-id="' + esc(d.id) + '" data-name="' + esc(d.name) + '">שכחה</button>') + '</div>';
      }).join('') + '</div>';
      return h + '<p class="fine">"שכחה" מוחקת את המפתח של המכשיר. כדי להתחבר אליו שוב צריך קוד ואישור.</p>';
    },
    sig: () => JSON.stringify(CB.L().devices || []) + (CB.L().link ? CB.L().link.peerId : '')
  };

  // ---------- connection & permissions ----------
  V.setup = {
    html: () => {
      const e = CB.ui.env || {};
      const p = e.perms || {};
      const row = (ok, ic, t, s, action, extra, optional) => '<button type="button" class="row perm-row" data-action="' + (ok ? 'noop' : action) + '"' + (extra || '') + '>' +
        '<span class="tile ' + (ok ? 'ok' : optional ? '' : 'must') + '">' + icon(ok ? 'check' : ic) + '</span><span class="grow"><span class="t">' + t + (optional ? '<span class="opt">רשות</span>' : '') + '</span><span class="s">' + s + '</span></span>' +
        (ok ? '<span class="perm-ok">מוכן</span>' : '<span class="chev">' + icon('chevL', 'sm') + '</span>') + '</button>';
      let h = '<div class="bar-top"><button type="button" class="icon-btn" aria-label="חזרה" data-action="back">' + icon('back') + '</button><h1 class="grow">חיבור והרשאות</h1></div>';
      h += '<div class="setup-hero">' + CB.logo(64) + '<p>חיברתי מחברת את הטלפונים ישירות ב-Wi-Fi, בלי אינטרנט. בשביל זה אנדרואיד מבקש כמה אישורים. כל אחד מוסבר כאן.</p></div>';
      h += '<div class="card list">';
      h += row(e.p2p !== false, 'phones', 'Wi-Fi Direct', e.p2p === false ? 'הטלפון הזה לא תומך. אפשר להתחבר כששני הטלפונים על אותו Wi-Fi (גם בלי אינטרנט)' : 'נתמך במכשיר הזה', 'noop');
      h += row(!!e.wifiOn, 'wifi', 'Wi-Fi דלוק', 'צריך Wi-Fi דלוק (לא צריך להיות מחובר לרשת)', 'enable-wifi');
      if (e.sdk >= 33) h += row(p.nearby !== false, 'radar', 'מכשירים בקרבת מקום', 'האישור של אנדרואיד לחיבור ישיר ב-Wi-Fi', 'ask-perm', ' data-k="network"');
      else h += row(p.location !== false, 'location', 'אישור מיקום', 'אנדרואיד ' + esc(e.release || '') + ' דורש אותו לכל חיבור Wi-Fi ישיר. חיברתי לא משתמשת במיקום', 'ask-perm', ' data-k="network"');
      if (e.locationNeeded) h += row(!!e.locationOn, 'location', 'מיקום דלוק', 'באנדרואיד הזה חיפוש Wi-Fi ישיר עובד רק כשהמיקום דלוק', 'open-settings', ' data-what="location"');
      if (p.notifications !== undefined) h += row(p.notifications, 'bell', 'התראות', 'כדי לראות בקשת חיבור, קבצים ושיתוף מסך גם כשהאפליקציה ברקע', 'ask-perm', ' data-k="notifications"', true);
      h += row(p.camera !== false, 'camera', 'מצלמה', 'רק לסריקת הקוד. שום תמונה לא נשמרת', 'ask-perm', ' data-k="camera"', true);
      if (e.audioCapture) h += row(!!p.audio, 'mic', 'קול בשיתוף מסך', 'אנדרואיד קורא לזה "מיקרופון". משמש רק לקול של הטלפון בזמן שיתוף מסך', 'ask-perm', ' data-k="audio"', true);
      if (p.storage !== undefined) h += row(p.storage, 'folder', 'שמירת קבצים', 'באנדרואיד ' + esc(e.release || '') + ' צריך אישור כדי לשמור בתיקיית ההורדות', 'ask-perm', ' data-k="storage"');
      h += row(!!e.batteryFree, 'battery', 'בלי הגבלת סוללה', 'מומלץ, כדי שהחיבור לא ייקטע כשהמסך כבוי', 'open-settings', ' data-what="battery"', true);
      return h + '</div><button type="button" class="btn secondary" data-action="open-settings" data-what="app">' + icon('settings') + 'הגדרות האפליקציה באנדרואיד</button>';
    },
    after: () => { CB.loadEnv().then(() => CB.refresh()); },
    sig: () => JSON.stringify(CB.ui.env || {})
  };
})();
