#!/usr/bin/env python3
"""Convert audio files (e.g. WhatsApp .ogg/Opus voice notes) to .wav or .mp3 using ffmpeg."""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def build_ffmpeg_command(
    input_path: Path,
    output_path: Path,
    fmt: str,
    sample_rate: int,
    channels: int,
) -> list[str]:
    """Build the ffmpeg command for the requested output format."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-ac",
        str(channels),
        "-ar",
        str(sample_rate),
    ]
    if fmt == "wav":
        cmd.extend(["-c:a", "pcm_s16le"])
    elif fmt == "mp3":
        cmd.extend(["-c:a", "libmp3lame", "-q:a", "2"])
    else:
        raise ValueError(f"Unsupported format: {fmt}")

    cmd.append(str(output_path))
    return cmd


def convert_audio(
    input_path: Path,
    output_path: Path | None = None,
    fmt: str = "wav",
    sample_rate: int = 16000,
    channels: int = 1,
) -> Path:
    """Convert an audio file to WAV or MP3 via ffmpeg and return the output path."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg was not found in PATH. Install it (e.g. brew install ffmpeg).")

    if not input_path.is_file():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    resolved_output = output_path if output_path else input_path.with_suffix(f".{fmt}")
    resolved_output.parent.mkdir(parents=True, exist_ok=True)

    cmd = build_ffmpeg_command(input_path, resolved_output, fmt, sample_rate, channels)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed (exit {result.returncode}):\n{result.stderr.strip()}")

    return resolved_output


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert an audio file (such as .ogg) to .wav or .mp3 using ffmpeg."
    )
    parser.add_argument("input", type=Path, help="Path to the input audio file (e.g. voice_note.ogg)")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Optional output file path (defaults to input path with .wav or .mp3 extension)",
    )
    parser.add_argument(
        "-f",
        "--format",
        choices=("wav", "mp3"),
        default="wav",
        help="Target audio format (default: wav, 16 kHz mono PCM for speech-to-text)",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=16000,
        help="Output sample rate in Hz (default: 16000)",
    )
    parser.add_argument(
        "--channels",
        type=int,
        default=1,
        help="Number of audio channels (default: 1)",
    )
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    fmt = args.format
    if args.output and args.output.suffix.lower() in {".wav", ".mp3"}:
        fmt = args.output.suffix.lower().lstrip(".")

    try:
        out = convert_audio(
            input_path=args.input,
            output_path=args.output,
            fmt=fmt,
            sample_rate=args.sample_rate,
            channels=args.channels,
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Converted: {args.input} -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
