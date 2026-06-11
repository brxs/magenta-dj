"""Spike for M15: does style-from-audio actually resemble the source?

Generates a source stream from text, embeds the tail of its AUDIO via
MusicCoCa (the deck-to-deck sampling path), and regenerates from that
embedding — plus a 50/50 blend with a contrasting text style (the pad
blend case). Judged by ear on the written WAVs; embedding latency is
the number that decides whether sampling can run inline in the worker
between chunks (the pacing lead is ~3 s).

Run: uv run python scripts/spike_style_transfer.py
Listen:  spike_style/source.wav        — deck A (text-styled)
         spike_style/from_audio.wav    — deck B steered by A's audio
         spike_style/contrast.wav      — deck B's own contrasting text
         spike_style/blend.wav         — 50/50 audio + contrast
"""

import time
import wave
from pathlib import Path

import numpy as np

from magenta_rt import audio
from magenta_rt.mlx import system

SOURCE_STYLE = "driving techno, four on the floor"
CONTRAST_STYLE = "ambient drone, soft pads, no drums"
GENERATE_SECONDS = 16
SAMPLE_SECONDS = 10  # what the deck capture will ship
OUT_DIR = Path(__file__).resolve().parent.parent / "spike_style"


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as out:
        out.setnchannels(samples.shape[1])
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        out.writeframes(pcm.tobytes())


def generate(mrt, style, seconds):
    waveform, _ = mrt.generate(style=style, frames=int(seconds / 0.04), state=None)
    return waveform


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    print("Loading mrt2_small ...")
    mrt = system.MagentaRT2SystemMlxfn(size="mrt2_small")

    print(f"generating source: {SOURCE_STYLE!r} ...")
    text_embedding = mrt.embed_style(SOURCE_STYLE)
    source = generate(mrt, text_embedding, GENERATE_SECONDS)
    write_wav(OUT_DIR / "source.wav", source.samples, source.sample_rate)

    tail_frames = SAMPLE_SECONDS * source.sample_rate
    tail = audio.Waveform(
        samples=source.samples[-tail_frames:].astype(np.float32),
        sample_rate=source.sample_rate,
    )
    # Warm-up, then timed runs: the first audio embed may compile.
    mrt.embed_style(tail)
    timings = []
    for _ in range(3):
        started = time.monotonic()
        audio_embedding = mrt.embed_style(tail)
        timings.append(time.monotonic() - started)
    print(
        f"audio embed latency over {SAMPLE_SECONDS}s: "
        + ", ".join(f"{t:.2f}s" for t in timings)
    )

    print("generating from the audio embedding ...")
    from_audio = generate(mrt, audio_embedding, GENERATE_SECONDS)
    write_wav(OUT_DIR / "from_audio.wav", from_audio.samples, from_audio.sample_rate)

    print(f"generating contrast: {CONTRAST_STYLE!r} ...")
    contrast_embedding = mrt.embed_style(CONTRAST_STYLE)
    contrast = generate(mrt, contrast_embedding, GENERATE_SECONDS)
    write_wav(OUT_DIR / "contrast.wav", contrast.samples, contrast.sample_rate)

    print("generating the 50/50 blend ...")
    blend_embedding = 0.5 * np.asarray(audio_embedding) + 0.5 * np.asarray(
        contrast_embedding
    )
    blend = generate(mrt, blend_embedding, GENERATE_SECONDS)
    write_wav(OUT_DIR / "blend.wav", blend.samples, blend.sample_rate)

    print("\ncosine similarities (numeric resemblance hints):")
    print(
        f"  audio-embed vs source text: {cosine(audio_embedding, text_embedding):.3f}"
    )
    print(
        f"  audio-embed vs contrast text: {cosine(audio_embedding, contrast_embedding):.3f}"
    )
    print(f"\n4 files in {OUT_DIR} — listen per the docstring.")


if __name__ == "__main__":
    main()
