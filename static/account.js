/* johnplusnews accounts: sign in, My Words, reading progress and preferences, and the teacher view.
   Everything talks straight to the Supabase project named in config.js. Without that, this file does nothing,
   and readers can still highlight words on their own device exactly as before. */
(function () {
  "use strict";

  var cfg = window.JPN_CONFIG || {};
  var ON = !!(cfg.url && cfg.key);
  var root = document.getElementById("acct-root");
  var PAGE = root ? root.getAttribute("data-page") : "";

  /* Loading, empty and error states -------------------------------------------
     The session check and the first data fetch are two separate round trips, so without
     this the page would sit empty until both finished. One polite status line carries the
     message; the grey placeholder rows only reserve space and are hidden from screen readers. */
  var bootFailed = false;
  function skeleton(rows) {
    var box = el("div", "acct-skel");
    box.setAttribute("aria-hidden", "true");
    for (var i = 0; i < rows; i++) box.appendChild(el("div", "sk-row"));
    return box;
  }
  function showLoading(text, rows) {
    if (!root) return;
    clear(root);
    root.setAttribute("aria-busy", "true");
    var p = el("p", "acct-note acct-loading", text);
    p.setAttribute("role", "status");
    root.appendChild(p);
    root.appendChild(skeleton(rows || 3));
  }
  function showError(text, retry) {
    if (!root) return;
    clear(root);
    root.removeAttribute("aria-busy");
    var p = el("p", "acct-err", text);
    p.setAttribute("role", "alert");
    root.appendChild(p);
    if (retry) {
      var b = el("button", "acct-go", "Try again");
      b.type = "button";
      b.addEventListener("click", retry);
      root.appendChild(b);
    }
  }
  function ready() { if (root) root.removeAttribute("aria-busy"); }

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
    // a server that answers with a page rather than a message must not have it read out at the reader
    if (/^\s*</.test(m) || m.length > 160) return "Something went wrong at our end. Please try again.";
    return m || "Something went wrong. Please try again.";
  }
  function signIn(email, password) {
    return raw("POST", "/auth/v1/token?grant_type=password", { body: { email: email, password: password } })
      .then(function (j) { setSession(fromToken(j)); try { localStorage.removeItem(seenKey(session.user.id)); } catch (e) {} return start(true); });
  }
  function signUp(name, email, password) {
    return raw("POST", "/auth/v1/signup?redirect_to=" + enc(location.origin + "/"), { body: { email: email, password: password, data: { display_name: name } } })
      .then(function (j) {
        if (j && j.access_token) { setSession(fromToken(j)); try { localStorage.removeItem(seenKey(session.user.id)); } catch (e) {} return start(true).then(function () { return "in"; }); }
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

  /* ================================================================= when someone was last here */
  /* The database sets the time itself (news_touch in supabase/add_last_seen.sql), so it is the real moment and
     cannot be altered from the browser. Once every ten minutes per person is plenty, and a sign-in always counts.
     Until that function has been added to the project the call simply fails and is not tried again. */
  var touchBroken = false;
  function seenKey(id) { return "jpn_seen_" + id; }
  function touchSeen() {
    if (!me || touchBroken) return;
    var last = 0; try { last = Number(localStorage.getItem(seenKey(me.id))) || 0; } catch (e) {}
    if (Date.now() - last < 10 * 60 * 1000) return;
    try { localStorage.setItem(seenKey(me.id), String(Date.now())); } catch (e) {}
    api("POST", "/rest/v1/rpc/news_touch", { body: {} }).catch(function (e) {
      if (e && (e.status === 404 || e.status === 400)) touchBroken = true;
    });
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
      if (r) { me.role = r.role || "student"; if (r.display_name) me.name = r.display_name; write("jpn_role", { id: me.id, role: me.role }); touchSeen(); }
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
      var agree = el("p", "acct-small", "Your teacher can see the words you save and look up, and the articles you read. Nobody else can. By creating an account you agree to the ");
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
    // on a locked article, "just read" would promise something the page does not give a guest
    if (mode === "signin" || mode === "signup") alt.appendChild(link(!me && document.querySelector("article[data-locked]") ? "Not now" : "Not now, just read", null));
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

  /* A signed-in reader gets a way straight back to their words from the home page,
     so the feature is not hidden behind the avatar menu. */
  function homeLinks() {
    var box = document.getElementById("home-links");
    if (!box) return;
    clear(box);
    if (!me) { box.hidden = true; return; }
    var a = el("a", "intro-link", "My words");
    a.href = "/words/";
    box.appendChild(a);
    if (me.role === "teacher") {
      var t = el("a", "intro-link", "Teacher view");
      t.href = "/teacher/";
      box.appendChild(t);
    }
    box.hidden = false;
  }

  /* ================================================================= the header button */
  var holder = null, menu = null, menuBtn = null;
  function closeMenu() { if (menu) { menu.hidden = true; if (menuBtn) menuBtn.setAttribute("aria-expanded", "false"); } }
  function drawHeader() {
    homeLinks();
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
    menu.lastChild.className = "acct-out";
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

  /* a dictionary look-up by a signed-in member: one row per word per article per visit, and never allowed to get in the way */
  var lookedUp = {};
  function recordLookup(slug, level, word) {
    word = String(word || "").trim().slice(0, 60);
    if (!me || !slug || !word || lookupBroken) return;
    var k = slug + "|" + word.toLowerCase();
    if (lookedUp[k]) return;
    lookedUp[k] = 1;
    api("POST", "/rest/v1/news_lookups", { prefer: "return=minimal", body: { slug: slug, level: level || "", word: word } })
      .catch(function (e) { if (e && (e.status === 404 || e.status === 400)) lookupBroken = true; });
  }
  var lookupBroken = false;
  document.addEventListener("jpn:lookup", function (e) { var d = e.detail || {}; recordLookup(d.slug, d.level, d.word); });

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
      var done = r.status === "finished";
      var st = el("span", "acct-read" + (done ? " done" : ""));
      st.setAttribute("aria-label", done ? "Completed" : "In progress");
      st.appendChild(el("span", "acct-read-t", done ? "Completed" : "In progress"));
      meta.appendChild(st);
    });
  }

  var prefs = {}, prefTimer = null;
  function localPrefs() {
    var out = {};
    try {
      var f = localStorage.getItem("jpn_font"); if (f && /^[a-z]+$/.test(f)) out.font = f;
      var l = localStorage.getItem("jpn_level"); if (l && /^[a-z][a-z0-9-]*$/i.test(l)) out.level = l;
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
      if (r.level && /^[a-z][a-z0-9-]*$/i.test(r.level)) { prefs.level = r.level; try { localStorage.setItem("jpn_level", r.level); } catch (e) {} }
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
  var LV_OLD = { b1: "Core", b2: "Intermediate", "c1-c2": "Advanced" };  // levels saved while the CEFR names were live
  function lvName(v) { if (!v || v === "single") return ""; var k = String(v).toLowerCase(); return LV_OLD[k] || k.charAt(0).toUpperCase() + k.slice(1); }
  function titleOf(slug) {
    if (titles && titles[slug]) return titles[slug].title;
    return slug.replace(/-/g, " ").replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; }
  }
  /* the time of day, in the reader's own time zone, to the minute */
  function fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function fmtStamp(iso) { return iso ? fmtDate(iso) + ", " + fmtTime(iso) : ""; }
  /* the exact moment, down to the second and with the time zone, for a tooltip */
  function fmtExact(iso) {
    try {
      return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
    } catch (e) { return ""; }
  }
  /* a sortable local date and time for the spreadsheets, 2026-10-27 14:32:07 */
  function csvStamp(iso) {
    if (!iso) return "";
    var d = new Date(iso); if (isNaN(d.getTime())) return "";
    function z(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes()) + ":" + z(d.getSeconds());
  }
  function ms(iso) { var t = Date.parse(iso); return isNaN(t) ? 0 : t; }
  /* a table cell with the date and, under it, the time; hover for the exact second and time zone */
  function stampTd(iso, none) {
    var td = el("td", "num t-stamp");
    if (!iso) { td.textContent = none || ""; return td; }
    td.appendChild(el("span", "t-date", fmtDate(iso)));
    td.appendChild(el("span", "t-time", fmtTime(iso)));
    td.title = fmtExact(iso);
    return td;
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
  /* A dictionary entry is a word or a short phrase, never a sentence. Highlights can run to
     90 characters, so anything longer or more sentence-shaped gets no look-up link: the
     dictionary would charge for an entry and then mark it as not standard English. Six words
     covers the long idioms ("kill two birds with one stone"); ordinary prose does not fit. */
  function isHeadword(s) {
    return window.JPNGloss ? window.JPNGloss.isHeadword(s) : false;
  }
  /* The dictionary's public, token-free gloss endpoint. Readers here have no
     dictionary account, so sending them to johnplusdictionary.com/w/<word> hit
     a "Sign in to look it up" wall whenever the word had no entry yet. This
     returns the definition instead, and writes the entry on a first miss, so
     the next reader gets it for nothing. The same headword test runs on the
     server, so a sentence can never be sent for generation. */
  /* Word look-ups live in gloss.js (shared with the highlighter). */
  var G = function () { return window.JPNGloss; };
  var defNodes = {};          // lower(word) -> [nodes on screen], for the prefetch
  /* Fill in every definition we already have the moment My words opens, so a
     reader does not wait on a request per word. This asks look-only, so it
     never generates and never charges however many words are saved. A word
     with no entry yet stays quiet and is created only if the reader opens it. */
  function prefetchGlosses(words) {
    if (!G()) return;
    G().preview(words, function (row) {
      if (row.gloss) paintGloss((row.input || "").toLowerCase(), row);
    });
  }
  /* Only asked for when the reader actually opens a word. */
  function loadGloss(word, node) {
    if (!G()) return;
    if (node.getAttribute("data-state")) return;    // already asked
    var k = word.toLowerCase();
    var have = G().cached(word);
    if (have) { paintGloss(k, have); return; }
    node.setAttribute("data-state", "loading");
    node.textContent = "Looking it up\u2026";
    G().lookup(word).then(function (row) {
      node.setAttribute("data-state", "done");
      node.textContent = "";
      if (!row || row.source === "failed") {
        node.appendChild(el("span", "wd-def-note", "Could not look that one up just now."));
        node.setAttribute("data-state", "");        // let them try again
        return;
      }
      if (row.source === "capped") {
        node.appendChild(el("span", "wd-def-note", row.notice ||
          "The daily limit for new words has been reached. Try again tomorrow."));
        node.setAttribute("data-state", "");
        return;
      }
      if (row.source === "not-headword" || !row.gloss) {
        node.appendChild(el("span", "wd-def-note", "No dictionary entry for that one."));
        return;
      }
      if (row.pos) node.appendChild(el("span", "wd-pos", row.pos));
      node.appendChild(el("span", "wd-gloss", row.gloss));
      if (row.standard === false) {
        node.appendChild(el("span", "wd-def-note", "Not standard English."));
      }
    }).catch(function () {
      node.setAttribute("data-state", "");          // transient; allow a retry
      node.textContent = "";
      node.appendChild(el("span", "wd-def-note", "Could not reach the dictionary just now."));
    });
  }
  function paintGloss(key, row) {
    (defNodes[key] || []).forEach(function (node) {
      if (node.getAttribute("data-state") === "done") return;
      node.setAttribute("data-state", "done");
      node.textContent = "";
      if (row.pos) node.appendChild(el("span", "wd-pos", row.pos));
      node.appendChild(el("span", "wd-gloss", row.gloss));
    });
  }
  /* Only asked for when the reader actually opens a word, so a long list costs
     nothing to draw. */
  function loadGloss(word, node) {
    if (node.getAttribute("data-state")) return;    // already asked
    node.setAttribute("data-state", "loading");
    node.textContent = "Looking it up…";
    glossRequest(word).then(function (row) {
      node.setAttribute("data-state", "done");
      node.textContent = "";
      if (!row || row.source === "failed") {
        node.appendChild(el("span", "wd-def-note", "Could not look that one up just now."));
        node.setAttribute("data-state", "");        // let them try again
        return;
      }
      if (row.source === "capped") {
        node.appendChild(el("span", "wd-def-note", row.notice ||
          "The daily limit for new words has been reached. Try again tomorrow."));
        node.setAttribute("data-state", "");
        return;
      }
      if (row.source === "not-headword" || !row.gloss) {
        node.appendChild(el("span", "wd-def-note", "No dictionary entry for that one."));
        return;
      }
      if (row.pos) node.appendChild(el("span", "wd-pos", row.pos));
      node.appendChild(el("span", "wd-gloss", row.gloss));
      if (row.standard === false) {
        node.appendChild(el("span", "wd-def-note", "Not standard English."));
      }
    }).catch(function () {
      node.setAttribute("data-state", "");          // transient; allow a retry
      node.textContent = "";
      node.appendChild(el("span", "wd-def-note", "Could not reach the dictionary just now."));
    });
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
    if (bootFailed) {
      showError("We could not reach your account just now. Check your connection and try again.",
                function () { bootFailed = false; init(); });
      return;
    }
    clear(root);
    ready();
    root.appendChild(el("p", "acct-note", text));
    var b = el("button", "acct-go", "Sign in"); b.type = "button"; b.addEventListener("click", function () { openDialog("signin"); });
    root.appendChild(b);
  }

  /* delete my account: removes the sign-in, the saved words, the progress and the preferences */
  function deletePanel() {
    var box = el("section", "acct-danger");
    box.appendChild(el("h2", "", "Your account"));
    var p = el("p", "", "You can delete your account whenever you like. This permanently removes your sign-in, your saved words, your look-ups, your progress and your preferences. It cannot be undone, so download your words first if you want to keep them.");
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
    showLoading("Loading your words", 4);
    Promise.all([loadTitles(), getAll("/rest/v1/news_words?select=id,slug,level,text,sentence,created_at&user_id=eq." + enc(me.id) + "&order=created_at.desc")]).then(function (res) {
      var rows = res[1], q = "";
      clear(root); ready();
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
        defNodes = {};                       // the old nodes just went away
        prefetchGlosses(rs.map(function (r) { return r.text; }));
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
            /* one compact row per word; the sentence and the controls stay folded away
               until the reader opens it, so a long list can be scanned at a glance */
            var d = el("details", "wd-item");
            if (q) d.open = true;                       // a search shows its matches in context
            var sum = document.createElement("summary");
            sum.appendChild(el("span", "wd-w", r.text));
            sum.appendChild(el("span", "wd-lv", lvName(r.level)));
            sum.appendChild(el("span", "wd-chev"));
            d.appendChild(sum);
            var body = el("div", "wd-body");
            if (r.sentence) body.appendChild(sentenceNode(r.sentence, r.text));
            /* The definition sits in the opened row itself. It is fetched when
               the row opens, not when the list draws. */
            if (isHeadword(r.text)) {
              var def = el("div", "wd-def");
              def.setAttribute("aria-live", "polite");
              body.appendChild(def);
              var dkey = r.text.toLowerCase();
              (defNodes[dkey] = defNodes[dkey] || []).push(def);
              var hit = window.JPNGloss && window.JPNGloss.cached(r.text);
              if (hit) {
                paintGloss(dkey, hit);                // already known, no wait
              } else {
                d.addEventListener("toggle", function () {
                  if (d.open) { loadGloss(r.text, def); recordLookup(r.slug, r.level, r.text); }
                });
                if (d.open) loadGloss(r.text, def);   // a search opens rows itself
              }
            }
            var acts = el("div", "wd-acts");
            var x = el("button", "wd-x", "Remove"); x.type = "button"; x.setAttribute("aria-label", "Remove " + r.text);
            x.addEventListener("click", function () {
              api("DELETE", "/rest/v1/news_words?id=eq." + r.id, { prefer: "return=minimal" }).then(function () {
                rows = rows.filter(function (z) { return z !== r; }); draw();
              }).catch(function (er) { toast(nice(er)); });
            });
            acts.appendChild(x);
            body.appendChild(acts);
            d.appendChild(body);
            li.appendChild(d);
            ul.appendChild(li);
          });
          sec.appendChild(ul); list.appendChild(sec);
        });
      }
      search.addEventListener("input", function () { q = search.value.trim().toLowerCase(); draw(); });
      cp.addEventListener("click", function () { copy(shown().map(function (r) { return r.text; }).join("\n"), cp); });
      dl.addEventListener("click", function () {
        download("my-words.csv", csv([["Word", "Sentence", "Article", "Level", "Saved"]].concat(shown().map(function (r) { return [r.text, r.sentence, titleOf(r.slug), lvName(r.level), fmtDate(r.created_at)]; }))));
      });
      draw();
    }).catch(function (er) { showError(nice(er), renderWords); });
  }

  function renderTeacher() {
    if (!me) { signInPrompt("Sign in to see the teacher view."); return; }
    if (me.role !== "teacher") { clear(root); root.appendChild(el("p", "acct-note", "This page is for the teacher.")); return; }
    showLoading("Loading the members", 6);
    /* last_seen_at only exists once supabase/add_last_seen.sql has been run; without it the page still works */
    var profileBase = "/rest/v1/news_profiles?select=id,email,display_name,role,created_at";
    function loadProfiles() {
      return getAll(profileBase + ",last_seen_at&order=created_at.asc").catch(function () { return getAll(profileBase + "&order=created_at.asc"); });
    }
    Promise.all([loadTitles(), loadProfiles(),
                 getAll("/rest/v1/news_words?select=user_id,slug,level,text,sentence,created_at&order=created_at.desc"),
                 getAll("/rest/v1/news_progress?select=user_id,slug,status,level,updated_at"),
                 /* news_lookups only exists once supabase/add_lookups.sql has been run */
                 getAll("/rest/v1/news_lookups?select=user_id,slug,level,word,created_at&order=created_at.desc").catch(function () { return null; })]).then(function (res) {
      var people = res[1].filter(function (p) { return p.role !== "teacher"; });
      var words = res[2], prog = res[3], looks = res[4];
      var byId = {}; people.forEach(function (p) { byId[p.id] = p; });
      words = words.filter(function (w) { return byId[w.user_id]; });
      prog = prog.filter(function (p) { return byId[p.user_id]; });
      var looksReady = looks !== null;
      looks = (looks || []).filter(function (l) { return byId[l.user_id]; });
      function nameOf(p) { return p.display_name || (p.email || "").split("@")[0] || "Member"; }
      var weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      function recent(iso) { return !!iso && new Date(iso).toISOString() >= weekAgo; }
      var info = people.map(function (p) {
        var ws = words.filter(function (w) { return w.user_id === p.id; });
        var pr = prog.filter(function (x) { return x.user_id === p.id; });
        /* the latest of: signing in, saving a word, opening or finishing an article */
        var stamps = ws.map(function (w) { return w.created_at; }).concat(pr.map(function (x) { return x.updated_at; }), looks.filter(function (l) { return l.user_id === p.id; }).slice(0, 1).map(function (l) { return l.created_at; }), [p.last_seen_at]);
        var best = 0; stamps.forEach(function (x) { if (x && ms(x) > best) best = ms(x); });
        return { p: p, ws: ws, pr: pr, done: pr.filter(function (x) { return x.status === "finished"; }).length, last: best ? new Date(best).toISOString() : "" };
      });
      clear(root); ready();

      /* the headline numbers */
      var active = info.filter(function (s) { return recent(s.last); }).length;
      var joined = people.filter(function (p) { return recent(p.created_at); }).length;
      var stats = el("div", "t-stats");
      [[people.length, people.length === 1 ? "member" : "members"], [active, "active this week"], [joined, "joined this week"],
       [prog.length, prog.length === 1 ? "article opened" : "articles opened"]].forEach(function (s) {
        var b = el("div", "t-stat"); b.appendChild(el("strong", "", String(s[0]))); b.appendChild(el("span", "", s[1])); stats.appendChild(b);
      });
      root.appendChild(stats);

      var tabs = el("div", "t-tabs"); tabs.setAttribute("role", "tablist");
      var panes = {}, btns = {};
      [["members", "Members"], ["words", "Words"], ["looks", "Look-ups"], ["reading", "Articles read"], ["articles", "Words by article"]].forEach(function (t) {
        var b = el("button", "t-tab", t[1]); b.type = "button"; b.setAttribute("role", "tab");
        b.addEventListener("click", function () { pick(t[0]); });
        tabs.appendChild(b); btns[t[0]] = b; panes[t[0]] = el("div", "t-pane");
      });
      function pick(k) { Object.keys(panes).forEach(function (n) { panes[n].hidden = n !== k; btns[n].setAttribute("aria-selected", n === k ? "true" : "false"); }); }
      var tools = el("div", "wd-bar");
      var dm = el("button", "wd-btn", "Download members (CSV)"); dm.type = "button";
      dm.addEventListener("click", function () {
        download("members.csv", csv([["Name", "Email", "Joined", "Last active", "Articles opened", "Articles finished", "Words saved"]].concat(info.map(function (s) {
          return [nameOf(s.p), s.p.email, csvStamp(s.p.created_at), csvStamp(s.last), s.pr.length, s.done, s.ws.length];
        }))));
      });
      var dl = el("button", "wd-btn", "Download all words (CSV)"); dl.type = "button";
      dl.addEventListener("click", function () {
        download("class-words.csv", csv([["Member", "Email", "Article", "Level", "Word", "Sentence", "Saved"]].concat(words.map(function (w) {
          var p = byId[w.user_id]; return [nameOf(p), p.email, titleOf(w.slug), lvName(w.level), w.text, w.sentence, csvStamp(w.created_at)];
        }))));
      });
      tools.appendChild(dm); tools.appendChild(dl);
      root.appendChild(tabs); root.appendChild(tools); root.appendChild(panes.members); root.appendChild(panes.words); root.appendChild(panes.looks); root.appendChild(panes.reading); root.appendChild(panes.articles);

      var showWordsFor = null;   // set by the Words table below; the Words figure on each member opens it

      /* members */
      if (!people.length) panes.members.appendChild(el("p", "acct-note", "Nobody has created an account yet."));
      else {
        var bar = el("div", "t-filter");
        var show = el("select"); show.setAttribute("aria-label", "Which members to show");
        [["all", "All members"], ["active", "Active this week"], ["new", "Joined this week"]].forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; show.appendChild(op); });
        var order = el("select"); order.setAttribute("aria-label", "Order");
        [["last", "Last active first"], ["joined", "Newest members first"], ["name", "By name"]].forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; order.appendChild(op); });
        var custom = el("option", "", ""); custom.value = "custom"; custom.disabled = true; order.appendChild(custom);
        var count = el("span", "t-count");
        bar.appendChild(show); bar.appendChild(order); bar.appendChild(count);
        panes.members.appendChild(bar);
        var tbl = el("table", "t-table t-members");
        /* Click a heading to sort by it, and again to turn it round. */
        var COLS = [["name", "Member"], ["joined", "Joined"], ["opened", "Opened"], ["finished", "Finished"], ["words", "Words"], ["last", "Last active"]];
        var sortKey = "last", sortDir = -1, ths = {};
        var head = el("tr");
        COLS.forEach(function (c, i) {
          var th = el("th", i ? "num" : ""); th.scope = "col";
          var b = el("button", "t-sort", c[1]); b.type = "button";
          b.addEventListener("click", function () {
            if (sortKey === c[0]) sortDir = -sortDir;
            else { sortKey = c[0]; sortDir = c[0] === "name" ? 1 : -1; }   // names run A to Z, everything else biggest or newest first
            draw();
          });
          th.appendChild(b); head.appendChild(th); ths[c[0]] = th;
        });
        var thead = el("thead"); thead.appendChild(head); tbl.appendChild(thead);
        var tb = el("tbody"); tbl.appendChild(tb); panes.members.appendChild(tbl);
        var none = el("p", "acct-small", "Nobody matches."); none.hidden = true; panes.members.appendChild(none);
        var stampCell = stampTd;
        info.forEach(function (s) {
          var tr = el("tr", "t-row");
          var td = el("td"); var nb = el("button", "t-name", nameOf(s.p)); nb.type = "button"; nb.setAttribute("aria-expanded", "false");
          td.appendChild(nb); td.appendChild(el("span", "t-mail", s.p.email || ""));
          tr.appendChild(td);
          tr.appendChild(stampCell(s.p.created_at, ""));
          tr.appendChild(el("td", "num", String(s.pr.length)));
          tr.appendChild(el("td", "num", String(s.done)));
          var wtd = el("td", "num");
          if (s.ws.length) {
            var wb = el("button", "t-link", String(s.ws.length)); wb.type = "button"; wb.title = "See " + nameOf(s.p) + "'s words";
            wb.addEventListener("click", function () { if (showWordsFor) showWordsFor(s.p.id); });
            wtd.appendChild(wb);
          } else wtd.textContent = "0";
          tr.appendChild(wtd);
          tr.appendChild(stampCell(s.last, "Never"));
          var dr = el("tr", "t-detail"); dr.hidden = true;
          var dc = el("td"); dc.colSpan = 6;
          dr.appendChild(dc);
          s.rows = [tr, dr];
          var built = false;
          function toggle() {
            var open = dr.hidden; dr.hidden = !open; nb.setAttribute("aria-expanded", open ? "true" : "false");
            if (open && !built) {
              built = true;
              dc.appendChild(el("h3", "t-sub", "Articles"));
              if (!s.pr.length) dc.appendChild(el("p", "acct-small", "No articles opened yet."));
              else {
                var ul = el("ul", "t-reads");
                s.pr.slice().sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; }).forEach(function (r) {
                  var li = el("li"); var a = el("a", "", titleOf(r.slug)); a.href = "/articles/" + r.slug + "/"; li.appendChild(a);
                  li.appendChild(el("span", "t-when", [r.status === "finished" ? "Finished" : "Opened", lvName(r.level), fmtStamp(r.updated_at)].filter(Boolean).join(" · ")));
                  ul.appendChild(li);
                });
                dc.appendChild(ul);
              }
              dc.appendChild(el("h3", "t-sub", "Saved words"));
              if (!s.ws.length) dc.appendChild(el("p", "acct-small", "No words saved yet."));
              groupBy(s.ws, "slug").forEach(function (g) {
                var h = el("h3"); var a = el("a", "", titleOf(g.key)); a.href = "/articles/" + g.key + "/"; h.appendChild(a); dc.appendChild(h);
                var wl = el("ul", "wd-words");
                g.rows.forEach(function (r) { var li = el("li"); li.appendChild(el("span", "wd-w", r.text)); if (r.sentence) li.appendChild(sentenceNode(r.sentence, r.text)); wl.appendChild(li); });
                dc.appendChild(wl);
              });
            }
          }
          nb.addEventListener("click", toggle);
        });
        var draw = function () {
          var list = info.filter(function (s) { return show.value === "active" ? recent(s.last) : show.value === "new" ? recent(s.p.created_at) : true; });
          function val(s, k) {
            return k === "name" ? nameOf(s.p) : k === "joined" ? ms(s.p.created_at) : k === "opened" ? s.pr.length
                 : k === "finished" ? s.done : k === "words" ? s.ws.length : ms(s.last);
          }
          list.sort(function (a, b) {
            var x = val(a, sortKey), y = val(b, sortKey), c = 0;
            if (sortKey === "name") c = String(x).localeCompare(String(y), undefined, { sensitivity: "base" });
            else c = x - y;
            if (c) return c * sortDir;
            /* ties: whoever was here most recently, then whoever joined most recently, then by name */
            return ms(b.last) - ms(a.last) || ms(b.p.created_at) - ms(a.p.created_at) || nameOf(a.p).localeCompare(nameOf(b.p));
          });
          COLS.forEach(function (c) { ths[c[0]].setAttribute("aria-sort", c[0] === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none"); });
          var preset = sortKey === "last" && sortDir < 0 ? "last" : sortKey === "joined" && sortDir < 0 ? "joined" : sortKey === "name" && sortDir > 0 ? "name" : "";
          if (preset) order.value = preset;
          else {
            var label = COLS.filter(function (c) { return c[0] === sortKey; })[0][1];
            custom.textContent = "Sorted by " + label.toLowerCase() + (sortKey === "name" ? (sortDir > 0 ? ", A to Z" : ", Z to A") : sortKey === "last" || sortKey === "joined" ? (sortDir > 0 ? ", oldest first" : ", newest first") : (sortDir > 0 ? ", fewest first" : ", most first"));
            order.value = "custom";
          }
          clear(tb);
          list.forEach(function (s) { tb.appendChild(s.rows[0]); tb.appendChild(s.rows[1]); });
          count.textContent = list.length + (list.length === 1 ? " member" : " members");
          tbl.hidden = !list.length; none.hidden = !!list.length;
        };
        show.addEventListener("change", draw);
        order.addEventListener("change", function () {
          var v = order.value;
          sortKey = v; sortDir = v === "name" ? 1 : -1;
          draw();
        });
        draw();
      }


      /* words: every saved word as a table to search, filter and sort, either one row per word or one row per save */
      (function () {
        var pane = panes.words;
        if (!words.length) { pane.appendChild(el("p", "acct-note", "No words have been saved yet.")); return; }
        var COLS = {
          word: [["text", "Word or phrase", "s"], ["members", "Members", "n"], ["saves", "Saves", "n"], ["articles", "Articles", "n"], ["levels", "Levels", "s"], ["last", "Last saved", "n"]],
          save: [["text", "Word or phrase", "s"], ["member", "Member", "s"], ["article", "Article", "s"], ["level", "Level", "s"], ["saved", "Saved", "n"]]
        };
        var st = { mode: "word", key: "members", dir: -1, shown: 100, level: "all", slug: "all", user: "all", q: "" };
        function opt(sel, value, text) { var o = el("option", "", text); o.value = value; sel.appendChild(o); }
        function box(label) { var x = el("select"); x.setAttribute("aria-label", label); return x; }
        function byText(a, b) { return a[1].localeCompare(b[1], undefined, { sensitivity: "base" }); }

        var bar = el("div", "t-filter");
        var q = el("input", "t-search"); q.type = "search"; q.autocomplete = "off"; q.placeholder = "Search words, sentences or members"; q.setAttribute("aria-label", "Search saved words");
        var viewSel = box("How to list the words"); opt(viewSel, "word", "One row per word"); opt(viewSel, "save", "One row per save");
        var lvSel = box("Level"); opt(lvSel, "all", "All levels");
        var haveLv = {}; words.forEach(function (w) { if (lvName(w.level)) haveLv[lvName(w.level)] = 1; });
        ["Core", "Intermediate", "Advanced"].concat(Object.keys(haveLv)).forEach(function (l, i, a) { if (haveLv[l] && a.indexOf(l) === i) opt(lvSel, l, l); });
        var artSel = box("Article"); opt(artSel, "all", "All articles");
        groupBy(words, "slug").map(function (g) { return [g.key, titleOf(g.key)]; }).sort(byText).forEach(function (a) { opt(artSel, a[0], a[1]); });
        var whoSel = box("Member"); opt(whoSel, "all", "All members");
        var seenWho = {}; words.forEach(function (w) { seenWho[w.user_id] = 1; });
        Object.keys(seenWho).map(function (id) { return [id, nameOf(byId[id])]; }).sort(byText).forEach(function (a) { opt(whoSel, a[0], a[1]); });
        var count = el("span", "t-count");
        [q, viewSel, lvSel, artSel, whoSel, count].forEach(function (n) { bar.appendChild(n); });
        pane.appendChild(bar);

        var wrap = el("div", "t-scroll");
        var tbl = el("table", "t-table t-words"); var thead = el("thead"); var tbody = el("tbody");
        tbl.appendChild(thead); tbl.appendChild(tbody); wrap.appendChild(tbl); pane.appendChild(wrap);
        var none = el("p", "acct-small", "No saved words match."); none.hidden = true; pane.appendChild(none);
        var more = el("button", "wd-btn", "Show more"); more.type = "button"; more.addEventListener("click", function () { st.shown += 100; draw(); });
        var dl2 = el("button", "wd-btn", "Download this table (CSV)"); dl2.type = "button";
        var foot = el("div", "wd-bar"); foot.appendChild(more); foot.appendChild(dl2); pane.appendChild(foot);

        function visible() {
          return words.filter(function (w) {
            if (st.level !== "all" && lvName(w.level) !== st.level) return false;
            if (st.slug !== "all" && w.slug !== st.slug) return false;
            if (st.user !== "all" && w.user_id !== st.user) return false;
            if (st.q && (w.text + " " + (w.sentence || "") + " " + nameOf(byId[w.user_id])).toLowerCase().indexOf(st.q) < 0) return false;
            return true;
          });
        }
        function rowsFor(list) {
          if (st.mode === "save") {
            return list.map(function (w) {
              return { w: w, v: { text: w.text.toLowerCase(), member: nameOf(byId[w.user_id]).toLowerCase(), article: titleOf(w.slug).toLowerCase(), level: lvName(w.level), saved: ms(w.created_at) } };
            });
          }
          var map = {}, out = [];
          list.forEach(function (w) {
            var k = w.text.toLowerCase().replace(/\s+/g, " ").trim(), g = map[k];
            if (!g) { g = map[k] = { w: w, who: {}, slugs: {}, lv: {}, saves: 0, last: 0 }; out.push(g); }
            g.who[w.user_id] = 1; g.slugs[w.slug] = 1; g.saves++;
            if (lvName(w.level)) g.lv[lvName(w.level)] = 1;
            var t = ms(w.created_at); if (t > g.last) { g.last = t; g.w = w; }
          });
          return out.map(function (g) {
            g.v = { text: g.w.text.toLowerCase(), members: Object.keys(g.who).length, saves: g.saves, articles: Object.keys(g.slugs).length, levels: Object.keys(g.lv).sort().join(", "), last: g.last };
            return g;
          });
        }
        function ordered(rows) {
          return rows.sort(function (a, b) {
            var x = a.v[st.key], y = b.v[st.key];
            var c = typeof x === "string" ? x.localeCompare(y, undefined, { sensitivity: "base" }) : x - y;
            if (c) return c * st.dir;
            if (st.mode === "word") return (b.v.members - a.v.members) || (b.v.saves - a.v.saves) || (b.v.last - a.v.last) || a.v.text.localeCompare(b.v.text);
            return (b.v.saved - a.v.saved) || a.v.text.localeCompare(b.v.text);
          });
        }
        function whoNames(g) {
          var n = Object.keys(g.who).map(function (id) { return nameOf(byId[id]); }).sort(function (a, b) { return a.localeCompare(b); });
          return n.slice(0, 3).join(", ") + (n.length > 3 ? " and " + (n.length - 3) + " more" : "");
        }
        function titlesOf(g) { return Object.keys(g.slugs).map(titleOf).sort().join("; "); }

        function draw() {
          var list = visible(), rows = ordered(rowsFor(list));
          clear(thead);
          var tr = el("tr");
          COLS[st.mode].forEach(function (c) {
            var th = el("th", c[2] === "n" ? "num" : ""); th.scope = "col";
            var b = el("button", "t-sort", c[1]); b.type = "button";
            b.addEventListener("click", function () {
              if (st.key === c[0]) st.dir = -st.dir; else { st.key = c[0]; st.dir = c[2] === "s" ? 1 : -1; }
              st.shown = 100; draw();
            });
            th.setAttribute("aria-sort", c[0] === st.key ? (st.dir > 0 ? "ascending" : "descending") : "none");
            th.appendChild(b); tr.appendChild(th);
          });
          thead.appendChild(tr);
          clear(tbody);
          rows.slice(0, st.shown).forEach(function (r) {
            var row = el("tr", "t-row"), td = el("td");
            td.appendChild(el("strong", "t-wd", r.w.text));
            if (st.mode === "word") {
              td.appendChild(el("span", "t-mail", whoNames(r)));
              row.appendChild(td);
              row.appendChild(el("td", "num", String(r.v.members)));
              row.appendChild(el("td", "num", String(r.v.saves)));
              var at = el("td", "num", String(r.v.articles)); at.title = titlesOf(r); row.appendChild(at);
              row.appendChild(el("td", "", r.v.levels));
              row.appendChild(stampTd(new Date(r.v.last).toISOString()));
            } else {
              if (r.w.sentence) td.appendChild(sentenceNode(r.w.sentence, r.w.text));
              row.appendChild(td);
              var p = byId[r.w.user_id], mt = el("td"); mt.appendChild(el("span", "t-who", nameOf(p))); mt.appendChild(el("span", "t-mail", p.email || "")); row.appendChild(mt);
              var ar = el("td"), a = el("a", "", titleOf(r.w.slug)); a.href = "/articles/" + r.w.slug + "/"; ar.appendChild(a); row.appendChild(ar);
              row.appendChild(el("td", "", lvName(r.w.level)));
              row.appendChild(stampTd(r.w.created_at));
            }
            tbody.appendChild(row);
          });
          count.textContent = st.mode === "word"
            ? rows.length + (rows.length === 1 ? " word" : " words") + " · " + list.length + (list.length === 1 ? " save" : " saves")
            : rows.length + (rows.length === 1 ? " save" : " saves");
          wrap.hidden = !rows.length; none.hidden = !!rows.length; foot.hidden = !rows.length;
          more.hidden = rows.length <= st.shown;
          more.textContent = "Show " + Math.min(100, rows.length - st.shown) + " more";
          dl2.onclick = function () {
            if (st.mode === "word") {
              download("words-by-word.csv", csv([["Word or phrase", "Members", "Saves", "Articles", "Levels", "Last saved"]].concat(rows.map(function (r) {
                return [r.w.text, r.v.members, r.v.saves, titlesOf(r), r.v.levels, csvStamp(new Date(r.v.last).toISOString())];
              }))));
            } else {
              download("words-every-save.csv", csv([["Word or phrase", "Sentence", "Member", "Email", "Article", "Level", "Saved"]].concat(rows.map(function (r) {
                var p = byId[r.w.user_id]; return [r.w.text, r.w.sentence, nameOf(p), p.email, titleOf(r.w.slug), lvName(r.w.level), csvStamp(r.w.created_at)];
              }))));
            }
          };
        }
        function reset() { st.shown = 100; draw(); }
        q.addEventListener("input", function () { st.q = q.value.trim().toLowerCase(); reset(); });
        lvSel.addEventListener("change", function () { st.level = lvSel.value; reset(); });
        artSel.addEventListener("change", function () { st.slug = artSel.value; reset(); });
        whoSel.addEventListener("change", function () { st.user = whoSel.value; reset(); });
        viewSel.addEventListener("change", function () {
          st.mode = viewSel.value;
          if (st.mode === "word") { st.key = "members"; st.dir = -1; } else { st.key = "saved"; st.dir = -1; }
          reset();
        });
        showWordsFor = function (id) {
          st.user = id; whoSel.value = id; st.mode = "save"; viewSel.value = "save"; st.key = "saved"; st.dir = -1;
          st.q = ""; q.value = ""; st.shown = 100; draw(); pick("words");
        };
        draw();
      })();

      /* look-ups: the words members opened a definition for, one row per word or one row per look-up */
      (function () {
        var pane = panes.looks;
        if (!looksReady) { pane.appendChild(el("p", "acct-note", "Look-ups are not being recorded yet. Run supabase/add_lookups.sql in Supabase to switch them on.")); return; }
        if (!looks.length) { pane.appendChild(el("p", "acct-note", "No look-ups have been recorded yet. They appear here once a member opens a definition.")); return; }
        var COLS = {
          word: [["text", "Word or phrase", "s"], ["members", "Members", "n"], ["times", "Look-ups", "n"], ["articles", "Articles", "n"], ["last", "Last looked up", "n"]],
          each: [["text", "Word or phrase", "s"], ["member", "Member", "s"], ["article", "Article", "s"], ["level", "Level", "s"], ["when", "When", "n"]]
        };
        var st = { mode: "word", key: "times", dir: -1, shown: 100, user: "all", q: "" };
        function opt(sel, value, text) { var o = el("option", "", text); o.value = value; sel.appendChild(o); }
        function box(label) { var x = el("select"); x.setAttribute("aria-label", label); return x; }
        var bar = el("div", "t-filter");
        var q = el("input", "t-search"); q.type = "search"; q.autocomplete = "off"; q.placeholder = "Search words or members"; q.setAttribute("aria-label", "Search look-ups");
        var viewSel = box("How to list the look-ups"); opt(viewSel, "word", "One row per word"); opt(viewSel, "each", "One row per look-up");
        var whoSel = box("Member"); opt(whoSel, "all", "All members");
        var seen = {}; looks.forEach(function (l) { seen[l.user_id] = 1; });
        Object.keys(seen).map(function (id) { return [id, nameOf(byId[id])]; }).sort(function (a, b) { return a[1].localeCompare(b[1], undefined, { sensitivity: "base" }); }).forEach(function (a) { opt(whoSel, a[0], a[1]); });
        var count = el("span", "t-count");
        [q, viewSel, whoSel, count].forEach(function (n) { bar.appendChild(n); });
        pane.appendChild(bar);
        var wrap = el("div", "t-scroll"), tbl = el("table", "t-table t-words"), thead = el("thead"), tbody = el("tbody");
        tbl.appendChild(thead); tbl.appendChild(tbody); wrap.appendChild(tbl); pane.appendChild(wrap);
        var more = el("button", "wd-btn", "Show more"); more.type = "button"; more.addEventListener("click", function () { st.shown += 100; draw(); });
        var dl3 = el("button", "wd-btn", "Download this table (CSV)"); dl3.type = "button";
        var foot = el("div", "wd-bar"); foot.appendChild(more); foot.appendChild(dl3); pane.appendChild(foot);
        function rowsFor() {
          var list = looks.filter(function (l) {
            if (st.user !== "all" && l.user_id !== st.user) return false;
            return !st.q || (l.word + " " + nameOf(byId[l.user_id])).toLowerCase().indexOf(st.q) >= 0;
          });
          if (st.mode === "each") return list.map(function (l) { return { l: l, v: { text: l.word.toLowerCase(), member: nameOf(byId[l.user_id]).toLowerCase(), article: titleOf(l.slug).toLowerCase(), level: lvName(l.level), when: ms(l.created_at) } }; });
          var map = {}, out = [];
          list.forEach(function (l) {
            var k = l.word.toLowerCase().replace(/\s+/g, " ").trim(), g = map[k];
            if (!g) { g = map[k] = { l: l, who: {}, slugs: {}, times: 0, last: 0 }; out.push(g); }
            g.who[l.user_id] = 1; g.slugs[l.slug] = 1; g.times++;
            var t = ms(l.created_at); if (t > g.last) g.last = t;
          });
          return out.map(function (g) { g.v = { text: g.l.word.toLowerCase(), members: Object.keys(g.who).length, times: g.times, articles: Object.keys(g.slugs).length, last: g.last }; return g; });
        }
        function draw() {
          var rows = rowsFor().sort(function (a, b) {
            var x = a.v[st.key], y = b.v[st.key];
            var c = typeof x === "string" ? x.localeCompare(y, undefined, { sensitivity: "base" }) : x - y;
            return c ? c * st.dir : a.v.text.localeCompare(b.v.text);
          });
          clear(thead); var tr = el("tr");
          COLS[st.mode].forEach(function (c) {
            var th = el("th", c[2] === "n" ? "num" : ""); th.scope = "col";
            var b = el("button", "t-sort", c[1]); b.type = "button";
            b.addEventListener("click", function () { if (st.key === c[0]) st.dir = -st.dir; else { st.key = c[0]; st.dir = c[2] === "s" ? 1 : -1; } st.shown = 100; draw(); });
            th.setAttribute("aria-sort", c[0] === st.key ? (st.dir > 0 ? "ascending" : "descending") : "none");
            th.appendChild(b); tr.appendChild(th);
          });
          thead.appendChild(tr); clear(tbody);
          rows.slice(0, st.shown).forEach(function (r) {
            var row = el("tr", "t-row");
            if (st.mode === "word") {
              var td = el("td"); td.appendChild(el("strong", "t-wd", r.l.word));
              td.appendChild(el("span", "t-mail", Object.keys(r.who).map(function (id) { return nameOf(byId[id]); }).sort().slice(0, 3).join(", ") + (Object.keys(r.who).length > 3 ? " and " + (Object.keys(r.who).length - 3) + " more" : "")));
              row.appendChild(td);
              row.appendChild(el("td", "num", String(r.v.members))); row.appendChild(el("td", "num", String(r.v.times)));
              var at = el("td", "num", String(r.v.articles)); at.title = Object.keys(r.slugs).map(titleOf).sort().join("; "); row.appendChild(at);
              row.appendChild(stampTd(new Date(r.v.last).toISOString()));
            } else {
              var t2 = el("td"); t2.appendChild(el("strong", "t-wd", r.l.word)); row.appendChild(t2);
              var p = byId[r.l.user_id], mt = el("td"); mt.appendChild(el("span", "t-who", nameOf(p))); mt.appendChild(el("span", "t-mail", p.email || "")); row.appendChild(mt);
              var ar = el("td"), a = el("a", "", titleOf(r.l.slug)); a.href = "/articles/" + r.l.slug + "/"; ar.appendChild(a); row.appendChild(ar);
              row.appendChild(el("td", "", lvName(r.l.level))); row.appendChild(stampTd(r.l.created_at));
            }
            tbody.appendChild(row);
          });
          count.textContent = st.mode === "word" ? rows.length + (rows.length === 1 ? " word" : " words") : rows.length + (rows.length === 1 ? " look-up" : " look-ups");
          wrap.hidden = !rows.length; foot.hidden = !rows.length; more.hidden = rows.length <= st.shown;
          more.textContent = "Show " + Math.min(100, rows.length - st.shown) + " more";
          dl3.onclick = function () {
            if (st.mode === "word") download("lookups-by-word.csv", csv([["Word or phrase", "Members", "Look-ups", "Articles", "Last looked up"]].concat(rows.map(function (r) { return [r.l.word, r.v.members, r.v.times, Object.keys(r.slugs).map(titleOf).sort().join("; "), csvStamp(new Date(r.v.last).toISOString())]; }))));
            else download("lookups-every.csv", csv([["Word or phrase", "Member", "Email", "Article", "Level", "When"]].concat(rows.map(function (r) { var p = byId[r.l.user_id]; return [r.l.word, nameOf(p), p.email, titleOf(r.l.slug), lvName(r.l.level), csvStamp(r.l.created_at)]; }))));
          };
        }
        function reset() { st.shown = 100; draw(); }
        q.addEventListener("input", function () { st.q = q.value.trim().toLowerCase(); reset(); });
        whoSel.addEventListener("change", function () { st.user = whoSel.value; reset(); });
        viewSel.addEventListener("change", function () { st.mode = viewSel.value; st.key = st.mode === "word" ? "times" : "when"; st.dir = -1; reset(); });
        draw();
      })();

      /* articles read: who opened and finished each article */
      if (!prog.length) panes.reading.appendChild(el("p", "acct-note", "No articles have been opened by members yet."));
      groupBy(prog, "slug").sort(function (a, b) { return b.rows.length - a.rows.length; }).forEach(function (g) {
        var fin = g.rows.filter(function (r) { return r.status === "finished"; }).length;
        var d = el("details", "t-art");
        var sm = el("summary"); sm.appendChild(el("span", "t-art-title", titleOf(g.key)));
        sm.appendChild(el("span", "t-art-n", g.rows.length + (g.rows.length === 1 ? " reader" : " readers") + " · " + fin + " finished"));
        d.appendChild(sm);
        var open = el("a", "t-open", "Open the article"); open.href = "/articles/" + g.key + "/"; d.appendChild(open);
        var ul = el("ul", "t-reads");
        g.rows.slice().sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; }).forEach(function (r) {
          var li = el("li"); li.appendChild(el("span", "t-who", nameOf(byId[r.user_id])));
          li.appendChild(el("span", "t-when", [r.status === "finished" ? "Finished" : "Opened", lvName(r.level), fmtStamp(r.updated_at)].filter(Boolean).join(" · ")));
          ul.appendChild(li);
        });
        d.appendChild(ul); panes.reading.appendChild(d);
      });

      /* words by article: which words members are saving */
      if (!words.length) panes.articles.appendChild(el("p", "acct-note", "No words have been saved yet."));
      groupBy(words, "slug").forEach(function (g) {
        var people_n = {}; g.rows.forEach(function (r) { people_n[r.user_id] = 1; });
        var d = el("details", "t-art");
        var sm = el("summary"); sm.appendChild(el("span", "t-art-title", titleOf(g.key)));
        sm.appendChild(el("span", "t-art-n", Object.keys(people_n).length + (Object.keys(people_n).length === 1 ? " member" : " members")));
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
          top.appendChild(el("span", "wd-w", w.text)); top.appendChild(el("span", "wd-lv", w.n + (w.n === 1 ? " member" : " members")));
          li.appendChild(top); if (w.sentence) li.appendChild(sentenceNode(w.sentence, w.text)); ul.appendChild(li);
        });
        d.appendChild(ul); panes.articles.appendChild(d);
      });
      pick("members");
    }).catch(function (er) { showError(nice(er), renderTeacher); });
  }

  function renderPage() {
    if (PAGE === "words") renderWords();
    else if (PAGE === "teacher") renderTeacher();
  }

  /* ================================================================= the free articles
     Anyone who is not signed in can open only the free articles (listed on /free/); the rest show a members panel instead of the text (CSS keys off the jpn-guest class). */
  function applyGate() {
    document.documentElement.classList.toggle("jpn-guest", !me);
    [].forEach.call(document.querySelectorAll(".gate-note, .lock-panel"), function (n) { n.parentNode.removeChild(n); });
    if (me) return;
    var gallery = document.querySelector(".gallery");
    if (gallery) {
      var all = gallery.querySelectorAll(".card").length, free = gallery.querySelectorAll(".card[data-free]").length;
      if (free < all) {
        var note = el("div", "gate-note");
        var p = el("p"); p.appendChild(el("strong", "", free ? free + " of these " + all + " articles " + (free === 1 ? "is" : "are") + " free to read." : "These articles are for members."));
        p.appendChild(document.createTextNode(" Create a free account to read them all."));
        var b = el("button", "acct-go", "Create a free account"); b.type = "button"; b.addEventListener("click", function () { openDialog("signup"); });
        var f = el("a", "more", "Read the free articles"); f.href = "/free/";
        note.appendChild(p); note.appendChild(b); note.appendChild(f);
        gallery.parentNode.insertBefore(note, gallery);
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
      var more = el("a", "more", "Read the free articles"); more.href = "/free/";
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
    if (PAGE === "words") showLoading("Loading your words", 4);
    else if (PAGE === "teacher") showLoading("Loading the members", 6);
    fromAddress().then(function (res) {
      var fresh = !!(res && !res.error);
      return start(fresh).then(function () {
        if (res && res.error) openDialog("signin", res.error);
        else if (res && res.type === "recovery") openDialog("reset", "Choose a new password for " + (me ? me.email : "your account") + ".");
        else if (res) toast("You are signed in.");
        else if (!me && !PAGE) nudge();
      });
    }).catch(function () { bootFailed = true; drawHeader(); renderPage(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
