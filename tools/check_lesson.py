"""Check a lesson article's exercise file before building: python3 tools/check_lesson.py <slug> [<slug> ...]

It catches the mistakes that are easy to make and hard to see: a key word that is not in the text,
a key word that gives away a later answer, a word box with two right answers for one gap by
construction (the same word twice), a missing level, a dash. It cannot judge whether a task is
pitched at the right level; read the tasks for that."""
import json, re, sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LEVELS = ["Core", "Intermediate", "Advanced"]
FOCUS_TYPES = {"linking words", "prepositions", "collocations", "phrasal verbs"}


def texts(slug):
    md = next((REPO / "content").glob("*-" + slug + ".md"))
    raw = md.read_text(encoding="utf-8")
    head, body = raw.split("\n---\n", 1)
    parts = re.split(r"^=== (.+?) ===\s*$", body, flags=re.M)
    sec = {parts[i].strip(): parts[i + 1] for i in range(1, len(parts), 2)}
    return head, sec


def check(slug):
    bad = []
    say = bad.append
    f = REPO / "content" / "exercises" / (slug + ".json")
    raw = f.read_text(encoding="utf-8")
    if re.search("[\u2014\u2013]", raw):
        say("the file has an em or en dash")
    d = json.loads(raw)
    head, sec = texts(slug)
    st = re.search(r"^short-title: (.+)$", head, flags=re.M)
    if not st:
        say("the article header has no 'short-title' line (the name of the downloaded worksheet)")
    elif re.search(r'[?:/\\*"<>|]', st.group(1)) or len(st.group(1).split()) > 6:
        say("short-title should be a few plain words with no ? : / or quotes")
    if not re.search(r"^layout: lesson\s*$", head, flags=re.M):
        say("the article header has no 'layout: lesson' line")
    sp = d.get("speak") or {}
    teens = re.search(r"^audience: teens\s*$", head, flags=re.M) is not None
    # A Teens story's task 9 is its own Activity plus useful phrases, not a role-play
    if teens and not sec.get("Activity", "").strip():
        say("a Teens story needs an '=== Activity ===' section for task 9")
    for k in (("title", "phrases") if teens else ("title", "setup", "a", "b", "phrases", "after")):
        if not sp.get(k):
            say("speak." + k + " is missing")
    if sp.get("phrases") and not 4 <= len(sp["phrases"]) <= 6:
        say("speak.phrases should have 4 to 6 lines")
    for part in ("a", "b"):
        if sp.get(part) and not (sp[part].get("role") and sp[part].get("text")):
            say("speak.{} needs role and text".format(part))
    types = set()
    for level in LEVELS:
        key = level.lower()
        lv = (d.get("levels") or {}).get(key)
        if not lv:
            say(key + ": level missing")
            continue
        text = sec.get(level, "").lower()
        here = lambda m: say("{}: {}".format(key, m))
        for q in ("before you read", "talk about it"):
            if not sec.get("{} {}".format(level, q), "").strip():
                here("the article has no '{} {}' questions".format(level, q))

        def gaps(items, name, n_ok):
            if len(items) not in n_ok:
                here("{} has {} items".format(name, len(items)))
            for it in items:
                if it.get("s", "").count("____") != 1:
                    here("{}: '{}' needs exactly one ____".format(name, it.get("s", "")[:50]))
                if not it.get("a"):
                    here("{}: an item has no answer".format(name))

        gap = lv.get("gap") or {}
        gaps(gap.get("items") or [], "gap", (5, 6))
        answers = [i["a"].lower() for i in gap.get("items") or []]
        extra = [x.lower() for x in gap.get("extra") or []]
        if len(extra) != 2:
            here("gap needs exactly two extra words")
        if len(set(answers + extra)) != len(answers + extra):
            here("gap: the word box has a repeated word")
        for a in answers:
            if a[:5] not in text:
                here("gap answer '{}' is not in this level's text".format(a))

        gr = lv.get("grammar") or {}
        if gr.get("kind") not in ("verb", "word"):
            here("grammar.kind must be verb or word")
        gaps(gr.get("items") or [], "grammar", (5,))
        for it in gr.get("items") or []:
            if not it.get("cue"):
                here("grammar: an item has no cue")
        gram = {x.lower() for i in gr.get("items") or [] for x in i.get("a", "").split("|")}

        tfn = lv.get("tfn") or []
        if len(tfn) != 5:
            here("tfn has {} statements".format(len(tfn)))
        if {t.get("a") for t in tfn} != {"T", "F", "N"}:
            here("tfn needs at least one T, one F and one N")
        for t in tfn:
            if not t.get("why"):
                here("tfn: '{}' has no why".format(t.get("s", "")[:40]))

        taken = gram | set(answers)
        words = [w for w in (lv.get("pre") or []) + (lv.get("match") or []) if w["t"].lower() not in taken]
        pre = lv.get("pre") or []
        if len(pre) != 8:
            here("pre has {} key words, it needs 8".format(len(pre)))
        if len(words) < 8:
            here("only {} key words are left after removing later answers".format(len(words)))
        for w in pre:
            if w["t"].lower() in taken:
                here("key word '{}' is the answer to a later task".format(w["t"]))
            if w["t"].lower() not in text:
                here("key word '{}' is not in this level's text".format(w["t"]))
            if not w.get("d"):
                here("key word '{}' has no meaning".format(w["t"]))
        if len({w["t"].lower() for w in pre}) != len(pre):
            here("pre has a repeated key word")

        fo = lv.get("focus") or {}
        if fo.get("type") not in FOCUS_TYPES:
            here("focus.type must be one of: " + ", ".join(sorted(FOCUS_TYPES)))
        types.add(fo.get("type"))
        if not fo.get("note"):
            here("focus.note is missing")
        gaps(fo.get("items") or [], "focus", (5,))
        fa = [i["a"].lower() for i in fo.get("items") or []]
        fe = [x.lower() for x in fo.get("extra") or []]
        if len(fe) != 2:
            here("focus needs exactly two extra words")
        if len(set(fa + fe)) != len(fa + fe):
            here("focus: the word box has a repeated word")
    if len(types) > 1:
        say("the three levels should share one focus type, found: " + ", ".join(sorted(str(t) for t in types)))
    return bad


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    failed = 0
    for slug in sys.argv[1:]:
        problems = check(slug)
        failed += bool(problems)
        print(("PROBLEMS " if problems else "ok       ") + slug)
        for p in problems:
            print("   - " + p)
    raise SystemExit(1 if failed else 0)
