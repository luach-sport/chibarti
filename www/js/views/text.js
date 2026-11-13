/* Text tab: messages between the two phones (a link, an address, a code), copy with one tap. The clipboard is
   read only when "paste" is pressed, never in the background. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;
  const V = CB.views;
  const ui = CB.ui;

  const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="#" dir="ltr" data-action="open-url" data-url="$1">$1</a>');

  // A quoted message inside a bubble: who wrote it and its start; a tap jumps to it.
  CB.quoteName = (r) => (r.from && r.from === (CB.L().me || {}).id ? 'אני' : r.name || CB.peerName() || '');
  const quote = (r) => r && r.id ? '<button type="button" class="quote" data-action="quote-jump" data-id="' + esc(r.id) + '"><b>' + esc(CB.quoteName(r)) + '</b><span dir="auto">' + esc(CB.clip(r.text || '', 90)) + '</span></button>' : '';

  function bubble(m) {
    return '<div class="msg ' + (m.mine ? 'mine' : 'theirs') + '" data-id="' + esc(m.id) + '" data-mine="' + (m.mine ? 1 : 0) + '">' +
      '<div class="bubble" dir="auto">' + quote(m.reply) + linkify(m.text) + '</div>' +
      '<div class="info"><span>' + CB.time(m.ts) + (m.mine ? '' : ' · ' + esc(m.peer || '')) + '</span>' +
      '<button type="button" class="copy" data-action="text-reply" data-id="' + esc(m.id) + '">' + icon('reply', 'xs') + 'תגובה</button>' +
      '<button type="button" class="copy" data-action="text-copy" data-id="' + esc(m.id) + '">' + icon('copy', 'xs') + 'העתקה</button></div>' +
      '<span class="swipe-hint" aria-hidden="true">' + icon('reply', 'sm') + '</span></div>';
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
    // new messages are added in place (CB.onText): only empty ↔ not empty redraws, so the typing bar keeps its focus
    sig: () => [CB.connected(), !!ui.texts, !(ui.texts || []).length].join('|'),
    restoreDraft: () => { const t = document.getElementById('composer'); if (t) { t.value = ui.draft || ''; grow(t); } CB.replyBar(); }
  };

  function grow(t) { t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight + 2) + 'px'; }
  CB.growComposer = grow;

  const placeholder = () => (!CB.connected() ? 'מתחברים כדי לשלוח' : CB.inRoom() ? 'הודעה לכל ' + CB.roomCount() + ' המכשירים בחדר' : CB.pre('הודעה ל', CB.peerName()));
  V.composer = () => '<div id="reply-bar"></div><div class="composer"><button type="button" class="icon-btn paste" data-action="text-paste" aria-label="הדבקה מהלוח">' + icon('paste') + '</button>' +
    '<textarea id="composer" rows="1" placeholder="' + esc(placeholder()) + '" aria-label="הודעה" data-draft="1"></textarea>' +
    '<button type="button" class="icon-btn send" data-action="text-send" aria-label="שליחה">' + icon('send') + '</button></div>';
  /** The typing bar stays (with its focus and keyboard) when the screen is drawn again; only its hint changes. */
  V.composerUpdate = () => { const t = document.getElementById('composer'); if (t) t.placeholder = placeholder(); CB.replyBar(); };

  // "Answering …" above the typing bar, with ✕ to cancel.
  CB.replyBar = () => {
    const el = document.getElementById('reply-bar');
    if (!el) return;
    const r = ui.reply;
    el.innerHTML = r ? '<div class="reply-bar"><span class="ic">' + icon('reply', 'sm') + '</span><span class="grow"><b>' + esc(r.from === (CB.L().me || {}).id ? 'בתגובה להודעה שלי' : CB.pre('בתגובה ל', r.name || '')) + '</b><span dir="auto">' + esc(CB.clip(r.text, 80)) + '</span></span>' +
      '<button type="button" class="icon-btn" data-action="reply-cancel" aria-label="ביטול התגובה">' + icon('close', 'sm') + '</button></div>' : '';
  };

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
