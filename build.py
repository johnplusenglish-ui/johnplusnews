#!/usr/bin/env python3
"""Build the johnplusnews site into docs/ (the folder GitHub Pages publishes).

    python3 build.py            build
    python3 build.py --serve    build, then preview at http://localhost:8123

Each article is one plain text file in content/ (see README.md).
"""
import datetime as dt
import hashlib
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
LEVELS = ["Intermediate", "Advanced"]


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


VERSION_MARK = re.compile(r"^===[ \t]*([A-Za-z]+)[ \t]*===[ \t]*$", re.M)


HEAD_LINE = re.compile(r"^(title|summary):[ \t]*(.*)$", re.I)


def take_head(text):
    """A version may start with its own 'title:' and/or 'summary:' lines, then a blank line.
    Returns ({'title','summary'}, rest-of-text)."""
    own = {"title": "", "summary": ""}
    lines = text.split("\n")
    i = 0
    while i < len(lines) and HEAD_LINE.match(lines[i]):
        m = HEAD_LINE.match(lines[i])
        own[m.group(1).lower()] = m.group(2).strip()
        i += 1
    if i == 0 or (i < len(lines) and lines[i].strip()):
        return {"title": "", "summary": ""}, text
    return own, "\n".join(lines[i:]).strip()


def parse_versions(meta, body):
    """Return [{'level','text','title','summary'}] in LEVELS order. An article is either one text with a
    'level:' header, or several texts, each starting with a line like === Advanced ===. A version may
    also carry its own headline and subheading (title:/summary: lines right after its marker).
    Raises ValueError."""
    levels = {l.lower(): l for l in LEVELS}
    marks = list(VERSION_MARK.finditer(body))
    if not marks:
        level = levels.get(meta.get("level", "").lower())
        if not level:
            raise ValueError("add a 'level:' header, or start each version with a line like === Advanced ===")
        if not body.strip():
            raise ValueError("the article text is empty")
        return [{"level": level, "text": body.strip(), "title": "", "summary": ""}]
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
        out.append({"level": level, "text": text, "title": own["title"], "summary": own["summary"]})
    names = [v["level"] for v in out]
    if len(set(names)) != len(names):
        raise ValueError("the same level appears twice")
    return sorted(out, key=lambda v: LEVELS.index(v["level"]))


def split_versions(meta, body):
    """Return [(level, text)] in LEVELS order (the simple form of parse_versions)."""
    return [(v["level"], v["text"]) for v in parse_versions(meta, body)]


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
        "versions": [
            {"level": v["level"], "html": body_html(v["text"]),
             "title": v["title"] or meta["title"], "summary": v["summary"] or summary}
            for v in versions
        ],
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


def page(path, main, title=None, desc=None, current=None, image=None, kind="website", wide=False, head_extra=""):
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
{head_extra}<style>{css}</style>
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
           body_class=' class="wide"' if wide else "", head_extra=head_extra)


def levels_label(a):
    return ", ".join(a["levels"])


def card_meta(a):
    return '<p class="meta"><span class="lvl">{}</span><span>{}</span></p>'.format(esc(levels_label(a)), fmt(a["date"], short=True))


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
    tabs = "".join(
        '<button type="button" role="tab" id="tab-{k}" aria-controls="v-{k}" aria-selected="{sel}" tabindex="{ti}" data-level="{k}" data-title="{t}" data-sub="{u}">{label}</button>'
        .format(k=x["level"].lower(), sel="true" if i == 0 else "false", ti=0 if i == 0 else -1, t=esc(x["title"]), u=esc(x["summary"]), label=esc(x["level"]))
        for i, x in enumerate(v))
    return '<div class="vtabs" role="tablist" aria-label="Reading level" data-tabs>{}</div>'.format(tabs)


def card(a):
    if a["image"]:
        thumb = '<img src="{}" alt="{}" loading="lazy" decoding="async">'.format(esc(asset(a.get("thumb") or a["image"])), esc(a["image_alt"]))
    else:
        thumb = '<span class="blank">{}</span>'.format(esc(levels_label(a)))
    return (
        '<li class="card"><div class="thumb">{thumb}</div>{meta}'
        '<h2><a href="{url}">{title}</a></h2><p class="sub">{summary}</p></li>'
    ).format(thumb=thumb, meta=card_meta(a), url=url_of(a), title=esc(a["title"]), summary=esc(a["summary"]))


def gallery_page(arts):
    if arts:
        body = '<ul class="gallery">{}</ul>'.format("".join(card(a) for a in arts))
    else:
        body = '<p class="empty">The first article is coming soon.</p>'
    main = '<div class="wrap"><h1 class="intro">{}</h1>{}</div>'.format(esc(SITE["tagline"]), body)
    return page("/", main, current="/", desc=SITE["tagline"], image=(arts[0]["image"] if arts else "") or None, wide=True)


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
    'x.tabIndex=on?0:-1;document.getElementById("v-"+l).hidden=!on;'
    'if(on){var tt=x.getAttribute("data-title"),ss=x.getAttribute("data-sub"),h=document.querySelector(".article-head h1"),d=document.querySelector(".dek"),ml=document.querySelector(".metaleft");if(ml)ml.setAttribute("data-print-level",x.textContent);'
    'if(h&&tt)h.textContent=tt;if(d&&ss)d.textContent=ss;if(tt)document.title=tt+" | "+document.title.split(" | ").pop()}});'
    'if(save){try{localStorage.setItem("jpn_level",k)}catch(e){}try{history.replaceState(null,"","#"+k)}catch(e){}}return true}'
    'var s="";try{s=localStorage.getItem("jpn_level")||""}catch(e){}'
    'if(!show(location.hash.slice(1).toLowerCase(),false))show(s,false);'
    't.forEach(function(x,i){x.addEventListener("click",function(){show(x.getAttribute("data-level"),true)});'
    'x.addEventListener("keydown",function(e){var n=e.key==="ArrowRight"?i+1:e.key==="ArrowLeft"?i-1:-1;'
    'if(n<0||n>=t.length)return;e.preventDefault();t[n].focus();show(t[n].getAttribute("data-level"),true)})});'
    'window.addEventListener("hashchange",function(){show(location.hash.slice(1).toLowerCase(),false)})})();'
)
FONTS = [("default", "Default"), ("georgia", "Georgia"), ("verdana", "Verdana"),
         ("atkinson", "Atkinson Hyperlegible"), ("lexend", "Lexend")]

# Runs in <head> before the page paints: applies the reader's saved font, and loads the two web fonts only on demand.
HEAD_JS = (
    '<script>(function(){var G={atkinson:"Atkinson+Hyperlegible:wght@400;700",lexend:"Lexend:wght@400;500;600"};'
    'window.jpnFont=function(k){if(G[k]&&!document.getElementById("gf-"+k)){var l=document.createElement("link");'
    'l.id="gf-"+k;l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family="+G[k]+"&display=swap";document.head.appendChild(l)}};'
    'try{var f=localStorage.getItem("jpn_font");if(f&&/^[a-z]+$/.test(f)){document.documentElement.setAttribute("data-font",f);window.jpnFont(f)}}catch(e){}})();</script>\n'
)

FONT_JS = (
    '(function(){var b=document.getElementById("fbtn"),m=document.getElementById("fmenu"),c=document.getElementById("fcur");if(!b||!m)return;'
    'var o=[].slice.call(m.querySelectorAll("[role=option]"));'
    'function sel(k,save){var f=o.filter(function(x){return x.getAttribute("data-font")===k})[0]||o[0];k=f.getAttribute("data-font");'
    'o.forEach(function(x){x.setAttribute("aria-selected",x===f)});c.textContent=f.getAttribute("data-short")||f.firstChild.textContent;'
    'if(k==="default")document.documentElement.removeAttribute("data-font");'
    'else{document.documentElement.setAttribute("data-font",k);window.jpnFont&&window.jpnFont(k)}'
    'if(save){try{localStorage.setItem("jpn_font",k)}catch(e){}}}'
    'function open(){if(window.jpnFont){window.jpnFont("atkinson");window.jpnFont("lexend")}m.hidden=false;b.setAttribute("aria-expanded","true");'
    '(o.filter(function(x){return x.getAttribute("aria-selected")==="true"})[0]||o[0]).focus()}'
    'function close(back){m.hidden=true;b.setAttribute("aria-expanded","false");if(back)b.focus()}'
    'var s="";try{s=localStorage.getItem("jpn_font")||""}catch(e){}sel(s,false);'
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
    'window.addEventListener("beforeprint",function(){old=document.title;var h=document.querySelector(".article-head h1"),'
    'l=document.querySelector(".metaleft"),lv=l&&l.getAttribute("data-print-level");if(h)document.title=h.textContent+(lv?" ("+lv+")":"")});'
    'window.addEventListener("afterprint",function(){if(old)document.title=old})})();'
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
            '<span class="flab" id="flab">Font</span><span id="fcur">Default</span>{}</button>'
            '<ul class="fmenu" id="fmenu" role="listbox" aria-labelledby="flab" hidden>{}</ul></div></div>'
            ).format(CHEVRON_ICON, items)


def highlight_script():
    """The highlighter lives in static/highlight.js; the version in the address makes browsers fetch a changed copy."""
    f = STATIC / "highlight.js"
    if not f.exists():
        return ""
    return '<script src="/highlight.js?v={}" defer></script>\n'.format(hashlib.md5(f.read_bytes()).hexdigest()[:8])


def versions_html(a):
    v = a["versions"]
    if len(v) == 1:
        return '<div class="prose">\n{}\n</div>'.format(v[0]["html"])
    panels = "".join(
        '<section class="panel" role="tabpanel" id="v-{k}" aria-labelledby="tab-{k}"{hidden}>'
        '<h2 class="lvl-head">{label} version</h2>'
        '<div class="prose">\n{html}\n</div></section>'
        .format(k=x["level"].lower(), hidden="" if i == 0 else " hidden", label=esc(x["level"]), html=x["html"])
        for i, x in enumerate(v))
    return '<div class="panels">{}</div>\n<script>{}</script>'.format(panels, TABS_JS)


def article_page(a, newer, older):
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
    pager = ""
    if newer or older:
        left = '<a href="{}"><small>Older article</small>{}</a>'.format(url_of(older), esc(older["title"])) if older else "<span></span>"
        right = '<a class="next" href="{}"><small>Newer article</small>{}</a>'.format(url_of(newer), esc(newer["title"])) if newer else ""
        pager = '<nav class="pager" aria-label="More articles">{}{}</nav>'.format(left, right)
    main = """<article class="wrap">
<header class="article-head">
<a class="back" href="/">&larr; All articles</a>
<div class="metarow{tabcls}"><div class="metaleft"{printlevel}>{tabs}{meta}</div>{picker}</div>
<script>{fontjs}</script>
<script>{printjs}</script>
<h1>{title}</h1>
<p class="dek">{summary}</p>
{img}
</header>
{versions}
{source}
{pager}
<p class="print-foot">{foot}</p>
</article>""".format(tabs=level_tabs(a), printlevel=(' data-print-level="{}"'.format(esc(a["versions"][0]["level"])) if len(a["versions"]) > 1 else ""), tabcls=" has-tabs" if len(a["versions"]) > 1 else "", meta=article_meta(a), picker=tools_html(), fontjs=FONT_JS, printjs=PRINT_JS, title=esc(a["versions"][0]["title"]), summary=esc(a["versions"][0]["summary"]), img=img,
                     versions=versions_html(a), source=source, pager=pager,
                     foot=esc("Read this article online: " + SITE["url"].replace("https://", "") + url_of(a)))
    no_js = ".tools{display:none}" + (".vtabs{display:none}.panel[hidden]{display:block!important}.lvl-head{display:block!important}" if len(a["versions"]) > 1 else "")
    return page(url_of(a), main, title=a["versions"][0]["title"], desc=a["versions"][0]["summary"], image=a["image"] or None, kind="article",
                head_extra=HEAD_JS + "<noscript><style>" + no_js + "</style></noscript>\n" + highlight_script())


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
    write("about/index.html", about_page())
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
