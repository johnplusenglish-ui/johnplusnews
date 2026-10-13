#!/usr/bin/env python3
"""Build the johnplusnews site into docs/ (the folder GitHub Pages publishes).

    python3 build.py            build
    python3 build.py --serve    build, then preview at http://localhost:8123

Each article is one plain text file in content/ (see README.md).
"""
import datetime as dt
import html
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
STATIC = ROOT / "static"
OUT = ROOT / "docs"

SITE = {
    "name": "johnplusnews",
    "url": "https://johnplusnews.com",
    "tagline": "A new article every week for English learners.",
    "social": [
        ("Telegram", "https://t.me/johnplusenglishchannel"),
        ("Instagram", "https://www.instagram.com/johnplusenglish/"),
    ],
}

NAV = [("/", "Articles"), ("/about/", "About")]
LEVELS = ["Intermediate", "Advanced", "Proficient"]


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
    level = {l.lower(): l for l in LEVELS}.get(meta.get("level", "").lower())
    if not level:
        fail(path, "level must be one of: " + ", ".join(LEVELS))
    if meta.get("draft", "").lower() in ("yes", "true", "1"):
        print("  skipped draft: " + path.name)
        return None

    summary = meta.get("summary", "")
    if not summary:
        first_para = plain(re.split(r"\n\s*\n", body)[0]).replace("\n", " ").strip()
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
        "level": level,
        "image": meta.get("image", ""),
        "image_alt": meta.get("image-alt", ""),
        "source_name": source_name,
        "source_url": source_url,
        "minutes": max(1, round(len(re.findall(r"\w+", plain(body))) / 200)),
        "html": body_html(body),
    }


def load_articles(content_dir=CONTENT):
    arts, seen = [], {}
    for path in sorted(content_dir.glob("*.md")):
        a = parse_article(path)
        if not a:
            continue
        if a["slug"] in seen:
            fail(path, "same slug as " + seen[a["slug"]])
        seen[a["slug"]] = path.name
        arts.append(a)
    arts.sort(key=lambda a: (a["date"], a["slug"]), reverse=True)
    return arts


def url_of(a):
    return "/articles/{}/".format(a["slug"])


# ------------------------------------------------------------------- templates

CSS = (ROOT / "style.css").read_text(encoding="utf-8")


def page(path, main, title=None, desc=None, current=None, image=None, kind="website", wide=False):
    full_title = SITE["name"] + " | " + SITE["tagline"].rstrip(".") if title is None else "{} | {}".format(title, SITE["name"])
    desc = desc or SITE["tagline"]
    canon = SITE["url"] + path
    nav = "".join(
        '<a href="{}"{}>{}</a>'.format(href, ' aria-current="page"' if href == current else "", label)
        for href, label in NAV
    )
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
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{css}</style>
</head>
<body{body_class}>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">john<span>plus</span>news</a>
    <nav class="site-nav" aria-label="Main">{nav}</nav>
  </div>
</header>
<main id="main">
{main}
</main>
<footer class="site-footer">
  <div class="wrap">{name}. {tagline}</div>
</footer>
</body>
</html>
""".format(title=esc(full_title), desc=esc(desc), canon=esc(canon), name=SITE["name"], kind=kind,
           og_image=og_image, css=CSS, nav=nav, main=main, tagline=SITE["tagline"],
           body_class=' class="wide"' if wide else "")


def meta_line(a, long=False):
    bits = []
    if a["level"]:
        bits.append('<span class="lvl">{}</span>'.format(esc(a["level"])))
    bits.append("<span>{}</span>".format(fmt(a["date"], short=not long)))
    bits.append("<span>{} min read</span>".format(a["minutes"]))
    return '<p class="meta">{}</p>'.format("".join(bits))


def card(a):
    if a["image"]:
        thumb = '<img src="{}" alt="{}" loading="lazy" decoding="async">'.format(esc(asset(a.get("thumb") or a["image"])), esc(a["image_alt"]))
    else:
        thumb = '<span class="blank">{}</span>'.format(esc(a["level"]))
    return (
        '<li class="card"><div class="thumb">{thumb}</div>{meta}'
        '<h2><a href="{url}">{title}</a></h2><p class="sub">{summary}</p></li>'
    ).format(thumb=thumb, meta=meta_line(a), url=url_of(a), title=esc(a["title"]), summary=esc(a["summary"]))


def level_url(level):
    return "/" if level is None else "/{}/".format(level.lower())


def gallery_page(arts, level=None):
    shown = [a for a in arts if level is None or a["level"] == level]
    tabs = "".join(
        '<a href="{}"{}>{}</a>'.format(level_url(l), ' aria-current="page"' if l == level else "", l or "All")
        for l in [None] + LEVELS
    )
    if shown:
        body = '<ul class="gallery">{}</ul>'.format("".join(card(a) for a in shown))
    elif level:
        body = '<p class="empty">No {} articles yet. Check back soon.</p>'.format(level.lower())
    else:
        body = '<p class="empty">The first article is coming soon.</p>'
    main = '<div class="wrap"><h1 class="intro">{}</h1><nav class="levels" aria-label="Level">{}</nav>{}</div>'.format(
        esc(SITE["tagline"]), tabs, body)
    desc = "{} articles for English learners.".format(level) if level else SITE["tagline"]
    return page(level_url(level), main, title="{} articles".format(level) if level else None, current="/",
                desc=desc, image=(shown[0]["image"] if shown else "") or None, wide=True)


def about_page():
    links = "".join(
        '<li><a href="{}" target="_blank" rel="noopener noreferrer"><span>{}</span><span aria-hidden="true">&rarr;</span></a></li>'.format(esc(url), label)
        for label, url in SITE["social"]
    )
    main = '<div class="wrap"><h1 class="page-title">About</h1><ul class="social">{}</ul></div>'.format(links)
    return page("/about/", main, title="About", current="/about/", desc="johnplusnews on Telegram and Instagram.")


def article_page(a, newer, older):
    img = '<img class="hero-img" src="{}" alt="{}">'.format(esc(asset(a["image"])), esc(a["image_alt"])) if a["image"] else ""
    source = ""
    if a["source_name"]:
        name = '<a href="{}">{}</a>'.format(esc(a["source_url"]), esc(a["source_name"])) if a["source_url"] else esc(a["source_name"])
        source = '<p class="source">Source: {}</p>'.format(name)
    pager = ""
    if newer or older:
        left = '<a href="{}"><small>Older {} article</small>{}</a>'.format(url_of(older), a["level"].lower(), esc(older["title"])) if older else "<span></span>"
        right = '<a class="next" href="{}"><small>Newer {} article</small>{}</a>'.format(url_of(newer), a["level"].lower(), esc(newer["title"])) if newer else ""
        pager = '<nav class="pager" aria-label="More articles">{}{}</nav>'.format(left, right)
    main = """<article class="wrap">
<header class="article-head">
<a class="back" href="/">&larr; All articles</a>
{meta}
<h1>{title}</h1>
<p class="dek">{summary}</p>
{img}
</header>
<div class="prose">
{body}
</div>
{source}
{pager}
</article>""".format(meta=meta_line(a, long=True), title=esc(a["title"]), summary=esc(a["summary"]), img=img,
                     body=a["html"], source=source, pager=pager)
    return page(url_of(a), main, title=a["title"], desc=a["summary"],
                image=a["image"] or None, kind="article")


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
    attach_thumbs(arts, static_dir)
    OUT = out_dir
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    if static_dir.exists():
        for item in static_dir.iterdir():
            dest = out_dir / item.name
            shutil.copytree(item, dest) if item.is_dir() else shutil.copy2(item, dest)

    write("index.html", gallery_page(arts))
    for level in LEVELS:
        write("{}/index.html".format(level.lower()), gallery_page(arts, level))
    write("about/index.html", about_page())
    write("404.html", not_found_page())
    for a in arts:
        same = [x for x in arts if x["level"] == a["level"]]
        i = same.index(a)
        newer = same[i - 1] if i > 0 else None
        older = same[i + 1] if i + 1 < len(same) else None
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
