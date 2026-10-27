"""The audio publisher: one page, every article in the order the site shows them, three recording
slots on each, one Publish button.

It only ever edits the `audio:` line inside a version block, so the article's words, questions,
pictures and settings cannot be altered or lost from here. Runs on its own port beside the other
two publishers.

    python3 tools/audio.py        then open http://127.0.0.1:8785
"""
import base64
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

import publish
from publish import UserError

PORT = 8785
LOCK = threading.Lock()
HEAD_KEYS = ("title", "summary", "audio", "voice", "language")
MAX_BODY = 90 * 1024 * 1024


def paths_by_slug():
    return {x[3]: x[0] for x in publish.article_files(publish.CONTENT)}


def row(a):
    levels = []
    for v in a["versions"]:
        rel = (v["audio"] or "").lstrip("/")
        timed = bool(rel) and (publish.STATIC / (rel.rsplit(".", 1)[0] + ".words.json")).is_file()
        levels.append({"level": v["level"], "audio": bool(rel), "timed": timed})
    return {"slug": a["slug"], "title": a["title"], "date": str(a["date"]), "levels": levels}


def listing():
    """Articles exactly as the site orders them: the gallery newest first, then the Teens
    collection in its own order."""
    arts = publish.build.load_articles(publish.CONTENT)
    adults = [a for a in arts if not a["teens"]]
    teens = sorted((a for a in arts if a["teens"]), key=lambda a: (a["order"] or 999, a["slug"]))
    st = publish.run(["git", "status", "--porcelain", "--", "content", "static/audio"])
    return {"main": [row(a) for a in adults], "teens": [row(a) for a in teens],
            "unpublished": len([l for l in st.stdout.splitlines() if l.strip()])}


def set_audio(path, level, rel):
    """Put `rel` on the audio line of one version block, or take the line out when rel is None.
    Nothing else in the file is touched."""
    text = path.read_text(encoding="utf-8")
    pat = re.compile(r"(^=== " + re.escape(level) + r" ===\n\n)(.*?)(?=^=== |\Z)", re.S | re.M)
    m = pat.search(text)
    if not m:
        raise UserError("That article has no {} version.".format(level))
    lines = m.group(2).split("\n")
    head = 0
    while head < len(lines) and re.match(r"^(" + "|".join(HEAD_KEYS) + r"): ", lines[head]):
        head += 1
    keep = [l for l in lines[:head] if not l.startswith("audio: ")]
    if rel:
        at = len(keep)
        for i, l in enumerate(keep):
            if l.startswith(("title: ", "summary: ")):
                at = i + 1
        keep.insert(at, "audio: " + rel)
    rest = lines[head:]
    if keep and not (rest and rest[0] == ""):
        rest = [""] + rest
    if not keep:
        while rest and rest[0] == "":
            rest = rest[1:]
    path.write_text(text[:m.start(2)] + "\n".join(keep + rest) + text[m.end(2):], encoding="utf-8")


def prune_audio():
    """Delete recordings and word timings that no article points at any more."""
    used = set()
    for path, meta, body, slug in publish.article_files(publish.CONTENT):
        try:
            for v in publish.build.parse_versions(meta, body):
                if v["audio"]:
                    used.add(Path(v["audio"]).name)
        except ValueError:
            return
    folder = publish.STATIC / "audio"
    if not folder.is_dir():
        return
    for f in list(folder.iterdir()):
        if f.suffix == ".m4a" and f.name not in used:
            f.unlink()
            f.with_suffix(".words.json").unlink(missing_ok=True)
        elif f.name.endswith(".words.json") and f.name[:-len(".words.json")] + ".m4a" not in used:
            f.unlink(missing_ok=True)


def level_of(name):
    level = {l.lower(): l for l in publish.build.LEVELS}.get(publish.one_line(name).lower())
    if not level:
        raise UserError("Unknown level.")
    return level


def upload(p):
    slug = publish.one_line(p.get("slug"))
    path = paths_by_slug().get(slug)
    if not path:
        raise UserError("That article no longer exists.")
    level = level_of(p.get("level"))
    try:
        raw = base64.b64decode(p.get("data") or "")
    except Exception:
        raise UserError("The recording could not be read.")
    if not raw:
        raise UserError("That file was empty.")
    rel = publish.make_audio(raw, p.get("name", "recording"), slug, level, publish.STATIC)
    set_audio(path, level, rel)
    note = publish.align_new_audio(slug, {level})
    timed = (publish.STATIC / (rel.rsplit(".", 1)[0] + ".words.json")).is_file()
    return {"ok": True, "audio": True, "timed": timed, "note": note}


def remove(p):
    slug = publish.one_line(p.get("slug"))
    path = paths_by_slug().get(slug)
    if not path:
        raise UserError("That article no longer exists.")
    set_audio(path, level_of(p.get("level")), None)
    return {"ok": True}


def publish_all(_p):
    prune_audio()
    publish.run_build()
    res = publish.git_publish("Update recordings")
    res["ok"] = True
    return res


PAGE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>johnplusnews audio</title>
<style>
:root{--ink:#111318;--muted:#5f6672;--line:#e6e8ec;--accent:#1d5fe0;--soft:#eef3fd;--ok:#0f7a55}
*{box-sizing:border-box}
body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#23262d;background:#fff}
header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:10px 20px}
.bar{display:flex;gap:14px;align-items:center;max-width:1040px;margin:0 auto}
.brand{font-weight:700;white-space:nowrap}.brand span{color:var(--accent)}
#q{flex:1;min-width:120px;padding:9px 12px;font:inherit;border:1px solid #cfd4dc;border-radius:9px}
button,.btn{font:inherit;font-weight:600;font-size:.8125rem;padding:7px 12px;border-radius:8px;border:1px solid var(--accent);background:#fff;color:var(--accent);cursor:pointer;white-space:nowrap}
button.main{background:var(--accent);color:#fff;font-size:.9rem;padding:9px 16px}
button:disabled{opacity:.45;cursor:default}
.count{color:var(--muted);font-size:.8125rem;white-space:nowrap}
#status{max-width:1040px;margin:12px auto 0;padding:11px 14px;border-radius:10px;background:var(--soft)}
#status.err{background:#fdeceb}
main{max-width:1040px;margin:0 auto;padding:6px 20px 80px}
h2{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:26px 0 6px}
.row{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,minmax(0,148px));gap:10px;align-items:center;padding:11px 0;border-bottom:1px solid var(--line)}
.t{min-width:0}.t b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis}
.t small{color:var(--muted)}
.slot{min-width:0}
.slot .lbl{display:block;font-size:.6875rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.slot .st{font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.slot .st.ok{color:var(--ok)}.slot .st.new{color:var(--accent);font-weight:600}.slot .st.gone{color:#b42318}
.acts{display:flex;gap:6px;margin-top:4px}
.acts button,.acts .btn{padding:3px 9px;font-size:.75rem}
.hide{display:none}
@media (max-width:720px){.row{grid-template-columns:1fr 1fr 1fr}.t{grid-column:1/-1}}
</style></head><body>
<header><div class="bar">
  <div class="brand">johnplus<span>news</span> audio</div>
  <input id="q" type="search" placeholder="Filter by title" autocomplete="off">
  <div class="count" id="count"></div>
  <button class="main" id="go" disabled>Publish</button>
</div></header>
<div id="status" hidden></div>
<main id="list"></main>
<script>
const $ = id => document.getElementById(id);
const LEVELS = ["Core", "Intermediate", "Advanced"];
let data = {main: [], teens: [], unpublished: 0}, pending = {}, gone = {}, busy = false;
const key = (s, l) => s + "|" + l;
function say(kind, html){ const s = $("status"); s.hidden = false; s.className = kind === "err" ? "err" : ""; s.innerHTML = html; }
async function api(path, body){
  const r = await fetch(path, {method: body ? "POST" : "GET", headers: {"Content-Type": "application/json"}, body: body ? JSON.stringify(body) : undefined});
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}
function slot(a, l){
  const k = key(a.slug, l.level);
  const box = document.createElement("div"); box.className = "slot"; box.id = "s-" + k;
  const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = l.level;
  const st = document.createElement("div"); st.className = "st";
  const acts = document.createElement("div"); acts.className = "acts";
  const pick = (text) => {
    const lab = document.createElement("label"); lab.className = "btn"; lab.textContent = text;
    const inp = document.createElement("input"); inp.type = "file"; inp.className = "hide";
    inp.accept = "audio/*,.m4a,.mp3,.wav,.aif,.aiff,.caf";
    inp.onchange = () => { const f = inp.files[0]; if (!f || busy) return;
      const fr = new FileReader();
      fr.onload = () => { pending[k] = {slug: a.slug, level: l.level, name: f.name, data: String(fr.result).split(",")[1]}; delete gone[k]; refresh(a, l); };
      fr.readAsDataURL(f); };
    lab.appendChild(inp); return lab;
  };
  const btn = (text, fn) => { const b = document.createElement("button"); b.textContent = text; b.onclick = fn; return b; };
  if (pending[k]) {
    st.className = "st new"; st.textContent = pending[k].name;
    acts.appendChild(btn("Undo", () => { delete pending[k]; refresh(a, l); }));
  } else if (gone[k]) {
    st.className = "st gone"; st.textContent = "Will be removed";
    acts.appendChild(btn("Undo", () => { delete gone[k]; refresh(a, l); }));
  } else if (l.audio) {
    st.className = "st ok"; st.textContent = l.timed ? "Recorded, timed" : "Recorded, not timed";
    acts.appendChild(pick("Replace"));
    acts.appendChild(btn("Remove", () => { gone[k] = true; refresh(a, l); }));
  } else {
    st.textContent = "None";
    acts.appendChild(pick("Add"));
  }
  box.append(lbl, st, acts); return box;
}
function refresh(a, l){ const old = $("s-" + key(a.slug, l.level)); if (old) old.replaceWith(slot(a, l)); tally(); }
function tally(){
  const n = Object.keys(pending).length + Object.keys(gone).length;
  $("count").textContent = n ? n + " change" + (n > 1 ? "s" : "") + " ready" : (data.unpublished ? "Unpublished changes on this Mac" : "");
  $("go").disabled = busy || !(n || data.unpublished);
}
function draw(){
  const t = $("q").value.trim().toLowerCase();
  const root = $("list"); root.innerHTML = "";
  [["Articles", data.main], ["Teens", data.teens]].forEach(([name, arts]) => {
    const rows = arts.filter(a => !t || a.title.toLowerCase().includes(t));
    if (!rows.length) return;
    const h = document.createElement("h2"); h.textContent = name; root.appendChild(h);
    rows.forEach(a => {
      const r = document.createElement("div"); r.className = "row";
      const tt = document.createElement("div"); tt.className = "t";
      const b = document.createElement("b"); b.textContent = a.title;
      const s = document.createElement("small"); s.textContent = a.date;
      tt.append(b, s); r.appendChild(tt);
      LEVELS.forEach(lv => { const l = a.levels.find(x => x.level === lv);
        if (l) r.appendChild(slot(a, l)); else r.appendChild(document.createElement("div")); });
      root.appendChild(r);
    });
  });
  tally();
}
async function load(){ data = await api("/api/list"); draw(); }
function mark(k, text){ const e = document.querySelector("#s-" + CSS.escape(k) + " .st"); if (e){ e.className = "st new"; e.textContent = text; } }
$("q").oninput = draw;
$("go").onclick = async () => {
  busy = true; tally();
  const notes = [], errors = [];
  try {
    for (const k of Object.keys(pending)) {
      const up = pending[k];
      mark(k, "Working, about 90 seconds...");
      try {
        const r = await api("/api/upload", up);
        if (r.note) notes.push(up.level + " of " + (data.main.concat(data.teens).find(a => a.slug === up.slug) || {}).title + ": " + r.note);
        delete pending[k];
      } catch (e) { errors.push((data.main.concat(data.teens).find(a => a.slug === up.slug) || {}).title + " " + up.level + ": " + e.message); mark(k, "Failed"); }
    }
    for (const k of Object.keys(gone)) {
      const [slug, level] = k.split("|");
      try { await api("/api/remove", {slug, level}); delete gone[k]; }
      catch (e) { errors.push(slug + " " + level + ": " + e.message); }
    }
    say("", "Publishing to the site...");
    const r = await api("/api/publish", {});
    say(errors.length ? "err" : "", (r.pushed ? "Published." : (r.note || "Saved on this Mac but not sent.")) +
        (notes.length ? "<br>" + notes.join("<br>") : "") + (errors.length ? "<br>" + errors.join("<br>") : ""));
  } catch (e) { say("err", e.message); }
  busy = false;
  await load();
};
load();
</script></body></html>
"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/list"):
            try:
                with LOCK:
                    return self.send_json(listing())
            except Exception as e:  # noqa: BLE001
                return self.send_json({"error": publish.mask(str(e))[:300]})
        body = PAGE.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        routes = {"/api/upload": upload, "/api/remove": remove, "/api/publish": publish_all}
        fn = routes.get(self.path.split("?")[0])
        if not fn:
            return self.send_json({"error": "Not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > MAX_BODY:
                raise UserError("That file is too big to send. Try a shorter recording.")
            payload = json.loads(self.rfile.read(n) or b"{}")
            with LOCK:
                return self.send_json(fn(payload))
        except UserError as e:
            return self.send_json({"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": publish.mask(str(e))[:300]})


def open_page(url):
    """Open the page in the default browser. `open` is what macOS itself uses, so try it first."""
    import subprocess
    import webbrowser
    try:
        if subprocess.run(["open", url], check=False).returncode == 0:
            return
    except OSError:
        pass
    webbrowser.open(url)


def main():
    url = "http://127.0.0.1:{}/".format(PORT)
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        # already running, probably from an earlier window: just show it rather than crashing
        print("The audio publisher is already running. Opening it again.", flush=True)
        open_page(url)
        return
    print("johnplusnews audio publisher is running at " + url, flush=True)
    print("Keep this window open while you work. Close it, or press Control-C, to stop.", flush=True)
    open_page(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
