"""Transcribe a recording with word timestamps, using the local faster-whisper install.

Prints one word per line: start, end, word. Everything runs offline once the model has been
fetched; the model is cached under ~/.cache/huggingface.
"""
import json
import sys

from faster_whisper import WhisperModel

MODEL = "small.en"


def words_of(path, model_name=MODEL):
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(
        str(path),
        language="en",
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
        condition_on_previous_text=False,
    )
    out = []
    for seg in segments:
        for w in (seg.words or []):
            out.append({"s": round(w.start, 3), "e": round(w.end, 3), "w": w.word.strip()})
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: whisper_words.py <audio> [out.json]")
        raise SystemExit(2)
    words = words_of(sys.argv[1])
    if len(sys.argv) > 2:
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            json.dump(words, f)
    print("recognised {} words, {:.1f}s of audio".format(len(words), words[-1]["e"] if words else 0))
