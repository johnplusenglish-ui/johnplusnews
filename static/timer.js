/* johnplusnews: a small classroom timer.
   A quiet pill in the corner shows the time left. Tap it to set the minutes, then start. While it runs, a thin bar down
   the left edge of the page fills from the top, turns amber near the end and a soft two-note chime plays at zero.
   The length you choose is remembered on this device, and a running timer carries on from article to article.
   It can be set to the second: type 2.5 or 2.50 for two and a half minutes, or 2:30. */
(function () {
  "use strict";

  var KEY = "jpn_timer";          // {minutes, seconds}: whole minutes for the account to sync, exact seconds for here
  var RUN = "jpn_timer_run";      // {endAt, total} while running, {left, total} while paused
  var PRESETS = [5, 10, 15, 20];

  function read(key, store) {
    try { return JSON.parse((store || localStorage).getItem(key) || "null"); } catch (e) { return null; }
  }
  function write(key, value, store) {
    try { (store || localStorage).setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function clear(key, store) {
    try { (store || localStorage).removeItem(key); } catch (e) {}
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  var MIN_SECS = 5, MAX_SECS = 180 * 60;
  function clampSecs(n) { return Math.max(MIN_SECS, Math.min(MAX_SECS, Math.round(n))); }
  /* The account stores the length as a whole number of minutes, so that is what it is given. */
  function asMinutes(n) { return Math.max(1, Math.round(n / 60)); }
  /* "2.5", "2.50", "2,5" and "2:30" all mean the same thing. Anything else is not a length. */
  function parse(text) {
    var t = String(text).trim().replace(",", ".");
    var m = t.match(/^(\d{1,3}):(\d{1,2})$/);
    if (m) return Number(m[2]) > 59 ? null : Number(m[1]) * 60 + Number(m[2]);
    if (/^(\d+\.?\d*|\.\d+)$/.test(t)) return Math.round(parseFloat(t) * 60);
    return null;
  }
  function decimal(n) { return (n / 60).toFixed(2); }

  var saved = read(KEY);
  var secs = saved && saved.seconds >= MIN_SECS ? clampSecs(saved.seconds)
           : saved && saved.minutes > 0 ? clampSecs(Math.round(saved.minutes) * 60) : 600;
  var state = "idle";             // idle | running | paused | done
  var total = secs * 1000;
  var left = total;
  var endAt = 0;
  var tick = null;

  /* ------------------------------------------------------------------ the page furniture */
  var bar = el("div", "jt-bar");
  bar.setAttribute("aria-hidden", "true");
  var fill = el("div", "jt-fill");
  bar.appendChild(fill);

  var wrap = el("div", "jt");
  var pill = el("button", "jt-pill");
  pill.type = "button";
  pill.setAttribute("aria-expanded", "false");
  pill.setAttribute("aria-label", "Timer");
  var icon = el("span", "jt-icon");
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="13" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9.5V13l2.5 1.5M9.5 3h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var face = el("span", "jt-face", clock(total));
  // idle, the pill says what it is; once it is counting, the clock speaks for itself
  var word = el("span", "jt-word", "Timer");
  pill.appendChild(icon);
  pill.appendChild(word);
  pill.appendChild(face);

  var panel = el("div", "jt-panel");
  panel.hidden = true;
  var label = el("label", "jt-label", "Minutes");
  var input = el("input", "jt-input");
  input.type = "text"; input.inputMode = "decimal"; input.autocomplete = "off"; input.spellcheck = false;
  input.setAttribute("aria-describedby", "jt-hint");
  input.value = decimal(secs);
  input.id = "jt-minutes";
  label.htmlFor = "jt-minutes";
  var presets = el("div", "jt-presets");
  PRESETS.forEach(function (m) {
    var b = el("button", "jt-preset", String(m));
    b.type = "button";
    b.setAttribute("aria-label", m + " minutes");
    b.addEventListener("click", function () { setSecs(m * 60); });
    presets.appendChild(b);
  });
  var go = el("button", "jt-go", "Start");
  go.type = "button";
  var reset = el("button", "jt-reset", "Reset");
  reset.type = "button";
  var hint = el("div", "jt-hint", clock(secs * 1000));
  hint.id = "jt-hint";
  var row = el("div", "jt-row");
  row.appendChild(label); row.appendChild(input);
  var acts = el("div", "jt-acts");
  acts.appendChild(go); acts.appendChild(reset);
  panel.appendChild(row); panel.appendChild(hint); panel.appendChild(presets); panel.appendChild(acts);

  wrap.appendChild(panel);
  wrap.appendChild(pill);

  /* ------------------------------------------------------------------ behaviour */
  function show() {
    face.textContent = state === "done" ? "Time" : clock(left);
    var frac = total > 0 ? 1 - left / total : 0;
    fill.style.height = Math.max(0, Math.min(1, frac)) * 100 + "%";
    bar.classList.toggle("jt-on", state === "running" || state === "paused" || state === "done");
    bar.classList.toggle("jt-late", state !== "idle" && left / total <= 0.1);
    wrap.classList.toggle("jt-running", state === "running");
    wrap.classList.toggle("jt-idle", state === "idle");
    wrap.classList.toggle("jt-done", state === "done");
    wrap.classList.toggle("jt-late", state !== "idle" && state !== "done" && left / total <= 0.1);
    go.textContent = state === "running" ? "Pause" : state === "paused" ? "Resume" : state === "done" ? "Again" : "Start";
    input.disabled = state === "running";
    [].forEach.call(presets.children, function (b) { b.disabled = state === "running"; b.classList.toggle("jt-cur", Number(b.textContent) * 60 === secs); });
  }

  function chime() {
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      var ctx = new C(), t = ctx.currentTime;
      [660, 880].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.28);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.28 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.28 + 0.5);
        o.connect(g); g.connect(ctx.destination);
        o.start(t + i * 0.28); o.stop(t + i * 0.28 + 0.55);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1500);
    } catch (e) {}
  }

  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
  function startTick() {
    stopTick();
    tick = setInterval(function () {
      left = endAt - Date.now();
      if (left <= 0) { left = 0; finish(); return; }
      show();
    }, 250);
  }
  function finish() {
    stopTick();
    state = "done";
    clear(RUN, sessionStorage);
    show();
    chime();
  }

  function setSecs(n, quiet) {
    n = clampSecs(n);
    secs = n;
    input.value = decimal(n);
    hint.textContent = clock(n * 1000);
    write(KEY, { minutes: asMinutes(n), seconds: n });
    if (!quiet) { try { document.dispatchEvent(new CustomEvent("jpn:pref", { detail: { timer: asMinutes(n) } })); } catch (e) {} }
    if (state === "idle" || state === "done" || state === "paused") {
      state = "idle"; total = n * 1000; left = total; clear(RUN, sessionStorage);
    }
    show();
  }
  /* What was typed becomes the length, or the box goes back to the last good one. */
  function commit() {
    var n = parse(input.value);
    if (n === null) { input.value = decimal(secs); hint.textContent = clock(secs * 1000); return; }
    setSecs(n);
  }

  function start() {
    if (state === "idle" || state === "done") { total = secs * 1000; left = total; }
    state = "running";
    endAt = Date.now() + left;
    write(RUN, { endAt: endAt, total: total }, sessionStorage);
    startTick();
    show();
  }
  function pause() {
    left = Math.max(0, endAt - Date.now());
    stopTick();
    state = "paused";
    write(RUN, { left: left, total: total }, sessionStorage);
    show();
  }
  function restart() {
    stopTick();
    state = "idle"; total = secs * 1000; left = total;
    clear(RUN, sessionStorage);
    show();
  }

  /* The account script uses this to bring a saved length to this device. It only knows whole
     minutes, so a length that already rounds to the same minute is left exactly as typed. */
  window.jpnTimerSet = function (m) {
    m = Math.round(Number(m));
    if (!(m >= 1) || asMinutes(secs) === m) return;
    setSecs(m * 60, true);
  };

  go.addEventListener("click", function () {
    if (state === "running") pause(); else start();
  });
  reset.addEventListener("click", restart);
  input.addEventListener("change", commit);
  input.addEventListener("input", function () {
    var n = parse(input.value);
    hint.textContent = n === null ? "Try 2.5 or 2:30" : clock(clampSecs(n) * 1000);
  });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") { commit(); start(); } });
  pill.addEventListener("click", function () {
    var open = panel.hidden;
    panel.hidden = !open;
    pill.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && state !== "running") { try { input.focus(); input.select(); } catch (e) {} }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { panel.hidden = true; pill.setAttribute("aria-expanded", "false"); pill.focus(); }
  });
  document.addEventListener("click", function (e) {
    if (!panel.hidden && !wrap.contains(e.target)) { panel.hidden = true; pill.setAttribute("aria-expanded", "false"); }
  });

  /* a timer that was running on the previous article carries on here */
  var run = read(RUN, sessionStorage);
  if (run && run.endAt) {
    total = run.total || total; endAt = run.endAt; left = endAt - Date.now();
    if (left <= 0) { left = 0; state = "done"; clear(RUN, sessionStorage); } else { state = "running"; startTick(); }
  } else if (run && run.left > 0) {
    total = run.total || total; left = run.left; state = "paused";
  }

  function mount() {
    document.body.appendChild(bar);
    /* The timer sits with Font and PDF while it is idle, so nothing hovers over the reading.
       Once it is counting it floats, where it stays visible as the reader scrolls. */
    var slot = document.getElementById("timerslot");
    function reseat() {
      var floating = state === "running" || state === "paused" || state === "done";
      var home = floating || !slot ? document.body : slot;
      if (wrap.parentNode !== home) home.appendChild(wrap);
      wrap.classList.toggle("jt-float", floating || !slot);
      wrap.classList.toggle("jt-inline", !floating && !!slot);
    }
    reseat();
    var paint = show;
    show = function () { paint(); reseat(); };
    show();
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
