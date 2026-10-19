/* johnplusnews: highlight words in an article.
   Select words, press Highlight, and they get an amber underline and are collected in a numbered
   list under the text. Highlights are kept on this device, for each article and each level. */
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
    var slim = items.map(function (it) { return { start: it.start, end: it.end, text: it.text, sentence: it.sentence || "" }; });
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
    try { document.dispatchEvent(new CustomEvent("jpn:hl", { detail: { type: type, slug: slug, level: levelOf(st.prose), item: item ? { text: item.text, start: item.start, end: item.end, sentence: item.sentence || "" } : null } })); } catch (e) {}
  }

  /* -------------------------------------------------------------- one state per text */
  function levelOf(prose) {
    var p = prose.closest ? prose.closest(".panel") : null;
    return p ? p.id.replace(/^v-/, "") : "single";
  }
  var states = proses.map(function (prose) {
    return { prose: prose, key: "jpn_hl:" + slug + ":" + levelOf(prose), items: [], box: null, ol: null };
  });

  function buildBox(st) {
    var box = document.createElement("section");
    box.className = "hl-list";
    box.hidden = true;
    box.setAttribute("aria-label", "Highlights");
    var h = document.createElement("h3");
    h.className = "hl-title";
    h.textContent = "Highlights";
    var ol = document.createElement("ol");
    var actions = document.createElement("div");
    actions.className = "hl-actions";
    var copy = document.createElement("button");
    copy.type = "button"; copy.textContent = "Copy list";
    var clear = document.createElement("button");
    clear.type = "button"; clear.textContent = "Clear all";
    actions.appendChild(copy); actions.appendChild(clear);
    box.appendChild(h); box.appendChild(ol); box.appendChild(actions);
    st.prose.parentNode.insertBefore(box, st.prose.nextSibling);
    st.box = box; st.ol = ol;

    copy.addEventListener("click", function () {
      var text = st.items.map(function (it) { return it.text; }).join("\n");
      function done() { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy list"; }, 1500); }
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
      if (!st.items.length || !confirm("Remove all the highlights from this text?")) return;
      st.items.slice().forEach(function (it) { unwrap(st.prose, it.id); });
      st.items = [];
      save(st.key, st.items);
      render(st);
      emit("clear", st, null);
    });
  }

  function render(st) {
    st.ol.textContent = "";
    st.items.forEach(function (it, i) {
      var li = document.createElement("li");
      var n = document.createElement("span");
      n.className = "n"; n.textContent = (i < 9 ? "0" : "") + (i + 1);
      var w = document.createElement("span");
      w.className = "w"; w.textContent = it.text;
      var x = document.createElement("button");
      x.type = "button"; x.className = "x";
      x.setAttribute("aria-label", "Remove the highlight: " + it.text);
      x.textContent = "×";
      x.addEventListener("click", function () { removeItem(st, it.id); });
      li.appendChild(n); li.appendChild(w); li.appendChild(x);
      st.ol.appendChild(li);
    });
    st.box.hidden = !st.items.length;
    hints.forEach(function (h) { h.hidden = wasUsed(); });
  }

  function addItem(sel) {
    var st = sel.st, s = sel.start, e = sel.end, keep = [];
    st.items.forEach(function (it) {
      if (it.end >= s && it.start <= e) { s = Math.min(s, it.start); e = Math.max(e, it.end); unwrap(st.prose, it.id); (st.dropped = st.dropped || []).push(it); }
      else keep.push(it);
    });
    var item = { id: nextId++, start: s, end: e, text: squash(st.prose.textContent.slice(s, e)), sentence: sentenceFor(st.prose, s, e) };
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
    var item = { id: nextId++, start: start, end: end, text: squash(full.slice(start, end)), sentence: it.sentence || sentenceFor(st.prose, start, end) };
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
      states.forEach(function (st) { st.items.forEach(function (it) { out.push({ level: levelOf(st.prose), text: it.text, start: it.start, end: it.end, sentence: it.sentence || "" }); }); });
      return out;
    },
    sync: function (rows) {
      states.forEach(function (st) {
        var lv = levelOf(st.prose), mine = rows.filter(function (r) { return r.level === lv; });
        var texts = {};
        mine.forEach(function (r) { texts[r.text] = r; });
        st.items.slice().forEach(function (it) { if (!texts[it.text]) { unwrap(st.prose, it.id); st.items = st.items.filter(function (x) { return x !== it; }); } });
        mine.forEach(function (r) {
          if (st.items.some(function (it) { return it.text === r.text; })) return;
          place(st, { start: r.start_pos, end: r.end_pos, text: r.text, sentence: r.sentence });
        });
        save(st.key, st.items);
        render(st);
      });
    }
  };

  /* ------------------------------------------------------------------ hint line */
  var hints = [];
  function buildHint() {
    /* one hint directly above each text, so it stays next to the text whatever sits above it */
    proses.forEach(function (prose) {
      var h = document.createElement("p");
      h.className = "hl-hint";
      h.textContent = "Select any words to highlight them. They are collected under the text.";
      h.hidden = wasUsed();
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

  function showPill(mode, rect, info) {
    target = info; target.mode = mode;
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
  }
  function hidePill() { pill.hidden = true; target = null; }
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
    if (pill.contains(e.target)) return;
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
      if (st) showPill("remove", m.getBoundingClientRect(), { st: st, id: id });
    } else if (!pill.contains(e.target) && target && target.mode === "remove" && (!s || s.isCollapsed)) {
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
  buildHint();
  states.forEach(render);
})();
