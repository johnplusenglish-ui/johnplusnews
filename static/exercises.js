/* Exercises under an article: gap-fill, matching, grammar, true/false.
   The gap-fill takes a drag, or a tap on a word and then a tap on a gap.
   Everything is marked in the page; nothing is sent anywhere. */
(function () {
  var wrap = document.querySelector(".ex-wrap");
  if (!wrap) return;
  var picked = null;   // the word the reader has tapped
  var armed = null;    // the gap the reader has tapped first

  function norm(s) { return (s || "").toLowerCase().trim().replace(/\s+/g, " "); }
  function chipFor(block, word) {
    return [].slice.call(block.querySelectorAll(".ex-chip")).filter(function (c) {
      return norm(c.dataset.w) === norm(word) && c.classList.contains("used");
    })[0];
  }
  function clearPick() {
    if (picked) picked.classList.remove("sel");
    picked = null;
    if (armed) armed.classList.remove("armed");
    armed = null;
  }
  function setGap(gap, word) {
    var block = gap.closest("[data-ex]");
    if (gap.dataset.w) {                       // put whatever is in there back first
      var old = chipFor(block, gap.dataset.w);
      if (old) old.classList.remove("used");
    }
    if (word) {
      gap.textContent = word;
      gap.dataset.w = word;
      gap.classList.add("filled");
      gap.draggable = true;
      gap.setAttribute("aria-label", "Gap, contains " + word + ". Activate to remove.");
    } else {
      gap.textContent = "";
      delete gap.dataset.w;
      gap.classList.remove("filled");
      gap.draggable = false;
      gap.setAttribute("aria-label", "Gap, empty");
    }
    gap.classList.remove("ok", "no", "blank");
  }
  function place(gap, chip) {
    var block = gap.closest("[data-ex]");
    [].forEach.call(block.querySelectorAll(".ex-gap"), function (g) {   // a word lives in one gap only
      if (g !== gap && norm(g.dataset.w || "") === norm(chip.dataset.w)) setGap(g, null);
    });
    setGap(gap, chip.dataset.w);
    chip.classList.add("used");
    clearPick();
  }

  wrap.addEventListener("input", function (ev) { if (ev.target.classList) ev.target.classList.remove("blank"); });
  wrap.addEventListener("change", function (ev) { if (ev.target.classList) ev.target.classList.remove("blank"); });

  wrap.addEventListener("click", function (ev) {
    var chip = ev.target.closest(".ex-chip");
    var gap = ev.target.closest(".ex-gap");
    var btn = ev.target.closest(".ex-btn");
    var opt = ev.target.closest(".ex-opt");

    if (opt) {                                 // one choice per statement
      var group = opt.closest(".ex-tfn");
      [].forEach.call(group.querySelectorAll(".ex-opt"), function (b) { b.classList.remove("on", "ok", "no"); });
      group.classList.remove("blank");
      opt.classList.add("on");
      return;
    }
    if (chip && !chip.classList.contains("used")) {
      if (armed) { place(armed, chip); return; }
      if (picked === chip) { clearPick(); return; }
      clearPick(); picked = chip; chip.classList.add("sel"); return;
    }
    if (gap) {
      if (picked) { place(gap, picked); return; }
      if (gap.dataset.w) { setGap(gap, null); clearPick(); return; }
      if (armed === gap) { clearPick(); return; }
      clearPick(); armed = gap; gap.classList.add("armed"); return;
    }
    if (btn) {
      if (btn.hasAttribute("data-total")) { tally(btn.closest(".ex-level")); return; }
      if (btn.hasAttribute("data-resetall")) { resetAll(btn.closest(".ex-level")); return; }
      var block = btn.closest("[data-ex]");
      if (btn.hasAttribute("data-check")) mark(block, false);
      else if (btn.hasAttribute("data-show")) mark(block, true);
      else if (btn.hasAttribute("data-reset")) reset(block);
      return;
    }
    clearPick();
  });

  // drag and drop, for a mouse
  wrap.addEventListener("dragstart", function (ev) {
    var from = ev.target.closest(".ex-gap");
    if (from && from.dataset.w) {              // dragging a word back out of a gap
      clearPick();
      from.classList.add("drag");
      ev.dataTransfer.setData("text/plain", from.dataset.w);
      ev.dataTransfer.effectAllowed = "move";
      return;
    }
    var chip = ev.target.closest(".ex-chip");
    if (!chip || chip.classList.contains("used")) return ev.preventDefault();
    clearPick();
    chip.classList.add("drag");
    ev.dataTransfer.setData("text/plain", chip.dataset.w);
    ev.dataTransfer.effectAllowed = "move";
  });
  wrap.addEventListener("dragend", function () {
    [].forEach.call(wrap.querySelectorAll(".drag"), function (x) { x.classList.remove("drag"); });
    [].forEach.call(wrap.querySelectorAll(".over"), function (x) { x.classList.remove("over"); });
  });
  wrap.addEventListener("dragover", function (ev) {
    var t = ev.target.closest(".ex-gap, [data-bank]");
    if (!t) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; t.classList.add("over");
  });
  wrap.addEventListener("dragleave", function (ev) {
    var t = ev.target.closest(".ex-gap, [data-bank]"); if (t) t.classList.remove("over");
  });
  wrap.addEventListener("drop", function (ev) {
    var t = ev.target.closest(".ex-gap, [data-bank]"); if (!t) return;
    ev.preventDefault(); t.classList.remove("over");
    var word = ev.dataTransfer.getData("text/plain"); if (!word) return;
    var block = t.closest("[data-ex]");
    var chip = [].slice.call(block.querySelectorAll(".ex-chip")).filter(function (c) {
      return norm(c.dataset.w) === norm(word);
    })[0];
    if (!chip) return;                                  // dragged in from another level
    if (t.classList.contains("ex-gap")) place(t, chip);
    else {                                              // dropped back on the bank
      [].forEach.call(block.querySelectorAll(".ex-gap"), function (g) {
        if (norm(g.dataset.w || "") === norm(word)) setGap(g, null);
      });
      chip.classList.remove("used");
    }
  });

  function mark(block, reveal) {
    var right = 0, total = 0, blank = 0;
    [].forEach.call(block.querySelectorAll(".ex-gap"), function (g) {
      total++;
      var ok = norm(g.dataset.w || "") === norm(g.dataset.a);
      var none = !g.dataset.w;
      if (ok) right++;
      if (none && !reveal) blank++;
      g.classList.toggle("blank", none && !reveal);
      if (reveal && !ok) {
        var chip = [].slice.call(block.querySelectorAll(".ex-chip")).filter(function (c) {
          return norm(c.dataset.w) === norm(g.dataset.a);
        })[0];
        if (chip) place(g, chip); else setGap(g, g.dataset.a);
        g.classList.add("ok");
      } else {
        g.classList.toggle("ok", ok);
        g.classList.toggle("no", !ok && (!!g.dataset.w || reveal));
      }
    });
    [].forEach.call(block.querySelectorAll(".ex-in"), function (inp) {
      total++;
      var accept = inp.dataset.a.split("|").map(norm);
      var ok = accept.indexOf(norm(inp.value)) >= 0;
      var none = norm(inp.value) === "";
      if (ok) right++;
      if (none && !reveal) blank++;
      inp.classList.toggle("blank", none && !reveal);
      if (reveal && !ok) { inp.value = inp.dataset.a.split("|")[0]; inp.classList.remove("no"); inp.classList.add("ok"); }
      else { inp.classList.toggle("ok", ok); inp.classList.toggle("no", !ok && (norm(inp.value) !== "" || reveal)); }
    });
    [].forEach.call(block.querySelectorAll(".ex-tfn"), function (g) {
      total++;
      var chosen = g.querySelector(".ex-opt.on");
      var ok = !!chosen && chosen.dataset.v === g.dataset.a;
      if (ok) right++;
      if (!chosen && !reveal) blank++;
      g.classList.toggle("blank", !chosen && !reveal);
      if (reveal && !ok) {
        [].forEach.call(g.querySelectorAll(".ex-opt"), function (b) { b.classList.remove("on", "ok", "no"); });
        var want = g.querySelector('.ex-opt[data-v="' + g.dataset.a + '"]');
        if (want) want.classList.add("on", "ok");
      } else if (chosen) {
        chosen.classList.toggle("ok", ok); chosen.classList.toggle("no", !ok);
      }
      // the reason appears once this statement has been answered, never before
      var why = g.parentNode.querySelector(".ex-why");
      if (why && (chosen || reveal)) why.hidden = false;
    });
    [].forEach.call(block.querySelectorAll(".ex-sel"), function (s) {
      total++;
      var ok = s.value === s.dataset.a;
      if (ok) right++;
      if (s.value === "" && !reveal) blank++;
      s.classList.toggle("blank", s.value === "" && !reveal);
      if (reveal && !ok) { s.value = s.dataset.a; s.classList.remove("no"); s.classList.add("ok"); }
      else { s.classList.toggle("ok", ok); s.classList.toggle("no", !ok && (s.value !== "" || reveal)); }
    });
    if (reveal) block.dataset.revealed = "1";
    var out = block.querySelector(".ex-score");
    var assisted = !!block.dataset.revealed;      // once the answers have been shown, this attempt is not a score
    out.textContent = reveal ? "Answers shown" :
      assisted ? "Answers were shown, so this is not a score. Press Try again to start fresh." :
      right + " of " + total + " correct" + (blank ? ", " + blank + " not answered" : "");
    out.classList.toggle("good", !reveal && !assisted && right === total);
    return { right: right, total: total, blank: blank };
  }

  function reset(block) {
    [].forEach.call(block.querySelectorAll(".ex-gap"), function (g) { setGap(g, null); });
    [].forEach.call(block.querySelectorAll(".ex-chip"), function (c) { c.classList.remove("used", "sel", "drag"); });
    [].forEach.call(block.querySelectorAll(".ex-sel"), function (s) { s.value = ""; s.classList.remove("ok", "no", "blank"); });
    [].forEach.call(block.querySelectorAll(".ex-in"), function (i) { i.value = ""; i.classList.remove("ok", "no", "blank"); });
    [].forEach.call(block.querySelectorAll(".ex-opt"), function (b) { b.classList.remove("on", "ok", "no"); });
    [].forEach.call(block.querySelectorAll(".ex-tfn"), function (g) { g.classList.remove("blank"); });
    [].forEach.call(block.querySelectorAll(".ex-why"), function (w) { w.hidden = true; });
    delete block.dataset.revealed;
    var out = block.querySelector(".ex-score"); out.textContent = ""; out.classList.remove("good");
    clearPick();
  }

  function tally(level) {
    var right = 0, all = 0, shown = 0, rows = "";
    [].forEach.call(level.querySelectorAll("[data-ex]"), function (b) {
      var r = mark(b, false);
      var name = b.querySelector(".ex-h").textContent;
      if (b.dataset.revealed) {            // the answers were shown, so this one is not a score
        shown++;
        rows += '<li><span>' + name + '</span><b class="shown">answers shown</b></li>';
        return;
      }
      right += r.right; all += r.total;
      rows += '<li><span>' + name + '</span><b class="'
            + (r.right === r.total ? "full" : "") + '">' + r.right + " / " + r.total + "</b></li>";
    });
    level.querySelector("[data-total-right]").textContent = right;
    level.querySelector("[data-total-all]").textContent = all;
    level.querySelector("[data-total-list]").innerHTML = rows;
    var pct = all ? Math.round(right / all * 100) : 0;
    var note = !all ? "You showed the answers for all four, so there is nothing to score yet. Press Start all four again to have a go." :
      pct === 100 ? "Everything right. Nothing left to look up." :
      pct >= 80 ? "Strong. Read back over the ones you missed." :
      pct >= 50 ? "A good start. Every answer is somewhere in the article above." :
                  "Worth reading the article once more, then trying again.";
    if (all && shown) note += " Exercises where you showed the answers are left out of the score.";
    level.querySelector("[data-total-msg]").textContent = note;
    level.querySelector(".ex-total-out").hidden = false;
    showTask(level, "total", false);
  }

  function resetAll(level) {
    [].forEach.call(level.querySelectorAll("[data-ex]"), function (b) { reset(b); });
    level.querySelector(".ex-total-out").hidden = true;
    showTask(level, "gap", false);
    level.querySelector(".ex-nav").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // the task row: show one activity, keep the rest in the page for scoring and for the PDF
  function showTask(level, key, focus) {
    var tabs = [].slice.call(level.querySelectorAll('.ex-nav [role="tab"]'));
    tabs.forEach(function (t) {
      var on = t.dataset.task === key;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      var panel = level.querySelector("#" + t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
      if (on && focus) t.focus();
    });
  }
  wrap.addEventListener("click", function (ev) {
    var tab = ev.target.closest('.ex-nav [role="tab"]');
    if (!tab) return;
    showTask(tab.closest(".ex-level"), tab.dataset.task, false);
  });
  wrap.addEventListener("keydown", function (ev) {
    var tab = ev.target.closest('.ex-nav [role="tab"]');
    if (!tab) return;
    var level = tab.closest(".ex-level");
    var tabs = [].slice.call(level.querySelectorAll('.ex-nav [role="tab"]'));
    var i = tabs.indexOf(tab), go = null;
    if (ev.key === "ArrowRight") go = tabs[(i + 1) % tabs.length];
    else if (ev.key === "ArrowLeft") go = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (ev.key === "Home") go = tabs[0];
    else if (ev.key === "End") go = tabs[tabs.length - 1];
    if (go) { ev.preventDefault(); showTask(level, go.dataset.task, true); }
  });

  // the exercises follow the reading-level tabs
  function showLevel(k) {
    if (!k) return;
    clearPick();
    [].forEach.call(wrap.querySelectorAll(".ex-level"), function (p) { p.hidden = p.dataset.exLevel !== k; });
  }
  var sel = document.querySelector('[role="tab"][aria-selected="true"]');
  if (sel) showLevel(sel.getAttribute("data-level"));
  document.addEventListener("jpn:pref", function (ev) {
    if (ev.detail && ev.detail.level) showLevel(ev.detail.level);
  });
  [].forEach.call(document.querySelectorAll('[role="tab"]'), function (t) {
    t.addEventListener("click", function () { showLevel(t.getAttribute("data-level")); });
  });
})();
