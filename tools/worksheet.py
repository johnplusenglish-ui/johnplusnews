"""The printed worksheet for a lesson article: one A4 PDF per level in static/worksheets/, with the
answer key alone on the last page. Run it after changing the article or its exercises, then build.

    python3 tools/worksheet.py would-you-miss-work-to-play-a-video-game

It needs Google Chrome, which does the printing."""
import hashlib, html, json, re, subprocess, sys, tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "static" / "worksheets"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if len(sys.argv) != 2:
    raise SystemExit("usage: python3 tools/worksheet.py <article-slug>")
SLUG = sys.argv[1]
MD = next((REPO / "content").glob("*-" + SLUG + ".md"))
EX = json.loads((REPO / "content" / "exercises" / (SLUG + ".json")).read_text())
LEVELS = ["Core", "Intermediate", "Advanced"]
CEFR = {"Core": "B1", "Intermediate": "B2", "Advanced": "C1/C2"}
esc = html.escape

raw = MD.read_text()
head, body = raw.split("\n---\n", 1)
meta = dict(l.split(": ", 1) for l in head.split("\n") if ": " in l)
parts = re.split(r"^=== (.+?) ===\s*$", body, flags=re.M)
sec = {parts[i].strip(): parts[i + 1].strip() for i in range(1, len(parts), 2)}


def level_text(level):
    lines = sec[level].split("\n")
    own = {}
    while lines and re.match(r"^(title|summary|audio|voice): ", lines[0]):
        k, v = lines.pop(0).split(": ", 1)
        own[k] = v
    paras = [p.strip() for p in "\n".join(lines).split("\n\n") if p.strip()]
    return own.get("title", meta["title"]), own.get("summary", meta["summary"]), paras


def bullets(name):
    return [re.sub(r"^[-\d.\s]+", "", l).strip() for l in sec.get(name, "").split("\n") if l.strip()]


def order(seed, n):
    return sorted(range(n), key=lambda i: hashlib.md5("{}|{}".format(seed, i).encode()).hexdigest())


def gap(s, cls="gap"):
    a, b = s.split("____", 1)
    return '{}<span class="{}"></span>{}'.format(esc(a), cls, esc(b))


def task(n, title, how, inner, extra=""):
    return ('<section class="task {x}"><h3><span class="num">{n}</span>{t}</h3>'
            '<p class="how">{h}</p>{i}</section>').format(x=extra, n=n, t=esc(title), h=how, i=inner)


def sheet(level, teacher, compact=False):
    key = level.lower()
    d = EX["levels"][key]
    title, summary, paras = level_text(level)
    taken = {x.lower() for i in d["grammar"]["items"] for x in i["a"].split("|")} | {i["a"].lower() for i in d["gap"]["items"]}
    words = [w for w in d["pre"] + d["match"] if w["t"].lower() not in taken][:8]  # a key word must not give away a later answer
    od = order(SLUG + key, len(words))
    letter = {i: chr(65 + pos) for pos, i in enumerate(od)}
    ans = []

    # 1 warm-up
    warm = "<ol class='qs'>{}</ol>".format("".join("<li>{}</li>".format(esc(q)) for q in bullets(level + " before you read")))
    t1 = task(1, "Warm up", "Talk about these questions with a partner.", warm)

    # 2 key words
    left = "".join('<li><span class="box"></span><b>{}</b></li>'.format(esc(w["t"])) for w in words)
    right = "".join('<li><b>{}</b>{}</li>'.format(chr(65 + n), esc(words[i]["d"])) for n, i in enumerate(od))
    t2 = task(2, "Key words",
              "These words are in the article. Write the letter of the meaning (A to {}) in each box.".format(chr(64 + len(words))),
              '<div class="kw"><ol class="kw-w">{}</ol><ul class="kw-m">{}</ul></div>'.format(left, right))
    ans.append(("2 Key words", ["{} {}".format(n, letter[i]) for n, i in enumerate(range(len(words)), 1)]))

    # 3 the article
    art = "".join('<p><span class="pn">{}</span>{}</p>'.format(n, esc(p)) for n, p in enumerate(paras, 1))
    src = []
    for k in ("source", "source-2", "source-3"):
        if meta.get(k):
            src.append(esc(meta[k].split("|")[0].strip()))
    t3 = ('<section class="task read"><h3><span class="num">3</span>Read</h3>'
          '<p class="how">Read the article and underline the key words from task 2. The paragraphs are numbered.</p>'
          '<div class="art"><p class="sum">{s}</p><div class="cols">{a}</div>'
          '<p class="src">Sources: {src}. Picture: {cr}.</p></div></section>').format(
              s=esc(summary), a=art, src="; ".join(src), cr=esc(meta.get("image-credit-label", "")))

    # 4 understanding
    rows = "".join('<li><span class="st">{}</span><span class="tfn"><i>T</i><i>F</i><i>NG</i></span></li>'.format(esc(i["s"]))
                   for i in d["tfn"])
    t4 = task(4, "True, false or not given",
              "Circle <b>T</b> (true), <b>F</b> (false) or <b>NG</b> (the article does not say).",
              '<ol class="rows">{}</ol>'.format(rows))
    ans.append(("4 True, false or not given", ["{} {}".format(n, {"T": "T", "F": "F", "N": "NG"}[i["a"]]) for n, i in enumerate(d["tfn"], 1)]))

    # 5 vocabulary
    g = d["gap"]
    bank = sorted([i["a"] for i in g["items"]] + list(g.get("extra") or []), key=str.lower)
    t5 = task(5, "Vocabulary", "Complete the sentences with words from the box. Two words are not needed.",
              '<p class="bank">{}</p><ol class="rows">{}</ol>'.format(
                  "".join("<span>{}</span>".format(esc(w)) for w in bank),
                  "".join("<li>{}</li>".format(gap(i["s"])) for i in g["items"])))
    ans.append(("5 Vocabulary", ["{} {}".format(n, i["a"]) for n, i in enumerate(g["items"], 1)]))

    # 6 grammar
    gr = d["grammar"]
    verb = gr["kind"] == "verb"
    t6 = task(6, "Verb forms" if verb else "Word forms",
              "Write the correct form of the verb in brackets." if verb else
              "Use the word in brackets to make a word that fits the gap.",
              '<ol class="rows">{}</ol>'.format("".join(
                  '<li>{} <span class="cue">({})</span></li>'.format(gap(i["s"], "gap long"), esc(i["cue"].upper()))
                  for i in gr["items"])))
    ans.append(("6 " + ("Verb forms" if verb else "Word forms"),
                ["{} {}".format(n, i["a"].replace("|", " or ")) for n, i in enumerate(gr["items"], 1)]))

    # 7 linking words
    lk = d["focus"]
    lbank = sorted([i["a"].lower() for i in lk["items"]] + [x.lower() for x in lk.get("extra") or []])
    t7 = task(7, "Language focus: " + lk["type"],
              "Complete the sentences with words from the box. Two words are not needed. " + esc(lk["note"]),
              '<p class="bank">{}</p><ol class="rows">{}</ol>'.format(
                  "".join("<span>{}</span>".format(esc(w.lower())) for w in lbank),
                  "".join("<li>{}</li>".format(gap(i["s"])) for i in lk["items"])))
    ans.append(("7 Language focus", ["{} {}".format(n, i["a"]) for n, i in enumerate(lk["items"], 1)]))

    # 8 discussion
    talk = "<ol class='qs'>{}</ol>".format("".join("<li>{}</li>".format(esc(q)) for q in bullets(level + " talk about it")))
    t8 = task(8, "Talk about it", "Discuss in pairs or small groups. Give reasons for your answers.", talk)

    # 9 role-play, or for a Teens story its group activity with useful phrases
    sp = EX["speak"]
    phr = '<div class="phr"><h4>Useful phrases</h4><ul>{}</ul></div>'.format("".join("<li>{}</li>".format(esc(p)) for p in sp["phrases"]))
    if sp.get("a"):
        t9 = task(9, sp["title"], esc(sp["setup"]),
                  '<div class="cards"><div class="card"><h4>Student A · {ar}</h4><p>{at}</p></div>'
                  '<div class="card"><h4>Student B · {br}</h4><p>{bt}</p></div></div>{ph}<p class="after">{af}</p>'.format(
                      ar=esc(sp["a"]["role"]), at=esc(sp["a"]["text"]), br=esc(sp["b"]["role"]), bt=esc(sp["b"]["text"]),
                      ph=phr, af=esc(sp["after"])))
    else:
        t9 = task(9, sp["title"], esc(re.sub(r"\s+", " ", sec["Activity"])), phr)

    keyblock = ""
    if teacher:
        keyblock = '<section class="key"><h2 class="stage">Answer key</h2><dl>{}</dl>SUPPORT</section>'.format(
            "".join("<dt>{}</dt><dd>{}</dd>".format(esc(h), " &nbsp;·&nbsp; ".join(esc(x) for x in xs)) for h, xs in ans))

    teens = meta.get("audience", "").strip() == "teens"
    # a line for the teacher under the answer key; not on Teens sheets
    keyblock = keyblock.replace("SUPPORT", "" if teens else
                                '<p class="support">This lesson is free. If it saved you time, you can support johnplusnews at <b>ko-fi.com/johnplusenglish</b></p>')
    foot = "{}{} · {} {}".format("Teens · " if teens else "", meta["title"], level, CEFR[level])
    return TEMPLATE.format(
        css=CSS.replace("FOOT", foot.replace('"', "'")).replace("FONTFACES", FACES), level=level, cefr=CEFR[level], tight="tight" if compact else "", date=esc(meta.get("date-label", "")),
        who='Name <span class="line"></span>',
        title=esc(title), img=PICTURE, kicker="Teens lesson" if teens else "News lesson", t1=t1, t2=t2, t3=t3, t4=t4, t5=t5, t6=t6, t7=t7, t8=t8, t9=t9,
        key=keyblock)


TEMPLATE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title} ({level} {cefr})</title>
<style>{css}</style></head><body class="{tight}">
<header class="top"><span class="brand">john<b>plus</b>news</span><span class="lv">{level} <b>{cefr}</b></span>
<span class="dt">{date}</span><span class="who">{who}</span></header>
<div class="hero"><div><p class="kicker">{kicker}</p><h1>{title}</h1></div><img src="{img}" alt=""></div>
<h2 class="stage">Before you read</h2>
{t1}{t2}
<h2 class="stage brk">Read</h2>
{t3}
<h2 class="stage brk">After you read</h2>
{t4}{t5}{t6}{t7}
<h2 class="stage">Speak</h2>
{t8}{t9}
{key}
</body></html>"""

CSS = """
FONTFACES
@page{size:A4;margin:14mm 15mm 16mm;
  @bottom-left{content:"johnplusnews.com  ·  FOOT";font:7.5pt Outfit,sans-serif;color:#6b7280}
  @bottom-right{content:counter(page) " / " counter(pages);font:7.5pt Outfit,sans-serif;color:#6b7280}}
*{box-sizing:border-box}
html{font:10.5pt/1.45 Outfit,system-ui,sans-serif;color:#14181f;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}
em,i{font-style:normal}
:root{--a:#1d5fe0;--soft:#eef3fd;--line:#d5dae3;--mu:#5b6472}
.top{display:flex;align-items:center;gap:4mm;padding-bottom:2.5mm;border-bottom:1.2pt solid #14181f;font-size:9pt}
.brand{font-weight:700;font-size:11pt;letter-spacing:-.01em}.brand b{color:var(--a);font-weight:700}
.lv{background:var(--a);color:#fff;font-weight:600;padding:.6mm 2.6mm;border-radius:2mm;font-size:8.5pt}
.lv b{font-weight:500;opacity:.85;margin-left:1.2mm;padding-left:1.6mm;border-left:.5pt solid rgba(255,255,255,.6)}
.dt{color:var(--mu)}.who{margin-left:auto;color:var(--mu)}
.line{display:inline-block;width:52mm;border-bottom:.35pt solid #4b5563;margin-left:1.5mm;height:4mm;vertical-align:bottom}
.hero{display:flex;gap:7mm;align-items:center;margin:5mm 0 1mm}
.hero>div{flex:1;min-width:0}.hero img{width:62mm;height:41mm;object-fit:cover;border-radius:2.5mm;flex:none}
.kicker{margin:0 0 1.5mm;font-size:8pt;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--a)}
h1{font:600 21pt/1.12 Outfit,sans-serif;letter-spacing:-.015em;margin:0}
.stage{font:600 8.5pt Outfit,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);
  margin:6mm 0 2.5mm;padding-bottom:1.2mm;border-bottom:.6pt solid var(--line);break-after:avoid}
.stage.brk{break-before:page;margin-top:0}
.task{margin:0 0 5mm;break-inside:avoid}
.task h3{display:flex;align-items:center;gap:2.5mm;font:600 12pt Outfit,sans-serif;margin:0 0 1mm}
.num{display:inline-flex;align-items:center;justify-content:center;width:6.2mm;height:6.2mm;border-radius:50%;
  background:var(--a);color:#fff;font:600 9.5pt Outfit,sans-serif;flex:none}
.how{margin:0 0 2.2mm 8.7mm;color:var(--mu);font-size:9.5pt}
.task>ol,.task>div,.task>p.bank,.task>p.after{margin-left:8.7mm}
ol.qs,ol.rows{padding-left:5mm;margin-top:0;margin-bottom:0}
ol.qs li{margin:0 0 1.6mm;padding-left:1mm}
ol.qs li::marker,ol.rows li::marker{color:var(--a);font-weight:600}
ol.rows li{margin:0 0 2.6mm;padding-left:1mm;line-height:1.6}
.gap{display:inline-block;width:27mm;border-bottom:.35pt solid #4b5563;height:4.2mm;vertical-align:-0.55mm;margin:0 1mm}
.gap.long{width:34mm}
.cue{font-weight:600;color:var(--mu);font-size:9pt;letter-spacing:.03em}
.bank{display:flex;flex-wrap:wrap;gap:1.6mm 5mm;border:.6pt solid var(--a);background:var(--soft);border-radius:2mm;
  padding:2mm 3.5mm;margin-top:0;margin-bottom:3mm;font-weight:500}
.kw{display:grid;grid-template-columns:44mm 1fr;gap:0 8mm}
.kw ol,.kw ul{margin:0;padding:0;list-style:none}
.kw li{display:flex;align-items:center;gap:2.2mm;min-height:7.4mm;border-bottom:.4pt solid var(--line)}
.kw-w{counter-reset:k}.kw-w li{counter-increment:k}
.kw-w li::before{content:counter(k);color:var(--a);font-weight:600;width:4.5mm;font-size:9.5pt}
.kw-w b{font-weight:600}
.box{order:3;margin-left:auto;width:6mm;height:5.6mm;border:.6pt solid #14181f;border-radius:1mm;flex:none}
.kw-m b{color:var(--a);font-weight:600;width:5mm;flex:none}
.rows li{position:relative}
li:has(.tfn){display:list-item}
.st{display:inline-block;width:calc(100% - 30mm);vertical-align:top}
.tfn{display:inline-flex;gap:2mm;width:29mm;justify-content:flex-end;vertical-align:top}
.tfn i{display:inline-flex;align-items:center;justify-content:center;min-width:7.2mm;height:5.6mm;border:.5pt solid #7b8494;
  border-radius:3mm;font-size:8pt;font-weight:600;color:#3a4250;padding:0 1mm}
.read .how{margin-bottom:3mm}
.task.read{break-inside:auto}
.art{margin-left:0;border-top:1.2pt solid #14181f;padding-top:3mm}
.art h2{font:600 15pt/1.15 Newsreader,Georgia,serif;margin:0 0 1.2mm}
.sum{font:500 11.5pt/1.35 Newsreader,Georgia,serif;color:#3a4250;margin:0 0 3.2mm}
.cols{column-count:2;column-gap:8mm;column-rule:.4pt solid var(--line);font:400 10.3pt/1.46 Newsreader,Georgia,serif;
  text-align:justify;hyphens:auto}
.cols p{margin:0 0 2.2mm;orphans:2;widows:2}
.pn{display:inline-flex;align-items:center;justify-content:center;width:4.4mm;height:4.4mm;border-radius:50%;
  background:var(--soft);color:var(--a);font:600 7.5pt Outfit,sans-serif;margin-right:1.6mm;vertical-align:.4mm}
.src{font-size:7.5pt;color:var(--mu);margin:2.5mm 0 0}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:3mm}
.card{border:.6pt solid var(--a);border-radius:2.5mm;padding:3mm 3.5mm;background:var(--soft)}
.card h4,.phr h4{font:600 9.5pt Outfit,sans-serif;margin:0 0 1.2mm;color:var(--a)}
.card p{margin:0;font-size:10pt}
.phr{border-left:1.6pt solid var(--a);padding-left:3.5mm}
.phr ul{margin:0;padding:0;list-style:none;columns:2;column-gap:8mm;font-size:10pt}
.phr li{margin:0 0 1mm;break-inside:avoid}
.after{margin-top:3mm;margin-bottom:0;font-weight:500}
.tight{font-size:10pt}
.tight .task{margin-bottom:3.4mm}
.tight ol.rows li{margin-bottom:1.5mm;line-height:1.5}
.tight ol.qs li{margin-bottom:1mm}
.tight .stage{margin-top:4mm}
.tight .cards{gap:4mm;margin-bottom:2mm}
.tight .card{padding:2.2mm 3mm}
.tight .cols{font-size:10pt;line-height:1.42}
.tight .cols p{margin-bottom:1.8mm}
.tight .sum{margin-bottom:2.4mm}
.key{break-before:page}
.support{margin:9mm 0 0;padding-top:4mm;border-top:.35pt solid #c9ced8;font-size:9.5pt;color:#4a4f5a}.support b{color:#14181f;font-weight:600}
.key dl{margin:0}.key dt{font-weight:600;margin:3.5mm 0 .6mm}.key dd{margin:0;color:#14181f}
"""

def font_faces(tmp):
    """One plain font file per weight. Chrome turns a variable font into drawn shapes in a PDF, which
    is four times the size; fixed weights are embedded as small font subsets."""
    wanted = [("Outfit", "outfit-latin", {}, (400, 500, 600, 700)), ("Newsreader", "newsreader-latin", {"opsz": 12}, (400, 500))]
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
    except ImportError:
        return "".join('@font-face{{font-family:{};src:url({}) format("woff2");font-weight:100 900}}'.format(
            fam, (REPO / "static" / "fonts" / (name + ".woff2")).as_uri()) for fam, name, _, _ in wanted)
    out = []
    for fam, name, fixed, weights in wanted:
        for w in weights:
            font = TTFont(str(REPO / "static" / "fonts" / (name + ".woff2")))
            axes = {a.axisTag for a in font["fvar"].axes}
            pin = {k: v for k, v in dict(fixed, wght=w).items() if k in axes}
            font = instancer.instantiateVariableFont(font, pin)
            font.flavor = None
            dest = Path(tmp) / "{}-{}.ttf".format(name, w)
            font.save(str(dest))
            out.append('@font-face{{font-family:{};src:url({}) format("truetype");font-weight:{}}}'.format(fam, dest.as_uri(), w))
    return "".join(out)


def picture(tmp):
    """The picture is printed 62mm wide, so a 480px copy is plenty and keeps the file small."""
    src = REPO / "static" / "images" / "thumbs" / Path(meta["image"]).name
    try:
        from PIL import Image
    except ImportError:
        return src.as_uri()
    im = Image.open(src).convert("RGB")
    im.thumbnail((480, 480))
    dest = Path(tmp) / "picture.jpg"
    im.save(dest, "JPEG", quality=72, optimize=True)
    return dest.as_uri()


OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    FACES = font_faces(tmp)
    PICTURE = picture(tmp)
    for lv in LEVELS:
        name = "{}-{}-{}".format(SLUG, lv.lower(), CEFR[lv].replace("/", "-").lower())
        page = Path(tmp) / (name + ".html")
        pdf = OUT / (name + ".pdf")
        # four pages of lesson and one of answers; a long set of tasks is set a little tighter to keep to that
        for compact in (False, True):
            page.write_text(sheet(lv, True, compact), encoding="utf-8")
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=4000",
                            "--print-to-pdf=" + str(pdf), page.as_uri()], check=True, capture_output=True)
            pages = len(re.findall(rb"/Type\s*/Page[^s]", pdf.read_bytes()))
            if pages <= 5:
                break
        print(pdf.relative_to(REPO), pdf.stat().st_size // 1024, "KB", pages, "pages" + (" (tight)" if compact else ""))
