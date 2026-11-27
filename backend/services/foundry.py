"""Microsoft Foundry client for ephemeral voice note transcription."""

from __future__ import annotations

import os
import subprocess
import tempfile
import httpx


class FoundryClient:
    """Transcribes Spanish WhatsApp voice notes via Microsoft Foundry."""

    def __init__(self, endpoint: str, api_key: str, model: str = "gpt-4o-transcribe") -> None:
        self._endpoint = endpoint.rstrip("/")
        self._api_key = api_key
        self._model = model

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
        """Transcribe audio bytes to Spanish text without persisting audio files."""
        ext = "ogg" if "ogg" in mime_type else "mp3"
        filename = f"voice.{ext}"
        payload_bytes = audio_bytes

        # Convert .ogg/.opus to .wav ephemerally if needed for model compatibility,
        # deleting temporary files immediately after conversion.
        if ext == "ogg":
            payload_bytes = self._convert_to_wav_ephemeral(audio_bytes)
            filename = "voice.wav"
            mime_type = "audio/wav"

        url = f"{self._endpoint}/openai/deployments/{self._model}/audio/transcriptions?api-version=2024-06-01"
        headers = {"api-key": self._api_key}
        files = {"file": (filename, payload_bytes, mime_type)}
        data = {"language": "es"}

        with httpx.Client(timeout=45.0) as client:
            resp = client.post(url, headers=headers, files=files, data=data)
            resp.raise_for_status()
            return resp.json().get("text", "").strip()

    @staticmethod
    def _convert_to_wav_ephemeral(audio_bytes: bytes) -> bytes:
        with tempfile.TemporaryDirectory() as tmpdir:
            src = os.path.join(tmpdir, "input.ogg")
            dst = os.path.join(tmpdir, "output.wav")
            with open(src, "wb") as f:
                f.write(audio_bytes)
            subprocess.run(
                ["ffmpeg", "-y", "-i", src, "-ar", "16000", "-ac", "1", dst],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            with open(dst, "rb") as f:
                return f.read()
