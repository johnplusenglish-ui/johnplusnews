"""Time every word of an article against its recording, for the read-along highlight.

A local speech model (faster-whisper, in .venv-align) transcribes the audio with per-word
timestamps. That transcript is then matched against the article's own words with a
Needleman-Wunsch alignment, so the timings land on the real text rather than on whatever the
recogniser thought it heard. Words the recogniser missed are interpolated between their
neighbours.

    .venv-align/bin/python tools/align_audio.py content/<article>.md Advanced

Writes <audio>.words.json beside the recording. build.py picks that up and the player follows
the words as they are spoken.
"""
import json
import pathlib
import re
import sys


def article_text(md_path, level, head=True):
    """The words to time. Some recordings open with the headline and standfirst and some go
    straight into the article, so both are tried and whichever matches better is used."""
    blk = re.search(r"^=== " + level + r" ===\n(.*?)(?=^=== |\Z)",
                    md_path.read_text(encoding="utf-8"), re.S | re.M).group(1)
    title = re.search(r"^title: (.*)$", blk, re.M)
    summary = re.search(r"^summary: (.*)$", blk, re.M)
    body = re.sub(r"^(title|summary|audio|voice|language):.*$", "", blk, flags=re.M).strip()
    parts = []
    if head and title:
        parts.append(title.group(1).rstrip(".") + ".")
    if head and summary:
        parts.append(summary.group(1))
    parts.append(body)
    return "\n\n".join(parts)


def key(word):
    """What two words have to share to count as the same word."""
    w = word.lower().replace("’", "'")
    w = re.sub(r"[^a-z0-9']", "", w)
    return w.strip("'")


def match_up(text_words, heard):
    """Needleman-Wunsch between the article's words and the recogniser's. Returns, for each
    article word, the index of the word it was heard as, or None if it was not matched."""
    n, m = len(text_words), len(heard)
    a = [key(w) for w in text_words]
    b = [key(h["w"]) for h in heard]
    GAP = -1.0
    prev = [GAP * j for j in range(m + 1)]
    ptr = [[2] * (m + 1)] + [[0] * (m + 1) for _ in range(n)]
    for i in range(1, n + 1):
        cur = [GAP * i] + [0.0] * m
        ptr[i][0] = 1
        for j in range(1, m + 1):
            diag = prev[j - 1] + (2.0 if a[i - 1] == b[j - 1] else -1.0)
            up = prev[j] + GAP
            left = cur[j - 1] + GAP
            best, d = diag, 0
            if up > best:
                best, d = up, 1
            if left > best:
                best, d = left, 2
            cur[j], ptr[i][j] = best, d
        prev = cur

    out = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        d = ptr[i][j]
        if d == 0:
            if a[i - 1] == b[j - 1]:
                out[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif d == 1:
            i -= 1
        else:
            j -= 1
    return out


def timings(text_words, heard):
    """A start and end for every article word, interpolating the ones that were not matched."""
    pairs = match_up(text_words, heard)
    spans = [None] * len(text_words)
    for i, j in enumerate(pairs):
        if j is not None:
            spans[i] = [heard[j]["s"], heard[j]["e"]]

    known = [i for i, s in enumerate(spans) if s]
    if not known:
        raise SystemExit("none of the article's words were recognised in the recording")

    first, last = known[0], known[-1]
    for i in range(first):
        spans[i] = [max(0.0, spans[first][0] - (first - i) * 0.3), spans[first][0]]
    for i in range(last + 1, len(spans)):
        spans[i] = [spans[last][1], spans[last][1] + (i - last) * 0.3]

    # words the recogniser missed share out the gap between the two it did hear
    for a, b in zip(known, known[1:]):
        if b - a <= 1:
            continue
        start, end = spans[a][1], spans[b][0]
        step = (end - start) / (b - a)
        for k in range(a + 1, b):
            s = start + step * (k - a - 1)
            spans[k] = [s, s + step]

    # the recogniser occasionally hands back spans that overlap by a few hundredths; tidy them
    # so the words run in order and a gap always means real silence
    out = []
    prev_end = 0.0
    for a, b in spans:
        a = max(0.0, a, prev_end)
        b = max(b, a + 0.06)
        out.append({"s": round(a, 2), "e": round(b, 2)})
        prev_end = b
    return out, sum(1 for p in pairs if p is not None)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: align_audio.py <content/xxx.md> <Core|Intermediate|Advanced>")
        raise SystemExit(2)
    md = pathlib.Path(sys.argv[1])
    level = sys.argv[2]
    blk = re.search(r"^=== " + level + r" ===\n(.*?)(?=^=== |\Z)",
                    md.read_text(encoding="utf-8"), re.S | re.M).group(1)
    rel = re.search(r"^audio: (.*)$", blk, re.M)
    if not rel:
        print("that version has no recording")
        raise SystemExit(1)

    static = md.parent.parent / "static"
    audio = static / rel.group(1).strip()
    out_path = audio.with_suffix(".words.json")

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from whisper_words import words_of

    heard = words_of(audio)
    best = None
    for with_head in (True, False):
        words = article_text(md, level, with_head).split()
        spans, matched = timings(words, heard)
        score = matched / len(words)
        if best is None or score > best[0] + 0.01:
            best = (score, spans, matched, words, with_head)
    rate, spans, matched, text_words, with_head = best
    if rate < 0.85:
        # the recording and the text have drifted apart, usually because the article was edited
        # after it was read. Better no highlighting than highlighting the wrong words.
        if out_path.exists():
            out_path.unlink()
        print("MATCH_TOO_LOW {:.0f}% of the text was heard in the recording".format(rate * 100))
        raise SystemExit(3)
    out_path.write_text(
        json.dumps({"dur": round(max(x["e"] for x in spans), 2), "head": with_head, "w": spans},
                   separators=(",", ":")),
        encoding="utf-8")
    print("MATCHED {:.0f}% ({} of {} words, {}) -> {}".format(
        rate * 100, matched, len(text_words),
        "headline read aloud" if with_head else "body only", out_path.name))
