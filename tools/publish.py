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
PICTURES_PAGE = (Path(__file__).resolve().parent / "pictures.html").read_text(encoding="utf-8")
PORT, PREVIEW_PORT = 8765, 8766
TOKEN = secrets.token_urlsafe(16)
LOCK = threading.Lock()
STATE = {"preview": None, "tmp": None}
DRY_RUN = os.environ.get("JPN_DRY_RUN") == "1"
PHOTOS_ONLY = False   # tools/photos.py turns this on: the separate pictures-only publisher
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
    return subprocess.run(cmd, cwd=kw.pop("cwd", ROOT), env=env, capture_output=True, text=True,
                          timeout=kw.pop("timeout", 180), **kw)


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
    # the same order as the home page of the site: newest date first, then the order they were added
    order = {}
    for path, meta, body, slug in article_files(CONTENT):
        order[slug] = (meta.get("date", ""), build.added_at(path), slug)
    rows.sort(key=lambda r: order.get(r["slug"], (r["date"], 0, r["slug"])), reverse=True)
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
            return {"slug": slug, "rev": file_rev(path), "title": meta.get("title", ""), "date": meta.get("date", ""), "date_label": meta.get("date-label", ""),
                    "tags": [t["label"] for t in build.parse_tags(meta.get("tags", ""))],
                    "versions": versions, "overrides": overrides, "audio": audio, "voices": voices, "summary": meta.get("summary", ""),
                    "before": "\n".join(sets["before"]), "after": "\n".join(sets["after"]),
                    "language": {lv: "\n".join("{} ({}): {}".format(i["term"], i["kind"], i["meaning"]) for i in items)
                                 for lv, items in sets["language"].items()},
                    "source_name": name, "source_url": url, "image": meta.get("image", ""),
                    "image_alt": meta.get("image-alt", ""),
                    "image_credit": meta.get("image-credit", ""), "image_credit_url": meta.get("image-credit-url", ""),
                    "image_licence": meta.get("image-licence", ""), "image_licence_url": meta.get("image-licence-url", ""),
                    "image_credit_note": meta.get("image-credit-note", ""),
                    "image_credit_label": meta.get("image-credit-label", ""), "image_origin": meta.get("image-origin", "")}
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
                f.with_suffix(".words.json").unlink(missing_ok=True)
        # a recording replaced before this ran can leave its word timings behind
        for f in d.iterdir():
            if f.name.endswith(".words.json") and f.name[:-len(".words.json")] + ".m4a" not in used_audio:
                f.unlink(missing_ok=True)
    used = set()
    for _, meta, _, _ in article_files(content_dir):
        if meta.get("image"):
            used.add(Path(meta["image"]).name)
    for folder in ("images", "images/thumbs"):
        d = static_dir / folder
        if d.is_dir():
            for f in d.iterdir():
                if f.is_file() and GENERATED.search(f.name) and f.name not in used:
                    f.unlink()


# --------------------------------------------------------- the picture manager

ORIGIN_KINDS = ["AI-generated", "My own photo", "Free-to-use or licensed photo", "Supplied by someone else", "Other"]
IMAGE_PARTS = ["alt", "credit", "credit-url", "licence", "licence-url", "credit-note", "credit-label"]
# the form fields the Pictures page sends, and the picture part each one belongs to
FIELD_PARTS = [("alt", "alt"), ("credit", "credit"), ("credit_url", "credit-url"), ("licence", "licence"),
               ("licence_url", "licence-url"), ("note", "credit-note")]
PIC_KEYS = ["image"] + ["image-" + p for p in IMAGE_PARTS] + ["image-origin"]


def pic_values(meta):
    out = {"image": meta.get("image", "")}
    for p in IMAGE_PARTS:
        out[p] = meta.get("image-" + p, "")
    out["origin"] = meta.get("image-origin", "")
    return out


def thumb_of(image):
    if not image:
        return ""
    cand = "images/thumbs/" + Path(image).name
    return cand if (STATIC / cand).is_file() else image


def photo_prompts():
    """The ready-made photo prompts, by article: {slug: {type, idea, prompt}}."""
    try:
        return json.loads((Path(__file__).resolve().parent / "photo_prompts.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_prompt(slug, text):
    """Keep a hand-edited photo prompt. Only tools/photo_prompts.json changes; nothing is published."""
    prompts = photo_prompts()
    if slug not in prompts:
        raise UserError("There is no prompt for that article.")
    text = (text or "").replace("\r\n", "\n").strip()
    if not text:
        raise UserError("A prompt cannot be empty.")
    if len(text) > 20000:
        raise UserError("That prompt is too long.")
    prompts[slug]["prompt"] = text
    dest = Path(__file__).resolve().parent / "photo_prompts.json"
    tmp = dest.with_suffix(".tmp")
    tmp.write_text(json.dumps(prompts, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(dest)
    return {"ok": True}


def list_pictures():
    rows = []
    order = {}
    for path, meta, body, slug in article_files(CONTENT):
        order[slug] = (meta.get("date", ""), build.added_at(path), slug)
        v = pic_values(meta)
        rows.append({"slug": slug, "title": meta.get("title", slug), "date": meta.get("date", ""), "summary": meta.get("summary", ""), "rev": file_rev(path),
                     "live_url": "{}/articles/{}/".format(build.SITE["url"], slug),
                     "image": v["image"], "thumb": thumb_of(v["image"]), "alt": v["alt"], "origin": v["origin"],
                     "credit": v["credit"], "credit_url": v["credit-url"], "licence": v["licence"],
                     "licence_url": v["licence-url"], "note": v["credit-note"]})
    rows.sort(key=lambda r: order.get(r["slug"], (r["date"], 0, r["slug"])), reverse=True)
    return rows


def rewrite_image_header(path, values):
    """Change only the picture lines in an article's header; the text of the article is not touched."""
    raw = path.read_text(encoding="utf-8")
    m = re.search(r"^---[ \t]*$", raw, flags=re.M)
    if not m:
        raise UserError("The article {} has no --- line, so its picture could not be changed.".format(path.name))
    head, rest = raw[:m.start()], raw[m.start():]
    lines = [l for l in head.split("\n") if not (":" in l and l.split(":", 1)[0].strip().lower() in PIC_KEYS)]
    while lines and not lines[-1].strip():
        lines.pop()
    if one_line(values.get("image", "")):
        lines.append("image: " + one_line(values["image"]))
        for part in IMAGE_PARTS:
            v = one_line(values.get(part, ""))
            if v:
                lines.append("image-{}: {}".format(part, v))
        v = one_line(values.get("origin", ""))
        if v:
            lines.append("image-origin: " + v)
    path.write_text("\n".join(lines) + "\n" + rest, encoding="utf-8")


def apply_picture_changes(changes, content_dir, static_dir):
    """Apply a batch of picture changes. Returns the slugs of the articles that really changed."""
    touched = []
    for ch in changes:
        slug = ch.get("slug")
        match = [x for x in article_files(content_dir) if x[3] == slug]
        if not match:
            raise UserError("An article in this batch no longer exists: {}.".format(slug))
        path, meta = match[0][0], match[0][1]
        if ch.get("rev") and ch["rev"] != file_rev(path):
            raise UserError("\"{}\" was changed outside the publisher after this page was loaded, so nothing was saved. "
                            "Reload the Pictures page and try again.".format(meta.get("title", slug)))
        cur = pic_values(meta)
        new = dict(cur)
        pic = ch.get("image")
        if ch.get("remove"):
            new = {k: "" for k in cur}
        elif pic and pic.get("data"):
            try:
                data = base64.b64decode(pic["data"])
            except Exception:
                raise UserError("The picture for \"{}\" could not be read.".format(meta.get("title", slug)))
            STATIC_TARGET["dir"] = static_dir
            new = {k: "" for k in cur}   # the old credit belonged to the old picture
            new["image"] = make_pictures(data, pic.get("name", "picture"), slug)
        if new["image"]:
            for field, part in FIELD_PARTS:
                if field in ch:
                    new[part] = one_line(ch[field])
            if "origin" in ch:
                new["origin"] = one_line(ch["origin"])
        else:
            new = {k: "" for k in cur}
        if new != cur:
            rewrite_image_header(path, new)
            touched.append(slug)
    prune_pictures(content_dir, static_dir)
    return touched


def do_pictures(p):
    changes = p.get("changes") or []
    if not changes:
        raise UserError("Choose at least one picture first.")
    if len(changes) > 60:
        raise UserError("That is a lot at once. Publish up to 60 articles' pictures at a time.")
    with LOCK:
        if PHOTOS_ONLY:
            problem = sync_with_github()
            if problem:
                raise UserError(problem + " Nothing was published.")
        # Try the whole batch in a throwaway copy first, so a mistake never touches the real site.
        tmp = Path(tempfile.mkdtemp(prefix="jpn-pic-"))
        try:
            shutil.copytree(CONTENT, tmp / "content")
            shutil.copytree(STATIC, tmp / "static")
            apply_picture_changes(changes, tmp / "content", tmp / "static")
            run_build(tmp / "content", tmp / "static", tmp / "site")
        finally:
            STATIC_TARGET["dir"] = STATIC
            shutil.rmtree(tmp, ignore_errors=True)
        touched = apply_picture_changes(changes, CONTENT, STATIC)
        STATIC_TARGET["dir"] = STATIC
        if not touched:
            return {"ok": True, "pushed": False, "changed": [], "note": "Nothing was different, so nothing was published."}
        run_build()
        res = git_publish("Update pictures for {} article{}".format(len(touched), "" if len(touched) == 1 else "s"))
        res.update({"ok": True, "changed": touched, "verify": {s: verify_info(s) for s in touched}})
        return res


# ------------------------------------------------------------------ writing

def compose(f):
    lines = ["title: " + f["title"], "date: " + f["date"]]
    if f.get("date_label"):
        lines.append("date-label: " + f["date_label"])
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
                          ("image_credit_note", "image-credit-note"), ("image_credit_label", "image-credit-label"),
                          ("image_origin", "image-origin")):
            if f.get(key):
                lines.append("{}: {}".format(name, f[key]))
    blocks = []
    for v in f["versions"]:
        head = "".join("{}: {}\n".format(k, v[k]) for k in ("title", "summary", "audio", "voice") if v.get(k))
        blocks.append("=== {} ===\n\n{}{}{}".format(v["level"], head, "\n" if head else "", v["text"]))
        lang = (f.get("language") or {}).get(v["level"])
        if lang:
            blocks.append("=== {} language ===\n\n{}".format(v["level"], "\n".join("- " + x for x in lang)))
    for key, label in build.QUESTION_SETS:
        if f[key]:
            blocks.append("=== {} ===\n\n{}".format(label, "\n".join("- " + q for q in f[key])))
    blocks.extend(f.get("_keep") or [])
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
        "date_label": one_line(p.get("date_label")) if "date_label" in p else None,
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
    f["language"] = {}
    for name, text in (p.get("language") or {}).items():
        level = levels.get(one_line(name).lower())
        if not level:
            continue
        try:
            items = build.clean_language((text or "").replace("\r\n", "\n").replace("\r", "\n"))
        except ValueError as e:
            raise UserError("Useful language for {}: {}.".format(level, e))
        if len(items) > 30:
            raise UserError("Useful language for {} has {} items. Keep it to 30 or fewer.".format(level, len(items)))
        if items:
            f["language"][level] = ["{} ({}): {}".format(i["term"], i["kind"], i["meaning"]) for i in items]
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


def per_level_questions(body):
    """The === Core before you read === style blocks, returned whole. The publisher does not edit
    them, so the safe thing is to write them back untouched."""
    out = []
    for block in body.split("\n=== "):
        head = block.split("\n", 1)[0].strip()
        m = re.match(r"^(Core|Intermediate|Advanced) (before you read|talk about it) ===$", head, re.I)
        if m:
            out.append("=== " + block.rstrip("\n"))
    return out


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
        # The form has one Before you read and one Talk about it box, but an article may carry a
        # set for each level. Those blocks are kept exactly as they are rather than thrown away.
        f["_keep"] = per_level_questions(match[0][2])
        old_levels = [v["level"] for v in build.parse_versions(match[0][1], match[0][2])]
        going = [lv for lv in old_levels if lv not in {v["level"] for v in f["versions"]}]
        if going:
            raise UserError(
                "Nothing was saved, because this would have deleted the {} text that the article already has. "
                "Press Edit on the article again to load every level, then make your change."
                .format(" and ".join(going)))
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
    if f.get("date_label") is None:   # the form did not send one: keep the article's current label
        f["date_label"] = old.get("date-label", "")
    f["image"] = image
    # where the picture came from is kept for the same picture, and dropped when the picture is replaced
    f["image_origin"] = old.get("image-origin", "") if image and image == old.get("image", "") else ""
    if not image:  # a credit only makes sense with a picture
        for key in ("image_credit", "image_credit_url", "image_licence", "image_licence_url", "image_credit_note", "image_credit_label", "image_alt", "image_origin"):
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


def align_new_audio(slug, levels):
    """Time the words of a recording that has just been uploaded, so the article can highlight
    them as they are read. Never stops a publish: if the speech model is missing, or the words
    do not match the text, the article goes out with a working player and no highlighting."""
    if not levels:
        return ""
    py = ROOT / ".venv-align" / "bin" / "python"
    script = ROOT / "tools" / "align_audio.py"
    if not py.exists() or not script.exists():
        return "The words were not timed, so the recording will not highlight as it plays: the speech model is not installed."
    md = next((x[0] for x in article_files(CONTENT) if x[3] == slug), None)
    if md is None:
        return ""
    notes = []
    for level in sorted(levels):
        try:
            r = run([str(py), str(script), str(md), level], timeout=900)
        except subprocess.TimeoutExpired:
            notes.append("{}: timing the words took too long, so that recording will not highlight.".format(level))
            continue
        out = ((r.stdout or "") + (r.stderr or "")).strip().splitlines()
        line = next((x for x in reversed(out) if x.startswith(("MATCHED", "MATCH_TOO_LOW"))), "")
        if r.returncode == 0 and line.startswith("MATCHED"):
            notes.append("{}: words timed, {}.".format(level, line.split(" ", 1)[1].split(" ->")[0]))
        elif line.startswith("MATCH_TOO_LOW"):
            notes.append("{}: the recording does not match the text ({}), so it will not highlight. "
                         "Re-record it if the article changed after it was read."
                         .format(level, line.split(" ", 1)[1]))
        else:
            notes.append("{}: the words could not be timed, so that recording will not highlight.".format(level))
    return " ".join(notes)


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


def sync_with_github():
    """Photos-only publisher: bring this separate copy up to date with GitHub before showing or changing pictures.
    Returns a short problem description, or "" when all is well."""
    if DRY_RUN:
        return ""
    f = run(["git", "fetch", "-q", "origin", "main"])
    if f.returncode != 0:
        return "Could not reach GitHub, so this may not show the newest articles."
    if run(["git", "rev-parse", "HEAD"]).stdout.strip() == run(["git", "rev-parse", "origin/main"]).stdout.strip():
        return ""
    m = run(["git", "merge", "-q", "--ff-only", "origin/main"])
    if m.returncode != 0:
        return "This copy has changes that clash with the newest version on GitHub. Ask Claude to tidy it up."
    return ""


def git_publish(message):
    if DRY_RUN:
        return {"pushed": False, "note": "Dry run: nothing was committed or sent."}
    run(["git", "add", "content", "static", "docs", "site.json"] + (["tools/photo_prompts.json"] if PHOTOS_ONLY else []))
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
        by_name = {l.lower(): l for l in build.LEVELS}
        new_audio = {by_name[one_line(n).lower()] for n, up in (p.get("audio") or {}).items()
                     if one_line(n).lower() in by_name and isinstance(up, dict) and up.get("data")}
        audio_note = align_new_audio(slug, new_audio)
        run_build()
        verb = "Update" if p.get("slug") else "Add"
        res = git_publish("{} article: {}".format(verb, title))
        res.update({"ok": True, "slug": slug, "live_url": "{}/articles/{}/".format(build.SITE["url"], slug),
                    "verify": verify_info(slug), "audio_note": audio_note})
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


def fetch_live(path, method="GET"):
    """(status, body) of a page or file on the live site, bypassing caches. Status 0 means the site could not be reached."""
    url = "{}{}?nocache={}".format(build.SITE["url"], path, secrets.token_hex(4))
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, method=method, headers={"User-Agent": "jpn-publisher"}), timeout=8)
        return r.status, (r.read() if method == "GET" else b"")
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return 0, b""


def check_live(path, expect, sha="", assets=()):
    """Is it really live? A page that already existed returns 200 before the new version arrives, so an update is only
    live when the page is byte for byte the version just built (sha) and every picture it uses loads."""
    code, body = fetch_live(path)
    if code == 0:
        return {"status": 0, "done": False}
    out = {"status": code, "done": code == expect}
    if expect == 200 and sha:
        out["page_new"] = hashlib.sha256(body).hexdigest() == sha
        out["done"] = out["done"] and out["page_new"]
    if expect == 200 and assets:
        missing = [a for a in assets if fetch_live(a, "HEAD")[0] != 200]
        out["images_missing"] = len(missing)
        out["done"] = out["done"] and not missing
    return out


def verify_info(slug):
    """What to look for on the live site after publishing: the exact new page and the pictures it uses."""
    page = DOCS / "articles" / slug / "index.html"
    if not page.is_file():
        return {}
    data = page.read_bytes()
    html_text = data.decode("utf-8", "replace")
    imgs = []
    for m in re.finditer(r'(?:src|content)="((?:https://johnplusnews\.com)?/images/[^"]+\.jpg)"', html_text):
        u = m.group(1).replace("https://johnplusnews.com", "")
        for v in (u, u.replace("/images/", "/images/thumbs/", 1)):
            if v not in imgs:
                imgs.append(v)
    return {"sha": hashlib.sha256(data).hexdigest(), "assets": imgs}


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
        if PHOTOS_ONLY and url.path == "/":
            url = url._replace(path="/pictures")
        if url.path == "/":
            body = PAGE.replace("__TOKEN__", TOKEN).replace("__LEVELS__", json.dumps(build.LEVELS)).replace("__LIVE__", build.SITE["url"]).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return self.wfile.write(body)
        if url.path == "/pictures":
            page = PICTURES_PAGE
            if PHOTOS_ONLY:   # no link to the article form, and the tag says what this window is
                page = re.sub(r'<a class="navl" href="/">Articles</a>', "", page).replace('<span class="tag">Publisher</span>', '<span class="tag">Photos</span>')
            body = page.replace("__TOKEN__", TOKEN).replace("__LIVE__", build.SITE["url"]).encode()
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
            if PHOTOS_ONLY and url.path in ("/api/articles", "/api/article"):
                return self.send_json({"error": "Not found"}, 404)
            if url.path == "/api/articles":
                return self.send_json({"articles": list_articles()})
            if url.path == "/api/article":
                return self.send_json(get_article(q.get("slug", [""])[0]))
            if url.path == "/api/pictures":
                with LOCK:
                    note = sync_with_github() if PHOTOS_ONLY else ""
                    out = {"pictures": list_pictures(), "kinds": ORIGIN_KINDS, "prompts": photo_prompts()}
                if note:
                    out["warning"] = note
                return self.send_json(out)
            if url.path == "/api/check":
                assets = [a for a in q.get("assets", [""])[0].split(",") if a.startswith("/images/")]
                return self.send_json(check_live(q.get("path", ["/"])[0], int(q.get("expect", ["200"])[0]), q.get("sha", [""])[0], assets))
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
            if PHOTOS_ONLY and self.path in ("/api/preview", "/api/publish", "/api/remove"):
                return self.send_json({"error": "Not found"}, 404)
            if self.path == "/api/preview":
                return self.send_json(do_preview(payload))
            if self.path == "/api/publish":
                return self.send_json(do_publish(payload))
            if self.path == "/api/pictures/save":
                return self.send_json(do_pictures(payload))
            if self.path == "/api/prompts/save":
                return self.send_json(save_prompt(payload.get("slug", ""), payload.get("prompt", "")))
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
