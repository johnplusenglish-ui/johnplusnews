/* johnplusnews: highlight words in an article.
   Select words, press Highlight, and they get a pink underline and are collected in a numbered
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
    var slim = items.map(function (it) { return { start: it.start, end: it.end, text: it.text }; });
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
    if (hint) hint.hidden = wasUsed();
  }

  function addItem(sel) {
    var st = sel.st, s = sel.start, e = sel.end, keep = [];
    st.items.forEach(function (it) {
      if (it.end >= s && it.start <= e) { s = Math.min(s, it.start); e = Math.max(e, it.end); unwrap(st.prose, it.id); }
      else keep.push(it);
    });
    var item = { id: nextId++, start: s, end: e, text: squash(st.prose.textContent.slice(s, e)) };
    keep.push(item);
    keep.sort(function (a, b) { return a.start - b.start; });
    st.items = keep;
    wrap(st.prose, s, e, item.id);
    save(st.key, st.items);
    markUsed();
    render(st);
  }
  function removeItem(st, id) {
    unwrap(st.prose, id);
    st.items = st.items.filter(function (it) { return it.id !== id; });
    save(st.key, st.items);
    render(st);
  }

  /* ------------------------------------------------------------ restore saved ones */
  function restore(st) {
    var full = st.prose.textContent;
    var saved = load(st.key).filter(function (it) { return it && typeof it.start === "number" && typeof it.end === "number" && it.text; });
    saved.sort(function (a, b) { return a.start - b.start; });
    var last = -1;
    saved.forEach(function (it) {
      var start = it.start, end = it.end;
      if (squash(full.slice(start, end)) !== it.text) {      // the text has changed since: look for the words again
        var at = full.indexOf(it.text);
        if (at < 0) return;
        start = at; end = at + it.text.length;
      }
      if (start < last) return;                              // never overlap
      var item = { id: nextId++, start: start, end: end, text: squash(full.slice(start, end)) };
      st.items.push(item);
      wrap(st.prose, start, end, item.id);
      last = end;
    });
    save(st.key, st.items);
  }

  /* ------------------------------------------------------------------ hint line */
  var hint = null;
  function buildHint() {
    var first = proses[0];
    var anchor = first.closest ? (first.closest(".panels") || first) : first;
    hint = document.createElement("p");
    hint.className = "hl-hint";
    hint.textContent = "Select any words to highlight them. They are collected under the text.";
    hint.hidden = wasUsed();
    anchor.parentNode.insertBefore(hint, anchor);
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
