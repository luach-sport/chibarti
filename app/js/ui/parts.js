/* Small building blocks used on many screens: list rows, switches, progress bars, file tiles. */
(function () {
  'use strict';
  const CB = window.CB;
  const { esc, icon } = CB;

  CB.navRow = (action, ic, label, sub, value, extra) => '<button type="button" class="row" data-action="' + action + '"' + (extra || '') + '>' +
    (ic ? '<span class="lead' + (ic === 'alert' ? ' warn' : '') + '">' + icon(ic) + '</span>' : '') +
    '<span class="grow"><span class="t">' + esc(label) + '</span>' + (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</span>' +
    (value ? '<span class="v">' + esc(value) + '</span>' : '') + '<span class="chev">' + icon('chevL', 'sm') + '</span></button>';

  CB.toggleRow = (action, label, sub, on, extra) => '<button type="button" class="toggle-row" role="switch" aria-checked="' + !!on + '" data-action="' + action + '"' + (extra || '') + '>' +
    '<span class="grow"><span class="t">' + esc(label) + '</span>' + (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</span><span class="switch" aria-hidden="true"></span></button>';

  CB.bar = (id, pct, cls) => '<div class="bar' + (cls ? ' ' + cls : '') + '"><span id="' + id + '" style="width:' + pct + '%"></span></div>';

  CB.tile = (mime, name, cls) => '<span class="tile' + (cls ? ' ' + cls : '') + '">' + CB.fileIcon(mime, name) + '</span>';

  CB.emptyArt = () => '<svg class="art" viewBox="0 0 168 104" aria-hidden="true">' +
    '<rect x="16" y="14" width="44" height="78" rx="11" fill="currentColor" opacity=".16"/><rect x="108" y="14" width="44" height="78" rx="11" fill="currentColor" opacity=".16"/>' +
    '<rect x="22" y="22" width="32" height="56" rx="5" fill="currentColor" opacity=".22"/><rect x="114" y="22" width="32" height="56" rx="5" fill="currentColor" opacity=".22"/>' +
    '<path d="M72 46q12-12 24 0M77 54q7-7 14 0" stroke="#FFD27A" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="84" cy="62" r="3.5" fill="#FFD27A"/></svg>';

  CB.needConnection = (what) => '<div class="empty">' + CB.emptyArt() + '<h2>קודם מתחברים</h2><p>' + esc(what) + '</p>' +
    '<button type="button" class="btn" data-action="go-home">' + icon('link') + 'למסך החיבור</button></div>';
})();
