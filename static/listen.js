/* johnplusnews: the listen player.
   Each article version with a recording has a plain <audio controls> inside a .listen row. This script keeps the
   audio element but hides the browser's own controls and adds a small player: play and pause, back 10 seconds, a
   seek bar, the time and a speed button. Without JavaScript the browser's own controls stay visible. */
(function () {
  "use strict";

  var rows = [].slice.call(document.querySelectorAll(".listen"));
  if (!rows.length) return;

  var SPEEDS = [1, 1.25, 1.5, 0.75];
  var PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';
  var BACK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 3.5v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
    var rate = el("button", "lp-speed", "1x");
    rate.type = "button";
    rate.setAttribute("aria-label", "Playback speed");

    var body = el("div", "lp-body");
    body.appendChild(head);
    body.appendChild(seek);
    var side = el("div", "lp-side");
    side.appendChild(time);
    var tools = el("div", "lp-tools");
    tools.appendChild(back);
    tools.appendChild(rate);
    side.appendChild(tools);
    row.insertBefore(side, audio);
    row.insertBefore(body, side);
    row.insertBefore(play, body);

    var dragging = false;
    function showRate() { rate.textContent = (audio.playbackRate || speed) + "x"; }
    function showTime() {
      var d = audio.duration;
      time.textContent = clock(audio.currentTime) + (isFinite(d) && d > 0 ? " / " + clock(d) : "");
      if (!dragging) seek.value = String(Math.floor(audio.currentTime));
    }
    function applyMeta() {
      var d = audio.duration;
      if (isFinite(d) && d > 0) seek.max = String(Math.ceil(d));
      audio.playbackRate = speed;
      showRate();
      showTime();
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
    rate.addEventListener("click", function () {
      var i = SPEEDS.indexOf(speed);
      speed = SPEEDS[(i + 1) % SPEEDS.length];
      saveSpeed(speed);
      all.forEach(function (o) { o.playbackRate = speed; });
      document.querySelectorAll(".lp-speed").forEach(function (b) { b.textContent = speed + "x"; });
    });
    seek.addEventListener("pointerdown", function () { dragging = true; });
    seek.addEventListener("pointerup", function () { dragging = false; });
    seek.addEventListener("input", function () {
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
