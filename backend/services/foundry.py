"""Microsoft Foundry client for ephemeral voice note transcription."""

from __future__ import annotations

import json

import httpx


class FoundryClient:
    """Transcribes Spanish WhatsApp voice notes via Microsoft Foundry."""

    def __init__(
        self,
        endpoint: str,
        api_key: str,
        model: str = "gpt-4o-transcribe",
        chat_model: str = "gpt-4o-mini",
    ) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._chat_model = chat_model

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
        """Transcribe audio bytes to Spanish text without persisting audio files."""
        # WhatsApp voice notes are Ogg/Opus, which the transcription API accepts as-is
        # (the Functions host has no ffmpeg).
        ext = "ogg" if "ogg" in mime_type else "mp3"
        filename = f"voice.{ext}"
        payload_bytes = audio_bytes
        mime_type = mime_type.split(";")[0]

        url = f"{self._endpoint}/openai/deployments/{self._model}/audio/transcriptions?api-version=2024-06-01"
        headers = {"api-key": self._api_key}
        files = {"file": (filename, payload_bytes, mime_type)}
        data = {"language": "es"}

        with httpx.Client(timeout=45.0) as client:
            resp = client.post(url, headers=headers, files=files, data=data)
            resp.raise_for_status()
            return resp.json().get("text", "").strip()

    def extract_lot(self, transcript: str) -> dict:
        """Extract lot fields (lot_name, quantity, unit, process) from a Spanish transcript."""
        url = (
            f"{self._endpoint}/openai/deployments/{self._chat_model}"
            "/chat/completions?api-version=2024-06-01"
        )
        system = (
            "Extrae los datos de un lote de café de la transcripción de una nota de voz de un "
            "productor colombiano. Responde solo JSON con las claves: lot_name (string o null), "
            "quantity (número o null), unit (kg, arrobas, cargas, sacos, libras o null), "
            "process (lavado, honey, natural u otro texto o null). Usa null si no se menciona."
        )
        body = {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": transcript},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        }
        with httpx.Client(timeout=45.0) as client:
            resp = client.post(url, headers={"api-key": self._api_key}, json=body)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(content)
