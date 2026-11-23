/* The lesson layout: check the answers in a task, show them, clear them, and open or close the practice tasks.
   Right and wrong carry a tick or a cross as well as a colour. In Key words the dropdown lists each meaning
   next to its letter while it is open, so a phone user does not scroll down to the list for every word.
   The level tabs already show the right set (data-qlevel). Nothing is sent anywhere. */
(function () {
  var root = document.querySelector("article.ls");
  if (!root) return;
  function norm(s) { return (s || "").toLowerCase().trim().replace(/\s+/g, " "); }
  function each(list, fn) { [].forEach.call(list, fn); }

  function mark(el, ok) {              // a tick or a cross after a field, or inside a T/F/NG button
    var group = el.classList.contains("ls-tfn");
    var m = group ? el.querySelector(".ls-mark") : el.nextElementSibling;
    if (!m || !m.classList || !m.classList.contains("ls-mark")) {
      m = document.createElement("span");
      if (group) el.appendChild(m); else el.parentNode.insertBefore(m, el.nextSibling);
    }
    m.className = "ls-mark " + (ok ? "ls-mark-ok" : "ls-mark-no");
    m.setAttribute("role", "img"); m.setAttribute("aria-label", ok ? "Correct" : "Not correct");
  }
  function unmark(body) { each(body.querySelectorAll(".ls-mark"), function (m) { m.parentNode.removeChild(m); }); }
  function pick(sel, answer) {         // choose the option that matches an answer, whatever its capital letter
    var want = norm(answer.split("|")[0]);
    each(sel.options, function (o) { if (norm(o.value) === want) sel.value = o.value; });
  }

  function check(body) {
    var right = 0, total = 0;
    unmark(body);
    each(body.querySelectorAll("select[data-a],input[data-a]"), function (f) {
      total++;
      var ok = f.getAttribute("data-a").split("|").map(norm).indexOf(norm(f.value)) > -1;
      if (ok) right++;
      f.classList.toggle("ls-ok", ok);
      f.classList.toggle("ls-no", !ok && f.value !== "");
      f.setAttribute("aria-invalid", !ok && f.value !== "" ? "true" : "false");
      if (f.value !== "") mark(f, ok);
    });
    each(body.querySelectorAll(".ls-tfn"), function (g) {
      total++;
      var on = g.querySelector('[aria-pressed="true"]');
      var why = g.parentNode.parentNode.querySelector(".ls-why");
      if (!on) return;
      var ok = on.getAttribute("data-v") === g.getAttribute("data-a");
      if (ok) right++;
      on.classList.add(ok ? "ls-ok" : "ls-no");
      mark(g, ok);
      if (why) why.hidden = false;
    });
    var s = body.querySelector(".ls-score");
    s.textContent = right + " of " + total + " correct";
    s.classList.toggle("ls-good", right === total);
    var sum = body.parentNode.querySelector("summary"), d = sum.querySelector(".ls-done");
    if (!d) {
      d = document.createElement("span");
      d.className = "ls-done";
      var sp = sum.querySelector(".ls-sp");
      sp.parentNode.replaceChild(d, sp);
    }
    d.textContent = right + " / " + total;
    var sh = body.querySelector("[data-ls-show]");
    if (sh) sh.hidden = right === total;             // offered once you have tried, unless everything is right
  }

  function showAnswers(body) {
    unmark(body);
    each(body.querySelectorAll("select[data-a],input[data-a]"), function (f) {
      var a = f.getAttribute("data-a");
      if (f.tagName === "SELECT") pick(f, a); else f.value = a.split("|")[0];
      f.classList.remove("ls-no"); f.classList.add("ls-ok"); f.setAttribute("aria-invalid", "false");
    });
    each(body.querySelectorAll(".ls-tfn"), function (g) {
      each(g.querySelectorAll("button"), function (b) {
        var on = b.getAttribute("data-v") === g.getAttribute("data-a");
        b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.remove("ls-ok", "ls-no");
        if (on) b.classList.add("ls-ok");
      });
      var why = g.parentNode.parentNode.querySelector(".ls-why");
      if (why) why.hidden = false;
    });
    body.querySelector(".ls-score").textContent = "Answers shown";
    body.querySelector(".ls-score").classList.remove("ls-good");
    body.querySelector("[data-ls-show]").hidden = true;
  }

  function reset(body) {
    each(body.querySelectorAll("select,input"), function (f) {
      f.value = ""; f.classList.remove("ls-ok", "ls-no"); f.removeAttribute("aria-invalid");
    });
    each(body.querySelectorAll(".ls-tfn button"), function (b) {
      b.setAttribute("aria-pressed", "false"); b.classList.remove("ls-ok", "ls-no");
    });
    each(body.querySelectorAll(".ls-why"), function (w) { w.hidden = true; });
    unmark(body);
    var sh = body.querySelector("[data-ls-show]"); if (sh) sh.hidden = true;
    body.querySelector(".ls-score").textContent = "";
    var d = body.parentNode.querySelector(".ls-done");
    if (d) d.textContent = "";
  }

  each(root.querySelectorAll(".ls-kw"), function (kw) {
    var mean = {};
    each(kw.querySelectorAll(".ls-kw-m li"), function (li) {
      var b = li.querySelector("b"), s = li.querySelector("span");
      if (b && s) mean[b.textContent.trim()] = s.textContent.trim();
    });
    each(kw.querySelectorAll(".ls-kw-w select"), function (sel) {
      function long() { each(sel.options, function (o) { if (o.value) o.textContent = o.value + "   " + (mean[o.value] || ""); }); }
      function short() { each(sel.options, function (o) { if (o.value) o.textContent = o.value; }); }
      sel.addEventListener("pointerdown", long); sel.addEventListener("keydown", long);
      sel.addEventListener("change", short); sel.addEventListener("blur", short);
    });
  });

  root.addEventListener("click", function (e) {
    var all = e.target.closest("[data-ls-all]");
    if (all) {
      var open = all.textContent === "Open all";
      each(root.querySelectorAll('.ls-task[data-ls-task="4"],.ls-task[data-ls-task="5"],.ls-task[data-ls-task="6"],.ls-task[data-ls-task="7"]'),
        function (t) { t.open = open; });
      all.textContent = open ? "Close all" : "Open all";
      return;
    }
    var v = e.target.closest(".ls-tfn button");
    if (v) {
      each(v.parentNode.querySelectorAll("button"), function (b) {
        b.setAttribute("aria-pressed", b === v ? "true" : "false"); b.classList.remove("ls-ok", "ls-no");
      });
      var old = v.parentNode.querySelector(".ls-mark"); if (old) old.parentNode.removeChild(old);   // a new choice is unchecked
      return;
    }
    var body = e.target.closest(".ls-body");
    if (!body) return;
    if (e.target.closest("[data-ls-check]")) check(body);
    else if (e.target.closest("[data-ls-show]")) showAnswers(body);
    else if (e.target.closest("[data-ls-reset]")) reset(body);
  });
})();
