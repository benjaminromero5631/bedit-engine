#!/usr/bin/env python3
"""Transcribe con faster-whisper y escribe chunks palabra por palabra:
[{"text": "hola", "timestamp": [0.12, 0.40]}, ...]  (mismo formato que usa la extensión)."""
import json, os, sys

def main():
    wav, out = sys.argv[1], sys.argv[2]
    from faster_whisper import WhisperModel
    size = os.environ.get("WHISPER_MODEL", "small")
    threads = int(os.environ.get("WHISPER_THREADS", "0"))
    model = WhisperModel(size, device="cpu", compute_type=os.environ.get("WHISPER_COMPUTE", "int8"),
                         cpu_threads=threads, download_root=os.environ.get("WHISPER_CACHE", "/data/models"))
    segments, info = model.transcribe(
        wav, language=os.environ.get("WHISPER_LANG", "es"), word_timestamps=True,
        vad_filter=True, vad_parameters={"min_silence_duration_ms": 300},
        beam_size=5, condition_on_previous_text=False,
        initial_prompt="Hola, eh, mmm, este... bueno, les cuento algo.")  # ayuda a que no se coma las muletillas
    chunks = []
    for seg in segments:
        for w in (seg.words or []):
            t = w.word.strip()
            if t:
                chunks.append({"text": t, "timestamp": [round(w.start, 3), round(w.end, 3)]})
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"language": info.language, "model": size, "chunks": chunks}, f, ensure_ascii=False)

if __name__ == "__main__":
    main()
