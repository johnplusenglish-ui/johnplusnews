/* How it works: a guided tour of a lesson page. It dims the page, lights up one part at a time and says
   in one short line what it does. The lit part still works, so the reader can try it; the rest of the page
   is blocked until the tour ends. A first-time visitor is offered it once; the button is always in the bar.
   Same pattern as the Word Rooms tour on johnplusenglish (assets/word-rooms.js). */
(function () {
  var art = document.querySelector("article.ls");
  var tools = art && art.querySelector(".ls-tools");
  if (!tools) return;
  var KEY = "jpn_tour_seen";
  var html = document.documentElement;

  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "tourbtn"; btn.setAttribute("aria-label", "How it works");
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.8v.4"/><circle class="d" cx="12" cy="16.9" r=".6"/></svg><span>How it works</span>';
  tools.insertBefore(btn, tools.firstChild);

  function $(s) { return art.querySelector(s); }
  function shown(el) { return el && el.offsetParent !== null && el.getBoundingClientRect().width > 0; }
  function secs() { return art.querySelectorAll(".ls-sec"); }
  function stage(name) {
    return [].filter.call(secs(), function (s) {
      var h = s.querySelector(".ls-stage"); return h && h.textContent.trim().indexOf(name) === 0;
    })[0];
  }
  function locked() { return html.classList.contains("jpn-guest") && art.hasAttribute("data-locked"); }
  var signedIn = function () { return !!document.querySelector("#acct .acct-me"); };

  var STEPS = [
    { el: function () { return $(".ls-bar .vtabs"); }, t: "Choose your level",
      d: "Core, Intermediate or Advanced. The article and every task change with it." },
    { el: function () { return [].filter.call(art.querySelectorAll(".listen"), shown)[0]; }, t: "Listen",
      d: "Press play to hear the article read aloud." },
    { el: function () { return stage("Before you read"); }, tall: true, t: "Before you read",
      d: "Start here: a warm-up and eight key words." },
    { el: function () { return $(".ls-sec-read"); }, tall: true, t: "Read and save words",
      d: "Select any word and press Highlight to keep it. Try it now." },
    { el: function () { return stage("After you read"); }, tall: true, t: "After you read",
      d: "Open a task, answer it, then press Check answers." },
    { el: function () { return stage("Speak"); }, tall: true, t: "Speak",
      d: "Questions to discuss, then a task for pairs." },
    { el: function () { return $(".ls-words"); }, tall: true, t: "Your words",
      d: "The words you highlight collect here, with their meanings." },
    { el: function () { return [].filter.call(art.querySelectorAll(".ls-pdf"), shown)[0]; }, t: "Worksheet PDF",
      d: "Print this lesson. The answers are on the last page." },
    { el: function () { return document.getElementById("timerslot"); }, t: "Timer",
      d: "Time a class activity. It chimes at zero." },
    /* the last stop is My words: signed in, the menu under the reader's name opens and its My words link is lit */
    { el: function () {
        var link = document.querySelector("#acct .acct-menu:not([hidden]) a[href='/words/']");
        return link || document.getElementById("acct");
      },
      before: function () {
        var b = document.querySelector("#acct .acct-me"), m = document.querySelector("#acct .acct-menu");
        if (b && m && m.hidden) b.click();
      },
      t: "My words",
      d: function () {
        return signedIn() ? "Every word you save, from every article, is kept in My words. Open it from this menu any time."
          : "Sign in, and every word you save is kept in My words, ready on any device.";
      } }
  ];
  function closeMenu() {
    var b = document.querySelector("#acct .acct-me"), m = document.querySelector("#acct .acct-menu");
    if (b && m && !m.hidden) b.click();
  }

  var tour = null, i = 0, list = [];
  function rectOf(els) {
    els = [].concat(els).filter(shown); if (!els.length) return null;
    var r = els.map(function (e) { return e.getBoundingClientRect(); });
    var l = Math.min.apply(0, r.map(function (x) { return x.left; })), t = Math.min.apply(0, r.map(function (x) { return x.top; }));
    var rr = Math.max.apply(0, r.map(function (x) { return x.right; })), b = Math.max.apply(0, r.map(function (x) { return x.bottom; }));
    return { left: l, top: t, width: rr - l, height: b - t };
  }
  function place() {
    if (!tour) return;
    var s = list[i], r = rectOf(s.el()); if (!r) return;
    var pad = 8, vw = window.innerWidth, vh = window.innerHeight;
    var hole = tour.querySelector(".hole"), card = tour.querySelector(".tip");
    var hl = Math.max(4, r.left - pad), ht = Math.max(4, r.top - pad);
    var hw = Math.min(vw - 8, r.width + pad * 2), hh = Math.min(vh - 8 - ht, r.height + pad * 2);
    if (s.tall) hh = Math.min(hh, Math.max(120, vh * (vw <= 700 ? 0.42 : 0.5)));  // a long section: light its top part
    hole.style.transform = "translate(" + hl + "px," + ht + "px)"; hole.style.width = hw + "px"; hole.style.height = hh + "px";
    var bl = tour.querySelector(".block"), x2 = hl + hw, y2 = ht + hh;
    bl.style.clipPath = "polygon(0 0,100% 0,100% 100%,0 100%,0 0," + hl + "px " + ht + "px," + hl + "px " + y2 + "px," + x2 + "px " + y2 + "px," + x2 + "px " + ht + "px," + hl + "px " + ht + "px)";
    if (vw <= 700) {
      card.style.left = ""; card.style.top = ""; card.classList.add("dock");
      card.classList.toggle("dock-top", ht + hh / 2 > vh * 0.55); return;
    }
    card.classList.remove("dock", "dock-top");
    var cw = card.offsetWidth, ch = card.offsetHeight, gap = 14;
    var top = ht + hh + gap; if (top + ch > vh - 12) top = ht - ch - gap; if (top < 12) top = Math.min(vh - ch - 12, Math.max(12, ht + hh / 2 - ch / 2));
    var left = Math.min(vw - cw - 12, Math.max(12, hl + hw / 2 - cw / 2));
    if (top < ht + hh && top + ch > ht) left = (hl + hw + gap + cw < vw - 12) ? hl + hw + gap : Math.max(12, hl - cw - gap);
    card.style.left = left + "px"; card.style.top = top + "px";
  }
  function show(n) {
    i = Math.max(0, Math.min(list.length - 1, n));
    var s = list[i], target = [].concat(s.el()).filter(shown)[0];
    var card = tour.querySelector(".tip");
    card.querySelector(".st").textContent = (i + 1) + " of " + list.length;
    card.querySelector("h3").textContent = s.t;
    card.querySelector("p").textContent = typeof s.d === "function" ? s.d() : s.d;
    card.querySelector(".bk").hidden = i === 0;
    var nx = card.querySelector(".nx"); nx.textContent = i === list.length - 1 ? "Done" : "Next";
    card.querySelector(".dotsrow").innerHTML = list.map(function (_, k) { return "<i" + (k === i ? ' class="on"' : "") + "></i>"; }).join("");
    if (target) {
      var r = target.getBoundingClientRect(), vh = window.innerHeight;
      var want = s.tall || r.height > vh - 260 ? 90 : Math.max(90, (vh - r.height) / 2 - 80);
      if (s.tall || r.top < 70 || r.bottom > vh - 200) window.scrollTo({ top: window.scrollY + r.top - want, behavior: "auto" });
    }
    if (s.before) setTimeout(function () { if (tour && list[i] === s) { s.before(); place(); } }, 0); else closeMenu();
    place(); requestAnimationFrame(place);
    nx.focus({ preventScroll: true });
  }
  function key(e) {
    if (!tour) return;
    if (e.key === "Escape") end();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") show(i - 1);
    else if (e.key === "Tab") {
      var f = tour.querySelectorAll(".tip button:not([hidden])"), a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      return;
    } else return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }
  function next() { if (i >= list.length - 1) end(); else show(i + 1); }
  function start() {
    if (tour || locked()) return; dismissInvite();
    list = STEPS.filter(function (s) { return rectOf(s.el()); });
    if (!list.length) return;
    tour = document.createElement("div"); tour.className = "jt-tour";
    tour.setAttribute("role", "dialog"); tour.setAttribute("aria-modal", "true"); tour.setAttribute("aria-labelledby", "jt-h");
    tour.innerHTML = '<div class="block"></div><div class="hole"></div><div class="tip" aria-live="polite"><div class="hd"><span class="st"></span>'
      + '<button type="button" class="sk">Close tour</button></div><h3 id="jt-h"></h3><p></p>'
      + '<div class="ft"><span class="dotsrow" aria-hidden="true"></span><button type="button" class="bk">Back</button><button type="button" class="nx">Next</button></div></div>';
    document.body.appendChild(tour);
    tour.querySelector(".nx").addEventListener("click", next);
    tour.querySelector(".bk").addEventListener("click", function () { show(i - 1); });
    tour.querySelector(".sk").addEventListener("click", end);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, { passive: true });
    btn.setAttribute("aria-expanded", "true");
    show(0);
  }
  function end() {
    if (!tour) return;
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("resize", place); window.removeEventListener("scroll", place);
    tour.remove(); tour = null; btn.setAttribute("aria-expanded", "false"); closeMenu();
    window.scrollTo({ top: 0, behavior: "auto" });
    btn.focus({ preventScroll: true });
  }
  btn.addEventListener("click", start);

  /* the one-time offer: it waits until the article is readable and no sign-in box is open */
  var invite = null;
  function dismissInvite() { if (invite) { invite.remove(); invite = null; } try { localStorage.setItem(KEY, "1"); } catch (e) {} }
  var seen = false; try { seen = !!localStorage.getItem(KEY); } catch (e) { seen = true; }
  if (!seen) {
    var tries = 0, timer = setInterval(function () {
      if (++tries > 120) return clearInterval(timer);
      if (tour || locked() || html.classList.contains("acct-lock") || tries < 2) return;
      clearInterval(timer);
      invite = document.createElement("div"); invite.className = "jt-invite"; invite.setAttribute("role", "status");
      invite.innerHTML = "<b>New to johnplusnews?</b><span>A one-minute tour shows you how this page works.</span>"
        + '<div class="ac"><button type="button" class="go">Show me</button><button type="button" class="no">No thanks</button></div>';
      document.body.appendChild(invite);
      invite.querySelector(".go").addEventListener("click", start);
      invite.querySelector(".no").addEventListener("click", dismissInvite);
    }, 1000);
  }
})();
