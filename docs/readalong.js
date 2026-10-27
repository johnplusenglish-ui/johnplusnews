/* johnplusnews: read along with the recording.

   The word being spoken is tinted as the audio plays. Nothing in the article is rewrapped to do
   it: the words are addressed as Ranges and painted with the CSS Custom Highlight API, so the
   saved-word highlighter, which stores character offsets into the prose, is untouched. Browsers
   without that API simply get the player as before. */
(function () {
  "use strict";

  if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;

  var rows = [].slice.call(document.querySelectorAll(".listen[data-words]"));
  if (!rows.length) return;

  var WORD = /[^\s]+/g;

  /* Character offsets inside one element, counted the way textContent counts them. */
  function wordsIn(el) {
    var text = el.textContent, out = [], m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(text))) out.push({ el: el, a: m.index, b: m.index + m[0].length });
    return out;
  }

  /* Turn a character span inside an element into a Range across its text nodes. */
  function rangeFor(el, a, b) {
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), seen = 0, r = document.createRange(), node;
    var started = false;
    while ((node = walk.nextNode())) {
      var len = node.nodeValue.length;
      if (!started && seen + len > a) { r.setStart(node, a - seen); started = true; }
      if (started && seen + len >= b) { r.setEnd(node, b - seen); return r; }
      seen += len;
    }
    return started ? r : null;
  }

  function panelFor(row) {
    /* The level this recording belongs to, so a three-level article highlights the right text. */
    var id = row.id && row.id.indexOf("l-") === 0 ? "v-" + row.id.slice(2) : null;
    return (id && document.getElementById(id)) || document;
  }

  rows.forEach(function (row) {
    var audio = row.querySelector("audio");
    if (!audio) return;

    fetch(row.getAttribute("data-words"), { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.w || !data.w.length) return;

        var scope = panelFor(row);
        var head = document.querySelector(".article-head h1");
        var dek = document.querySelector(".article-head .dek");
        var paras = [].slice.call(scope.querySelectorAll(".prose p"));
        var els = [];
        if (head) els.push(head);
        if (dek) els.push(dek);
        els = els.concat(paras);

        var words = [];
        els.forEach(function (el) { words = words.concat(wordsIn(el)); });
        if (words.length !== data.w.length) {
          /* The text and the recording have drifted apart, so say nothing rather than mislead. */
          if (window.console) console.warn("read-along off: " + words.length + " words on the page, " + data.w.length + " timed");
          return;
        }

        var times = data.w;
        var hl = new Highlight();
        CSS.highlights.set("readalong", hl);
        var shown = -1;
        var userScrolledAt = 0;
        addEventListener("scroll", function () { userScrolledAt = Date.now(); }, { passive: true });

        function find(t) {
          var lo = 0, hi = times.length - 1, best = -1;
          while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (times[mid].s <= t) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
          }
          if (best >= 0 && t > times[best].e + 0.6) return -1;   /* a long gap: hold nothing */
          return best;
        }

        function paint() {
          var i = find(audio.currentTime);
          if (i === shown) return;
          shown = i;
          hl.clear();
          if (i < 0) return;
          var w = words[i];
          var r = rangeFor(w.el, w.a, w.b);
          if (!r) return;
          hl.add(r);
          if (audio.paused) return;
          if (Date.now() - userScrolledAt < 4000) return;        /* the reader is in charge */
          var box = r.getBoundingClientRect();
          var top = window.innerHeight * 0.25, bottom = window.innerHeight * 0.72;
          if (box.top < top || box.bottom > bottom) {
            window.scrollBy({ top: box.top - window.innerHeight * 0.4, behavior: "smooth" });
            userScrolledAt = 0;
          }
        }

        audio.addEventListener("timeupdate", paint);
        audio.addEventListener("seeked", paint);
        audio.addEventListener("ended", function () { shown = -1; hl.clear(); });
        row.classList.add("ra-on");
      })
      .catch(function () {});
  });
})();
