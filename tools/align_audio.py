"""Rough forced alignment with nothing but afconvert, numpy and the text.

The recording is clean synthetic speech, so the loud and quiet frames separate cleanly. The
sentence boundaries are matched to real pauses by dynamic programming, and the words inside a
sentence are then spread across that sentence's speech frames in proportion to how long each
word takes to say. Good enough to read along with; a real aligner would be better.
"""
import json
import pathlib
import re
import struct
import subprocess
import sys

import numpy as np

FRAME = 0.01  # seconds per analysis frame


def decode(src, work):
    """afconvert writes WAVE_FORMAT_EXTENSIBLE, which the wave module will not read, so parse it here."""
    wav = work / "speech.wav"
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", str(src), str(wav)],
                   check=True, capture_output=True)
    raw = wav.read_bytes()
    pos, fmt, data = 12, None, None
    while pos + 8 <= len(raw):
        cid = raw[pos:pos + 4]
        size = struct.unpack("<I", raw[pos + 4:pos + 8])[0]
        if cid == b"fmt ":
            fmt = raw[pos + 8:pos + 8 + size]
        elif cid == b"data":
            data = raw[pos + 8:pos + 8 + size]
        pos += 8 + size + (size & 1)
    rate = struct.unpack("<I", fmt[4:8])[0]
    return np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0, rate


def voiced_frames(x, rate):
    hop = int(rate * FRAME)
    n = len(x) // hop
    e = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(axis=1))
    db = 20 * np.log10(np.maximum(e, 1e-7))
    floor, peak = np.percentile(db, 10), np.percentile(db, 95)
    return db > floor + (peak - floor) * 0.22


def pauses(voiced, min_frames=18):
    out, run = [], 0
    for i, v in enumerate(voiced):
        if not v:
            run += 1
        else:
            if run >= min_frames:
                out.append((i - run, run))   # (start frame, length)
            run = 0
    return out


ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
        "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def small_number(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000:
        rest = n % 100
        return ONES[n // 100] + " hundred" + (" and " + small_number(rest) if rest else "")
    return ""


def number_words(n, digits):
    """How the number is actually said, because the recording says it and the page prints it."""
    if digits == 4 and 1500 <= n <= 2099 and n % 100 != 0:
        hi, lo = n // 100, n % 100
        return small_number(hi) + (" oh " + ONES[lo] if lo < 10 else " " + small_number(lo))
    for size, name in ((1000000000, "billion"), (1000000, "million"), (1000, "thousand")):
        if n >= size:
            rest = n % size
            return (number_words(n // size, 0) + " " + name
                    + (" " + number_words(rest, 0) if rest else ""))
    return small_number(n) or "number"


def spoken(word):
    """Say the token the way a voice would, so its length is weighted honestly."""
    out = []
    for part in re.split(r"(\d[\d,]*)", word):
        if not part:
            continue
        if part[0].isdigit():
            n = int(part.replace(",", ""))
            out.append(number_words(n, len(part.replace(",", ""))))
        else:
            out.append(part)
    text = " ".join(out)
    if "$" in word:
        text += " dollars"
    elif "\u00a3" in word:
        text += " pounds"
    elif "%" in word:
        text += " per cent"
    return text


def syllables(word):
    total = 0
    for piece in spoken(word).split():
        w = re.sub(r"[^a-z]", "", piece.lower())
        if not w:
            continue
        groups = re.findall(r"[aeiouy]+", w)
        n = len(groups)
        if w.endswith("e") and n > 1 and not w.endswith(("le", "ee", "ye")):
            n -= 1
        total += max(1, n)
    return max(1, total)


def cost_weight(word):
    """Roughly how long a word takes to say, plus a beat for the punctuation after it."""
    pause = 0.9 if word.endswith((",", ";", ":")) else 0.0
    return syllables(word) + 0.4 + pause


def align(audio_path, sentences, out_path, work):
    x, rate = decode(audio_path, work)
    voiced = voiced_frames(x, rate)
    total_frames = len(voiced)
    speech_cum = np.cumsum(voiced.astype(np.int32))          # speech frames up to i
    total_speech = int(speech_cum[-1])

    sent_words = [s.split() for _, s in sentences]
    sent_w = np.array([sum(cost_weight(w) for w in ws) for ws in sent_words], dtype=np.float64)
    target = np.cumsum(sent_w) / sent_w.sum() * total_speech   # expected speech-frames per boundary

    # A boundary may fall on any frame. Sitting in a silence is rewarded, but not so much that it
    # outweighs being in the wrong place: an earlier version only allowed boundaries at detected
    # pauses, and when the right pause was missing it put the boundary somewhere badly wrong.
    bonus = np.zeros(total_frames)
    for st, ln in pauses(voiced, 4):
        bonus[st:st + ln] = min(ln, 90) / 90.0 * 0.8
    cum = speech_cum.astype(np.float64)

    nb = len(sentences) - 1
    if nb <= 0:
        chosen_frames = []
    else:
        NEG = -1e18
        back = np.zeros((nb, total_frames), dtype=np.int32)
        prev = np.full(total_frames, NEG)
        for i in range(nb):
            local = -np.abs(cum - target[i]) * 0.01 + bonus
            if i == 0:
                cur = local.copy()
                back[0] = 0
            else:
                run = np.concatenate(([NEG], np.maximum.accumulate(prev)[:-1]))
                arg = np.zeros(total_frames, dtype=np.int32)
                best, bi = NEG, 0
                for f in range(total_frames):      # running argmax of everything before f
                    if prev[f - 1] > best if f else False:
                        best, bi = prev[f - 1], f - 1
                    arg[f] = bi
                cur = run + local
                back[i] = arg
            prev = cur
        f = int(np.argmax(prev))
        chosen_frames = [0] * nb
        for i in range(nb - 1, -1, -1):
            chosen_frames[i] = f
            f = int(back[i][f])

    bounds = [0] + list(chosen_frames) + [total_frames]

    REAL_PAUSE = 12            # 120 ms: shorter gaps are part of ordinary speech
    in_pause = np.zeros(total_frames, dtype=bool)
    for st, ln in pauses(voiced, REAL_PAUSE):
        in_pause[st:st + ln] = True

    words_out = []
    for si, ws in enumerate(sent_words):
        a, b = bounds[si], bounds[si + 1]
        frames = [i for i in range(a, b) if voiced[i]] or list(range(a, b))
        w = np.array([cost_weight(t) for t in ws], dtype=np.float64)
        edges = np.concatenate([[0.0], np.cumsum(w) / w.sum()]) * len(frames)
        for wi, token in enumerate(ws):
            lo = min(int(edges[wi]), len(frames) - 1)
            hi = min(max(int(edges[wi + 1]) - 1, lo), len(frames) - 1)
            # a word owns only the frames it is actually spoken over, so a pause between two words
            # shows up as a gap in the timings instead of being swallowed by whichever word is next
            first, last = frames[lo], frames[hi]
            # stop the word at the first silence it runs into, so a pause is never swallowed by
            # whichever word happens to straddle it
            cut = last + 1
            for f in range(first, last + 1):
                if in_pause[f]:
                    cut = f
                    break
            start = first * FRAME
            end = cut * FRAME
            words_out.append({"s": round(start, 2), "e": round(max(end, start + 0.06), 2)})

    out_path.write_text(json.dumps({"dur": round(total_frames * FRAME, 2), "w": words_out},
                                   separators=(",", ":")), encoding="utf-8")
    return words_out, bounds


def article_text(md_path, level):
    """Title, standfirst and body, in the order the recording reads them."""
    blk = re.search(r"^=== " + level + r" ===\n(.*?)(?=^=== |\Z)",
                    md_path.read_text(encoding="utf-8"), re.S | re.M).group(1)
    title = re.search(r"^title: (.*)$", blk, re.M)
    summary = re.search(r"^summary: (.*)$", blk, re.M)
    body = re.sub(r"^(title|summary|audio|voice|language):.*$", "", blk, flags=re.M).strip()
    parts = []
    if title:
        parts.append(title.group(1).rstrip(".") + ".")
    if summary:
        parts.append(summary.group(1))
    parts.append(body)
    return "\n\n".join(parts)


def split_sentences(text):
    out = []
    for pi, para in enumerate([p.strip() for p in text.split("\n\n") if p.strip()]):
        for s in re.split(r"(?<=[.!?])\s+", para):
            if s.strip():
                out.append([pi, s.strip()])
    return out


if __name__ == "__main__":
    import tempfile
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
    out = audio.with_suffix(".words.json")
    text = article_text(md, level)
    sents = split_sentences(text)
    with tempfile.TemporaryDirectory() as tmp:
        words, _ = align(audio, sents, out, pathlib.Path(tmp))
    print("timed {} words over {} sentences -> {}".format(len(words), len(sents), out.name))
