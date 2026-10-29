/* johnplusnews: shared word look-ups against the dictionary.

   Two places need this: My words (account.js) and the highlighter in an
   article (highlight.js). They are separate sealed scripts, so the logic lives
   here once and is published on window.JPNGloss rather than copied into both,
   where the two copies would drift apart.

   The dictionary endpoint is public and token-free, and readers here have no
   dictionary account. Costs are controlled on both sides:
     - preview() asks only what is already known. It never generates and never
       charges, so a page can fill in every definition it already has for free.
     - lookup() may generate, so it is only ever called when a reader has
       deliberately asked for one word.
     - isHeadword() mirrors the test the server runs, so running text is never
       sent for generation. If one changes, change both. */
(function () {
  "use strict";
  var API = "https://johnplusdictionary.com/news-gloss";
  var BATCH = 10;                 // the endpoint's own limit
  var known = {};                 // lower(word) -> row that HAS a definition
  var missing = {};               // lower(word) -> true, no entry yet
  var inflight = {};              // lower(word) -> Promise, so two clicks ask once

  function key(w) { return (w || "").trim().toLowerCase(); }

  /* Six words, 45 characters, no sentence punctuation and no digits. Anything
     else is running text, not something the dictionary should hold. */
  function isHeadword(s) {
    var t = (s || "").trim();
    return !!t && t.length <= 45 && t.split(/\s+/).length <= 6 && !/[.!?,;:\d]/.test(t);
  }

  /* A request that never answers must not leave "Looking it up" on screen for ever, nor hold the
     shared in-flight promise so every later tap waits on it too. Give up after 20 seconds. */
  var TIMEOUT = 20000;
  function post(words, previewOnly) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : 0;
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify(previewOnly ? { words: words, preview: true }
                                       : { words: words })
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }

  function remember(row) {
    var k = key(row && row.input);
    if (!k) return;
    if (row.gloss) { known[k] = row; delete missing[k]; }
    else if (row.source === "missing") { missing[k] = true; }
  }

  /* What we already hold, with no request at all. */
  function cached(word) { return known[key(word)] || null; }
  function isMissing(word) { return !!missing[key(word)]; }

  /* Look-only. Resolves when every batch has been asked; onRow fires per word
     so a caller can paint as answers arrive. Never generates. */
  function preview(words, onRow) {
    var want = [];
    (words || []).forEach(function (w) {
      var k = key(w);
      if (!k || !isHeadword(w) || known[k] || missing[k]) return;
      if (want.indexOf(w) < 0) want.push(w);
    });
    if (!want.length) return Promise.resolve();
    var jobs = [];
    for (var i = 0; i < want.length; i += BATCH) {
      jobs.push(post(want.slice(i, i + BATCH), true).then(function (d) {
        (d.results || []).forEach(function (row) {
          remember(row);
          if (onRow) onRow(row);
        });
      }).catch(function () { /* quiet: callers still work on demand */ }));
    }
    return Promise.all(jobs);
  }

  /* One word, generating it if the dictionary does not have it yet. Only call
     this when a reader has actually asked. */
  function lookup(word) {
    var k = key(word);
    if (known[k]) return Promise.resolve(known[k]);
    if (inflight[k]) return inflight[k];
    var p = post([word], false).then(function (d) {
      var row = (d.results || [])[0] || null;
      if (row) { row.notice = d.notice || ""; remember(row); }
      delete inflight[k];
      return row;
    }).catch(function (e) { delete inflight[k]; throw e; });
    inflight[k] = p;
    return p;
  }

  window.JPNGloss = {
    isHeadword: isHeadword,
    preview: preview,
    lookup: lookup,
    cached: cached,
    isMissing: isMissing
  };
})();
