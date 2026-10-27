"""The audio publisher: recordings and nothing else.

Pick an article, add or replace a recording for any of its levels, press Publish. It touches only
the `audio:` line inside each version block, so the article's words, questions, pictures and
settings cannot be altered or lost from here. Runs on its own port beside the other two
publishers.

    python3 tools/audio.py        then open http://127.0.0.1:8785
"""
import base64
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import publish
from publish import UserError

PORT = 8785
LOCK = threading.Lock()
HEAD_KEYS = ("title", "summary", "audio", "voice", "language")


def articles():
    out = []
    for path, meta, body, slug in publish.article_files(publish.CONTENT):
        try:
            versions = publish.build.parse_versions(meta, body)
        except ValueError:
            continue
        out.append({
            "slug": slug,
            "title": meta.get("title", slug),
            "date": str(meta.get("date", "")),
            "levels": [{"level": v["level"], "audio": v["audio"],
                        "timed": bool(v["audio"]) and (publish.STATIC / (v["audio"].rsplit(".", 1)[0] + ".words.json")).is_file()}
                       for v in versions],
        })
    out.sort(key=lambda a: (a["date"], a["title"]), reverse=True)
    return out


def set_audio(path, level, rel):
    """Put `rel` on the audio line of one version block, or take the line out when rel is None.
    Nothing else in the file is touched."""
    text = path.read_text(encoding="utf-8")
    pat = re.compile(r"(^=== " + re.escape(level) + r" ===\n\n)(.*?)(?=^=== |\Z)", re.S | re.M)
    m = pat.search(text)
    if not m:
        raise UserError("That article has no {} version.".format(level))
    block = m.group(2)
    lines = block.split("\n")
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
    new = "\n".join(keep + rest)
    path.write_text(text[:m.start(2)] + new + text[m.end(2):], encoding="utf-8")


def prune_audio():
    """Delete recordings and word timings no article points at any more."""
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
    for f in folder.iterdir():
        if f.suffix == ".m4a" and f.name not in used:
            f.unlink()
            f.with_suffix(".words.json").unlink(missing_ok=True)
        if f.name.endswith(".words.json") and f.name[:-len(".words.json")] + ".m4a" not in used:
            f.unlink(missing_ok=True)


def save(p):
    slug = publish.one_line(p.get("slug"))
    match = [x for x in publish.article_files(publish.CONTENT) if x[3] == slug]
    if not match:
        raise UserError("That article no longer exists.")
    path = match[0][0]
    if p.get("rev") and p["rev"] != publish.file_rev(path):
        raise UserError("That article changed on disk after this page was loaded. Reload and try again.")

    levels = {l.lower(): l for l in publish.build.LEVELS}
    added = set()
    for name, up in (p.get("uploads") or {}).items():
        level = levels.get(publish.one_line(name).lower())
        if not level or not isinstance(up, dict) or not up.get("data"):
            continue
        try:
            raw = base64.b64decode(up["data"])
        except Exception:
            raise UserError("The {} recording could not be read.".format(level))
        rel = publish.make_audio(raw, up.get("name", "recording"), slug, level, publish.STATIC)
        set_audio(path, level, rel)
        added.add(level)
    for name in (p.get("removes") or []):
        level = levels.get(publish.one_line(name).lower())
        if level:
            set_audio(path, level, None)

    prune_audio()
    note = publish.align_new_audio(slug, added)
    publish.run_build()
    res = publish.git_publish("Update recordings: " + match[0][1].get("title", slug))
    res.update({"ok": True, "slug": slug, "audio_note": note,
                "live_url": "{}/articles/{}/".format(publish.build.SITE["url"], slug)})
    return res


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>johnplusnews audio</title>
<style>
:root{--ink:#111318;--muted:#5f6672;--line:#e6e8ec;--accent:#1d5fe0;--soft:#eef3fd}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#23262d;background:#fff}
header{border-bottom:1px solid var(--line);padding:14px 20px;font-weight:700}
header span{color:var(--accent)}
.wrap{max-width:760px;margin:0 auto;padding:22px 20px 70px}
input[type=search]{width:100%;padding:11px 13px;font:inherit;border:1px solid #cfd4dc;border-radius:9px}
ul{list-style:none;margin:16px 0 0;padding:0}
li{border-bottom:1px solid var(--line)}
li button.pick{display:block;width:100%;text-align:left;padding:12px 2px;font:inherit;background:none;border:0;cursor:pointer}
li button.pick:hover{color:var(--accent)}
.meta{color:var(--muted);font-size:.8125rem}
.lv{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 12px}
.lv h3{margin:0 0 6px;font-size:1rem}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px}
button{font:inherit;font-weight:600;padding:9px 15px;border-radius:9px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
button.ghost{background:#fff;color:var(--accent)}
button:disabled{opacity:.5;cursor:default}
.status{margin-top:16px;padding:12px 14px;border-radius:10px;background:var(--soft)}
.status.err{background:#fdeceb}
a{color:var(--accent)}
</style></head><body>
<header>johnplus<span>news</span> &nbsp;audio</header>
<div class="wrap">
  <div id="list">
    <input type="search" id="q" placeholder="Search your articles" autocomplete="off">
    <ul id="rows"></ul>
  </div>
  <div id="one" hidden>
    <button class="ghost" id="back">&larr; All articles</button>
    <h2 id="title"></h2>
    <div id="levels"></div>
    <div class="row"><button id="save">Publish recordings</button></div>
  </div>
  <div class="status" id="status" hidden></div>
</div>
<script>
const $ = id => document.getElementById(id);
let all = [], cur = null, picked = {}, drop = {};
function say(kind, html){ const s=$("status"); s.hidden=false; s.className="status"+(kind==="err"?" err":""); s.innerHTML=html; }
async function api(path, body){
  const r = await fetch(path, {method: body?"POST":"GET", headers:{"Content-Type":"application/json"}, body: body?JSON.stringify(body):undefined});
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}
function draw(){
  const t = $("q").value.trim().toLowerCase();
  $("rows").innerHTML = "";
  all.filter(a => !t || a.title.toLowerCase().includes(t)).slice(0, 60).forEach(a => {
    const n = a.levels.filter(l => l.audio).length;
    const li = document.createElement("li");
    const b = document.createElement("button"); b.className = "pick";
    b.innerHTML = a.title + '<div class="meta">' + a.date + (n ? " &middot; " + n + " recording" + (n>1?"s":"") : "") + "</div>";
    b.onclick = () => open_(a.slug);
    li.appendChild(b); $("rows").appendChild(li);
  });
}
async function open_(slug){
  cur = await api("/api/one?slug=" + encodeURIComponent(slug));
  picked = {}; drop = {};
  $("list").hidden = true; $("one").hidden = false; $("status").hidden = true;
  $("title").textContent = cur.title;
  $("levels").innerHTML = "";
  cur.levels.forEach(l => {
    const d = document.createElement("div"); d.className = "lv";
    d.innerHTML = "<h3>" + l.level + "</h3><div class='meta' id='st-"+l.level+"'></div>" +
      "<div class='row'><input type='file' id='f-"+l.level+"' accept='audio/*,.m4a,.mp3,.wav,.aif,.aiff,.caf'>" +
      "<button class='ghost' id='x-"+l.level+"'>Remove</button></div>";
    $("levels").appendChild(d);
    $("f-"+l.level).onchange = e => { const f = e.target.files[0]; if(!f) return;
      const fr = new FileReader(); fr.onload = () => { picked[l.level] = {name: f.name, data: String(fr.result).split(",")[1]}; drop[l.level]=false; state(l); }; fr.readAsDataURL(f); };
    $("x-"+l.level).onclick = () => { if (picked[l.level]) { delete picked[l.level]; $("f-"+l.level).value=""; } else if (l.audio) drop[l.level]=true; state(l); };
    state(l);
  });
}
function state(l){
  const s = $("st-"+l.level);
  const x = $("x-"+l.level);
  if (picked[l.level]) { s.textContent = "New file chosen: " + picked[l.level].name; x.hidden = false; x.textContent = "Undo"; }
  else if (drop[l.level]) { s.textContent = "The recording will be removed when you publish."; x.hidden = true; }
  else if (l.audio) { s.textContent = "Has a recording" + (l.timed ? ", words timed" : ", words not timed"); x.hidden = false; x.textContent = "Remove"; }
  else { s.textContent = "No recording"; x.hidden = true; }
}
$("q").oninput = draw;
$("back").onclick = () => { $("one").hidden = true; $("list").hidden = false; $("status").hidden = true; load(); };
$("save").onclick = async () => {
  const removes = Object.keys(drop).filter(k => drop[k]);
  if (!Object.keys(picked).length && !removes.length) return say("err", "Choose a recording first.");
  $("save").disabled = true;
  say("", "Publishing. Timing the words takes about a minute and a half for each new recording.");
  try {
    const r = await api("/api/save", {slug: cur.slug, rev: cur.rev, uploads: picked, removes: removes});
    say("", (r.pushed ? "Published." : (r.note || "Saved here but not sent.")) +
        (r.audio_note ? "<br>" + r.audio_note : "") +
        '<br><a href="' + r.live_url + '" target="_blank">View the live article</a>');
    picked = {}; drop = {};
    cur = await api("/api/one?slug=" + encodeURIComponent(cur.slug));
    cur.levels.forEach(state);
  } catch (e) { say("err", e.message); }
  $("save").disabled = false;
};
async function load(){ all = (await api("/api/list")).articles; draw(); }
load();
</script></body></html>"""


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
            return self.send_json({"articles": articles()})
        if self.path.startswith("/api/one"):
            slug = self.path.split("slug=", 1)[1] if "slug=" in self.path else ""
            from urllib.parse import unquote
            slug = unquote(slug)
            match = [a for a in articles() if a["slug"] == slug]
            if not match:
                return self.send_json({"error": "No such article."}, 404)
            path = [x[0] for x in publish.article_files(publish.CONTENT) if x[3] == slug][0]
            out = dict(match[0], rev=publish.file_rev(path))
            return self.send_json(out)
        body = PAGE.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/save":
            return self.send_json({"error": "Not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > 90 * 1024 * 1024:
                raise UserError("That is too much to send at once. Publish one level at a time.")
            payload = json.loads(self.rfile.read(n) or b"{}")
            with LOCK:
                return self.send_json(save(payload))
        except UserError as e:
            return self.send_json({"error": str(e)}, 200)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": publish.mask(str(e))[:300]}, 200)


def main():
    import webbrowser
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = "http://127.0.0.1:{}/".format(PORT)
    print("johnplusnews audio publisher: " + url)
    print("Press Control-C to stop.")
    webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
