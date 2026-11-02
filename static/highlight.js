/* johnplusnews: highlight words in an article.
   Select words, press Highlight, and they get an amber underline and are collected in a numbered
   list under the text. That list, not a floating card, is where the reading happens: the sentence
   the words came from, every sense the dictionary holds, and a box for the reader's own wording.
   Tapping a highlight shows only a one-line peek, so the text it sits over stays readable.
   Highlights are kept on this device, for each article and each level. */
(function () {
  "use strict";

  var proses = [].slice.call(document.querySelectorAll(".prose"));
  if (!proses.length || !window.getSelection || !document.createRange || !document.createTreeWalker) return;

  var slug = location.pathname.replace(/\/+$/, "").split("/").pop() || "article";
  var BLOCK = /^(P|LI|H2|H3|BLOCKQUOTE)$/;
  var EDGE = /[\s.,;:!?"'()\[\]\u2018\u2019\u201C\u201D\u2013\u2014-]/;
  var MAX = 90;
  var coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  var memory = {};
  var nextId = 1;
  var dragging = false;
  var timer = null;

  /* ------------------------------------------------------------------ storage */
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]") || []; } catch (e) { return memory[key] || []; }
  }
  function save(key, items) {
    var slim = items.map(function (it) { return { start: it.start, end: it.end, text: it.text, sentence: it.sentence || "", note: it.note || "" }; });
    try { localStorage.setItem(key, JSON.stringify(slim)); } catch (e) { memory[key] = slim; }
  }
  function markUsed() { try { localStorage.setItem("jpn_hl_used", "1"); } catch (e) {} }
  function wasUsed() { try { return localStorage.getItem("jpn_hl_used") === "1"; } catch (e) { return false; } }

  /* --------------------------------------------------------------- text offsets */
  function textNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var out = [], pos = 0, n;
    while ((n = walker.nextNode())) { out.push({ node: n, start: pos }); pos += n.nodeValue.length; }
    return out;
  }
  function offsetOf(prose, node, offset) {
    var r = document.createRange();
    r.selectNodeContents(prose);
    r.setEnd(node, offset);
    return r.toString().length;
  }
  function wrap(prose, start, end, id) {
    var nodes = textNodes(prose);
    for (var i = nodes.length - 1; i >= 0; i--) {
      var t = nodes[i];
      var s = Math.max(start, t.start), e = Math.min(end, t.start + t.node.nodeValue.length);
      if (e <= s) continue;
      var node = t.node, local = s - t.start, len = e - s;
      if (local > 0) node = node.splitText(local);
      if (len < node.nodeValue.length) node.splitText(len);
      var m = document.createElement("mark");
      m.className = "hl";
      m.setAttribute("data-hl", id);
      node.parentNode.insertBefore(m, node);
      m.appendChild(node);
    }
  }
  function unwrap(prose, id) {
    [].slice.call(prose.querySelectorAll('mark.hl[data-hl="' + id + '"]')).forEach(function (m) {
      var p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
  }
  function squash(s) { return s.replace(/\s+/g, " ").trim(); }
  function blockAt(prose, pos) {
    var nodes = textNodes(prose), hit = null;
    for (var i = 0; i < nodes.length; i++) { if (nodes[i].start <= pos && pos < nodes[i].start + nodes[i].node.nodeValue.length) { hit = nodes[i]; break; } }
    return hit ? blockOf(hit.node, prose) : null;
  }
  function sentenceFor(prose, s, e) {      /* the whole sentence the words sit in, for the My Words list */
    var b = blockAt(prose, s);
    if (!b) return "";
    var base = offsetOf(prose, b, 0), full = b.textContent, a = s - base, z = e - base;
    var from = 0, to = full.length, m, re = /[.!?]["'\u201D\u2019)]*\s+/g;
    while ((m = re.exec(full))) {
      var cut = m.index + m[0].length;
      if (cut <= a) from = cut;
      else if (m.index + 1 >= z) { to = m.index + 1; break; }
    }
    return squash(full.slice(from, to)).slice(0, 600);
  }
  function emit(type, st, item) {
    try { document.dispatchEvent(new CustomEvent("jpn:hl", { detail: { type: type, slug: slug, level: levelOf(st.prose), item: item ? { text: item.text, start: item.start, end: item.end, sentence: item.sentence || "", note: item.note || "" } : null } })); } catch (e) {}
  }

  /* -------------------------------------------------------------- one state per text */
  function levelOf(prose) {
    var p = prose.closest ? prose.closest(".panel") : null;
    return p ? p.id.replace(/^v-/, "") : "single";
  }
  var states = proses.map(function (prose) {
    return { prose: prose, key: "jpn_hl:" + slug + ":" + levelOf(prose), items: [], box: null, ol: null };
  });

  function undoToast(st, gone) {
    var t = document.querySelector(".hl-toast") || (function () {
      var d = document.createElement("div"); d.className = "hl-toast"; d.setAttribute("role", "status");
      document.body.appendChild(d); return d;
    })();
    t.textContent = "";
    var msg = document.createElement("span");
    msg.textContent = gone.length + (gone.length === 1 ? " highlight removed." : " highlights removed.");
    var undo = document.createElement("button");
    undo.type = "button"; undo.className = "hl-toast-btn"; undo.textContent = "Undo";
    undo.addEventListener("click", function () {
      gone.forEach(function (it) { place(st, it); });   // place() re-wraps and re-sorts on its own
      save(st.key, st.items);
      render(st);
      t.hidden = true;
    });
    t.appendChild(msg); t.appendChild(undo);
    t.hidden = false;
    clearTimeout(t._hide);
    t._hide = setTimeout(function () { t.hidden = true; }, 8000);
  }

  function buildBox(st) {
    /* the list lives in the Study this story accordion, so the saved words sit with the
       other things the learner does with this article rather than in a block of their own */
    var box = document.createElement("div");
    box.className = "hl-list";
    var empty = document.createElement("p");
    empty.className = "hl-empty";
    empty.textContent = "Select a useful word or phrase in the article. It is saved here with its meaning, and in My words.";
    var ol = document.createElement("ol");
    var actions = document.createElement("div");
    actions.className = "hl-actions";
    var copy = document.createElement("button");
    copy.type = "button"; copy.className = "hl-copy"; copy.textContent = "Copy highlights";
    var said = document.createElement("span");
    said.className = "hl-said"; said.setAttribute("role", "status");
    var clear = document.createElement("button");
    clear.type = "button"; clear.className = "hl-clear"; clear.textContent = "Clear article highlights";
    actions.appendChild(copy); actions.appendChild(clear); actions.appendChild(said);
    box.appendChild(empty); box.appendChild(ol); box.appendChild(actions);
    var slot = document.querySelector('[data-hl-slot="' + levelOf(st.prose) + '"]') ||
               document.querySelector("[data-hl-slot]");
    (slot || st.prose.parentNode).appendChild(box);
    st.box = box; st.ol = ol; st.empty = empty; st.actions = actions;
    st.row = slot ? slot.closest("details") : null;

    copy.addEventListener("click", function () {
      var text = st.items.map(function (it) { return it.text; }).join("\n");
      // the label keeps its width, so confirming a copy never nudges the layout
      function done() { said.textContent = "Copied"; setTimeout(function () { said.textContent = ""; }, 2500); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else fallback();
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
    clear.addEventListener("click", function () {
      if (!st.items.length) return;
      var gone = st.items.slice();
      gone.forEach(function (it) { unwrap(st.prose, it.id); });
      st.items = [];
      save(st.key, st.items);
      render(st);
      emit("clear", st, null);
      // removal is immediate but reversible, so nobody loses a page of words to one click
      undoToast(st, gone);
    });
  }

  /* ------------------------------------------------------- the meanings in the list */
  /* Tells the account script a member asked for this word. It keeps one row per
     word per article per visit, so saying so twice costs nothing. */
  function noteLookup(st, word) {
    try { document.dispatchEvent(new CustomEvent("jpn:lookup", { detail: { slug: slug, level: levelOf(st.prose), word: word } })); } catch (e) {}
  }
  /* A quiet line in place of a definition: a cap, a miss, or nothing to look up. */
  function senseNote(box, text) {
    box.textContent = "";
    var p = document.createElement("p");
    p.className = "hl-sense-note";
    p.textContent = text;
    box.appendChild(p);
  }
  /* Several senses are numbered and carry no part of speech: the entry holds one
     for the whole word, so on "yet" it would print "adverb" over a conjunction.
     A single sense keeps its part of speech, where there is nothing to mislabel. */
  /* Rows waiting on the free look-only sweep. They are gathered and asked for in
     one batch: drawing ten words must not fire ten requests, and a word saved a
     moment ago has not been asked about at all yet. */
  var pending = [];
  var sweepTimer = null, sweepTries = 0;
  function needLookup(st, box, it) {
    senseNote(box, "Looking it up…");
    pending.push({ st: st, box: box, it: it });
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweep, 120);
  }
  function sweep() {
    var G = window.JPNGloss;
    /* gloss.js is a separate deferred script and may not have run yet. */
    if (!G) {
      if (sweepTries++ < 20) { sweepTimer = setTimeout(sweep, 150); return; }
    }
    var jobs = pending;
    pending = [];
    function done() {
      jobs.forEach(function (j) { j.box.asked = true; fillSenses(j.st, j.box, j.it); });
    }
    if (!G) { done(); return; }
    G.preview(jobs.map(function (j) { return j.it.text; })).then(done, done);
  }
  /* The closed row shows the first sense beside the word, so the list still reads
     as a glossary at a glance and opening a row is for the rest of the entry. */
  function setPeek(box, text) {
    if (box.peek) box.peek.textContent = text || "";
  }
  function fillSenses(st, box, it) {
    var G = window.JPNGloss;
    box.textContent = "";
    box.hidden = false;
    setPeek(box, "");
    /* Nothing can be decided before the look-up code is there; wait for it. */
    if (!G) { needLookup(st, box, it); return; }
    if (!G.isHeadword(it.text)) { box.hidden = true; return; }
    var have = G.cached(it.text);
    if (have) {
      var all = G.senses(have);
      setPeek(box, all[0] || have.gloss || "");
      if (all.length > 1) {
        var ol = document.createElement("ol");
        ol.className = "hl-sense-list";
        all.forEach(function (g) {
          var li = document.createElement("li");
          li.textContent = g;
          ol.appendChild(li);
        });
        box.appendChild(ol);
      } else {
        var one = document.createElement("p");
        one.className = "hl-sense-one";
        if (have.pos) {
          var ps = document.createElement("span");
          ps.className = "hl-pos"; ps.textContent = have.pos;
          one.appendChild(ps);
        }
        one.appendChild(document.createTextNode(all[0] || have.gloss || ""));
        box.appendChild(one);
      }
      return;
    }
    if (G.isMissing(it.text)) {
      /* Asking for a word the dictionary does not hold yet creates the entry, so
         it stays a deliberate press rather than something the page pays for. */
      ask(st, box, it, "Look up the meaning");
      return;
    }
    /* The sweep has run and still has no answer for this word, which means the
       request failed rather than the dictionary saying no. Offer the button. */
    if (box.asked) { ask(st, box, it, "Look up the meaning"); return; }
    needLookup(st, box, it);
  }
  function ask(st, box, it, label) {
    box.textContent = "";
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "hl-look"; btn.textContent = label;
    btn.addEventListener("click", function () {
      btn.disabled = true; btn.textContent = "Looking it up…";
      noteLookup(st, it.text);
      window.JPNGloss.lookup(it.text).then(function (row) {
        if (row && row.gloss) fillSenses(st, box, it);
        else if (row && row.source === "capped") senseNote(box, row.notice || "Daily limit reached.");
        else senseNote(box, "No definition for that one.");
      }).catch(function () {
        ask(st, box, it, "Could not reach the dictionary. Try again");
      });
    });
    box.appendChild(btn);
  }
  /* The sentence the words came from, with the words themselves picked out, so a
     meaning is read against the use the reader actually met. */
  function sentenceNode(it) {
    var p = document.createElement("p");
    p.className = "hl-sent";
    var full = it.sentence || "";
    var i = full.toLowerCase().indexOf(it.text.toLowerCase());
    if (i < 0) { p.textContent = full; return p; }
    p.appendChild(document.createTextNode(full.slice(0, i)));
    var b = document.createElement("b");
    b.textContent = full.slice(i, i + it.text.length);
    p.appendChild(b);
    p.appendChild(document.createTextNode(full.slice(i + it.text.length)));
    return p;
  }
  /* The reader's own wording. It grows with the text, saves a moment after typing
     stops, and prints: on paper an empty one is a ruled line to write on. */
  function noteNode(st, it) {
    var wrap = document.createElement("div");
    wrap.className = "hl-note-wrap";
    var lab = document.createElement("label");
    lab.className = "hl-note-lab";
    /* The caption is a span of its own: a textarea inherits the label's font,
       so a bold uppercase label would be typed into in bold uppercase. */
    var cap = document.createElement("span");
    cap.className = "hl-note-cap";
    cap.textContent = "In my words";
    lab.appendChild(cap);
    var ta = document.createElement("textarea");
    ta.className = "hl-note";
    ta.rows = 1;
    ta.setAttribute("placeholder", "Say it your way");
    ta.setAttribute("aria-label", "Your own wording for " + it.text);
    ta.value = it.note || "";
    var mirror = document.createElement("p");
    mirror.className = "hl-note-print";
    mirror.textContent = it.note || "";
    /* A row for a level that is not on screen has no width, and a height measured
       there comes back nonsense, so leave it to the CSS until it is really laid
       out. Watching the width covers both that and a window being resized; only
       a change of width is acted on, or growing it would trigger itself. */
    function grow() {
      if (!ta.offsetWidth) return;
      ta.style.height = "auto";
      ta.style.height = (ta.scrollHeight + 2) + "px";
    }
    var lastW = 0;
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (ta.offsetWidth && ta.offsetWidth !== lastW) { lastW = ta.offsetWidth; grow(); }
      }).observe(ta);
    }
    ta.addEventListener("focus", grow);
    ta.addEventListener("input", function () {
      it.note = ta.value.slice(0, 400);
      mirror.textContent = it.note;
      grow();
      clearTimeout(ta._t);
      ta._t = setTimeout(function () { save(st.key, st.items); emit("note", st, it); }, 600);
    });
    ta.addEventListener("blur", function () {
      clearTimeout(ta._t);
      save(st.key, st.items);
      emit("note", st, it);
    });
    lab.appendChild(ta);
    wrap.appendChild(lab);
    wrap.appendChild(mirror);
    setTimeout(grow, 0);        // scrollHeight is only right once it is in the document
    return wrap;
  }

  var CHEVRON = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
                '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" ' +
                'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* One row per word, folded away. Open it for the sentence it came from, every
     sense, and the box for your own wording. Whether a row is open is kept on the
     item rather than in storage, so a redraw after a save does not shut rows the
     reader has opened. */
  function render(st) {
    st.ol.textContent = "";
    st.items.forEach(function (it, i) {
      var li = document.createElement("li");
      var row = document.createElement("details");
      row.className = "hl-item";
      row.open = !!it.open;
      row.addEventListener("toggle", function () { it.open = row.open; });

      var sum = document.createElement("summary");
      var n = document.createElement("span");
      n.className = "n"; n.textContent = (i < 9 ? "0" : "") + (i + 1);
      var head = document.createElement("span");
      head.className = "hl-head";
      var w = document.createElement("span");
      w.className = "w"; w.textContent = it.text;
      var peek = document.createElement("span");
      peek.className = "hl-peek";
      head.appendChild(w); head.appendChild(peek);
      var x = document.createElement("button");
      x.type = "button"; x.className = "x";
      x.setAttribute("aria-label", "Remove the highlight: " + it.text);
      x.textContent = "×";
      /* A button inside a summary still toggles the row unless we stop it. */
      x.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation(); removeItem(st, it.id);
      });
      var chev = document.createElement("span");
      chev.className = "hl-chev"; chev.innerHTML = CHEVRON;
      sum.appendChild(n); sum.appendChild(head); sum.appendChild(x); sum.appendChild(chev);

      var main = document.createElement("div");
      main.className = "hl-main";
      if (it.sentence) main.appendChild(sentenceNode(it));
      var senses = document.createElement("div");
      senses.className = "hl-senses";
      senses.peek = peek;
      fillSenses(st, senses, it);
      main.appendChild(senses);
      main.appendChild(noteNode(st, it));

      row.appendChild(sum); row.appendChild(main);
      li.appendChild(row);
      st.ol.appendChild(li);
    });
    var n = st.items.length;
    st.empty.hidden = n > 0;
    st.ol.hidden = n === 0;
    st.actions.hidden = n === 0;
    if (st.row) {
      var c = st.row.querySelector("[data-hl-count]");
      if (c) c.textContent = n + (n === 1 ? " saved" : " saved");
    }
    hints.forEach(function (h) { h.hidden = wasUsed(); });
  }

  function addItem(sel) {
    var st = sel.st, s = sel.start, e = sel.end, keep = [];
    st.items.forEach(function (it) {
      if (it.end >= s && it.start <= e) { s = Math.min(s, it.start); e = Math.max(e, it.end); unwrap(st.prose, it.id); (st.dropped = st.dropped || []).push(it); }
      else keep.push(it);
    });
    var item = { id: nextId++, start: s, end: e, text: squash(st.prose.textContent.slice(s, e)), sentence: sentenceFor(st.prose, s, e), note: "", open: true };
    keep.push(item);
    keep.sort(function (a, b) { return a.start - b.start; });
    st.items = keep;
    wrap(st.prose, s, e, item.id);
    save(st.key, st.items);
    markUsed();
    render(st);
    var gone = st.dropped || [];
    st.dropped = [];
    gone.forEach(function (g) { emit("remove", st, g); });
    emit("add", st, item);
    saySaved(st, item);
  }
  function removeItem(st, id) {
    var gone = st.items.filter(function (it) { return it.id === id; })[0];
    unwrap(st.prose, id);
    st.items = st.items.filter(function (it) { return it.id !== id; });
    save(st.key, st.items);
    render(st);
    if (gone) emit("remove", st, gone);
  }

  /* ------------------------------------------------------------ restore saved ones */
  function place(st, it) {
    var full = st.prose.textContent, start = it.start, end = it.end;
    if (typeof start !== "number" || typeof end !== "number" || !it.text) return null;
    if (squash(full.slice(start, end)) !== it.text) {        // the text has changed since: look for the words again
      var at = full.indexOf(it.text);
      if (at < 0) return null;
      start = at; end = at + it.text.length;
    }
    for (var i = 0; i < st.items.length; i++) { if (start < st.items[i].end && end > st.items[i].start) return null; }   // never overlap
    var item = { id: nextId++, start: start, end: end, text: squash(full.slice(start, end)), sentence: it.sentence || sentenceFor(st.prose, start, end), note: it.note || "" };
    st.items.push(item);
    wrap(st.prose, start, end, item.id);
    st.items.sort(function (a, b) { return a.start - b.start; });
    return item;
  }
  function restore(st) {
    var saved = load(st.key).filter(function (it) { return it && typeof it.start === "number" && typeof it.end === "number" && it.text; });
    saved.sort(function (a, b) { return a.start - b.start; });
    saved.forEach(function (it) { place(st, it); });
    save(st.key, st.items);
  }

  /* the account script (when someone is signed in) hands over the words saved in the cloud for this article:
     the cloud list wins, so a highlight removed on another device disappears here too */
  window.jpnHL = {
    slug: slug,
    all: function () {
      var out = [];
      states.forEach(function (st) { st.items.forEach(function (it) { out.push({ level: levelOf(st.prose), text: it.text, start: it.start, end: it.end, sentence: it.sentence || "", note: it.note || "" }); }); });
      return out;
    },
    sync: function (rows) {
      states.forEach(function (st) {
        var lv = levelOf(st.prose), mine = rows.filter(function (r) { return r.level === lv; });
        var texts = {};
        mine.forEach(function (r) { texts[r.text] = r; });
        st.items.slice().forEach(function (it) { if (!texts[it.text]) { unwrap(st.prose, it.id); st.items = st.items.filter(function (x) { return x !== it; }); } });
        mine.forEach(function (r) {
          var here = null;
          st.items.forEach(function (it) { if (it.text === r.text) here = it; });
          if (here) {
            /* Never let a sync wipe wording typed on this device and not yet sent. */
            if (r.note && !here.note) here.note = r.note;
            return;
          }
          place(st, { start: r.start_pos, end: r.end_pos, text: r.text, sentence: r.sentence, note: r.note });
        });
        save(st.key, st.items);
        render(st);
      });
    }
  };

  /* ------------------------------------------------------------------ hint line */
  var hints = [];
  function tipDismissed() {
    try { return !!localStorage.getItem("jpn_hl_tip"); } catch (e) { return false; }
  }
  /* a short confirmation after a save, with a way straight back out of it */
  var toast = null, toastTimer = null;
  function saySaved(st, item) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "hl-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = "";
    var msg = document.createElement("span");
    var n = st.items.length;
    msg.textContent = "Saved. " + n + (n === 1 ? " word" : " words") + " on this page.";
    var undo = document.createElement("button");
    undo.type = "button";
    undo.className = "hl-toast-btn";
    undo.textContent = "Undo";
    undo.addEventListener("click", function () {
      removeItem(st, item.id);
      hide();
    });
    var words = document.createElement("a");
    words.className = "hl-toast-link";
    words.href = "/words/";
    words.textContent = "My words";
    toast.appendChild(msg); toast.appendChild(undo); toast.appendChild(words);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, 6000);
    function hide() { clearTimeout(toastTimer); if (toast) toast.hidden = true; }
  }

  function buildHint() {
    /* one hint directly above each text, so it stays next to the text whatever sits above it */
    proses.forEach(function (prose) {
      var h = document.createElement("p");
      h.className = "hl-hint";
      var t = document.createElement("span");
      t.textContent = "Select a word or phrase to save it. Your words gather below with their meanings.";
      var x = document.createElement("button");
      x.type = "button";
      x.className = "hl-hint-x";
      x.setAttribute("aria-label", "Hide this tip");
      x.textContent = "Got it";
      x.addEventListener("click", function () {
        try { localStorage.setItem("jpn_hl_tip", "1"); } catch (e) {}
        hints.forEach(function (p) { p.hidden = true; });
      });
      h.appendChild(t); h.appendChild(x);
      h.hidden = wasUsed() || tipDismissed();
      prose.parentNode.insertBefore(h, prose);
      hints.push(h);
    });
  }

  /* ------------------------------------------------------------------ the pill */
  var pill = document.createElement("button");
  pill.type = "button";
  pill.className = "hl-pill";
  pill.hidden = true;
  pill.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20h6l9-9a2 2 0 0 0 0-3l-3-3a2 2 0 0 0-3 0L4 14v6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13 7l4 4" stroke="currentColor" stroke-width="2"/></svg><span></span>';
  var pillLabel = pill.lastChild;
  document.body.appendChild(pill);
  var target = null;   // {mode: "add"|"remove", st, sel | id, rect}

  /* The definition of a highlighted word, shown beside the pill when a reader
     taps their own highlight. A separate element, NOT inside the pill: the
     pill is itself a button, so text placed in it would remove the highlight
     when tapped. Hidden whenever the pill hides. */
  var defBox = document.createElement("div");
  defBox.className = "hl-def";
  defBox.hidden = true;
  defBox.setAttribute("role", "status");
  document.body.appendChild(defBox);
  /* Removing a highlight is a rare, secondary action, so it floats faintly
     BELOW the panel rather than sitting inside it competing with the meaning
     the reader actually came for. Its own element so it can sit outside the
     panel's white card. */
  var rmBox = document.createElement("button");
  rmBox.type = "button";
  rmBox.className = "hl-rm";
  rmBox.textContent = "Remove highlight";
  rmBox.hidden = true;
  document.body.appendChild(rmBox);
  var defRect = null;        // the highlight being described
  function hideDef() {
    defBox.hidden = true; defBox.textContent = ""; defBox.onclick = null;
    rmBox.hidden = true; rmBox.onclick = null;
    defRect = null;
  }
  /* The word, then its definition, then a quiet "Remove highlight".
     The word is repeated here deliberately: the panel sits over the line you
     were reading, so without it you lose sight of what you asked about. */
  function setDef(word, parts, st, id) {
    defBox.textContent = "";
    if (word) {
      var h = document.createElement("span");
      h.className = "hl-def-w"; h.textContent = word;
      defBox.appendChild(h);
    }
    var body = document.createElement("span");
    body.className = "hl-def-body";
    parts.forEach(function (p) {
      var sp = document.createElement("span");
      sp.className = p[0]; sp.textContent = p[1];
      body.appendChild(sp);
    });
    defBox.appendChild(body);
    if (st && id != null) {
      rmBox.onclick = function (ev) {
        ev.stopPropagation(); removeItem(st, id); hideDef(); hidePill();
      };
      rmBox.hidden = false;
    } else {
      rmBox.hidden = true;
    }
    defBox.hidden = false;
    placeDef();
  }
  /* Below the highlighted line where there is room, above it otherwise, so the
     word being defined stays visible. */
  function placeDef() {
    if (defBox.hidden || !defRect) return;
    var sx = window.pageXOffset, sy = window.pageYOffset;
    var w = defBox.offsetWidth, h = defBox.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var left = defRect.left + sx + defRect.width / 2 - w / 2;
    left = Math.max(sx + 8, Math.min(left, sx + vw - w - 8));
    /* Room for the panel AND the pill below it, or we flip above the line. */
    var rh = rmBox.hidden ? 0 : rmBox.offsetHeight + 6;
    var below = defRect.bottom + sy + 10;
    var above = defRect.top + sy - h - 10;
    var goBelow = (defRect.bottom + h + rh + 16 <= vh) || above - rh < sy + 8;
    var top = goBelow ? below : above;
    defBox.style.left = Math.round(left) + "px";
    defBox.style.top = Math.round(top) + "px";
    if (!rmBox.hidden) {
      /* Always on the far side of the panel from the word: below the panel
         when the panel is below the line, above it when the panel is above.
         Putting it below in both cases laid the pill straight over the word
         being defined. */
      var rw = rmBox.offsetWidth;
      var rl = left + w / 2 - rw / 2;
      rl = Math.max(sx + 8, Math.min(rl, sx + vw - rw - 8));
      rmBox.style.left = Math.round(rl) + "px";
      rmBox.style.top = Math.round(goBelow ? top + h + 6
                                           : top - rmBox.offsetHeight - 6) + "px";
    }
  }
  /* Returns true if it is showing a panel, so the caller knows the heavy black
     pill is not needed.

     The peek is one line and nothing more. Every sense, the sentence and the
     reader's own wording live in the list under the text, where they have room
     and where they print. A card big enough to hold all that sat over the very
     line the reader was asking about. The peek also never generates, so a
     passing tap never costs a look-up: that belongs to the button in the list. */
  function showDefFor(text, rect, st, id) {
    var G = window.JPNGloss;
    defRect = rect;
    if (!G || !G.isHeadword(text)) { hideDef(); return false; }
    var have = G.cached(text);
    if (have) {
      noteLookup(st, text);
      var all = G.senses(have);
      var parts = [["hl-def-g", all[0] || have.gloss || ""]];
      /* Say so when there is more, or the first sense reads as the only one. */
      if (all.length > 1) parts.push(["hl-def-more", all.length + " meanings in the list below"]);
      setDef(text, parts, st, id);
    } else {
      setDef(text, [["hl-def-note", "Meaning in the list below."]], st, id);
    }
    return true;
  }

  function showPill(mode, rect, info) {
    target = info; target.mode = mode;
    if (mode === "add") hideDef();      // nothing is selected yet to define
    pillLabel.textContent = mode === "add" ? "Highlight" : "Remove highlight";
    pill.setAttribute("aria-label", mode === "add" ? "Highlight the selected words" : "Remove this highlight");
    pill.hidden = false;
    var w = pill.offsetWidth, h = pill.offsetHeight;
    var sx = window.pageXOffset, sy = window.pageYOffset;
    var left = rect.left + sx + rect.width / 2 - w / 2;
    left = Math.max(sx + 8, Math.min(left, sx + document.documentElement.clientWidth - w - 8));
    var above = rect.top + sy - h - 10;
    var below = rect.bottom + sy + 12;
    var top = (coarse || above < sy + 8) ? below : above;
    pill.style.left = Math.round(left) + "px";
    pill.style.top = Math.round(top) + "px";
    placeDef();
  }
  function hidePill() { pill.hidden = true; target = null; hideDef(); }
  function clearSelection() { var s = window.getSelection(); if (s && s.removeAllRanges) s.removeAllRanges(); }

  pill.addEventListener("mousedown", function (e) { e.preventDefault(); });
  pill.addEventListener("click", function () {
    if (!target) return;
    if (target.mode === "add") addItem(target.sel); else removeItem(target.st, target.id);
    hidePill(); clearSelection();
  });

  /* ----------------------------------------------------------- reading the selection */
  function blockOf(node, prose) {
    while (node && node !== prose) {
      if (node.nodeType === 1 && BLOCK.test(node.tagName)) return node;
      node = node.parentNode;
    }
    return null;
  }
  function currentSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0), st = null;
    for (var i = 0; i < states.length; i++) {
      if (states[i].prose.contains(r.startContainer) && states[i].prose.contains(r.endContainer)) { st = states[i]; break; }
    }
    if (!st || !st.prose.offsetParent) return null;
    var a = blockOf(r.startContainer, st.prose), b = blockOf(r.endContainer, st.prose);
    if (!a || a !== b) return null;
    var s = offsetOf(st.prose, r.startContainer, r.startOffset);
    var e = offsetOf(st.prose, r.endContainer, r.endOffset);
    var full = st.prose.textContent;
    while (s < e && EDGE.test(full.charAt(s))) s++;
    while (e > s && EDGE.test(full.charAt(e - 1))) e--;
    if (e <= s || e - s > MAX) return null;
    return { st: st, start: s, end: e, rect: r.getBoundingClientRect() };
  }
  function onSelection() {
    if (dragging) return;
    var sel = currentSelection();
    if (!sel) { if (target && target.mode === "add") hidePill(); return; }
    var cover = null;
    sel.st.items.forEach(function (it) { if (it.start <= sel.start && it.end >= sel.end) cover = it; });
    if (cover) showPill("remove", sel.rect, { st: sel.st, id: cover.id });
    else showPill("add", sel.rect, { st: sel.st, sel: sel });
  }

  document.addEventListener("selectionchange", function () { clearTimeout(timer); timer = setTimeout(onSelection, 90); });
  document.addEventListener("mousedown", function (e) {
    if (pill.contains(e.target) || rmBox.contains(e.target) || defBox.contains(e.target)) return;
    dragging = !!(e.target.closest && e.target.closest(".prose"));
    if (!dragging) hidePill();
  });
  document.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    setTimeout(onSelection, 0);
  });
  document.addEventListener("click", function (e) {
    var m = e.target.closest ? e.target.closest("mark.hl") : null;
    var s = window.getSelection();
    if (m && s && s.isCollapsed) {
      var id = +m.getAttribute("data-hl"), st = null;
      states.forEach(function (x) { if (x.prose.contains(m)) st = x; });
      if (st) {
        var it = null;
        st.items.forEach(function (x) { if (x.id === id) it = x; });
        var rect = m.getBoundingClientRect();
        /* When we can describe the word, the panel carries its own quiet
           remove link and the heavy black pill is left out entirely: it
           dominated the screen when all the reader wanted was the meaning.
           Anything we cannot define (a whole sentence) still gets the pill. */
        if (it && showDefFor(it.text, rect, st, id)) {
          /* Hide the pill itself WITHOUT hidePill(), which would also close
             the panel we just opened. target still says "remove" so the
             tap-away handler below still dismisses both. */
          pill.hidden = true;
          target = { st: st, id: id, mode: "remove" };
        } else {
          showPill("remove", rect, { st: st, id: id });
        }
      }
    } else if (!pill.contains(e.target) && !defBox.contains(e.target) && !rmBox.contains(e.target) && target && target.mode === "remove" && (!s || s.isCollapsed)) {
      hidePill();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { hidePill(); return; }
    if (e.altKey && e.code === "KeyH" && target && target.mode === "add") {
      e.preventDefault();
      addItem(target.sel); hidePill(); clearSelection();
    }
  });

  /* ------------------------------------------------------------------------ start */
  states.forEach(function (st) { buildBox(st); restore(st); });
  /* Every row drawn above queued itself with the sweep, which asks the dictionary
     look-only for the whole page in one batch. That never generates, so it costs
     nothing, and it also means tapping a highlight shows its meaning with no
     wait at all. */
  buildHint();
  states.forEach(render);
})();
