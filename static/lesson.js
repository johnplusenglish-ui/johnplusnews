/* The lesson layout: check the answers in a task, clear them, and open or close the practice tasks.
   The level tabs already show the right set (data-qlevel). Nothing is sent anywhere. */
(function () {
  var root = document.querySelector("article.ls");
  if (!root) return;
  function norm(s) { return (s || "").toLowerCase().trim().replace(/\s+/g, " "); }
  function each(list, fn) { [].forEach.call(list, fn); }

  function check(body) {
    var right = 0, total = 0;
    each(body.querySelectorAll("select[data-a],input[data-a]"), function (f) {
      total++;
      var ok = f.getAttribute("data-a").split("|").map(norm).indexOf(norm(f.value)) > -1;
      if (ok) right++;
      f.classList.toggle("ls-ok", ok);
      f.classList.toggle("ls-no", !ok && f.value !== "");
      f.setAttribute("aria-invalid", !ok && f.value !== "" ? "true" : "false");
    });
    each(body.querySelectorAll(".ls-tfn"), function (g) {
      total++;
      var on = g.querySelector('[aria-pressed="true"]');
      var why = g.parentNode.parentNode.querySelector(".ls-why");
      if (!on) return;
      var ok = on.getAttribute("data-v") === g.getAttribute("data-a");
      if (ok) right++;
      on.classList.add(ok ? "ls-ok" : "ls-no");
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
  }

  function reset(body) {
    each(body.querySelectorAll("select,input"), function (f) {
      f.value = ""; f.classList.remove("ls-ok", "ls-no"); f.removeAttribute("aria-invalid");
    });
    each(body.querySelectorAll(".ls-tfn button"), function (b) {
      b.setAttribute("aria-pressed", "false"); b.classList.remove("ls-ok", "ls-no");
    });
    each(body.querySelectorAll(".ls-why"), function (w) { w.hidden = true; });
    body.querySelector(".ls-score").textContent = "";
    var d = body.parentNode.querySelector(".ls-done");
    if (d) d.textContent = "";
  }

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
      each(v.parentNode.children, function (b) {
        b.setAttribute("aria-pressed", b === v ? "true" : "false"); b.classList.remove("ls-ok", "ls-no");
      });
      return;
    }
    var body = e.target.closest(".ls-body");
    if (!body) return;
    if (e.target.closest("[data-ls-check]")) check(body);
    else if (e.target.closest("[data-ls-reset]")) reset(body);
  });
})();
