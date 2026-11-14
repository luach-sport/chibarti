/* "Copy the download link" button in the hero. Falls back to a selected text box where copying isn't allowed. */
(function () {
  var btn = document.getElementById('copy-link');
  var label = document.getElementById('copy-label');
  var input = document.getElementById('apk-url');
  if (!btn || !label || !input) return;
  var url = input.value;
  var idle = label.textContent;
  function done(text) {
    label.textContent = text;
    setTimeout(function () { label.textContent = idle; }, 2200);
  }
  function fallback() {
    input.hidden = false;
    input.focus();
    input.select();
    done('סמנו והעתיקו את הקישור');
  }
  btn.addEventListener('click', function () {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { done('הקישור הועתק'); }, fallback);
      } else {
        fallback();
      }
    } catch (e) {
      fallback();
    }
  });
})();
