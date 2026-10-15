#!/usr/bin/env python3
"""Local publisher for johnplusnews.

Run it with the "Publish an article.command" file, or:  python3 tools/publish.py

It opens a page in your browser where you paste an article and choose a picture.
Preview builds a throwaway copy of the site. Publish saves the article, rebuilds
the site, commits and pushes it to GitHub. Nothing here talks to anything except
your own Mac, GitHub (through git) and johnplusnews.com (to confirm it is live).
"""
import base64
import datetime as dt
import functools
import hashlib
import http.server
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402

CONTENT, STATIC, DOCS = build.CONTENT, build.STATIC, build.OUT
PAGE = (Path(__file__).resolve().parent / "publish.html").read_text(encoding="utf-8")
PORT, PREVIEW_PORT = 8765, 8766
TOKEN = secrets.token_urlsafe(16)
LOCK = threading.Lock()
STATE = {"preview": None, "tmp": None}
DRY_RUN = os.environ.get("JPN_DRY_RUN") == "1"
MAX_BODY = 90 * 1024 * 1024
GENERATED = re.compile(r"-[0-9a-f]{6}\.jpg$")  # only pictures made by this program are ever pruned
GENERATED_AUDIO = re.compile(r"-[0-9a-f]{6}\.m4a$")  # and only recordings made by this program


class UserError(Exception):
    """A problem the person at the form can fix; the message is shown to them."""


# ------------------------------------------------------------------- helpers

def one_line(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def slugify(title):
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60].strip("-")
    return s or "article"


def mask(text):
    text = re.sub(r"(ghp_|github_pat_|nfp_)[A-Za-z0-9_]+", "***", text)
    return re.sub(r"(https://[^:/@\s]+:)[^@\s]+@", r"\1***@", text)


def run(cmd, **kw):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    return subprocess.run(cmd, cwd=kw.pop("cwd", ROOT), env=env, capture_output=True, text=True, timeout=180, **kw)


def file_rev(path):
    """A short fingerprint of an article file, so a form that was opened earlier cannot overwrite a newer version."""
    return hashlib.sha1(path.read_bytes()).hexdigest()[:12]


def article_files(content_dir):
    out = []
    for path in sorted(content_dir.glob("*.md")):
        try:
            meta, body = build.split_article(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        out.append((path, meta, body, re.sub(r"^\d{4}-\d{2}-\d{2}-", "", path.stem)))
    return out


def split_source(value):
    if not value:
        return "", ""
    if "|" in value:
        name, url = [b.strip() for b in value.split("|", 1)]
        return name, url
    return ("", value) if value.startswith("http") else (value, "")


# ------------------------------------------------------------------- listing

def list_articles():
    rows = []
    for path, meta, body, slug in article_files(CONTENT):
        try:
            levels = [lv for lv, _ in build.split_versions(meta, body)]
        except ValueError:
            levels = []
        rows.append({
            "slug": slug, "title": meta.get("title", slug), "date": meta.get("date", ""),
            "levels": levels, "image": meta.get("image", ""), "tags": [t["label"] for t in build.parse_tags(meta.get("tags", ""))],
            "draft": meta.get("draft", "").lower() in ("yes", "true", "1"),
            "live_url": "{}/articles/{}/".format(build.SITE["url"], slug),
        })
    rows.sort(key=lambda r: (r["date"], r["slug"]), reverse=True)
    return rows


def get_article(slug):
    for path, meta, body, s in article_files(CONTENT):
        if s == slug:
            name, url = split_source(meta.get("source", ""))
            try:
                parsed = build.parse_versions(meta, body)
            except ValueError as e:
                raise UserError("That article could not be opened: " + str(e))
            versions = {v["level"]: v["text"] for v in parsed}
            sets = build.split_sections(body)[1]
            overrides = {v["level"]: {"title": v["title"], "summary": v["summary"]} for v in parsed}
            audio = {v["level"]: v["audio"] for v in parsed if v["audio"]}
            voices = {v["level"]: v["voice"] for v in parsed if v["audio"]}
            return {"slug": slug, "rev": file_rev(path), "title": meta.get("title", ""), "date": meta.get("date", ""),
                    "tags": [t["label"] for t in build.parse_tags(meta.get("tags", ""))],
                    "versions": versions, "overrides": overrides, "audio": audio, "voices": voices, "summary": meta.get("summary", ""),
                    "before": "\n".join(sets["before"]), "after": "\n".join(sets["after"]),
                    "source_name": name, "source_url": url, "image": meta.get("image", ""),
                    "image_alt": meta.get("image-alt", ""),
                    "image_credit": meta.get("image-credit", ""), "image_credit_url": meta.get("image-credit-url", ""),
                    "image_licence": meta.get("image-licence", ""), "image_licence_url": meta.get("image-licence-url", ""),
                    "image_credit_note": meta.get("image-credit-note", ""),
                    "image_credit_label": meta.get("image-credit-label", "")}
    raise UserError("That article was not found.")


# ------------------------------------------------------------------ pictures

def make_pictures(data, filename, base):
    """Save a 1400px picture and a 700px thumbnail as JPEGs. Returns the header path (images/<name>.jpg)."""
    if not shutil.which("sips"):
        raise UserError("This program needs the Mac picture tool (sips) to resize pictures.")
    work = Path(tempfile.mkdtemp(prefix="jpn-img-"))
    try:
        src = work / ("source" + (Path(filename).suffix.lower()[:8] or ".img"))
        src.write_bytes(data)
        probe = run(["sips", "-g", "pixelWidth", str(src)])
        m = re.search(r"pixelWidth:\s*(\d+)", probe.stdout)
        if probe.returncode != 0 or not m:
            raise UserError("That picture could not be read. Try a JPG or PNG.")
        width = int(m.group(1))
        name = "{}-{}.jpg".format(base, hashlib.sha1(data).hexdigest()[:6])
        for folder, max_w, quality in (("images", 1400, "80"), ("images/thumbs", 700, "76")):
            dest = STATIC_TARGET["dir"] / folder / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            cmd = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", quality]
            if width > max_w:
                cmd += ["--resampleWidth", str(max_w)]
            r = run(cmd + [str(src), "--out", str(dest)])
            if r.returncode != 0 or not dest.exists():
                raise UserError("That picture could not be converted. Try a JPG or PNG.")
        return "images/" + name
    finally:
        shutil.rmtree(work, ignore_errors=True)


STATIC_TARGET = {"dir": STATIC}


def make_audio(data, filename, base, level, static_dir):
    """Turn an uploaded recording (m4a, mp3, wav, aiff...) into a small mono AAC .m4a under static/audio.
    Returns the path used in the article ('audio/<name>.m4a')."""
    if not shutil.which("afconvert"):
        raise UserError("This program needs the Mac audio tool (afconvert) to prepare recordings.")
    work = Path(tempfile.mkdtemp(prefix="jpn-audio-"))
    try:
        suffix = re.sub(r"[^a-z0-9.]", "", Path(filename).suffix.lower())[:8] or ".audio"
        src = work / ("source" + suffix)
        src.write_bytes(data)
        name = "{}-{}-{}.m4a".format(base, level.lower(), hashlib.sha1(data).hexdigest()[:6])
        dest = static_dir / "audio" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        out = work / "out.m4a"
        r = run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", "-c", "1", str(src), str(out)])
        if r.returncode != 0 or not out.exists() or out.stat().st_size < 1000:
            raise UserError("The {} recording could not be read. Use an m4a, mp3, wav or aiff file (a Voice Memos or QuickTime recording works).".format(level))
        shutil.copy2(out, dest)
        return "audio/" + name
    finally:
        shutil.rmtree(work, ignore_errors=True)


def prune_pictures(content_dir, static_dir):
    """Delete pictures and recordings this program made that no article uses any more."""
    used_audio = set()
    for _, meta, body, _ in article_files(content_dir):
        try:
            used_audio.update(Path(v["audio"]).name for v in build.parse_versions(meta, body) if v["audio"])
        except ValueError:
            used_audio = None
            break
    d = static_dir / "audio"
    if used_audio is not None and d.is_dir():
        for f in d.iterdir():
            if f.is_file() and GENERATED_AUDIO.search(f.name) and f.name not in used_audio:
                f.unlink()
    used = {Path(meta.get("image", "")).name for _, meta, _, _ in article_files(content_dir) if meta.get("image")}
    for folder in ("images", "images/thumbs"):
        d = static_dir / folder
        if d.is_dir():
            for f in d.iterdir():
                if f.is_file() and GENERATED.search(f.name) and f.name not in used:
                    f.unlink()


# ------------------------------------------------------------------ writing

def compose(f):
    lines = ["title: " + f["title"], "date: " + f["date"]]
    if f["summary"]:
        lines.append("summary: " + f["summary"])
    if f["tags"]:
        lines.append("tags: " + ", ".join(f["tags"]))
    if f["source_name"] and f["source_url"]:
        lines.append("source: {} | {}".format(f["source_name"], f["source_url"]))
    elif f["source_url"]:
        lines.append("source: " + f["source_url"])
    elif f["source_name"]:
        lines.append("source: " + f["source_name"])
    if f["image"]:
        lines.append("image: " + f["image"])
        if f["image_alt"]:
            lines.append("image-alt: " + f["image_alt"])
        for key, name in (("image_credit", "image-credit"), ("image_credit_url", "image-credit-url"),
                          ("image_licence", "image-licence"), ("image_licence_url", "image-licence-url"),
                          ("image_credit_note", "image-credit-note"), ("image_credit_label", "image-credit-label")):
            if f[key]:
                lines.append("{}: {}".format(name, f[key]))
    blocks = []
    for v in f["versions"]:
        head = "".join("{}: {}\n".format(k, v[k]) for k in ("title", "summary", "audio", "voice") if v.get(k))
        blocks.append("=== {} ===\n\n{}{}{}".format(v["level"], head, "\n" if head else "", v["text"]))
    for key, label in build.QUESTION_SETS:
        if f[key]:
            blocks.append("=== {} ===\n\n{}".format(label, "\n".join("- " + q for q in f[key])))
    body = "\n\n".join(blocks)
    return "\n".join(lines) + "\n---\n" + body + "\n"


def known_tags(content_dir):
    """The spelling already used for each tag, so 'technology' and 'Technology' never become two topics."""
    counts = {}
    for _, meta, _, _ in article_files(content_dir):
        for t in build.parse_tags(meta.get("tags", "")):
            counts.setdefault(t["slug"], {}).setdefault(t["label"], 0)
            counts[t["slug"]][t["label"]] += 1
    return {slug: sorted(v.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] for slug, v in counts.items()}


def clean_tags(raw, content_dir):
    items = raw if isinstance(raw, list) else str(raw or "").split(",")
    known = known_tags(content_dir)
    out, seen = [], set()
    for item in items:
        for piece in str(item).split(","):
            label = one_line(piece)
            if not label:
                continue
            slug = build.tag_slug(label)
            if not slug:
                raise UserError("The tag '{}' needs some letters or numbers.".format(label))
            if slug in seen:
                continue
            if len(label) > 30:
                raise UserError("Tags should be short. '{}...' is too long (30 characters at most).".format(label[:20]))
            seen.add(slug)
            out.append(known.get(slug) or (label[:1].upper() + label[1:]))
    if len(out) > 8:
        raise UserError("Use 8 tags or fewer.")
    return out


def clean_fields(p, content_dir=None):
    f = {
        "title": one_line(p.get("title")), "date": one_line(p.get("date")),
        "summary": one_line(p.get("summary")), "source_name": one_line(p.get("source_name")),
        "source_url": one_line(p.get("source_url")), "image_alt": one_line(p.get("image_alt")),
        "image_credit": one_line(p.get("image_credit")), "image_credit_url": one_line(p.get("image_credit_url")),
        "image_licence": one_line(p.get("image_licence")), "image_licence_url": one_line(p.get("image_licence_url")),
        "image_credit_note": one_line(p.get("image_credit_note")), "image_credit_label": one_line(p.get("image_credit_label")),
    }
    if not f["title"]:
        raise UserError("Add a title.")
    f["tags"] = clean_tags(p.get("tags"), content_dir or CONTENT)
    for key, label in build.QUESTION_SETS:
        qs = [one_line(q) for q in build.clean_questions((p.get(key) or "").replace("\r\n", "\n").replace("\r", "\n"))]
        if len(qs) > 12:
            raise UserError("'{}' has {} questions. Keep it to 12 or fewer.".format(label, len(qs)))
        if any(q.startswith("===") for q in qs):
            raise UserError("A question in '{}' starts with ===. Please reword it.".format(label))
        f[key] = qs
    levels = {l.lower(): l for l in build.LEVELS}
    found = {}
    own = {}
    voices = {}
    for name, label in (p.get("voices") or {}).items():
        level = levels.get(one_line(name).lower())
        if level:
            voices[level] = one_line(label)[:60]
    uploads = {}
    for name, up in (p.get("audio") or {}).items():
        level = levels.get(one_line(name).lower())
        if level and isinstance(up, dict) and up.get("data"):
            uploads[level] = up
    removes = {levels.get(one_line(n).lower()) for n, on in (p.get("audio_remove") or {}).items() if on}
    for name, extra in (p.get("overrides") or {}).items():
        level = levels.get(one_line(name).lower())
        if level and isinstance(extra, dict):
            own[level] = {"title": one_line(extra.get("title")), "summary": one_line(extra.get("summary"))}
    for name, text in (p.get("versions") or {}).items():
        level = levels.get(one_line(name).lower())
        if not level:
            raise UserError("Unknown level: " + one_line(name) + ". Use " + ", ".join(build.LEVELS) + ".")
        t = (text or "").replace("\r\n", "\n").replace("\r", "\n")
        t = "\n".join(line.rstrip() for line in t.split("\n"))
        t = re.sub(r"\n{3,}", "\n\n", t).strip()
        if not t:
            raise UserError("Paste the {} text, or untick that level.".format(level))
        if build.ANY_MARK.search(t):
            raise UserError("The {} text contains a line like === Advanced ===. Please remove that line.".format(level))
        if build.HEAD_LINE.match(t.split("\n")[0]):
            raise UserError("The first line of the {} text starts with 'title:', 'summary:', 'audio:' or 'voice:', which the site would read as a setting. Please reword it.".format(level))
        found[level] = t
    if not found:
        raise UserError("Tick at least one level and paste the article text.")
    f["versions"] = []
    for level in build.LEVELS:
        if level in found:
            mine = own.get(level, {"title": "", "summary": ""})
            f["versions"].append({
                "level": level, "text": found[level],
                "title": "" if mine["title"] == f["title"] else mine["title"],
                "summary": "" if mine["summary"] == f["summary"] else mine["summary"],
                "audio": "", "voice": voices.get(level, ""),
            })
    f["_uploads"] = {lv: up for lv, up in uploads.items() if lv in found}
    f["_removes"] = {lv for lv in removes if lv in found}
    try:
        dt.date.fromisoformat(f["date"])
    except ValueError:
        raise UserError("Choose a date.")
    if f["source_url"] and not re.match(r"https?://\S+$", f["source_url"]):
        raise UserError("The source link must start with http:// or https://")
    if f["source_name"] and "|" in f["source_name"]:
        raise UserError("Please remove the | character from the source name.")
    if f["image_credit_url"] and not re.match(r"https?://\S+$", f["image_credit_url"]):
        raise UserError("The picture credit link must start with http:// or https://")
    if f["image_credit_url"] and not f["image_credit"]:
        raise UserError("Add the name for the picture credit, or clear its link.")
    if f["image_licence_url"] and not re.match(r"https?://\S+$", f["image_licence_url"]):
        raise UserError("The licence link must start with http:// or https://")
    if len(f["image_credit_label"]) > 30 or ":" in f["image_credit_label"]:
        raise UserError("The credit label should be one or two short words with no colon, for example Photo or Image.")
    if f["image_licence_url"] and not f["image_licence"]:
        raise UserError("Add the licence name (for example CC BY-SA 4.0), or clear its link.")
    return f


def prepare(p, content_dir, static_dir):
    """Write the article (and its pictures) into the given folders. Returns (slug, title)."""
    f = clean_fields(p, content_dir)
    existing = p.get("slug")
    old = {}
    old_audio = {}
    if existing:
        match = [x for x in article_files(content_dir) if x[3] == existing]
        if not match:
            raise UserError("The article you are editing no longer exists.")
        path, old, slug = match[0][0], match[0][1], existing
        if p.get("rev") and p["rev"] != file_rev(path):
            raise UserError("This article was changed outside the publisher after you opened it (for example by Claude, or in another publisher window), so nothing was saved. "
                            "Press Edit on the article again to load the latest version, then make your change again.")
        try:
            old_audio = {v["level"]: v["audio"] for v in build.parse_versions(match[0][1], match[0][2]) if v["audio"]}
        except ValueError:
            old_audio = {}
    else:
        slug = slugify(f["title"])
        taken = {x[3] for x in article_files(content_dir)}
        n = 2
        while slug in taken:
            slug = "{}-{}".format(slugify(f["title"]), n)
            n += 1
        path = content_dir / "{}-{}.md".format(f["date"], slug)

    image = old.get("image", "")
    if p.get("remove_image"):
        image = ""
    new_pic = p.get("image")
    if new_pic and new_pic.get("data"):
        try:
            data = base64.b64decode(new_pic["data"])
        except Exception:
            raise UserError("That picture could not be read.")
        STATIC_TARGET["dir"] = static_dir
        image = make_pictures(data, new_pic.get("name", "picture"), slug)
    f["image"] = image
    if not image:  # a credit only makes sense with a picture
        for key in ("image_credit", "image_credit_url", "image_licence", "image_licence_url", "image_credit_note", "image_credit_label", "image_alt"):
            f[key] = ""
    for v in f["versions"]:
        level = v["level"]
        up = f["_uploads"].get(level)
        if up:
            try:
                raw = base64.b64decode(up["data"])
            except Exception:
                raise UserError("The {} recording could not be read.".format(level))
            v["audio"] = make_audio(raw, up.get("name", "recording"), slug, level, static_dir)
        elif level in f["_removes"]:
            v["audio"] = ""
        else:
            v["audio"] = old_audio.get(level, "")
        if not v["audio"]:
            v["voice"] = ""
    path.write_text(compose(f), encoding="utf-8")
    prune_pictures(content_dir, static_dir)
    return slug, f["title"]


# ------------------------------------------------------------------ building

def run_build(content_dir=None, static_dir=None, out_dir=None):
    cmd = [sys.executable, str(ROOT / "build.py")]
    if content_dir:
        cmd += ["--content", str(content_dir), "--static", str(static_dir), "--out", str(out_dir)]
    r = run(cmd)
    if r.returncode != 0:
        msg = (r.stderr or r.stdout).strip().splitlines()
        raise UserError("The site could not be built: " + (msg[-1] if msg else "unknown error"))


def do_preview(p):
    with LOCK:
        tmp = Path(tempfile.mkdtemp(prefix="jpn-preview-"))
        try:
            shutil.copytree(CONTENT, tmp / "content")
            shutil.copytree(STATIC, tmp / "static")
            slug, title = prepare(p, tmp / "content", tmp / "static")
            run_build(tmp / "content", tmp / "static", tmp / "site")
        except BaseException:
            shutil.rmtree(tmp, ignore_errors=True)
            raise
        finally:
            STATIC_TARGET["dir"] = STATIC
        if STATE["tmp"]:
            shutil.rmtree(STATE["tmp"], ignore_errors=True)
        STATE["tmp"], STATE["preview"] = tmp, tmp / "site"
        return {"ok": True, "slug": slug, "article_url": "http://127.0.0.1:{}/articles/{}/".format(PREVIEW_PORT, slug),
                "gallery_url": "http://127.0.0.1:{}/".format(PREVIEW_PORT)}


AUTH_HINTS = ("could not read username", "could not read password", "terminal prompts disabled", "authentication failed",
              "invalid username or password", "bad credentials", "error: 401", "error: 403", "permission denied")


def is_auth_problem(text):
    """True when a failed push means GitHub did not get a (valid) sign-in, as opposed to a network or other problem."""
    low = (text or "").lower()
    return any(h in low for h in AUTH_HINTS)


def git_publish(message):
    if DRY_RUN:
        return {"pushed": False, "note": "Dry run: nothing was committed or sent."}
    run(["git", "add", "content", "static", "docs"])
    if run(["git", "diff", "--cached", "--quiet"]).returncode != 0:
        c = run(["git", "commit", "-q", "-m", message])
        if c.returncode != 0:
            raise UserError("Could not save the change in git: " + mask((c.stderr or c.stdout).strip())[:300])
    r = run(["git", "push", "origin", "main"])
    if r.returncode != 0:
        detail = mask((r.stderr or r.stdout).strip())[-400:]
        if is_auth_problem(detail):
            return {"pushed": False, "auth": True, "note": "GitHub needs your sign-in before it will take the article. Your article is saved safely on this Mac."}
        return {"pushed": False, "note": "Your article is saved on this Mac but GitHub did not accept it yet: " + detail}
    return {"pushed": True, "note": ""}


def do_publish(p):
    with LOCK:
        # Validate in a throwaway copy first so a mistake never touches the real site.
        tmp = Path(tempfile.mkdtemp(prefix="jpn-check-"))
        try:
            shutil.copytree(CONTENT, tmp / "content")
            shutil.copytree(STATIC, tmp / "static")
            prepare(p, tmp / "content", tmp / "static")
            run_build(tmp / "content", tmp / "static", tmp / "site")
        finally:
            STATIC_TARGET["dir"] = STATIC
            shutil.rmtree(tmp, ignore_errors=True)
        slug, title = prepare(p, CONTENT, STATIC)
        STATIC_TARGET["dir"] = STATIC
        run_build()
        verb = "Update" if p.get("slug") else "Add"
        res = git_publish("{} article: {}".format(verb, title))
        res.update({"ok": True, "slug": slug, "live_url": "{}/articles/{}/".format(build.SITE["url"], slug)})
        return res


def do_remove(slug):
    with LOCK:
        match = [x for x in article_files(CONTENT) if x[3] == slug]
        if not match:
            raise UserError("That article was not found.")
        title = match[0][1].get("title", slug)
        match[0][0].unlink()
        prune_pictures(CONTENT, STATIC)
        run_build()
        res = git_publish("Remove article: " + title)
        res.update({"ok": True, "slug": slug})
        return res


def do_signin():
    """Open the one-time sign-in helper in Terminal."""
    script = ROOT / "Sign in to GitHub.command"
    if not script.exists():
        raise UserError("The file 'Sign in to GitHub.command' is missing from the johnplusnews folder.")
    if os.environ.get("JPN_NO_BROWSER"):
        return {"ok": True, "opened": False}
    subprocess.run(["open", "-a", "Terminal", str(script)], check=False)
    return {"ok": True, "opened": True}


def check_live(path, expect):
    url = "{}{}?nocache={}".format(build.SITE["url"], path, secrets.token_hex(4))
    try:
        code = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "jpn-publisher"}), timeout=8).status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception:
        return {"status": 0, "done": False}
    return {"status": code, "done": code == expect}


# ---------------------------------------------------------------- web server

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def host_ok(self):
        return self.headers.get("Host", "") in ("127.0.0.1:{}".format(PORT), "localhost:{}".format(PORT))

    def api_ok(self):
        return self.host_ok() and self.headers.get("X-Token") == TOKEN

    def do_GET(self):
        if not self.host_ok():
            return self.send_json({"error": "Not allowed"}, 403)
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if url.path == "/":
            body = PAGE.replace("__TOKEN__", TOKEN).replace("__LEVELS__", json.dumps(build.LEVELS)).replace("__LIVE__", build.SITE["url"]).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return self.wfile.write(body)
        if url.path.startswith("/media/"):
            f = (STATIC / urllib.parse.unquote(url.path[len("/media/"):])).resolve()
            if STATIC.resolve() in f.parents and f.is_file():
                data = f.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml" if f.suffix == ".svg" else "image/jpeg")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return self.wfile.write(data)
            return self.send_json({"error": "Not found"}, 404)
        if not self.api_ok():
            return self.send_json({"error": "Not allowed"}, 403)
        try:
            if url.path == "/api/articles":
                return self.send_json({"articles": list_articles()})
            if url.path == "/api/article":
                return self.send_json(get_article(q.get("slug", [""])[0]))
            if url.path == "/api/check":
                return self.send_json(check_live(q.get("path", ["/"])[0], int(q.get("expect", ["200"])[0])))
        except UserError as e:
            return self.send_json({"error": str(e)}, 400)
        self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        if not self.api_ok():
            return self.send_json({"error": "Not allowed"}, 403)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_BODY:
                raise UserError("That is too much to send at once. Try a smaller picture.")
            payload = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/api/preview":
                return self.send_json(do_preview(payload))
            if self.path == "/api/publish":
                return self.send_json(do_publish(payload))
            if self.path == "/api/remove":
                return self.send_json(do_remove(payload.get("slug", "")))
            if self.path == "/api/signin":
                return self.send_json(do_signin())
            self.send_json({"error": "Not found"}, 404)
        except UserError as e:
            self.send_json({"error": str(e)}, 400)
        except Exception as e:  # keep the program running whatever happens
            self.send_json({"error": "Something went wrong: " + mask(str(e))[:300]}, 500)


class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        """Plain file serving plus byte ranges, which Safari needs to play a recording."""
        m = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range", ""))
        path = Path(self.translate_path(self.path))
        if not m or not path.is_file():
            return super().do_GET()
        size = path.stat().st_size
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = min(int(m.group(2)), size - 1) if m.group(1) and m.group(2) else size - 1
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */{}".format(size))
            self.end_headers()
            return
        with open(path, "rb") as fh:
            fh.seek(start)
            body = fh.read(end - start + 1)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", "bytes {}-{}/{}".format(start, end, size))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def preview_factory(*args, **kwargs):
    return PreviewHandler(*args, directory=str(STATE["preview"] or DOCS), **kwargs)


def main():
    try:
        main_server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
        preview_server = http.server.ThreadingHTTPServer(("127.0.0.1", PREVIEW_PORT), preview_factory)
    except OSError:
        print("The publisher looks like it is already running. Open http://127.0.0.1:{} in your browser.".format(PORT))
        webbrowser.open("http://127.0.0.1:{}/".format(PORT))
        return
    threading.Thread(target=preview_server.serve_forever, daemon=True).start()
    print("johnplusnews publisher is running at http://127.0.0.1:{}".format(PORT))
    print("Keep this window open while you work. Close it, or press Control+C, to stop.")
    if DRY_RUN:
        print("DRY RUN: nothing will be committed or sent to GitHub.")
    if not os.environ.get("JPN_NO_BROWSER"):
        webbrowser.open("http://127.0.0.1:{}/".format(PORT))
    try:
        main_server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        if STATE["tmp"]:
            shutil.rmtree(STATE["tmp"], ignore_errors=True)


if __name__ == "__main__":
    main()
