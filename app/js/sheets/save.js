/* Where received files are saved: by kind (the default), everything in Download/Chibarti, or a folder the user picks. */
(function () {
  'use strict';
  const CB = window.CB;
  const { icon } = CB;
  const ui = CB.ui;

  /** One line for the screens that say where files go (settings, received files, the approval of new files). */
  CB.saveWhereText = (e, short) => {
    e = e || {};
    if (e.saveMode === 'folder' && e.folder) return 'בתיקייה שבחרת: ' + (e.folderName || 'תיקייה');
    if (e.saveMode === 'downloads') return short ? 'בתיקיית ההורדות, Download/Chibarti' : 'הכל בתיקיית ההורדות: Download/Chibarti';
    return short ? 'לפי סוג, בתיקיות Chibarti' : 'לפי סוג: תמונות ב-Pictures, סרטונים ב-Movies, מוזיקה ב-Music והשאר ב-Download, בתוך תיקיית Chibarti';
  };

  CB.SHEETS.saveWhere = {
    title: () => 'איפה לשמור קבצים שמתקבלים',
    render: () => {
      const e = ui.env || {}, m = e.saveMode || 'auto';
      let h = '<div class="card list">' +
        CB.pickRow('save-mode', 'auto', 'אוטומטית לפי סוג', m === 'auto', 'תמונות ב-Pictures/Chibarti, סרטונים ב-Movies/Chibarti, מוזיקה ב-Music/Chibarti, וכל השאר ב-Download/Chibarti') +
        CB.pickRow('save-mode', 'downloads', 'הכל בתיקיית ההורדות', m === 'downloads', 'כל הקבצים יחד ב-Download/Chibarti') +
        CB.pickRow('save-mode', 'folder', 'תיקייה שאני בוחר', m === 'folder', e.folder ? (e.folderName || 'תיקייה') : 'בזיכרון הטלפון או בכרטיס הזיכרון') + '</div>';
      if (e.folder) h += '<button type="button" class="btn secondary" data-action="pick-folder">' + icon('folder') + 'בחירת תיקייה אחרת</button>';
      return h + '<p class="fine">קבצים שכבר התקבלו נשארים איפה שנשמרו. קבצי התקנה (APK) רק נשמרים, לא נפתחים לבד.</p>';
    },
    // opened from the approval of new files: back to it after choosing
    onClose: () => {
      const back = ui.saveBack;
      ui.saveBack = null;
      if (back && (CB.L().offers || []).some((o) => o.tid === back)) setTimeout(() => { if (!ui.sheet) CB.openSheet('offer', { tid: back }); }, 0);
    }
  };
})();
