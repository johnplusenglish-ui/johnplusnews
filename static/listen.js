/* johnplusnews: the listen player.
   Each article version with a recording has a plain <audio controls> inside a .listen row. This script keeps the
   audio element but hides the browser's own controls and adds a small player: play and pause, back 10 seconds, a
   seek bar, the time and a speed button. Without JavaScript the browser's own controls stay visible. */
(function () {
  "use strict";

  var rows = [].slice.call(document.querySelectorAll(".listen"));
  if (!rows.length) return;

  /* Two gentle steps down and no further: the browser time-stretches the audio to slow it, and past
     about 0.9 that starts to sound watery, which helps nobody. */
  var SPEEDS = [1, 0.95, 0.9];
  var PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';
  /* A solid anticlockwise replay arrow, to match the filled play and pause marks. */
  var BACK = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 5V2L7.5 6.5 12 11V8a5.5 5.5 0 1 1-5.5 5.5H4A8 8 0 1 0 12 5z" fill="currentColor"/></svg>';

  function getSpeed() {
    try {
      var v = parseFloat(localStorage.getItem("jpn_speed"));
      if (SPEEDS.indexOf(v) !== -1) return v;
    } catch (e) {}
    return 1;
  }
  function saveSpeed(v) { try { localStorage.setItem("jpn_speed", String(v)); } catch (e) {} }

  function clock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  var speed = getSpeed();
  var all = [];

  function closeMenus(except) {
    [].slice.call(document.querySelectorAll(".lp-menu")).forEach(function (m) {
      if (m === except || m.hidden) return;
      m.hidden = true;
      var b = m.parentNode.querySelector(".lp-speed");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }

  /* One speed for the whole page, so switching level does not reset it. */
  function setSpeed(v) {
    speed = v;
    saveSpeed(v);
    all.forEach(function (o) { o.playbackRate = v; });
    [].slice.call(document.querySelectorAll(".lp-speed")).forEach(function (b) { b.textContent = v + "x"; });
    [].slice.call(document.querySelectorAll(".lp-opt")).forEach(function (o) {
      o.setAttribute("aria-checked", parseFloat(o.getAttribute("data-v")) === v ? "true" : "false");
    });
  }

  document.addEventListener("click", function () { closeMenus(null); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenus(null);
  });

  rows.forEach(function (row) {
    var audio = row.querySelector("audio");
    var head = row.querySelector(".listen-head");
    if (!audio || !head) return;
    all.push(audio);
    audio.removeAttribute("controls");
    row.classList.add("lp-on");

    var play = el("button", "lp-play", PLAY);
    play.type = "button";
    play.setAttribute("aria-label", "Play");
    var back = el("button", "lp-back", BACK);
    back.type = "button";
    back.setAttribute("aria-label", "Back 10 seconds");
    back.title = "Back 10 seconds";
    var seek = el("input", "lp-seek");
    seek.type = "range";
    seek.min = "0";
    seek.max = "0";
    seek.step = "1";
    seek.value = "0";
    seek.setAttribute("aria-label", "Seek");
    var time = el("span", "lp-time", "0:00");
    var rateWrap = el("div", "lp-rate");
    var rate = el("button", "lp-speed", speed + "x");
    rate.type = "button";
    rate.setAttribute("aria-label", "Playback speed");
    rate.setAttribute("aria-haspopup", "true");
    rate.setAttribute("aria-expanded", "false");
    var menu = el("div", "lp-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    SPEEDS.forEach(function (v) {
      var o = el("button", "lp-opt", v + "x" + (v === 1 ? " <span>normal</span>" : ""));
      o.type = "button";
      o.setAttribute("role", "menuitemradio");
      o.setAttribute("data-v", String(v));
      o.setAttribute("aria-checked", v === speed ? "true" : "false");
      menu.appendChild(o);
    });
    rateWrap.appendChild(rate);
    rateWrap.appendChild(menu);

    var body = el("div", "lp-body");
    body.appendChild(head);
    body.appendChild(seek);
    var side = el("div", "lp-side");
    side.appendChild(time);
    var tools = el("div", "lp-tools");
    tools.appendChild(back);
    tools.appendChild(rateWrap);
    side.appendChild(tools);
    row.insertBefore(side, audio);
    row.insertBefore(body, side);
    row.insertBefore(play, body);

    var dragging = false;
    function showRate() { rate.textContent = speed + "x"; }
    /* The track is a gradient, so the played part has to be set as a custom property. */
    function fill() {
      var max = Number(seek.max) || 0;
      seek.style.setProperty("--p", (max > 0 ? (Number(seek.value) / max) * 100 : 0) + "%");
    }
    function showTime() {
      var d = audio.duration;
      time.textContent = clock(audio.currentTime) + (isFinite(d) && d > 0 ? " / " + clock(d) : "");
      if (!dragging) seek.value = String(Math.floor(audio.currentTime));
      fill();
    }
    function applyMeta() {
      var d = audio.duration;
      if (isFinite(d) && d > 0) seek.max = String(Math.ceil(d));
      audio.playbackRate = speed;
      showRate();
      showTime();
      fill();
    }
    function setIcon() {
      var playing = !audio.paused && !audio.ended;
      play.innerHTML = playing ? PAUSE : PLAY;
      play.setAttribute("aria-label", playing ? "Pause" : "Play");
    }

    audio.addEventListener("loadedmetadata", applyMeta);
    audio.addEventListener("durationchange", applyMeta);
    audio.addEventListener("timeupdate", showTime);
    audio.addEventListener("play", function () {
      all.forEach(function (o) { if (o !== audio && !o.paused) o.pause(); });
      audio.playbackRate = speed;
      showRate();
      setIcon();
      mediaInfo();
    });
    audio.addEventListener("pause", setIcon);
    audio.addEventListener("ended", setIcon);
    audio.addEventListener("error", function () {
      time.textContent = "Could not load";
      play.disabled = true;
    });

    play.addEventListener("click", function () {
      if (audio.paused) {
        var p = audio.play();
        if (p && p.catch) p.catch(function () { setIcon(); });
      } else {
        audio.pause();
      }
    });
    back.addEventListener("click", function () {
      audio.currentTime = Math.max(0, audio.currentTime - 10);
      showTime();
    });
    rate.addEventListener("click", function (e) {
      e.stopPropagation();
      var opening = menu.hidden;
      closeMenus(opening ? menu : null);
      menu.hidden = !opening;
      rate.setAttribute("aria-expanded", opening ? "true" : "false");
      if (opening) {
        var c = menu.querySelector('[aria-checked="true"]') || menu.firstChild;
        if (c && c.focus) c.focus();
      }
    });
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
      var o = e.target;
      while (o && o !== menu && o.className !== "lp-opt") o = o.parentNode;
      if (!o || o === menu) return;
      setSpeed(parseFloat(o.getAttribute("data-v")));
      menu.hidden = true;
      rate.setAttribute("aria-expanded", "false");
      rate.focus();
    });
    seek.addEventListener("pointerdown", function () { dragging = true; });
    seek.addEventListener("pointerup", function () { dragging = false; });
    seek.addEventListener("input", function () {
      fill();
      audio.currentTime = Number(seek.value);
      showTime();
    });

    function mediaInfo() {
      if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
      try {
        var voice = row.querySelector(".listen-voice");
        navigator.mediaSession.metadata = new MediaMetadata({
          title: row.getAttribute("data-title") || document.title,
          artist: voice ? voice.textContent : "johnplusnews",
          album: "johnplusnews"
        });
        navigator.mediaSession.setActionHandler("play", function () { audio.play(); });
        navigator.mediaSession.setActionHandler("pause", function () { audio.pause(); });
        navigator.mediaSession.setActionHandler("seekbackward", function () { audio.currentTime = Math.max(0, audio.currentTime - 10); });
        navigator.mediaSession.setActionHandler("seekforward", function () { audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + 10); });
      } catch (e) {}
    }

    audio.playbackRate = speed;
    showRate();
    if (audio.readyState >= 1) applyMeta();
  });
})();
