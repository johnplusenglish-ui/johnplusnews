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


def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 1
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and n > 1 and not w.endswith(("le", "ee", "ye")):
        n -= 1
    return max(1, n)


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

    cands = pauses(voiced)
    # a boundary may also fall at a frame with no pause at all, so keep an "anywhere" fallback
    cand_frames = [s + l // 2 for s, l in cands]
    cand_bonus = [min(l, 120) / 120.0 for s, l in cands]

    nb = len(sentences) - 1
    if nb == 0 or not cands:
        chosen = []
    else:
        NEG = -1e18
        dp = np.full((nb, len(cands)), NEG)
        back = np.zeros((nb, len(cands)), dtype=np.int32)
        for j, f in enumerate(cand_frames):
            dp[0][j] = score(speech_cum[f], target[0], total_speech) + cand_bonus[j]
        for i in range(1, nb):
            best, bestj = NEG, 0
            for j, f in enumerate(cand_frames):
                if j and dp[i - 1][j - 1] > best:
                    best, bestj = dp[i - 1][j - 1], j - 1
                if best == NEG:
                    continue
                dp[i][j] = best + score(speech_cum[f], target[i], total_speech) + cand_bonus[j]
                back[i][j] = bestj
        j = int(np.argmax(dp[nb - 1]))
        chosen = [0] * nb
        for i in range(nb - 1, -1, -1):
            chosen[i] = j
            j = int(back[i][j])

    bounds = [0] + [cand_frames[j] for j in chosen] + [total_frames]

    words_out = []
    for si, ws in enumerate(sent_words):
        a, b = bounds[si], bounds[si + 1]
        frames = [i for i in range(a, b) if voiced[i]] or list(range(a, b))
        w = np.array([cost_weight(t) for t in ws], dtype=np.float64)
        edges = np.concatenate([[0.0], np.cumsum(w) / w.sum()]) * (len(frames) - 1)
        for wi, token in enumerate(ws):
            start = frames[int(edges[wi])] * FRAME
            end = frames[int(edges[wi + 1])] * FRAME
            words_out.append({"s": round(start, 2), "e": round(max(end, start + 0.08), 2)})

    out_path.write_text(json.dumps({"dur": round(total_frames * FRAME, 2), "w": words_out},
                                   separators=(",", ":")), encoding="utf-8")
    return words_out, bounds


def score(got, want, total):
    return -abs(float(got) - float(want)) / total * 60.0


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
