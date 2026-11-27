"""Unit tests for the voice-note lot registration handler."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from handlers.audio import NO_LOT_REPLY, handle_audio


class FakeStore:
    def __init__(self, saved: bool = True) -> None:
        self.saved, self.lots = saved, []

    def get_user_by_wa_id(self, wa_id: str):
        return {"id": "u1"}

    def create_lot(self, *args) -> bool:
        self.lots.append(args)
        return self.saved


class FakeWhatsApp:
    def __init__(self) -> None:
        self.sent: list[str] = []

    def send_text(self, to_wa_id: str, body: str) -> None:
        self.sent.append(body)

    def send_location_request(self, to_wa_id: str, body: str) -> None:
        self.sent.append(body)

    def download_media(self, media_id: str):
        return b"audio", "audio/ogg"


class FakeFoundry:
    def __init__(self, fields: dict) -> None:
        self.fields = fields

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
        return "lote La Esperanza, 50 kilos, lavado"

    def extract_lot(self, transcript: str) -> dict:
        return self.fields


MSG = {"type": "audio", "audio_id": "a1", "wa_id": "573", "source_message_id": "wamid.1"}


class AudioTests(unittest.TestCase):
    def test_creates_lot(self) -> None:
        store, wa = FakeStore(), FakeWhatsApp()
        fields = {"lot_name": "La Esperanza", "quantity": "50", "unit": "kg", "process": "lavado"}
        self.assertTrue(handle_audio(MSG, store, wa, FakeFoundry(fields)))
        user_id, msg_id, code, name, qty, unit, process = store.lots[0]
        self.assertEqual((user_id, msg_id, name, qty, unit, process),
                         ("u1", "wamid.1", "La Esperanza", 50.0, "kg", "lavado"))
        self.assertTrue(code.startswith("LC-"))
        self.assertIn(code, wa.sent[0])

    def test_normalizes_misheard_unit(self) -> None:
        store, wa = FakeStore(), FakeWhatsApp()
        fields = {"lot_name": "San Benites", "quantity": 50, "unit": "kilómetros", "process": "lavado"}
        handle_audio(MSG, store, wa, FakeFoundry(fields))
        self.assertEqual(store.lots[0][5], "kg")

    def test_nothing_extracted(self) -> None:
        store, wa = FakeStore(), FakeWhatsApp()
        self.assertTrue(handle_audio(MSG, store, wa, FakeFoundry({"quantity": None})))
        self.assertEqual((store.lots, wa.sent), ([], [NO_LOT_REPLY]))

    def test_ignores_non_audio(self) -> None:
        self.assertFalse(handle_audio({"type": "text"}, FakeStore(), FakeWhatsApp(), FakeFoundry({})))


if __name__ == "__main__":
    unittest.main()
