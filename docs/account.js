/* johnplusnews accounts: sign in, My Words, reading progress and preferences, and the teacher view.
   Everything talks straight to the Supabase project named in config.js. Without that, this file does nothing,
   and readers can still highlight words on their own device exactly as before. */
(function () {
  "use strict";

  var cfg = window.JPN_CONFIG || {};
  var ON = !!(cfg.url && cfg.key);
  var root = document.getElementById("acct-root");
  var PAGE = root ? root.getAttribute("data-page") : "";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null && text !== "") e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
  function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function fire(name, detail) { try { document.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) {} }

  window.jpnGateReady = true;                                       // tells the page the gate is being managed (see the fail-open timer in the page head)
  if (!ON) {
    document.documentElement.classList.remove("jpn-guest");
    if (root) {
      clear(root);
      root.appendChild(el("p", "acct-note", "Accounts are not switched on for this site yet."));
      var back = el("a", "more", "Back to all articles");
      back.href = "/";
      root.appendChild(back);
    }
    return;
  }

  /* ================================================================= the connection */
  var SKEY = "jpn_session", OUTKEY = "jpn_outbox";
  var session = read(SKEY);          // {access_token, refresh_token, expires_at, user:{id,email,name}}
  var me = null;                      // {id, email, name, role}
  var refreshing = null;

  function now() { return Math.floor(Date.now() / 1000); }
  function setSession(s) { session = s; if (s) { write(SKEY, s); try { localStorage.setItem("jpn_has_account", "1"); } catch (e) {} } else { drop(SKEY); me = null; } }
  function fromToken(j) {
    var u = j.user || {}, meta = u.user_metadata || {};
    return { access_token: j.access_token, refresh_token: j.refresh_token,
             expires_at: j.expires_at || now() + (j.expires_in || 3600),
             user: { id: u.id, email: u.email, name: meta.display_name || "" } };
  }
  function problem(status, body) {
    var msg = (body && (body.msg || body.message || body.error_description || body.error)) || "Something went wrong";
    var err = new Error(String(msg));
    err.status = status; err.code = body && (body.error_code || body.code);
    return err;
  }
  function raw(method, path, opts) {
    opts = opts || {};
    var h = { apikey: cfg.key, "Content-Type": "application/json" };
    if (opts.token) h.Authorization = "Bearer " + opts.token;   // a signed-in person's token; the project key travels in apikey only (new publishable keys are not tokens)
    if (opts.prefer) h.Prefer = opts.prefer;
    if (opts.range) { h["Range-Unit"] = "items"; h.Range = opts.range[0] + "-" + opts.range[1]; }
    return fetch(cfg.url.replace(/\/+$/, "") + path, { method: method, headers: h, body: opts.body == null ? undefined : JSON.stringify(opts.body) })
      .then(function (r) {
        return r.text().then(function (txt) {
          var body = null;
          if (txt) { try { body = JSON.parse(txt); } catch (e) { body = { message: txt }; } }
          if (!r.ok) throw problem(r.status, body);
          return body;
        });
      });
  }
  function refresh() {
    if (!session) return Promise.resolve();
    if (refreshing) return refreshing;
    refreshing = raw("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: session.refresh_token } })
      .then(function (j) { setSession(fromToken(j)); })
      .catch(function (e) { if (e.status === 400 || e.status === 401 || e.status === 403) { setSession(null); fire("jpn:auth"); } else throw e; })
      .then(function () { refreshing = null; }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }
  function api(method, path, opts) {
    opts = opts || {};
    var go = session && session.expires_at - now() < 60 ? refresh() : Promise.resolve();
    function once() {
      if (!session) throw problem(401, { message: "Please sign in" });
      opts.token = session.access_token;
      return raw(method, path, opts);
    }
    return go.then(once).catch(function (e) {
      if (e.status !== 401 || !session) throw e;          // the server says the sign-in has lapsed: renew it once and try again
      return refresh().then(once);
    });
  }
  function getAll(path) {
    var out = [];
    function more(from) {
      return api("GET", path, { range: [from, from + 999] }).then(function (rows) {
        rows = rows || []; out = out.concat(rows);
        return rows.length === 1000 ? more(from + 1000) : out;
      }, function (e) { if (e.status === 416) return out; throw e; });   // asking past the last row is not an error
    }
    return more(0);
  }
  var enc = encodeURIComponent;

  /* ================================================================= signing in and out */
  function nice(e) {
    var m = (e && e.message) || "", c = (e && e.code) || "";
    if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(m)) return "Could not reach the server. Check your connection and try again.";
    if (/invalid login/i.test(m)) return "That email and password do not match.";
    if (/already registered|already been registered|user_already_exists/i.test(m + c)) return "There is already an account with that email. Try signing in.";
    if (/not confirmed/i.test(m)) return "Please confirm your email first. Look for the message we sent you.";
    if (/rate limit|too many|429/i.test(m + c) || (e && e.status === 429)) return "Too many tries. Wait a minute and try again.";
    if (/password/i.test(m) && /(least|short|weak|characters)/i.test(m)) return "Choose a longer password, at least 8 characters.";
    if (/valid email|email address/i.test(m) && /invalid/i.test(m)) return "That email address does not look right.";
    return m || "Something went wrong. Please try again.";
  }
  function signIn(email, password) {
    return raw("POST", "/auth/v1/token?grant_type=password", { body: { email: email, password: password } })
      .then(function (j) { setSession(fromToken(j)); return start(true); });
  }
  function signUp(name, email, password) {
    return raw("POST", "/auth/v1/signup?redirect_to=" + enc(location.origin + "/"), { body: { email: email, password: password, data: { display_name: name } } })
      .then(function (j) {
        if (j && j.access_token) { setSession(fromToken(j)); return start(true).then(function () { return "in"; }); }
        return "confirm";
      });
  }
  function recover(email) {
    return raw("POST", "/auth/v1/recover?redirect_to=" + enc(location.origin + "/"), { body: { email: email } });
  }
  function newPassword(pw) {
    return api("PUT", "/auth/v1/user", { body: { password: pw } });
  }
  function signOut() {
    var t = session && session.access_token;
    var wait = me ? Promise.race([flush(), new Promise(function (r) { setTimeout(r, 3000); })]) : Promise.resolve();   // send waiting changes first
    wait.then(function () {
      wipeLocalHighlights(); drop("jpn_hl_owner"); drop(OUTKEY);
      setSession(null);
      drop("jpn_role");
      progress = {};
      fire("jpn:auth");
      drawHeader();
      applyGate();
      markCards();
      if (t) raw("POST", "/auth/v1/logout", { token: t }).catch(function () {});
      if (document.querySelector(".prose")) location.reload();
      else if (PAGE) renderPage();
    });
  }

  /* a link from an email (confirm, reset password) arrives with the sign-in details in the address */
  function fromAddress() {
    var h = location.hash.replace(/^#/, "");
    if (!/(^|&)(access_token|error_code|error_description)=/.test(h)) return Promise.resolve(null);
    var p = {};
    h.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " ")); });
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (p.error_description) return Promise.resolve({ error: p.error_description });
    if (!p.access_token) return Promise.resolve(null);
    var t = p.access_token;
    return raw("GET", "/auth/v1/user", { token: t }).then(function (u) {
      setSession(fromToken({ access_token: t, refresh_token: p.refresh_token, expires_in: +p.expires_in || 3600, expires_at: +p.expires_at || 0, user: u }));
      return { type: p.type || "signup" };
    }).catch(function () { return { error: "That link has expired. Ask for a new one." }; });
  }

  /* ================================================================= who am I */
  function loadMe() {
    if (!session) { me = null; return Promise.resolve(); }
    me = { id: session.user.id, email: session.user.email, name: session.user.name, role: (read("jpn_role") || {}).role || "student" };
    function get() { return api("GET", "/rest/v1/news_profiles?select=display_name,role&id=eq." + enc(me.id)); }
    return get().then(function (rows) {
      if (rows && rows[0]) return rows;
      // first time on the news site: make this person's profile (the sign-in project is shared with other sites, so it is not automatic)
      return api("POST", "/rest/v1/news_profiles?on_conflict=id", { prefer: "resolution=ignore-duplicates,return=minimal",
        body: { id: me.id, display_name: (me.name || "").slice(0, 60) } }).then(get);
    }).then(function (rows) {
      var r = rows && rows[0];
      if (r) { me.role = r.role || "student"; if (r.display_name) me.name = r.display_name; write("jpn_role", { id: me.id, role: me.role }); }
    }).catch(function () {});
  }

  /* ================================================================= the dialog */
  var dlg = null, lastFocus = null;
  function closeDialog() {
    if (!dlg) return;
    dlg.parentNode.removeChild(dlg); dlg = null;
    document.documentElement.classList.remove("acct-lock");
    try { sessionStorage.setItem("jpn_nudge_off", "1"); } catch (e) {}
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function field(form, id, label, type, auto, extra) {
    var wrap = el("div", "acct-field");
    var l = el("label", "", label); l.htmlFor = "acct-" + id;
    var i = el("input"); i.id = "acct-" + id; i.name = id; i.type = type; i.autocomplete = auto; i.required = true;
    if (extra) Object.keys(extra).forEach(function (k) { i.setAttribute(k, extra[k]); });
    wrap.appendChild(l); wrap.appendChild(i); form.appendChild(wrap);
    return i;
  }
  function openDialog(mode, notice, auto) {
    if (!dlg) {
      lastFocus = document.activeElement;
      dlg = el("div", "acct-back");
      dlg.addEventListener("mousedown", function (e) { if (e.target === dlg) closeDialog(); });
      document.body.appendChild(dlg);
      document.documentElement.classList.add("acct-lock");     // the page behind stays put while the box is open
    }
    clear(dlg);
    var box = el("div", "acct-dlg");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    var titles = { signin: "Sign in", signup: "Create your account", forgot: "Reset your password", reset: "Choose a new password" };
    var h = el("h2", "", titles[mode]); h.id = "acct-h"; box.setAttribute("aria-labelledby", "acct-h");
    var x = el("button", "acct-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", closeDialog);
    box.appendChild(x); box.appendChild(h);
    if (notice) box.appendChild(el("p", "acct-notice", notice));
    if (mode === "signup") box.appendChild(el("p", "acct-lead", "Save the words you highlight and pick up where you left off on any device. It is free."));
    if (mode === "signin") box.appendChild(el("p", "acct-lead", "Welcome back. Sign in to see your saved words and where you stopped."));
    var err = el("p", "acct-err"); err.setAttribute("role", "alert"); err.hidden = true;

    var form = el("form"); form.noValidate = false;
    var first, email, pw, name;
    if (mode === "signup") name = first = field(form, "name", "Your name", "text", "name", { maxlength: "60" });
    if (mode !== "reset") { email = field(form, "email", "Email", "email", "email"); first = first || email; }
    if (mode === "signin") pw = field(form, "pw", "Password", "password", "current-password");
    if (mode === "signup") pw = field(form, "pw", "Password (at least 8 characters)", "password", "new-password", { minlength: "8" });
    if (mode === "reset") { pw = field(form, "pw", "New password (at least 8 characters)", "password", "new-password", { minlength: "8" }); first = pw; }
    if (mode === "forgot") form.appendChild(el("p", "acct-small", "We will email you a link to choose a new password."));
    if (mode === "signup") {
      var agree = el("p", "acct-small", "Your teacher can see the words you save and the articles you read. Nobody else can. By creating an account you agree to the ");
      [["Terms", "/terms/"], ["Privacy notice", "/privacy/"]].forEach(function (l, i) {
        var a = el("a", "", l[0]); a.href = l[1]; a.target = "_blank"; a.rel = "noopener";
        if (i) agree.appendChild(document.createTextNode(" and the ")); agree.appendChild(a);
      });
      agree.appendChild(document.createTextNode("."));
      form.appendChild(agree);
    }
    form.appendChild(err);
    var go = el("button", "acct-go", { signin: "Sign in", signup: "Create account", forgot: "Send the link", reset: "Save password" }[mode]);
    go.type = "submit"; form.appendChild(go);
    box.appendChild(form);

    var alt = el("p", "acct-alt");
    function link(text, to) { var b = el("button", "acct-link", text); b.type = "button"; b.addEventListener("click", function () { if (to) openDialog(to); else closeDialog(); }); return b; }
    if (mode === "signin") { alt.appendChild(link("Create an account", "signup")); alt.appendChild(link("Forgotten your password?", "forgot")); }
    if (mode === "signup" || mode === "forgot") alt.appendChild(link("I already have an account", "signin"));
    if (mode === "signin" || mode === "signup") alt.appendChild(link("Not now, just read", null));
    if (alt.firstChild) box.appendChild(alt);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.hidden = true;
      var em = email ? email.value.trim() : "", pv = pw ? pw.value : "";
      if ((mode === "signup" || mode === "reset") && pv.length < 8) { err.textContent = "Choose a longer password, at least 8 characters."; err.hidden = false; return; }
      go.disabled = true;
      var job;
      if (mode === "signin") job = signIn(em, pv).then(closeDialog);
      else if (mode === "signup") job = signUp(name.value.trim(), em, pv).then(function (r) { if (r === "in") closeDialog(); else sentMessage("We sent a message to " + em + ". It can take a minute. Open it and press the link to confirm your email. If you cannot see it, check your spam or junk folder and mark it as not spam. Then come back and sign in."); });
      else if (mode === "forgot") job = recover(em).then(function () { sentMessage("If " + em + " has an account, a message with a link is on its way. It can take a minute. Open it to choose a new password. If you cannot see it, check your spam or junk folder."); });
      else job = newPassword(pv).then(function () { closeDialog(); toast("Your new password is saved."); });
      job.catch(function (er) { err.textContent = nice(er); err.hidden = false; go.disabled = false; });
    });
    dlg.appendChild(box);
    if (auto) { box.tabIndex = -1; setTimeout(function () { try { box.focus({ preventScroll: true }); } catch (e) {} }, 0); }   // on a phone, do not pop the keyboard up before anyone has tapped
    else setTimeout(function () { try { first.focus(); } catch (e) {} }, 0);
  }
  function sentMessage(text) {
    if (!dlg) return;
    clear(dlg);
    var box = el("div", "acct-dlg");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "acct-h");
    var h = el("h2", "", "Check your email"); h.id = "acct-h";
    var x = el("button", "acct-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", closeDialog);
    var ok = el("button", "acct-go", "OK"); ok.type = "button"; ok.addEventListener("click", closeDialog);
    box.appendChild(x); box.appendChild(h); box.appendChild(el("p", "", text)); box.appendChild(ok);
    dlg.appendChild(box);
    setTimeout(function () { ok.focus(); }, 0);
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (dlg) closeDialog(); closeMenu(); }
  });

  var toastEl = null;
  function toast(text) {
    if (!toastEl) { toastEl = el("div", "acct-toast"); toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = text; toastEl.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.classList.remove("on"); }, 3200);
  }

  /* ================================================================= the header button */
  var holder = null, menu = null, menuBtn = null;
  function closeMenu() { if (menu) { menu.hidden = true; if (menuBtn) menuBtn.setAttribute("aria-expanded", "false"); } }
  function drawHeader() {
    var wrap = document.querySelector(".site-header .wrap");
    if (!wrap) return;
    if (!holder) { holder = el("div", "acct"); wrap.appendChild(holder); }
    clear(holder);
    menu = null; menuBtn = null;
    if (!me) {
      var b = el("button", "acct-btn", "Sign in"); b.type = "button";
      b.addEventListener("click", function () { openDialog("signin"); });
      holder.appendChild(b);
      return;
    }
    var label = (me.name || me.email || "Me").split(/\s+/)[0];
    menuBtn = el("button", "acct-btn acct-me"); menuBtn.type = "button";
    menuBtn.setAttribute("aria-haspopup", "true"); menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.appendChild(el("span", "acct-dot", label.charAt(0).toUpperCase()));
    menuBtn.appendChild(el("span", "acct-name", label));
    menu = el("div", "acct-menu"); menu.hidden = true;
    menu.appendChild(el("p", "acct-who", me.email || ""));
    function item(text, href, fn) {
      var a = href ? el("a", "", text) : el("button", "", text);
      if (href) a.href = href; else { a.type = "button"; a.addEventListener("click", function () { closeMenu(); fn(); }); }
      menu.appendChild(a);
    }
    item("My words", "/words/");
    if (me.role === "teacher") item("Teacher view", "/teacher/");
    item("Sign out", null, signOut);
    menuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.hidden; menu.hidden = !open; menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    holder.appendChild(menuBtn); holder.appendChild(menu);
  }
  document.addEventListener("click", function (e) { if (holder && !holder.contains(e.target)) closeMenu(); });

  /* ================================================================= the outbox: changes wait here until they are saved */
  function outbox() { return read(OUTKEY) || []; }
  function queue(op) { if (!me) return; op.u = me.id; var q = outbox(); q.push(op); write(OUTKEY, q); flush(); }
  var flushing = null;
  function flush() {
    if (!me) return Promise.resolve();
    if (flushing) return flushing;
    function step() {
      var q = outbox().filter(function (o) { return o.u === me.id; });
      if (!q.length) return Promise.resolve();
      var o = q[0], job;
      if (o.op === "add") {
        job = api("POST", "/rest/v1/news_words?on_conflict=user_id,slug,level,text", { prefer: "resolution=merge-duplicates,return=minimal",
          body: { user_id: me.id, slug: o.slug, level: o.level, text: o.text, sentence: o.sentence || null, start_pos: o.start, end_pos: o.end } });
      } else if (o.op === "del") {
        job = api("DELETE", "/rest/v1/news_words?user_id=eq." + enc(me.id) + "&slug=eq." + enc(o.slug) + "&level=eq." + enc(o.level) + "&text=eq." + enc(o.text), { prefer: "return=minimal" });
      } else {
        job = api("DELETE", "/rest/v1/news_words?user_id=eq." + enc(me.id) + "&slug=eq." + enc(o.slug) + "&level=eq." + enc(o.level), { prefer: "return=minimal" });
      }
      return job.then(function () { pop(o); return step(); }, function (e) {
        if (e instanceof TypeError || (e.status >= 500) || e.status === 401) throw e;   // offline or a server hiccup: keep it for later
        pop(o); return step();                                                         // refused for good: drop it
      });
    }
    function pop(o) { var q = outbox(), i = q.indexOf(o); if (i < 0) { for (i = 0; i < q.length; i++) if (JSON.stringify(q[i]) === JSON.stringify(o)) break; } if (i >= 0 && i < q.length) q.splice(i, 1); write(OUTKEY, q); }
    flushing = step().then(function () { flushing = null; }, function () { flushing = null; });
    return flushing;
  }

  document.addEventListener("jpn:hl", function (e) {
    var d = e.detail || {};
    if (!me) return;
    if (d.type === "add") queue({ op: "add", slug: d.slug, level: d.level, text: d.item.text, start: d.item.start, end: d.item.end, sentence: d.item.sentence });
    else if (d.type === "remove") queue({ op: "del", slug: d.slug, level: d.level, text: d.item.text });
    else if (d.type === "clear") queue({ op: "clear", slug: d.slug, level: d.level });
  });

  /* this device's highlights belong to whoever was signed in last, so they are wiped on sign-out
     and never handed to a different person who signs in next */
  function wipeLocalHighlights() {
    try {
      var gone = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("jpn_hl:") === 0) gone.push(k); }
      gone.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  /* on the very first sign-in, words highlighted on this device before then are saved too */
  function pushLocal() {
    var rows = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i), m = /^jpn_hl:(.+?):([^:]+)$/.exec(k || "");
        if (!m) continue;
        (read(k) || []).forEach(function (it) {
          if (it && it.text) rows.push({ user_id: me.id, slug: m[1], level: m[2], text: String(it.text).slice(0, 200), sentence: it.sentence ? String(it.sentence).slice(0, 800) : null, start_pos: it.start, end_pos: it.end });
        });
      }
    } catch (e) {}
    if (!rows.length) return Promise.resolve();
    return api("POST", "/rest/v1/news_words?on_conflict=user_id,slug,level,text", { prefer: "resolution=merge-duplicates,return=minimal", body: rows }).catch(function () {});
  }

  /* ================================================================= reading progress and preferences */
  var progress = {};          // slug -> {status, level}
  function loadProgress() {
    return api("GET", "/rest/v1/news_progress?select=slug,status,level&user_id=eq." + enc(me.id)).then(function (rows) {
      progress = {};
      (rows || []).forEach(function (r) { progress[r.slug] = r; });
    }).catch(function () {});
  }
  function currentLevel() {
    var t = document.querySelector('[data-tabs] [role=tab][aria-selected="true"]');
    return t ? t.getAttribute("data-level") : null;
  }
  function saveProgress(slug, status) {
    var lv = currentLevel();
    var rec = { user_id: me.id, slug: slug, level: lv, status: status, updated_at: new Date().toISOString() };
    progress[slug] = rec;
    return api("POST", "/rest/v1/news_progress?on_conflict=user_id,slug", { prefer: "resolution=merge-duplicates,return=minimal", body: rec }).catch(function () {});
  }
  var watching = false;
  function trackArticle() {
    var slug = window.jpnHL ? window.jpnHL.slug : (location.pathname.match(/^\/articles\/([^/]+)/) || [])[1];
    if (!slug || watching) return;
    watching = true;
    if (!progress[slug]) saveProgress(slug, "opened");
    var opened = Date.now();
    function check() {
      if (!progress[slug] || progress[slug].status === "finished") return;
      var proses = [].slice.call(document.querySelectorAll(".prose")).filter(function (p) { return p.offsetParent; });
      var last = proses[proses.length - 1];
      if (!last) return;
      var bottom = last.getBoundingClientRect().bottom + window.pageYOffset;
      if (window.pageYOffset + window.innerHeight >= bottom - 120 && Date.now() - opened > 30000) { saveProgress(slug, "finished"); }
    }
    window.addEventListener("scroll", function () { clearTimeout(check.t); check.t = setTimeout(check, 400); }, { passive: true });
    setInterval(check, 5000);
    document.addEventListener("jpn:pref", function (e) { if (e.detail && e.detail.level && progress[slug]) progress[slug].level = e.detail.level; });
  }
  function markCards() {
    var cards = document.querySelectorAll(".card");
    if (!cards.length) return;
    [].forEach.call(cards, function (c) {
      var a = c.querySelector("h2 a"); if (!a) return;
      var m = /\/articles\/([^/]+)/.exec(a.getAttribute("href") || "");
      var old = c.querySelector(".acct-read"); if (old) old.parentNode.removeChild(old);
      var r = m && progress[m[1]];
      if (!r) return;
      var meta = c.querySelector(".meta"); if (!meta) return;
      meta.appendChild(el("span", "acct-read" + (r.status === "finished" ? " done" : ""), r.status === "finished" ? "Read" : "Started"));
    });
  }

  var prefs = {}, prefTimer = null;
  function localPrefs() {
    var out = {};
    try {
      var f = localStorage.getItem("jpn_font"); if (f && /^[a-z]+$/.test(f)) out.font = f;
      var l = localStorage.getItem("jpn_level"); if (l && /^[a-z]+$/i.test(l)) out.level = l;
    } catch (e) {}
    var t = read("jpn_timer"); if (t && t.minutes >= 1 && t.minutes <= 180) out.timer_minutes = Math.round(t.minutes);
    return out;
  }
  function savePrefs() {
    clearTimeout(prefTimer);
    prefTimer = setTimeout(function () {
      if (!me) return;
      var body = { user_id: me.id, updated_at: new Date().toISOString() };
      Object.keys(prefs).forEach(function (k) { body[k] = prefs[k]; });
      api("POST", "/rest/v1/news_prefs?on_conflict=user_id", { prefer: "resolution=merge-duplicates,return=minimal", body: body }).catch(function () {});
    }, 800);
  }
  document.addEventListener("jpn:pref", function (e) {
    var d = e.detail || {};
    if (!me) return;
    if (d.font) prefs.font = d.font;
    if (d.level) prefs.level = d.level;
    if (d.timer) prefs.timer_minutes = d.timer;
    savePrefs();
  });
  function syncPrefs() {
    return api("GET", "/rest/v1/news_prefs?select=font,level,timer_minutes&user_id=eq." + enc(me.id)).then(function (rows) {
      var r = rows && rows[0], mine = localPrefs();
      if (!r) { prefs = mine; if (Object.keys(mine).length) savePrefs(); return; }
      prefs = {};
      if (r.font && /^[a-z]+$/.test(r.font)) {
        prefs.font = r.font;
        try { localStorage.setItem("jpn_font", r.font); } catch (e) {}
        if (window.jpnFontSet) window.jpnFontSet(r.font);
      } else if (mine.font) prefs.font = mine.font;
      if (r.level && /^[a-z]+$/i.test(r.level)) { prefs.level = r.level; try { localStorage.setItem("jpn_level", r.level); } catch (e) {} }
      else if (mine.level) prefs.level = mine.level;
      if (r.timer_minutes >= 1 && r.timer_minutes <= 180) {
        prefs.timer_minutes = r.timer_minutes;
        write("jpn_timer", { minutes: r.timer_minutes });
        if (window.jpnTimerSet) window.jpnTimerSet(r.timer_minutes);
      } else if (mine.timer_minutes) prefs.timer_minutes = mine.timer_minutes;
      if (Object.keys(mine).some(function (k) { return r[k] == null && prefs[k] != null; })) savePrefs();   // fill in what the cloud lacks
    }).catch(function () {});
  }

  /* ================================================================= article pages: bring the saved words over */
  function syncArticle() {
    if (!window.jpnHL) return Promise.resolve();
    return flush().then(function () {
      return api("GET", "/rest/v1/news_words?select=level,text,sentence,start_pos,end_pos&user_id=eq." + enc(me.id) + "&slug=eq." + enc(window.jpnHL.slug));
    }).then(function (rows) { window.jpnHL.sync(rows || []); }).catch(function () {});
  }

  /* ================================================================= My words and the teacher view */
  var titles = null;
  function loadTitles() {
    if (titles) return Promise.resolve(titles);
    return fetch("/articles.json").then(function (r) { return r.json(); }).then(function (j) { titles = j; return j; }).catch(function () { titles = {}; return titles; });
  }
  function titleOf(slug) {
    if (titles && titles[slug]) return titles[slug].title;
    return slug.replace(/-/g, " ").replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; }
  }
  function csv(rows) {
    return "﻿" + rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
  }
  function download(name, text) {
    var a = el("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function copy(text, btn) {
    function done() { var o = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = o; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
    function fb() {
      var ta = el("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} document.body.removeChild(ta);
    }
  }
  function sentenceNode(sentence, word) {
    var p = el("p", "wd-sent");
    var i = sentence ? sentence.toLowerCase().indexOf(word.toLowerCase()) : -1;
    if (i < 0) { p.textContent = sentence || ""; return p; }
    p.appendChild(document.createTextNode(sentence.slice(0, i)));
    p.appendChild(el("b", "", sentence.slice(i, i + word.length)));
    p.appendChild(document.createTextNode(sentence.slice(i + word.length)));
    return p;
  }
  function groupBy(rows, key) {
    var m = {}, order = [];
    rows.forEach(function (r) { var k = r[key]; if (!m[k]) { m[k] = []; order.push(k); } m[k].push(r); });
    return order.map(function (k) { return { key: k, rows: m[k] }; });
  }
  function signInPrompt(text) {
    clear(root);
    root.appendChild(el("p", "acct-note", text));
    var b = el("button", "acct-go", "Sign in"); b.type = "button"; b.addEventListener("click", function () { openDialog("signin"); });
    root.appendChild(b);
  }

  /* delete my account: removes the sign-in, the saved words, the progress and the preferences */
  function deletePanel() {
    var box = el("section", "acct-danger");
    box.appendChild(el("h2", "", "Your account"));
    var p = el("p", "", "You can delete your account whenever you like. This permanently removes your sign-in, your saved words, your progress and your preferences. It cannot be undone, so download your words first if you want to keep them.");
    var open = el("button", "wd-btn wd-danger", "Delete my account"); open.type = "button";
    var form = el("div", "acct-confirm"); form.hidden = true;
    var lab = el("label", "", "Type DELETE to confirm"); lab.htmlFor = "acct-del";
    var inp = el("input"); inp.id = "acct-del"; inp.type = "text"; inp.autocomplete = "off";
    var go = el("button", "wd-btn wd-danger", "Delete everything"); go.type = "button"; go.disabled = true;
    var no = el("button", "wd-btn", "Keep my account"); no.type = "button";
    var err = el("p", "acct-err"); err.hidden = true; err.setAttribute("role", "alert");
    form.appendChild(lab); form.appendChild(inp); form.appendChild(go); form.appendChild(no); form.appendChild(err);
    open.addEventListener("click", function () { form.hidden = false; open.hidden = true; try { inp.focus(); } catch (e) {} });
    no.addEventListener("click", function () { form.hidden = true; open.hidden = false; inp.value = ""; go.disabled = true; err.hidden = true; });
    inp.addEventListener("input", function () { go.disabled = inp.value.trim() !== "DELETE"; });
    go.addEventListener("click", function () {
      go.disabled = true; err.hidden = true;
      api("POST", "/rest/v1/rpc/news_delete_my_account", { body: {} }).then(afterDelete).catch(function (e) {
        err.textContent = (e.status === 404 || e.code === "PGRST202") ? "Deleting accounts is not switched on yet. Please contact us and we will delete it for you." : nice(e);
        err.hidden = false; go.disabled = false;
      });
    });
    box.appendChild(p); box.appendChild(open); box.appendChild(form);
    return box;
  }
  function afterDelete() {
    wipeLocalHighlights(); drop("jpn_hl_owner"); drop(OUTKEY); drop("jpn_role");
    setSession(null); progress = {};
    drawHeader(); applyGate();
    if (root) {
      clear(root);
      root.appendChild(el("h2", "", "Your account has been deleted"));
      root.appendChild(el("p", "acct-note", "Your sign-in, saved words, progress and preferences have been removed. You are welcome to read the free articles, or create a new account any time."));
      var back = el("a", "more", "Back to all articles"); back.href = "/"; root.appendChild(back);
    }
  }

  function renderWords() {
    if (!me) { signInPrompt("Sign in to see the words you have saved."); return; }
    clear(root);
    root.appendChild(el("p", "acct-note", "Loading your words"));
    Promise.all([loadTitles(), getAll("/rest/v1/news_words?select=id,slug,level,text,sentence,created_at&user_id=eq." + enc(me.id) + "&order=created_at.desc")]).then(function (res) {
      var rows = res[1], q = "";
      clear(root);
      var bar = el("div", "wd-bar");
      var search = el("input", "wd-search"); search.type = "search"; search.placeholder = "Search your words"; search.setAttribute("aria-label", "Search your words");
      var cp = el("button", "wd-btn", "Copy words"); cp.type = "button";
      var dl = el("button", "wd-btn", "Download CSV"); dl.type = "button";
      bar.appendChild(search); bar.appendChild(cp); bar.appendChild(dl);
      var count = el("p", "wd-count");
      var list = el("div", "wd-list");
      root.appendChild(bar); root.appendChild(count); root.appendChild(list);
      root.appendChild(deletePanel());
      function shown() { return rows.filter(function (r) { return !q || (r.text + " " + (r.sentence || "") + " " + titleOf(r.slug)).toLowerCase().indexOf(q) >= 0; }); }
      function draw() {
        var rs = shown();
        count.textContent = rows.length ? rs.length + (rs.length === 1 ? " word" : " words") + (q ? " found" : " saved") : "";
        clear(list);
        if (!rows.length) {
          var p = el("p", "acct-note", "You have not saved any words yet. Open an article, select the words you want to keep and press Highlight. They will appear here.");
          list.appendChild(p);
          var go = el("a", "more", "Find an article"); go.href = "/"; list.appendChild(go);
          return;
        }
        groupBy(rs, "slug").forEach(function (g) {
          var sec = el("section", "wd-art");
          var head = el("div", "wd-head");
          var h = el("h2"); var a = el("a", "", titleOf(g.key)); a.href = "/articles/" + g.key + "/"; h.appendChild(a); head.appendChild(h);
          head.appendChild(el("span", "wd-n", g.rows.length + (g.rows.length === 1 ? " word" : " words")));
          sec.appendChild(head);
          var ul = el("ul", "wd-words");
          g.rows.forEach(function (r) {
            var li = el("li");
            var top = el("div", "wd-top");
            top.appendChild(el("span", "wd-w", r.text));
            top.appendChild(el("span", "wd-lv", r.level === "single" ? "" : r.level));
            var x = el("button", "wd-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Remove " + r.text);
            x.addEventListener("click", function () {
              api("DELETE", "/rest/v1/news_words?id=eq." + r.id, { prefer: "return=minimal" }).then(function () {
                rows = rows.filter(function (z) { return z !== r; }); draw();
              }).catch(function (er) { toast(nice(er)); });
            });
            top.appendChild(x);
            li.appendChild(top);
            if (r.sentence) li.appendChild(sentenceNode(r.sentence, r.text));
            ul.appendChild(li);
          });
          sec.appendChild(ul); list.appendChild(sec);
        });
      }
      search.addEventListener("input", function () { q = search.value.trim().toLowerCase(); draw(); });
      cp.addEventListener("click", function () { copy(shown().map(function (r) { return r.text; }).join("\n"), cp); });
      dl.addEventListener("click", function () {
        download("my-words.csv", csv([["Word", "Sentence", "Article", "Level", "Saved"]].concat(shown().map(function (r) { return [r.text, r.sentence, titleOf(r.slug), r.level === "single" ? "" : r.level, fmtDate(r.created_at)]; }))));
      });
      draw();
    }).catch(function (er) { clear(root); root.appendChild(el("p", "acct-err", nice(er))); });
  }

  function renderTeacher() {
    if (!me) { signInPrompt("Sign in to see the teacher view."); return; }
    if (me.role !== "teacher") { clear(root); root.appendChild(el("p", "acct-note", "This page is for the teacher.")); return; }
    clear(root);
    root.appendChild(el("p", "acct-note", "Loading the class"));
    Promise.all([loadTitles(), getAll("/rest/v1/news_profiles?select=id,email,display_name,role,created_at&order=created_at.asc"),
                 getAll("/rest/v1/news_words?select=user_id,slug,level,text,sentence,created_at&order=created_at.desc"),
                 getAll("/rest/v1/news_progress?select=user_id,slug,status,level,updated_at")]).then(function (res) {
      var people = res[1].filter(function (p) { return p.role !== "teacher"; });
      var words = res[2], prog = res[3];
      var byId = {}; people.forEach(function (p) { byId[p.id] = p; });
      words = words.filter(function (w) { return byId[w.user_id]; });
      prog = prog.filter(function (p) { return byId[p.user_id]; });
      function nameOf(p) { return p.display_name || (p.email || "").split("@")[0] || "Student"; }
      clear(root);

      var tabs = el("div", "t-tabs"); tabs.setAttribute("role", "tablist");
      var panes = {}, btns = {};
      [["students", "Students"], ["articles", "By article"]].forEach(function (t) {
        var b = el("button", "t-tab", t[1]); b.type = "button"; b.setAttribute("role", "tab");
        b.addEventListener("click", function () { pick(t[0]); });
        tabs.appendChild(b); btns[t[0]] = b; panes[t[0]] = el("div", "t-pane");
      });
      function pick(k) { Object.keys(panes).forEach(function (n) { panes[n].hidden = n !== k; btns[n].setAttribute("aria-selected", n === k ? "true" : "false"); }); }
      var tools = el("div", "wd-bar");
      var dl = el("button", "wd-btn", "Download all words (CSV)"); dl.type = "button";
      dl.addEventListener("click", function () {
        download("class-words.csv", csv([["Student", "Email", "Article", "Level", "Word", "Sentence", "Saved"]].concat(words.map(function (w) {
          var p = byId[w.user_id]; return [nameOf(p), p.email, titleOf(w.slug), w.level === "single" ? "" : w.level, w.text, w.sentence, fmtDate(w.created_at)];
        }))));
      });
      tools.appendChild(dl);
      root.appendChild(tabs); root.appendChild(tools); root.appendChild(panes.students); root.appendChild(panes.articles);

      /* students */
      if (!people.length) panes.students.appendChild(el("p", "acct-note", "No students have created an account yet."));
      else {
        var tbl = el("table", "t-table");
        var head = el("tr"); ["Student", "Words", "Articles read", "Last active"].forEach(function (h, i) { var th = el("th", i ? "num" : "", h); th.scope = "col"; head.appendChild(th); });
        var thead = el("thead"); thead.appendChild(head); tbl.appendChild(thead);
        var tb = el("tbody");
        var info = people.map(function (p) {
          var ws = words.filter(function (w) { return w.user_id === p.id; });
          var pr = prog.filter(function (x) { return x.user_id === p.id; });
          var stamps = ws.map(function (w) { return w.created_at; }).concat(pr.map(function (x) { return x.updated_at; }));
          return { p: p, ws: ws, pr: pr, last: stamps.sort().pop() || "" };
        }).sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
        info.forEach(function (s) {
          var tr = el("tr", "t-row");
          var td = el("td"); var nb = el("button", "t-name", nameOf(s.p)); nb.type = "button"; nb.setAttribute("aria-expanded", "false");
          td.appendChild(nb); td.appendChild(el("span", "t-mail", s.p.email || ""));
          tr.appendChild(td);
          tr.appendChild(el("td", "num", String(s.ws.length)));
          tr.appendChild(el("td", "num", s.pr.filter(function (x) { return x.status === "finished"; }).length + " of " + s.pr.length));
          tr.appendChild(el("td", "num", s.last ? fmtDate(s.last) : "Never"));
          tb.appendChild(tr);
          var dr = el("tr", "t-detail"); dr.hidden = true;
          var dc = el("td"); dc.colSpan = 4;
          dr.appendChild(dc); tb.appendChild(dr);
          var built = false;
          function toggle() {
            var open = dr.hidden; dr.hidden = !open; nb.setAttribute("aria-expanded", open ? "true" : "false");
            if (open && !built) {
              built = true;
              if (!s.ws.length) dc.appendChild(el("p", "acct-small", "No words saved yet."));
              groupBy(s.ws, "slug").forEach(function (g) {
                var h = el("h3"); var a = el("a", "", titleOf(g.key)); a.href = "/articles/" + g.key + "/"; h.appendChild(a); dc.appendChild(h);
                var ul = el("ul", "wd-words");
                g.rows.forEach(function (r) { var li = el("li"); li.appendChild(el("span", "wd-w", r.text)); if (r.sentence) li.appendChild(sentenceNode(r.sentence, r.text)); ul.appendChild(li); });
                dc.appendChild(ul);
              });
            }
          }
          nb.addEventListener("click", toggle);
        });
        tbl.appendChild(tb); panes.students.appendChild(tbl);
      }

      /* by article: which words the class is saving */
      if (!words.length) panes.articles.appendChild(el("p", "acct-note", "No words have been saved yet."));
      groupBy(words, "slug").forEach(function (g) {
        var people_n = {}; g.rows.forEach(function (r) { people_n[r.user_id] = 1; });
        var d = el("details", "t-art");
        var sm = el("summary"); sm.appendChild(el("span", "t-art-title", titleOf(g.key)));
        sm.appendChild(el("span", "t-art-n", Object.keys(people_n).length + (Object.keys(people_n).length === 1 ? " student" : " students")));
        d.appendChild(sm);
        var open = el("a", "t-open", "Open the article"); open.href = "/articles/" + g.key + "/"; d.appendChild(open);
        var tally = {};
        g.rows.forEach(function (r) {
          var k = r.text.toLowerCase();
          if (!tally[k]) tally[k] = { text: r.text, who: {}, sentence: r.sentence };
          tally[k].who[r.user_id] = 1;
        });
        var arr = Object.keys(tally).map(function (k) { return { text: tally[k].text, n: Object.keys(tally[k].who).length, sentence: tally[k].sentence }; })
          .sort(function (a, b) { return b.n - a.n || (a.text.toLowerCase() < b.text.toLowerCase() ? -1 : 1); });
        var ul = el("ul", "wd-words");
        arr.forEach(function (w) {
          var li = el("li"); var top = el("div", "wd-top");
          top.appendChild(el("span", "wd-w", w.text)); top.appendChild(el("span", "wd-lv", w.n + (w.n === 1 ? " student" : " students")));
          li.appendChild(top); if (w.sentence) li.appendChild(sentenceNode(w.sentence, w.text)); ul.appendChild(li);
        });
        d.appendChild(ul); panes.articles.appendChild(d);
      });
      pick("students");
    }).catch(function (er) { clear(root); root.appendChild(el("p", "acct-err", nice(er))); });
  }

  function renderPage() {
    if (PAGE === "words") renderWords();
    else if (PAGE === "teacher") renderTeacher();
  }

  /* ================================================================= the free articles
     Anyone who is not signed in sees only the newest few articles; the rest are hidden by the page (CSS keys off the jpn-guest class). */
  function applyGate() {
    document.documentElement.classList.toggle("jpn-guest", !me);
    [].forEach.call(document.querySelectorAll(".gate-note, .lock-panel"), function (n) { n.parentNode.removeChild(n); });
    if (me) return;
    var gallery = document.querySelector(".gallery");
    if (gallery) {
      var hidden = gallery.querySelectorAll(".card:not([data-free])").length;
      if (hidden) {
        var note = el("div", "gate-note");
        var p = el("p"); p.appendChild(el("strong", "", hidden + (hidden === 1 ? " more article is" : " more articles are") + " for members."));
        p.appendChild(document.createTextNode(" Create a free account to read them all."));
        var b = el("button", "acct-go", "Create a free account"); b.type = "button"; b.addEventListener("click", function () { openDialog("signup"); });
        note.appendChild(p); note.appendChild(b);
        gallery.parentNode.insertBefore(note, gallery.nextSibling);
      }
    }
    var art = document.querySelector("article[data-locked]");
    var head = art && art.querySelector(".article-head");
    if (head) {
      var panel = el("div", "lock-panel");
      var q = el("p"); q.appendChild(el("strong", "", "This article is for members."));
      q.appendChild(document.createTextNode(" Create a free account to read it, and to save the words you highlight."));
      var go = el("button", "acct-go", "Create a free account"); go.type = "button"; go.addEventListener("click", function () { openDialog("signup"); });
      var si = el("button", "acct-link", "I already have an account"); si.type = "button"; si.addEventListener("click", function () { openDialog("signin"); });
      var more = el("a", "more", "Read the free articles"); more.href = "/";
      panel.appendChild(q); panel.appendChild(go); panel.appendChild(si); panel.appendChild(more);
      head.appendChild(panel);
    }
  }

  /* ================================================================= start */
  function start(fresh) {
    return loadMe().then(function () {
      drawHeader();
      applyGate();
      if (!me) { renderPage(); return; }
      var owner = read("jpn_hl_owner"), first = Promise.resolve();
      if (fresh) {
        if (owner && owner !== me.id) { wipeLocalHighlights(); drop(OUTKEY); }   // left behind by someone else on this device
        else first = pushLocal();
      }
      write("jpn_hl_owner", me.id);
      return first.then(function () { return Promise.all([syncPrefs(), loadProgress()]); }).then(function () {
        renderPage();
        markCards();
        if (document.querySelector(".prose")) { syncArticle(); trackArticle(); }
        flush();
      });
    });
  }

  /* people who are not signed in meet the sign-up box over the page as soon as it has appeared, once per visit */
  function nudge() {
    var off = false;
    try { off = sessionStorage.getItem("jpn_nudge_off") === "1"; } catch (e) {}
    if (off || dlg || document.querySelector(".legal")) return;     // not over the privacy, terms or contact pages
    var returning = false;
    try { returning = localStorage.getItem("jpn_has_account") === "1"; } catch (e) {}
    setTimeout(function () { if (!me && !dlg) openDialog(returning ? "signin" : "signup", null, true); }, 700);
  }

  function init() {
    fromAddress().then(function (res) {
      var fresh = !!(res && !res.error);
      return start(fresh).then(function () {
        if (res && res.error) openDialog("signin", res.error);
        else if (res && res.type === "recovery") openDialog("reset", "Choose a new password for " + (me ? me.email : "your account") + ".");
        else if (res) toast("You are signed in.");
        else if (!me && !PAGE) nudge();
      });
    }).catch(function () { drawHeader(); renderPage(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
