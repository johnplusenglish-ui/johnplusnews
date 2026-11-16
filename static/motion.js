/* Motion for johnplusnews.
   Three rules it never breaks:
   1. The page is complete before this file runs. Everything here animates from a
      visible resting state, so blocking the script changes nothing a reader needs.
   2. Nobody who has asked their device for less movement gets any of it.
   3. Nothing moves while somebody is reading. Reveals fire once, on approach. */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  /* ---------------------------------------------------------------- reveals */
  /* Only things below the first screen are ever hidden, so the page a reader
     opens on is always whole. No library: this is what IntersectionObserver is for. */
  function reveals() {
    if (!("IntersectionObserver" in window)) return;
    var items = [].slice.call(document.querySelectorAll(".gallery > .card, .nx"));
    if (!items.length) return;
    var fold = window.innerHeight * 0.92;
    var waiting = items.filter(function (el) {
      return el.getBoundingClientRect().top > fold;
    });
    if (!waiting.length) return;

    waiting.forEach(function (el) {
      el.classList.add("jpn-rev");
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.transition = "opacity 700ms cubic-bezier(.22,1,.36,1), transform 700ms cubic-bezier(.22,1,.36,1)";
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        el.style.opacity = "";
        el.style.transform = "";
        io.unobserve(el);
        setTimeout(function () {
          el.style.transition = "";
          el.classList.remove("jpn-rev");
        }, 760);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

    waiting.forEach(function (el) { io.observe(el); });

    /* If anything is still hidden a moment later, something went wrong: show it. */
    setTimeout(function () {
      waiting.forEach(function (el) {
        if (el.style.opacity === "0") { el.style.opacity = ""; el.style.transform = ""; }
      });
    }, 4000);
  }

  /* ------------------------------------------------------- the headline, once */
  /* gsap.from() animates towards the state the page is already in, so if GSAP is
     missing or blocked the headline simply sits there, correctly. */
  function headline() {
    var h = document.querySelector(".article-head h1");
    if (!h || !window.gsap || !window.SplitText) return;
    if (h.getBoundingClientRect().top > window.innerHeight) return;
    /* SplitText takes the lines out of normal flow, which collapses the heading to
       nothing and lets the standfirst ride up into it for the length of the tween.
       Hold the measured height until the split is reverted. */
    var keep = h.getBoundingClientRect().height;
    var split;
    try { split = new window.SplitText(h, { type: "lines", linesClass: "jpn-ln" }); }
    catch (e) { return; }
    h.style.height = keep + "px";
    split.lines.forEach(function (l) {
      l.style.overflow = "hidden";
      l.style.paddingBottom = "0.06em";
    });
    var cleaned = false;
    function done() {
      if (cleaned) return;
      cleaned = true;
      try { split.revert(); } catch (e) {}
      h.style.height = "";
      window.removeEventListener("resize", done);
    }
    var total = 0.8 + 0.07 * split.lines.length;
    window.gsap.from(split.lines, {
      yPercent: 106,
      duration: 0.8,
      ease: "power4.out",
      stagger: 0.07,
      onComplete: done,
      onInterrupt: done
    });
    /* The callback is not load-bearing. Split headings must come apart again whatever
       happens to the tween, or the heading keeps a pinned height and fixed line breaks
       that stop matching the window. */
    setTimeout(done, total * 1000 + 250);
    window.addEventListener("resize", done);
  }

  /* ------------------------------------------------------------ smooth scroll */
  /* Wheel only. Phones already have momentum scrolling that is better than
     anything a script can do, and overriding it on a reading site is a bad trade. */
  function smooth() {
    var Lenis = window.Lenis;
    if (!Lenis) return;
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return;
    var lenis = new Lenis({ duration: 1.0, smoothWheel: true, syncTouch: false });
    function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);

    /* Anything that jumps the page has to go through Lenis or it fights it. */
    document.addEventListener("click", function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href").slice(1);
      if (!id) return;
      var t = document.getElementById(id);
      if (!t) return;
      ev.preventDefault();
      lenis.scrollTo(t, { offset: -12 });
      t.setAttribute("tabindex", "-1");
      t.focus({ preventScroll: true });
    });
  }

  function start() { reveals(); headline(); smooth(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
