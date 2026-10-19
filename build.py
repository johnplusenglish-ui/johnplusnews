#!/usr/bin/env python3
"""Build the johnplusnews site into docs/ (the folder GitHub Pages publishes).

    python3 build.py            build
    python3 build.py --serve    build, then preview at http://localhost:8123

Each article is one plain text file in content/ (see README.md).
"""
import datetime as dt
import hashlib
import json
import legal
import html
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
STATIC = ROOT / "static"
OUT = ROOT / "docs"

SITE = {
    "owner": "CorkEnglishTeacher",                        # the trading name
    "legal_name": "",                                     # your full legal name, for example "John Murphy". Shown in the privacy notice, terms and contact page
    "address": "",                                        # a business address people can write to
    "email": "",                                          # for example "hello@example.com"
    "vat": "",                                            # VAT number, only if you are registered
    "cro": "",                                            # business name registration number (Companies Registration Office), only if registered
    "name": "johnplusnews",
    "url": "https://johnplusnews.com",
    "tagline": "News articles from around the world for English learners.",
    "social": [
        ("Telegram", "https://t.me/johnplusenglishchannel"),
        ("Instagram", "https://www.instagram.com/johnplusenglish/"),
    ],
}

NAV = [("/", "Articles"), ("/about/", "About")]
LEVELS = ["Core", "Intermediate", "Advanced"]
LANGUAGE_ON = False  # the useful-language boxes are paused; the lists stay in the article files
FREE_COUNT = 3  # readers who are not signed in see only this many of the newest articles (when accounts are switched on)
FREE_SLUGS = set()
DEFAULT_LEVEL = "Intermediate"  # the tab a new reader lands on (the first one if an article has no Intermediate)


def esc(s):
    return html.escape(s, quote=True)


def fail(path, msg):
    sys.exit("Error in {}: {}".format(path.name, msg))


def fmt(d, short=False):
    return "{} {}".format(d.day, d.strftime("%b %Y" if short else "%B %Y"))


# ---------------------------------------------------------------- text to html

def inline(s):
    s = html.escape(s, quote=False)

    def link(m):
        url = m.group(2).replace('"', "&quot;")
        return '<a href="{}">{}</a>'.format(url, m.group(1))

    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+|/[^)\s]*)\)", link, s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return s


def asset(src):
    """Local image paths are relative to static/ and served from the site root."""
    return src if src.startswith("http") else "/" + src.lstrip("/")


def body_html(text):
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [l.rstrip() for l in block.strip().splitlines()]
        if not lines:
            continue
        first = lines[0]
        img = re.fullmatch(r"!\[([^\]]*)\]\(([^)\s]+)\)", first) if len(lines) == 1 else None
        if img:
            out.append('<figure><img src="{}" alt="{}" loading="lazy"></figure>'.format(
                esc(asset(img.group(2))), esc(img.group(1))))
        elif first.startswith("## "):
            out.append("<h2>{}</h2>".format(inline(first[3:])))
        elif first.startswith("### "):
            out.append("<h3>{}</h3>".format(inline(first[4:])))
        elif all(l.startswith("- ") for l in lines):
            out.append("<ul>{}</ul>".format("".join("<li>{}</li>".format(inline(l[2:])) for l in lines)))
        elif all(l.startswith(">") for l in lines):
            inner = " ".join(l.lstrip(">").strip() for l in lines)
            out.append("<blockquote><p>{}</p></blockquote>".format(inline(inner)))
        else:
            out.append("<p>{}</p>".format(inline(" ".join(lines))))
    return "\n".join(out)


IRREGULAR = {"be": ["is", "are", "was", "were", "been", "being"], "break": ["broke", "broken"], "bring": ["brought"],
             "buy": ["bought"], "catch": ["caught"], "come": ["came"], "cut": ["cut"], "do": ["did", "done"],
             "draw": ["drew", "drawn"], "fall": ["fell", "fallen"], "feel": ["felt"], "find": ["found"], "fly": ["flew", "flown"],
             "get": ["got"], "give": ["gave", "given"], "go": ["went", "gone"], "grow": ["grew", "grown"], "have": ["has", "had"],
             "hold": ["held"], "keep": ["kept"], "lead": ["led"], "leave": ["left"], "lose": ["lost"], "make": ["made"],
             "pay": ["paid"], "put": ["put"], "run": ["ran"], "say": ["said"], "see": ["saw", "seen"], "sell": ["sold"],
             "shut": ["shut"], "sit": ["sat"], "speak": ["spoke", "spoken"], "stand": ["stood"], "take": ["took", "taken"],
             "tell": ["told"], "think": ["thought"], "throw": ["threw", "thrown"], "win": ["won"], "write": ["wrote", "written"],
             "lay": ["laid"], "dig": ["dug"], "wear": ["wore", "worn"], "deal": ["dealt"], "teach": ["taught"], "wake": ["woke", "woken"], "begin": ["began", "begun"],
             "choose": ["chose", "chosen"], "hide": ["hid", "hidden"], "mean": ["meant"], "meet": ["met"], "spend": ["spent"],
             "strike": ["struck"], "stick": ["stuck"], "fight": ["fought"], "seek": ["sought"], "build": ["built"], "send": ["sent"],
             "sleep": ["slept"], "understand": ["understood"], "set": ["set"], "let": ["let"], "spread": ["spread"], "shut": ["shut"],
             "swim": ["swam", "swum"], "ride": ["rode", "ridden"], "rise": ["rose", "risen"], "forget": ["forgot", "forgotten"]}
PLACEHOLDERS = {"someone", "somebody", "something", "sb", "sth", "one's", "someone's", "your", "yourself", "oneself",
                "you", "them", "him", "her", "his", "their", "its", "my", "our", "themselves", "himself", "herself"}


def word_forms(w):
    """A verb and the forms it may take in the text: turn, turns, turned, turning; tip, tipped; carry, carried; go, went."""
    forms = {w, w + "s", w + "es", w + "ed", w + "d", w + "ing"}
    if w.endswith("e"):
        forms.add(w[:-1] + "ing")
    if w.endswith("y"):
        forms.update({w[:-1] + "ies", w[:-1] + "ied"})
    if len(w) >= 3 and w[-1] not in "aeiouwxy" and w[-2] in "aeiou" and w[-3] not in "aeiou":
        forms.update({w + w[-1] + "ed", w + w[-1] + "ing"})
    forms.update(IRREGULAR.get(w, []))
    return sorted(forms, key=len, reverse=True)


def term_pattern(term):
    """Finds a listed item in the text: the first word may be inflected (turn up, turned up), a leading 'a', 'an' or
    'the' is optional, and 'someone', 'something', 'your' and the like may stand for up to three words of the text."""
    words = html.escape(term, quote=False).split()
    out, need_sep, verb_done = "", False, False
    for i, w in enumerate(words):
        lw = w.lower()
        if w in ("X", "Y"):
            out += (r"\s+" if need_sep else "") + r"[A-Za-z'\u2019-]+(?:\s+[A-Za-z'\u2019-]+){0,5}"
            need_sep = True
            continue
        if lw in PLACEHOLDERS:
            out += r"(?:\s+[A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,2})?" if need_sep else r"(?:[A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,2}\s+)?"
            continue
        if i == 0 and lw in ("a", "an", "the"):
            out += r"(?:(?:a|an|the)\s+)?"
            continue
        if not verb_done:
            piece = "(?:" + "|".join(re.escape(f) for f in word_forms(lw)) + ")"
            verb_done = True
        else:
            piece = re.escape(w)
        out += (r"\s+" if need_sep else "") + piece
        need_sep = True
    return re.compile(r"(?<![A-Za-z])" + out + r"(?![A-Za-z])", re.I)


def mark_language(html_text, items, path=None, level=""):
    """Underline the first place each useful-language item appears in a level's text (a dotted line that shows the
    meaning on tap). An item whose exact words are not in the text is still listed; a note is printed so the wording
    can be fixed."""
    if not items:
        return html_text
    parts = re.split(r"(<[^>]+>)", html_text)
    for it in items:
        pat = term_pattern(it["term"])
        found = False
        for i, seg in enumerate(parts):
            if not seg or seg.startswith("<"):
                continue
            m = pat.search(seg)
            if m:
                parts[i] = (seg[:m.start()] + '<span class="kl" tabindex="0" data-term="{}" data-kind="{}" data-meaning="{}">{}</span>'.format(
                    esc(it["term"]), esc(it["kind"]), esc(it["meaning"]), m.group(0)) + seg[m.end():])
                parts = re.split(r"(<[^>]+>)", "".join(parts))  # keep tags separate from text for the next item
                found = True
                break
        if not found:
            print("  note: '{}' is listed as {} language but its exact words are not in that text ({})".format(
                it["term"], level, path.name if path else "?"))
    return "".join(parts)


def plain(text):
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    return re.sub(r"[#>*\-]+\s*", "", t)


# -------------------------------------------------------------------- content

def split_article(raw):
    """Split an article file into (header dict, body text). Raises ValueError if malformed."""
    parts = re.split(r"^---[ \t]*$", raw, maxsplit=1, flags=re.M)
    if len(parts) != 2:
        raise ValueError("put a line containing only --- between the header and the text")
    meta = {}
    for line in parts[0].strip().splitlines():
        if ":" not in line:
            raise ValueError("header line without a colon: " + line)
        k, v = line.split(":", 1)
        meta[k.strip().lower()] = v.strip()
    return meta, parts[1].strip()


VERSION_MARK = re.compile(r"^===[ \t]*([A-Za-z]+)[ \t]*===[ \t]*$", re.M)


HEAD_LINE = re.compile(r"^(title|summary|audio|voice):[ \t]*(.*)$", re.I)

# Optional question sets, written as === Before you read === and === Talk about it === followed by one question per line.
ANY_MARK = re.compile(r"^===[ \t]*([A-Za-z][A-Za-z ]*?)[ \t]*===[ \t]*$", re.M)
QUESTION_SETS = [("before", "Before you read"), ("after", "Talk about it")]
SET_KEYS = {label.lower(): key for key, label in QUESTION_SETS}
# Optional "useful language" lists, one per level, written as === Core language === followed by one item per line:
#   - turn up (phrasal verb): to arrive somewhere
LANG_MARK = re.compile(r"^(" + "|".join(LEVELS) + r") language$", re.I)
LANG_LINE = re.compile(r"^(.+?)\s*\(([A-Za-z][A-Za-z /-]*)\)\s*:\s*(.+)$")
LANG_GROUPS = [("adjective", "Adjectives"), ("phrasal", "Phrasal verbs"), ("phrase", "Phrases"), ("other", "Other words")]


def lang_group(kind):
    k = kind.lower()
    if "adj" in k:
        return "adjective"
    if "phrasal" in k:
        return "phrasal"
    if any(w in k for w in ("idiom", "phrase", "expression", "collocation", "saying")):
        return "phrase"
    return "other"


def clean_language(text):
    """One item per line, 'term (type): meaning'. Returns [{'term', 'kind', 'meaning', 'group'}]. Raises ValueError."""
    out = []
    for line in text.splitlines():
        line = BULLET.sub("", line.strip()).strip()
        if not line:
            continue
        m = LANG_LINE.match(line)
        if not m:
            raise ValueError("a language line must look like 'turn up (phrasal verb): to arrive somewhere', not '{}'".format(line[:60]))
        term, kind, meaning = m.group(1).strip(), " ".join(m.group(2).split()).lower(), m.group(3).strip()
        out.append({"term": term, "kind": kind, "meaning": meaning, "group": lang_group(kind)})
    return out
BULLET = re.compile(r"^(?:[-*\u2022]|\d+[.)])\s+")


def clean_questions(text):
    """One question per line. A leading dash, bullet or number is dropped."""
    out = []
    for line in text.splitlines():
        line = BULLET.sub("", line.strip()).strip()
        if line:
            out.append(line)
    return out


def split_sections(body):
    """Take the question sets and the useful-language lists out of an article body.
    Returns (the rest of the body, {'before': [...], 'after': [...], 'language': {level: [items]}})."""
    marks = list(ANY_MARK.finditer(body))
    sets = {"before": [], "after": [], "language": {}}
    if not marks:
        return body, sets
    kept = [body[:marks[0].start()]]
    levels = {l.lower(): l for l in LEVELS}
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        name = m.group(1).strip()
        key = SET_KEYS.get(name.lower())
        lang = LANG_MARK.match(name)
        if key:
            if sets[key]:
                raise ValueError("'{}' appears twice".format(name))
            sets[key] = clean_questions(body[m.end():end])
        elif lang:
            level = levels[lang.group(1).lower()]
            if level in sets["language"]:
                raise ValueError("'{} language' appears twice".format(level))
            sets["language"][level] = clean_language(body[m.end():end])
        else:
            kept.append(body[m.start():end])
    return "".join(kept), sets


def take_head(text):
    """A version may start with its own 'title:', 'summary:', 'audio:' (a recording of it) and 'voice:' (who is
    speaking, shown beside the player) lines, then a blank line. Returns ({'title','summary','audio','voice'}, rest-of-text)."""
    empty = {"title": "", "summary": "", "audio": "", "voice": ""}
    own = dict(empty)
    lines = text.split("\n")
    i = 0
    while i < len(lines) and HEAD_LINE.match(lines[i]):
        m = HEAD_LINE.match(lines[i])
        own[m.group(1).lower()] = m.group(2).strip()
        i += 1
    if i == 0 or (i < len(lines) and lines[i].strip()):
        return dict(empty), text
    return own, "\n".join(lines[i:]).strip()


def parse_versions(meta, body):
    """Return [{'level','text','title','summary'}] in LEVELS order. An article is either one text with a
    'level:' header, or several texts, each starting with a line like === Advanced ===. A version may
    also carry its own headline and subheading (title:/summary: lines right after its marker).
    Question sets (=== Before you read === and so on) are ignored here; see split_sections. Raises ValueError."""
    body = split_sections(body)[0]
    levels = {l.lower(): l for l in LEVELS}
    marks = list(VERSION_MARK.finditer(body))
    if not marks:
        level = levels.get(meta.get("level", "").lower())
        if not level:
            raise ValueError("add a 'level:' header, or start each version with a line like === Advanced ===")
        if not body.strip():
            raise ValueError("the article text is empty")
        return [{"level": level, "text": body.strip(), "title": "", "summary": "",
                 "audio": meta.get("audio", ""), "voice": meta.get("voice", "")}]
    if body[:marks[0].start()].strip():
        raise ValueError("there is text before the first === level === line")
    out = []
    for i, m in enumerate(marks):
        level = levels.get(m.group(1).lower())
        if not level:
            raise ValueError("unknown level '{}' (use {})".format(m.group(1), ", ".join(LEVELS)))
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        own, text = take_head(body[m.end():end].strip())
        if not text:
            raise ValueError("the {} version is empty".format(level))
        out.append({"level": level, "text": text, "title": own["title"], "summary": own["summary"],
                    "audio": own["audio"], "voice": own["voice"]})
    names = [v["level"] for v in out]
    if len(set(names)) != len(names):
        raise ValueError("the same level appears twice")
    return sorted(out, key=lambda v: LEVELS.index(v["level"]))


def split_versions(meta, body):
    """Return [(level, text)] in LEVELS order (the simple form of parse_versions)."""
    return [(v["level"], v["text"]) for v in parse_versions(meta, body)]


def tag_slug(label):
    """'Health & Fitness' -> 'health-fitness' (used in the address of a topic page)."""
    t = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def parse_tags(value):
    """'Technology, Society' -> [{'label': 'Technology', 'slug': 'technology'}, ...]. Duplicates (same address) are dropped."""
    out, seen = [], set()
    for raw in (value or "").split(","):
        label = re.sub(r"\s+", " ", raw).strip()
        slug = tag_slug(label)
        if label and slug and slug not in seen:
            seen.add(slug)
            out.append({"label": label, "slug": slug})
    return out


def parse_article(path):
    try:
        meta, body = split_article(path.read_text(encoding="utf-8"))
    except ValueError as e:
        fail(path, str(e))
    for key in ("title", "date"):
        if not meta.get(key):
            fail(path, "missing '{}' in the header".format(key))
    try:
        date = dt.date.fromisoformat(meta["date"])
    except ValueError:
        fail(path, "date must look like 2026-10-13")
    try:
        versions = parse_versions(meta, body)
        questions = split_sections(body)[1]
        language = questions["language"] if LANGUAGE_ON else {}
    except ValueError as e:
        fail(path, str(e))
    if meta.get("draft", "").lower() in ("yes", "true", "1"):
        print("  skipped draft: " + path.name)
        return None

    summary = meta.get("summary", "")
    if not summary:
        first_para = plain(re.split(r"\n\s*\n", versions[0]["text"])[0]).replace("\n", " ").strip()
        summary = first_para if len(first_para) <= 170 else first_para[:167].rsplit(" ", 1)[0] + "..."

    source_name = source_url = ""
    if meta.get("source"):
        bits = [b.strip() for b in meta["source"].split("|", 1)]
        if len(bits) == 2:
            source_name, source_url = bits
        elif bits[0].startswith("http"):
            source_name, source_url = re.sub(r"^https?://(www\.)?", "", bits[0]).split("/")[0], bits[0]
        else:
            source_name = bits[0]

    return {
        "slug": re.sub(r"^\d{4}-\d{2}-\d{2}-", "", path.stem),
        "title": meta["title"],
        "date": date,
        "summary": summary,
        "levels": [v["level"] for v in versions],
        "image": meta.get("image", ""),
        "image_alt": meta.get("image-alt", ""),
        "image_credit": meta.get("image-credit", "") if meta.get("image") else "",
        "image_credit_url": meta.get("image-credit-url", "") if meta.get("image") else "",
        "image_licence": meta.get("image-licence", "") if meta.get("image") else "",
        "image_licence_url": meta.get("image-licence-url", "") if meta.get("image") else "",
        "image_credit_note": meta.get("image-credit-note", "") if meta.get("image") else "",
        "image_credit_label": meta.get("image-credit-label", "") if meta.get("image") else "",
        "source_name": source_name,
        "source_url": source_url,
        "questions": questions,
        "tags": parse_tags(meta.get("tags", "")),
        "versions": [
            {"level": v["level"], "html": mark_language(body_html(v["text"]), language.get(v["level"], []), path, v["level"]),
             "language": language.get(v["level"], []),
             "title": v["title"] or meta["title"], "summary": v["summary"] or summary,
             "audio": asset(v["audio"]) if v["audio"] else "", "voice": v["voice"]}
            for v in versions
        ],
    }


def added_at(path):
    """When the article file was first saved in git, so that articles with the same date show the newest first.
    A file git does not know about (a preview, or a new draft) uses its modified time."""
    try:
        out = subprocess.run(["git", "log", "--diff-filter=A", "--format=%ct", "--", path.name], cwd=str(path.parent),
                             capture_output=True, text=True, timeout=20).stdout.split()
        if out:
            return max(int(x) for x in out)
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return int(path.stat().st_mtime)


def load_articles(content_dir=CONTENT):
    arts, seen = [], {}
    for path in sorted(content_dir.glob("*.md")):
        a = parse_article(path)
        if not a:
            continue
        a["added"] = added_at(path)
        if a["slug"] in seen:
            fail(path, "same slug as " + seen[a["slug"]])
        seen[a["slug"]] = path.name
        arts.append(a)
    arts.sort(key=lambda a: (a["date"], a["added"], a["slug"]), reverse=True)
    return arts


def url_of(a):
    return "/articles/{}/".format(a["slug"])


# ------------------------------------------------------------------- templates

CSS = (ROOT / "style.css").read_text(encoding="utf-8")


def page(path, main, title=None, desc=None, current=None, image=None, kind="website", wide=False, head_extra=""):
    full_title = SITE["name"] + " | " + SITE["tagline"].rstrip(".") if title is None else "{} | {}".format(title, SITE["name"])
    desc = desc or SITE["tagline"]
    canon = SITE["url"] + path
    nav = "".join(
        '<a href="{}"{}>{}</a>'.format(href, ' aria-current="page"' if href == current else "", label)
        for href, label in NAV
    )
    head_extra = (GUEST_JS if accounts_on() else "") + head_extra + account_scripts()
    og_image = '<meta property="og:image" content="{}">'.format(
        esc(image if image.startswith("http") else SITE["url"] + asset(image))) if image else ""
    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canon}">
<meta property="og:site_name" content="{name}">
<meta property="og:type" content="{kind}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canon}">
{og_image}
<link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossorigin>
{head_extra}<style>{css}</style>
</head>
<body{body_class}>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path d="M5 20h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14.5A1.5 1.5 0 0 1 4.5 21 2.5 2.5 0 0 1 2 18.5V11a2 2 0 0 1 2-2h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 7.5h8M10 11.5h8M10 15.5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="wm">john<span>plus</span>news</span></a>
    <nav class="site-nav" aria-label="Main">{nav}</nav>
  </div>
</header>
<main id="main">
{main}
</main>
<footer class="site-footer">
  <div class="wrap"><span>{name}. {tagline}</span><nav class="foot-links" aria-label="About this site"><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/contact/">Contact</a></nav></div>
</footer>
</body>
</html>
""".format(title=esc(full_title), desc=esc(desc), canon=esc(canon), name=SITE["name"], kind=kind,
           og_image=og_image, css=CSS, nav=nav, main=main, tagline=SITE["tagline"],
           body_class=' class="wide"' if wide else "", head_extra=head_extra)


def levels_label(a):
    return ", ".join(a["levels"])


def default_index(versions):
    """Index of the version shown first: Intermediate if the article has it, otherwise the first version."""
    for i, v in enumerate(versions):
        if v["level"] == DEFAULT_LEVEL:
            return i
    return 0


def card_meta(a):
    """On a card: the topics (if any) and the date. The levels are inside the article, so they are not repeated here."""
    topics = ", ".join(t["label"] for t in a["tags"])
    first = '<span class="lvl">{}</span>'.format(esc(topics)) if topics else ""
    return '<p class="meta">{}<span>{}</span></p>'.format(first, fmt(a["date"], short=True))


def article_meta(a):
    v = a["versions"]
    bits = []
    if len(v) == 1:
        bits.append('<span class="lvl">{}</span>'.format(esc(v[0]["level"])))
    bits.append("<span>{}</span>".format(fmt(a["date"])))
    return '<p class="meta">{}</p>'.format("".join(bits))


def level_tabs(a):
    """A small level switch for the date line. Only articles with more than one version have one."""
    v = a["versions"]
    if len(v) < 2:
        return ""
    d = default_index(v)
    tabs = "".join(
        '<button type="button" role="tab" id="tab-{k}" aria-controls="v-{k}" aria-selected="{sel}" tabindex="{ti}" data-level="{k}" data-title="{t}" data-sub="{u}">{label}</button>'
        .format(k=x["level"].lower(), sel="true" if i == d else "false", ti=0 if i == d else -1, t=esc(x["title"]), u=esc(x["summary"]), label=esc(x["level"]))
        for i, x in enumerate(v))
    return '<div class="vtabs" role="tablist" aria-label="Reading level" data-tabs>{}</div>'.format(tabs)


def collect_topics(arts):
    """[{'slug','label','arts'}] for every tag in use, biggest first. The most used spelling of a label wins."""
    by = {}
    for a in arts:
        for t in a["tags"]:
            e = by.setdefault(t["slug"], {"slug": t["slug"], "labels": {}, "arts": []})
            e["labels"][t["label"]] = e["labels"].get(t["label"], 0) + 1
            e["arts"].append(a)
    out = []
    for e in by.values():
        label = sorted(e["labels"].items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        out.append({"slug": e["slug"], "label": label, "arts": e["arts"]})
    out.sort(key=lambda t: (-len(t["arts"]), t["label"].lower()))
    return out


def chips_html(topics, current=None):
    if not topics:
        return ""
    items = ['<a class="chip" href="/"{}>All</a>'.format(' aria-current="page"' if current is None else "")]
    items += ['<a class="chip" href="/tags/{}/"{}>{}</a>'.format(t["slug"], ' aria-current="page"' if t["slug"] == current else "", esc(t["label"])) for t in topics]
    return '<nav class="chips" aria-label="Topics">{}</nav>'.format("".join(items))


FINDER_JS = (
    '(function(){var i=document.getElementById("q");if(!i)return;i.closest(".finder").hidden=false;'
    'var c=[].slice.call(document.querySelectorAll(".gallery .card")),n=document.getElementById("nomatch");'
    'function go(){var t=i.value.toLowerCase().split(/\\s+/).filter(Boolean),k=0;'
    'c.forEach(function(x){var q=x.getAttribute("data-q")||"",ok=t.every(function(w){return q.indexOf(w)>-1});x.hidden=!ok;if(ok&&(!document.documentElement.classList.contains("jpn-guest")||x.hasAttribute("data-free")))k++});'
    'if(n)n.hidden=k>0}'
    'i.addEventListener("input",go);go()})();'
)


def filters_html(topics, current=None):
    finder = ('<div class="finder" hidden><input type="search" id="q" placeholder="Search articles" aria-label="Search articles" '
              'autocomplete="off" spellcheck="false"></div>')
    return '<div class="filters">{}{}</div>'.format(chips_html(topics, current), finder)


def search_text(a):
    """Everything the search box looks through for one article, in lower case."""
    bits = [a["title"], a["summary"]] + [v["title"] + " " + v["summary"] for v in a["versions"]] + [t["label"] for t in a["tags"]] + a["levels"]
    return re.sub(r"\s+", " ", " ".join(bits)).lower()


def card(a):
    if a["image"]:
        thumb = '<img src="{}" alt="{}" loading="lazy" decoding="async">'.format(esc(asset(a.get("thumb") or a["image"])), esc(a["image_alt"]))
    else:
        thumb = '<span class="blank">{}</span>'.format(esc(" \u00b7 ".join(t["label"] for t in a["tags"]) or levels_label(a)))
    return (
        '<li class="card" data-q="{q}"{free}><div class="thumb">{thumb}</div>{meta}'
        '<h2><a href="{url}">{title}</a></h2><p class="sub">{summary}</p></li>'
    ).format(thumb=thumb, meta=card_meta(a), url=url_of(a), title=esc(a["title"]), summary=esc(a["summary"]), q=esc(search_text(a)),
        free=' data-free="1"' if a["slug"] in FREE_SLUGS else "")


def gallery_page(arts, topics=(), topic=None):
    """The home page (topic is None) or the page for one topic."""
    if arts:
        body = '<ul class="gallery">{}</ul><p class="empty" id="nomatch" hidden>No articles match your search.</p>'.format("".join(card(a) for a in arts))
    else:
        body = '<p class="empty">The first article is coming soon.</p>'
    heading = esc(topic["label"]) if topic else esc(SITE["tagline"])
    main = ('<section class="banner"><div class="wrap"><h1 class="intro">{}</h1></div></section>\n'
            '<div class="wrap">{}{}</div>\n<script>{}</script>').format(heading, filters_html(topics, topic["slug"] if topic else None), body, FINDER_JS)
    if topic:
        return page("/tags/{}/".format(topic["slug"]), main, title=topic["label"], current="/", wide=True,
                    desc="{} articles for English learners on johnplusnews.".format(topic["label"]),
                    image=(arts[0]["image"] if arts else "") or None)
    return page("/", main, current="/", desc=SITE["tagline"], image=(arts[0]["image"] if arts else "") or None, wide=True)


def account_page(path, heading, kind, note):
    """My words and the teacher view: an empty shell that static/account.js fills in for the signed-in reader."""
    main = ('<div class="wrap"><h1 class="page-title">{}</h1><p class="acct-intro">{}</p>'
            '<div id="acct-root" data-page="{}"><noscript><p class="acct-note">This page needs JavaScript.</p></noscript></div></div>').format(heading, note, kind)
    return page(path, main, title=heading, desc=note, head_extra='<meta name="robots" content="noindex">\n')


def legal_page(path, title, body, desc):
    main = '<div class="wrap legal"><h1 class="page-title">{}</h1>{}</div>'.format(title, body)
    return page(path, main, title=title, desc=desc)


def about_page():
    links = "".join(
        '<li><a href="{}" target="_blank" rel="noopener noreferrer"><span>{}</span><span aria-hidden="true">&rarr;</span></a></li>'.format(esc(url), label)
        for label, url in SITE["social"]
    )
    main = '<div class="wrap"><h1 class="page-title">About</h1><ul class="social">{}</ul></div>'.format(links)
    return page("/about/", main, title="About", current="/about/", desc="johnplusnews on Telegram and Instagram.")


TABS_JS = (
    '(function(){var r=document.querySelector("[data-tabs]");if(!r)return;'
    'var t=[].slice.call(r.querySelectorAll("[role=tab]"));'
    'function show(k,save){var ok=t.some(function(x){return x.getAttribute("data-level")===k});if(!ok)return false;'
    't.forEach(function(x){var l=x.getAttribute("data-level"),on=l===k;x.setAttribute("aria-selected",on);'
    'x.tabIndex=on?0:-1;document.getElementById("v-"+l).hidden=!on;var q=document.getElementById("l-"+l);if(q){q.hidden=!on;var au=q.querySelector("audio");if(au&&!on&&!au.paused)au.pause()}'
    'if(on){var tt=x.getAttribute("data-title"),ss=x.getAttribute("data-sub"),h=document.querySelector(".article-head h1"),d=document.querySelector(".dek"),ml=document.querySelector(".metaleft");if(ml)ml.setAttribute("data-print-level",x.textContent);'
    'if(h&&tt)h.textContent=tt;if(d&&ss)d.textContent=ss;if(tt)document.title=tt+" | "+document.title.split(" | ").pop()}});'
    'if(save){try{localStorage.setItem("jpn_level",k)}catch(e){}try{history.replaceState(null,"","#"+k)}catch(e){}try{document.dispatchEvent(new CustomEvent("jpn:pref",{detail:{level:k}}))}catch(e){}}return true}'
    'var s="";try{s=localStorage.getItem("jpn_level")||""}catch(e){}'
    'if(!show(location.hash.slice(1).toLowerCase(),false))show(s,false);'
    't.forEach(function(x,i){x.addEventListener("click",function(){show(x.getAttribute("data-level"),true)});'
    'x.addEventListener("keydown",function(e){var n=e.key==="ArrowRight"?i+1:e.key==="ArrowLeft"?i-1:-1;'
    'if(n<0||n>=t.length)return;e.preventDefault();t[n].focus();show(t[n].getAttribute("data-level"),true)})});'
    'window.addEventListener("hashchange",function(){show(location.hash.slice(1).toLowerCase(),false)})})();'
)
LANG_JS = (
    '(function(){var pop=null;function close(){if(pop){pop.parentNode.removeChild(pop);pop=null}}'
    'function open(k){close();var d=document.createElement("div");d.className="kl-pop";d.setAttribute("role","note");'
    'var b=document.createElement("b");b.textContent=k.getAttribute("data-term");var t=document.createElement("span");t.className="kl-kind";t.textContent=k.getAttribute("data-kind");'
    'var s=document.createElement("span");s.textContent=k.getAttribute("data-meaning");d.appendChild(b);d.appendChild(t);d.appendChild(s);d.kl=k;document.body.appendChild(d);'
    'var r=k.getBoundingClientRect(),w=d.offsetWidth,x=Math.max(8,Math.min(window.pageXOffset+r.left,window.pageXOffset+document.documentElement.clientWidth-w-8));'
    'd.style.left=x+"px";d.style.top=(window.pageYOffset+r.bottom+6)+"px";pop=d}'
    'function fallback(t){var ta=document.createElement("textarea");ta.value=t;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.top="-1000px";document.body.appendChild(ta);ta.select();try{document.execCommand("copy")}catch(e){}document.body.removeChild(ta)}'
    'function copyText(t,done){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fallback(t);done()})}else{fallback(t);done()}}'
    'function flash(el,text){if(!el||el.getAttribute("data-busy"))return;var old=el.textContent;el.setAttribute("data-busy","1");el.textContent=text;el.classList.add("kl-done");'
    'setTimeout(function(){el.textContent=old;el.classList.remove("kl-done");el.removeAttribute("data-busy")},1200)}'
    'var KEY="jpn_kl_blur";function blurOn(){try{return localStorage.getItem(KEY)==="1"}catch(e){return false}}'
    'function applyBlur(on){[].slice.call(document.querySelectorAll(".kl-box")).forEach(function(b){b.classList.toggle("kl-blur",on);'
    'var t=b.querySelector(".kl-toggle");if(t){t.textContent=on?"Show meanings":"Hide meanings";t.setAttribute("aria-pressed",on?"true":"false")}'
    'var n=b.querySelector(".kl-note");if(n)n.textContent=on?"Tap an item to reveal its meaning":"";'
    'if(!on)[].slice.call(b.querySelectorAll(".kl-m.kl-show")).forEach(function(m){m.classList.remove("kl-show")})})}'
    'applyBlur(blurOn());'
    'document.addEventListener("click",function(e){var q=function(sel){return e.target.closest?e.target.closest(sel):null};'
    'var tg=q(".kl-toggle");if(tg){var on=!blurOn();try{localStorage.setItem(KEY,on?"1":"0")}catch(x){}applyBlur(on);return}'
    'var c=q(".kl-copy");if(c){var box=c.closest(".kl-box"),lines=[].slice.call(box.querySelectorAll(".kl-row")).map(function(r){return r.getAttribute("data-line")});copyText(lines.join("\\n"),function(){flash(c,"Copied")});return}'
    'var row=q(".kl-row");if(row){if(row.closest(".kl-box").classList.contains("kl-blur"))row.querySelector(".kl-m").classList.toggle("kl-show");return}'
    'var k=q(".kl");if(!k){if(!q(".kl-pop"))close();return}'
    'if(pop&&pop.kl===k)close();else open(k)});'
    'document.addEventListener("keydown",function(e){if(e.key==="Escape")close();'
    'else if((e.key==="Enter"||e.key===" ")&&e.target.classList&&(e.target.classList.contains("kl")||e.target.classList.contains("kl-row"))){e.preventDefault();'
    'if(e.target.classList.contains("kl-row"))e.target.click();else if(pop&&pop.kl===e.target)close();else open(e.target)}});'
    'window.addEventListener("resize",close)})();'
)
FONTS = [("default", "Georgia"), ("outfit", "Outfit")]

# Runs in <head> before the page paints: applies the reader's saved font (Georgia is the default; Outfit is hosted on this site).
HEAD_JS = (
    '<script>(function(){try{var f=localStorage.getItem("jpn_font");if(f==="outfit")document.documentElement.setAttribute("data-font","outfit")}catch(e){}})();</script>\n'
)

FONT_JS = (
    '(function(){var b=document.getElementById("fbtn"),m=document.getElementById("fmenu"),c=document.getElementById("fcur");if(!b||!m)return;'
    'var o=[].slice.call(m.querySelectorAll("[role=option]"));'
    'function sel(k,save){var f=o.filter(function(x){return x.getAttribute("data-font")===k})[0]||o[0];k=f.getAttribute("data-font");'
    'o.forEach(function(x){x.setAttribute("aria-selected",x===f)});c.textContent=f.getAttribute("data-short")||f.firstChild.textContent;'
    'if(k==="default")document.documentElement.removeAttribute("data-font");'
    'else{document.documentElement.setAttribute("data-font",k)}'
    'if(save){try{localStorage.setItem("jpn_font",k)}catch(e){}try{document.dispatchEvent(new CustomEvent("jpn:pref",{detail:{font:k}}))}catch(e){}}}'
    'function open(){m.hidden=false;b.setAttribute("aria-expanded","true");'
    '(o.filter(function(x){return x.getAttribute("aria-selected")==="true"})[0]||o[0]).focus()}'
    'function close(back){m.hidden=true;b.setAttribute("aria-expanded","false");if(back)b.focus()}'
    'var s="";try{s=localStorage.getItem("jpn_font")||""}catch(e){}sel(s,false);'
    'window.jpnFontSet=function(k){sel(k,false)};'
    'b.addEventListener("click",function(){m.hidden?open():close(true)});'
    'b.addEventListener("keydown",function(e){if(e.key==="ArrowDown"){e.preventDefault();open()}});'
    'o.forEach(function(x,i){x.addEventListener("click",function(){sel(x.getAttribute("data-font"),true);close(true)});'
    'x.addEventListener("keydown",function(e){var k=e.key;'
    'if(k==="ArrowDown"){e.preventDefault();o[Math.min(i+1,o.length-1)].focus()}'
    'else if(k==="ArrowUp"){e.preventDefault();o[Math.max(i-1,0)].focus()}'
    'else if(k==="Home"){e.preventDefault();o[0].focus()}else if(k==="End"){e.preventDefault();o[o.length-1].focus()}'
    'else if(k==="Enter"||k===" "){e.preventDefault();sel(x.getAttribute("data-font"),true);close(true)}'
    'else if(k==="Escape"||k==="Tab"){close(k==="Escape")}})});'
    'document.addEventListener("click",function(e){if(!m.hidden&&!e.target.closest(".fdrop"))close(false)})})();'
)

CHECK_ICON = ('<svg class="chk" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" '
              'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>')
CHEVRON_ICON = ('<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" '
                'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>')


PRINT_JS = (
    '(function(){var b=document.getElementById("pdfbtn");if(!b)return;var old="";'
    'b.addEventListener("click",function(){window.print()});'
    'var shut=[];window.addEventListener("beforeprint",function(){shut=[].slice.call(document.querySelectorAll("details.qs,details.kl-box")).filter(function(d){return!d.open});shut.forEach(function(d){d.open=true});old=document.title;var h=document.querySelector(".article-head h1"),'
    'l=document.querySelector(".metaleft"),lv=l&&l.getAttribute("data-print-level");if(h)document.title=h.textContent+(lv?" ("+lv+")":"")});'
    'window.addEventListener("afterprint",function(){shut.forEach(function(d){d.open=false});shut=[];if(old)document.title=old})})();'
)

PDF_ICON = ('<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" fill="none" '
            'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>')


def tools_html():
    """The two small controls at the right of the date line: reading font and save as PDF."""
    pdf = ('<button type="button" class="pdfbtn" id="pdfbtn" aria-label="Save this article as a PDF">{}<span>PDF</span></button>').format(PDF_ICON)
    return '<div class="tools">{}{}</div>'.format(font_picker(), pdf)


def font_picker():
    items = "".join(
        '<li role="option" class="fo-{k}" data-font="{k}" data-short="{short}" aria-selected="{sel}" tabindex="-1"><span>{label}</span>{chk}</li>'
        .format(k=k, sel="true" if k == "default" else "false", label=label, short=label.split()[0], chk=CHECK_ICON)
        for k, label in FONTS)
    return ('<div class="fontpick"><div class="fdrop">'
            '<button type="button" class="fbtn" id="fbtn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="flab fcur">'
            '<span class="flab" id="flab">Font</span><span id="fcur">Georgia</span>{}</button>'
            '<ul class="fmenu" id="fmenu" role="listbox" aria-labelledby="flab" hidden>{}</ul></div></div>'
            ).format(CHEVRON_ICON, items)


def timer_script():
    """The classroom timer lives in static/timer.js; the version in the address makes browsers fetch a changed copy."""
    f = STATIC / "timer.js"
    if not f.exists():
        return ""
    return '<script src="/timer.js?v={}" defer></script>\n'.format(hashlib.md5(f.read_bytes()).hexdigest()[:8])


def versioned(name):
    f = STATIC / name
    if not f.exists():
        return ""
    return '<script src="/{}?v={}" defer></script>\n'.format(name, hashlib.md5(f.read_bytes()).hexdigest()[:8])


def accounts_on():
    """Accounts are on when static/config.js names a Supabase project."""
    f = STATIC / "config.js"
    return f.exists() and bool(re.search(r'url:\s*"https?://[^"]+"', f.read_text(encoding="utf-8")))


# Runs in <head> before the page paints, so a reader who is not signed in never sees the locked articles flash up.
GUEST_JS = ('<script>try{if(!localStorage.getItem("jpn_session"))document.documentElement.classList.add("jpn-guest")}catch(e){document.documentElement.classList.add("jpn-guest")}'
            'setTimeout(function(){if(!window.jpnGateReady)document.documentElement.classList.remove("jpn-guest")},6000)</script>\n')   # fail open: if the sign-in script never runs, show everything


def account_scripts():
    """Sign-in lives in static/account.js and does nothing until static/config.js names a Supabase project."""
    return versioned("config.js") + versioned("account.js")


def highlight_script():
    """The highlighter lives in static/highlight.js; the version in the address makes browsers fetch a changed copy."""
    f = STATIC / "highlight.js"
    if not f.exists():
        return ""
    return '<script src="/highlight.js?v={}" defer></script>\n'.format(hashlib.md5(f.read_bytes()).hexdigest()[:8])


def questions_html(a, key):
    """A quiet, closed-by-default row. Opens to a numbered list; the PDF prints it open."""
    label = dict(QUESTION_SETS)[key]
    qs = a["questions"].get(key) or []
    if not qs:
        return ""
    return ('<details class="qs qs-{key}"><summary><span class="qs-label">{label}</span>'
            '<span class="qs-count">{n} question{s}</span>{chev}</summary><ol>{items}</ol></details>'
            ).format(key=key, label=label, n=len(qs), s="" if len(qs) == 1 else "s", chev=CHEVRON_ICON,
                     items="".join("<li>{}</li>".format(inline(q)) for q in qs))


def listen_html(a):
    """One quiet player row for each version that has a recording. static/listen.js turns the plain audio
    element into the custom player; without JavaScript the browser's own controls are used."""
    multi = len(a["versions"]) > 1
    d = default_index(a["versions"])
    out = []
    for i, v in enumerate(a["versions"]):
        if not v["audio"]:
            continue
        voice = '<span class="listen-voice">{}</span>'.format(esc(v["voice"])) if v["voice"] else ""
        out.append(
            '<div class="listen"{id}{hidden} data-title="{title}"><div class="listen-head"><span class="listen-label">Listen</span>{voice}</div>'
            '<audio class="listen-audio" controls preload="metadata" src="{src}"></audio></div>'.format(
                id=' id="l-{}"'.format(v["level"].lower()) if multi else "", hidden=" hidden" if multi and i != d else "",
                title=esc(v["title"]), voice=voice, src=esc(v["audio"])))
    return "\n".join(out)


def listen_script(a):
    f = STATIC / "listen.js"
    if not f.exists() or not any(v["audio"] for v in a["versions"]):
        return ""
    return '<script src="/listen.js?v={}" defer></script>\n'.format(hashlib.md5(f.read_bytes()).hexdigest()[:8])


def topics_html(a):
    """Small links to the topic pages, under the article."""
    if not a["tags"]:
        return ""
    return '<nav class="topics" aria-label="Topics"><span class="topics-label">Topics</span>{}</nav>'.format(
        "".join('<a class="chip" href="/tags/{}/">{}</a>'.format(t["slug"], esc(t["label"])) for t in a["tags"]))


def language_html(items):
    """A collapsible tinted box above a level's text, as a task before reading: three short lists (adjectives, phrasal
    verbs, phrases), each item with a short meaning. Closed until opened; the PDF prints it open. Copy list copies the items, and
    Hide meanings blurs the definitions so readers can test themselves, tapping an item to reveal it."""
    if not items:
        return ""
    cols = []
    for key, label in LANG_GROUPS:
        got = [it for it in items if it["group"] == key]
        if not got:
            continue
        lis = "".join(
            '<li class="kl-row" tabindex="0" data-line="{}"><b class="kl-t">{}</b><span class="kl-m">{}</span></li>'.format(
                esc("{} ({}): {}".format(it["term"], it["kind"], it["meaning"])), esc(it["term"]), inline(it["meaning"]))
            for it in got)
        cols.append('<div class="kl-col"><h3 class="kl-h">{}</h3><ul class="kl-list">{}</ul></div>'.format(label, lis))
    n = len(items)
    return ('<details class="kl-box"><summary><span class="kl-title">Useful language</span><span class="kl-count">{n} item{s}</span>{chev}</summary>'
            '<div class="kl-body"><div class="kl-head"><span class="kl-note"></span><span class="kl-btns"><button type="button" class="kl-toggle">Hide meanings</button>'
            '<button type="button" class="kl-copy">Copy list</button></span></div>'
            '<div class="kl-cols">{cols}</div></div></details>').format(n=n, s="" if n == 1 else "s", chev=CHEVRON_ICON, cols="".join(cols))


def versions_html(a):
    v = a["versions"]
    any_lang = any(x["language"] for x in v)
    if len(v) == 1:
        return '{}<div class="prose">\n{}\n</div>{}'.format(language_html(v[0]["language"]), v[0]["html"],
                                                            "\n<script>" + LANG_JS + "</script>" if any_lang else "")
    d = default_index(v)
    panels = "".join(
        '<section class="panel" role="tabpanel" id="v-{k}" aria-labelledby="tab-{k}"{hidden}>'
        '<h2 class="lvl-head">{label} version</h2>{lang}'
        '<div class="prose">\n{html}\n</div></section>'
        .format(k=x["level"].lower(), hidden="" if i == d else " hidden", label=esc(x["level"]), html=x["html"], lang=language_html(x["language"]))
        for i, x in enumerate(v))
    return '<div class="panels">{}</div>\n<script>{}</script>'.format(panels, TABS_JS + (LANG_JS if any_lang else ""))


def article_page(a, newer, older):
    first = a["versions"][default_index(a["versions"])]
    img = ""
    if a["image"]:
        parts = []
        for text, url in ((a["image_credit"], a["image_credit_url"]), (a["image_licence"], a["image_licence_url"])):
            if text:
                parts.append('<a href="{}" target="_blank" rel="noopener noreferrer">{}</a>'.format(esc(url), esc(text)) if url else esc(text))
        if a["image_credit_note"]:
            parts.append(esc(a["image_credit_note"]))
        credit = '<figcaption class="credit">{}: {}</figcaption>'.format(esc(a["image_credit_label"] or "Photo"), ", ".join(parts)) if parts else ""
        img = '<figure class="hero"><img class="hero-img" src="{}" alt="{}">{}</figure>'.format(
            esc(asset(a["image"])), esc(a["image_alt"]), credit)
    source = ""
    if a["source_name"]:
        name = '<a href="{}">{}</a>'.format(esc(a["source_url"]), esc(a["source_name"])) if a["source_url"] else esc(a["source_name"])
        source = '<p class="source">Source: {}</p>'.format(name)
    source += '<p class="ai-note">Written with AI assistance and edited by John. Spotted a mistake? <a href="/contact/">Tell us</a>.</p>'
    pager = ""
    if newer or older:
        def gate(x):
            return "" if x["slug"] in FREE_SLUGS else " data-lock"
        left = '<a href="{}"{}><small>Older article</small>{}</a>'.format(url_of(older), gate(older), esc(older["title"])) if older else "<span></span>"
        right = '<a class="next" href="{}"{}><small>Newer article</small>{}</a>'.format(url_of(newer), gate(newer), esc(newer["title"])) if newer else ""
        pager = '<nav class="pager" aria-label="More articles">{}{}</nav>'.format(left, right)
    main = """<article class="wrap"{locked}>
<header class="article-head">
<a class="back" href="/">&larr; All articles</a>
<div class="metarow{tabcls}"><div class="metaleft"{printlevel}>{tabs}{meta}</div>{picker}</div>
<script>{fontjs}</script>
<script>{printjs}</script>
<h1>{title}</h1>
<p class="dek">{summary}</p>
{img}
{listen}
{before}
</header>
{versions}
{after}
{source}
{topics}
{pager}
<p class="print-foot">{foot}</p>
</article>""".format(locked="" if a["slug"] in FREE_SLUGS else ' data-locked="1"', tabs=level_tabs(a), printlevel=(' data-print-level="{}"'.format(esc(first["level"])) if len(a["versions"]) > 1 else ""), tabcls=" has-tabs" if len(a["versions"]) > 1 else "", meta=article_meta(a), picker=tools_html(), fontjs=FONT_JS, printjs=PRINT_JS, title=esc(first["title"]), summary=esc(first["summary"]), img=img,
                     topics=topics_html(a), versions=versions_html(a), listen=listen_html(a), before=questions_html(a, "before"), after=questions_html(a, "after"), source=source, pager=pager,
                     foot=esc("Read this article online: " + SITE["url"].replace("https://", "") + url_of(a)))
    no_js = ".tools{display:none}" + (".vtabs{display:none}.panel[hidden]{display:block!important}.lvl-head{display:block!important}" if len(a["versions"]) > 1 else "")
    return page(url_of(a), main, title=first["title"], desc=first["summary"], image=a["image"] or None, kind="article",
                head_extra=HEAD_JS + "<noscript><style>" + no_js + "</style></noscript>\n" + highlight_script() + timer_script() + listen_script(a))


def not_found_page():
    main = '<div class="wrap"><h1 class="page-title">Page not found</h1><p><a class="more" href="/">Back to all articles &rarr;</a></p></div>'
    return page("/404.html", main, title="Page not found")


# ----------------------------------------------------------------------- build

def write(rel, text):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def attach_thumbs(arts, static_dir):
    """Cards use images/thumbs/<same file name> when it exists, so the gallery loads small files."""
    for a in arts:
        a["thumb"] = a["image"]
        if a["image"]:
            t = "images/thumbs/" + Path(a["image"]).name
            if (static_dir / t).exists():
                a["thumb"] = t


def build(content_dir=CONTENT, out_dir=OUT, static_dir=STATIC):
    global OUT
    if out_dir == ROOT / "docs":
        pass
    else:
        tmp = Path(tempfile.gettempdir()).resolve()
        if tmp not in Path(out_dir).resolve().parents:
            sys.exit("Refusing to clear unexpected output folder: {}".format(out_dir))
    arts = load_articles(content_dir)
    for a in arts:
        for v in a["versions"]:
            if v["audio"] and not v["audio"].startswith("http") and not (static_dir / v["audio"].lstrip("/")).is_file():
                sys.exit("The {} version of '{}' points to a recording that does not exist: {}".format(v["level"], a["title"], v["audio"]))
    attach_thumbs(arts, static_dir)
    FREE_SLUGS.clear()
    FREE_SLUGS.update(a["slug"] for a in arts[:FREE_COUNT])
    OUT = out_dir
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    if static_dir.exists():
        for item in static_dir.iterdir():
            dest = out_dir / item.name
            shutil.copytree(item, dest) if item.is_dir() else shutil.copy2(item, dest)

    topics = collect_topics(arts)
    write("index.html", gallery_page(arts, topics))
    for t in topics:
        write("tags/{}/index.html".format(t["slug"]), gallery_page(t["arts"], topics, t))
    write("about/index.html", about_page())
    write("privacy/index.html", legal_page("/privacy/", "Privacy notice", legal.privacy(SITE), "How johnplusnews handles your information."))
    write("terms/index.html", legal_page("/terms/", "Terms of use", legal.terms(SITE), "The terms for using johnplusnews."))
    write("contact/index.html", legal_page("/contact/", "Contact", legal.contact(SITE), "How to contact johnplusnews and report a mistake."))
    write("words/index.html", account_page("/words/", "My words", "words", "The words and phrases you have highlighted in articles, saved to your account."))
    write("teacher/index.html", account_page("/teacher/", "Teacher view", "teacher", "The words your students have saved, and what they have read."))
    write("articles.json", json.dumps({a["slug"]: {"title": a["title"]} for a in arts}, ensure_ascii=False))
    write("404.html", not_found_page())
    for i, a in enumerate(arts):
        newer = arts[i - 1] if i > 0 else None
        older = arts[i + 1] if i + 1 < len(arts) else None
        write("articles/{}/index.html".format(a["slug"]), article_page(a, newer, older))
    print("Built {} article(s) into {}".format(len(arts), out_dir))


def serve(port=8123):
    import functools
    import http.server
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(OUT))
    print("Preview at http://localhost:{}".format(port))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


def option(name):
    return Path(sys.argv[sys.argv.index(name) + 1]).resolve() if name in sys.argv else None


if __name__ == "__main__":
    build(option("--content") or CONTENT, option("--out") or OUT, option("--static") or STATIC)
    if "--serve" in sys.argv:
        serve()
