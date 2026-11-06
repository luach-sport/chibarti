/* Text tab: messages between the two phones (a link, an address, a code), copy with one tap. The clipboard is
   read only when "paste" is pressed, never in the background. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;
  const ui = CB.ui;

  const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="#" dir="ltr" data-action="open-url" data-url="$1">$1</a>');

  function bubble(m) {
    return '<div class="msg ' + (m.mine ? 'mine' : 'theirs') + '"><div class="bubble" dir="auto">' + linkify(m.text) + '</div>' +
      '<div class="info"><span>' + CB.time(m.ts) + (m.mine ? '' : ' · ' + esc(m.peer || '')) + '</span>' +
      '<button type="button" class="copy" data-action="text-copy" data-id="' + esc(m.id) + '">' + icon('copy', 'xs') + 'העתקה</button></div></div>';
  }

  V.text = {
    html: () => {
      const list = ui.texts || [];
      let h = '<header class="top"><h1 class="h1">הודעות</h1>' + (list.length ? '<button type="button" class="text-btn" data-action="texts-clear">ניקוי</button>' : '') + '</header>';
      if (!CB.connected()) h += '<button type="button" class="banner" data-action="go-home"><span class="ic">' + icon('link') + '</span><span class="txt"><span class="t">עדיין לא מחוברים</span><span class="s">אחרי החיבור אפשר לשלוח טקסט, קישור או קוד ישר לטלפון השני</span></span><span class="go">לחיבור</span></button>';
      if (!list.length) return h + '<div class="empty">' + CB.emptyArt() + '<h2>אין הודעות</h2><p>שולחים כתובת, קישור, מספר או סיסמה לרשת, והם מופיעים בטלפון השני מוכנים להעתקה.</p></div>';
      return h + '<div class="thread" id="thread">' + list.map(bubble).join('') + '</div>';
    },
    after: () => {
      if (!ui.texts) CB.loadTexts();
      if (CB.state.readTexts !== (CB.L().textCount || 0)) { CB.state.readTexts = CB.L().textCount || 0; CB.save(); }
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 0);
    },
    sig: () => [CB.connected(), (ui.texts || []).length].join('|'),
    restoreDraft: () => { const t = document.getElementById('composer'); if (t) { t.value = ui.draft || ''; grow(t); } }
  };

  function grow(t) { t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight + 2) + 'px'; }
  CB.growComposer = grow;

  V.composer = () => '<div class="composer"><button type="button" class="icon-btn paste" data-action="text-paste" aria-label="הדבקה מהלוח">' + icon('paste') + '</button>' +
    '<textarea id="composer" rows="1" placeholder="' + (CB.connected() ? esc(CB.pre('הודעה ל', CB.peerName())) : 'מתחברים כדי לשלוח') + '" aria-label="הודעה" data-draft="1"></textarea>' +
    '<button type="button" class="icon-btn send" data-action="text-send" aria-label="שליחה">' + icon('send') + '</button></div>';

  CB.loadTexts = async () => {
    try { const r = await CB.N.call('texts'); ui.texts = (r && r.items) || []; } catch (e) { ui.texts = []; }
    if (ui.tab === 'text' && !CB.view()) CB.render(true);
  };

  // A new message: added at the bottom without redrawing the rest (the typing bar keeps its text and focus).
  CB.onText = (m) => {
    if (!ui.texts) ui.texts = [];
    if (ui.texts.some((x) => x.id === m.id && x.mine === m.mine)) return;
    ui.texts.push(m);
    if (ui.tab === 'text' && !CB.view()) {
      const th = document.getElementById('thread');
      if (th) { th.insertAdjacentHTML('beforeend', bubble(m)); window.scrollTo(0, document.body.scrollHeight); CB.state.readTexts = (CB.L().textCount || 0) + 1; }
      else CB.render(true);
    } else if (!m.mine) CB.toast(CB.pre('הודעה מ', m.peer || CB.peerName()) + ': ' + CB.clip(m.text, 40));
    CB.tabBadges();
  };
})();
