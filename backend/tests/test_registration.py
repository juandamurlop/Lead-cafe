"""Unit tests for the WhatsApp registration state machine."""

from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from handlers.registration import (
    ASK_FARM_PROMPT,
    ASK_NAME_PROMPT,
    CONSENT_PROMPT,
    DECLINED_REPLY,
    handle_registration,
)


class FakeStore:
    def __init__(self) -> None:
        self.users: dict[str, dict] = {}
        self.farms: list[dict] = []

    def get_user_by_wa_id(self, wa_id: str) -> dict | None:
        return self.users.get(wa_id)

    def create_pending_user(self, wa_id: str) -> dict:
        user = {
            "id": "user-1",
            "wa_id": wa_id,
            "role": "farmer",
            "name": None,
            "registration_state": "awaiting_consent",
            "verified_by_coop": False,
            "consent_status": "pending",
        }
        self.users[wa_id] = user
        return user

    def accept_consent(self, wa_id: str) -> None:
        self.users[wa_id]["consent_status"] = "accepted"
        self.users[wa_id]["registration_state"] = "awaiting_name"

    def decline_consent(self, wa_id: str) -> None:
        self.users[wa_id]["consent_status"] = "declined"
        self.users[wa_id]["registration_state"] = "declined"

    def save_user_name(self, wa_id: str, name: str) -> None:
        self.users[wa_id]["name"] = name
        self.users[wa_id]["registration_state"] = "awaiting_farm"

    def complete_registration_with_farm(self, user_id: str, wa_id: str, farm_name: str) -> None:
        self.farms.append({"user_id": user_id, "name": farm_name})
        self.users[wa_id]["registration_state"] = "complete"


class FakeWhatsApp:
    def __init__(self) -> None:
        self.texts: list[tuple[str, str]] = []
        self.buttons: list[tuple[str, str]] = []

    def send_text(self, to_wa_id: str, body: str) -> None:
        self.texts.append((to_wa_id, body))

    def send_consent_buttons(self, to_wa_id: str, body: str) -> None:
        self.buttons.append((to_wa_id, body))

    def download_media(self, media_id: str) -> tuple[bytes, str]:
        return b"fake-ogg-bytes", "audio/ogg"


class FakeFoundry:
    def __init__(self, transcript: str = "Rosa Elvira") -> None:
        self.transcript = transcript

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
        return self.transcript


class RegistrationFlowTests(unittest.TestCase):
    def test_full_onboarding_flow_with_voice_name_and_text_farm(self) -> None:
        store = FakeStore()
        wa = FakeWhatsApp()
        foundry = FakeFoundry(transcript="Rosa Elvira")
        wa_id = "573001234567"

        # 1. Unknown user -> sends consent buttons
        handled = handle_registration(
            {"wa_id": wa_id, "type": "text", "text": "Hola"},
            store,
            wa,
            foundry,
        )
        self.assertTrue(handled)
        self.assertEqual(store.users[wa_id]["registration_state"], "awaiting_consent")
        self.assertEqual(wa.buttons, [(wa_id, CONSENT_PROMPT)])

        # 2. User clicks [Sí, acepto]
        handled = handle_registration(
            {"wa_id": wa_id, "type": "interactive", "button_id": "consent_yes"},
            store,
            wa,
            foundry,
        )
        self.assertTrue(handled)
        self.assertEqual(store.users[wa_id]["registration_state"], "awaiting_name")
        self.assertEqual(wa.texts[-1], (wa_id, ASK_NAME_PROMPT))

        # 3. User sends voice note with name
        handled = handle_registration(
            {"wa_id": wa_id, "type": "audio", "audio_id": "media-123"},
            store,
            wa,
            foundry,
        )
        self.assertTrue(handled)
        self.assertEqual(store.users[wa_id]["name"], "Rosa Elvira")
        self.assertEqual(store.users[wa_id]["registration_state"], "awaiting_farm")
        self.assertEqual(wa.texts[-1], (wa_id, ASK_FARM_PROMPT))

        # 4. User sends farm name as text
        handled = handle_registration(
            {"wa_id": wa_id, "type": "text", "text": "Finca La Esperanza"},
            store,
            wa,
            foundry,
        )
        self.assertTrue(handled)
        self.assertEqual(store.users[wa_id]["registration_state"], "complete")
        self.assertEqual(store.farms, [{"user_id": "user-1", "name": "Finca La Esperanza"}])
        self.assertIn("Rosa Elvira", wa.texts[-1][1])

        # 5. Subsequent message is NOT consumed by registration
        handled = handle_registration(
            {"wa_id": wa_id, "type": "text", "text": "Nuevo lote"},
            store,
            wa,
            foundry,
        )
        self.assertFalse(handled)

    def test_decline_consent(self) -> None:
        store = FakeStore()
        wa = FakeWhatsApp()
        foundry = FakeFoundry()
        wa_id = "573009998877"

        handle_registration({"wa_id": wa_id, "type": "text", "text": "Hola"}, store, wa, foundry)
        handle_registration(
            {"wa_id": wa_id, "type": "interactive", "button_id": "consent_no"},
            store,
            wa,
            foundry,
        )
        self.assertEqual(store.users[wa_id]["consent_status"], "declined")
        self.assertEqual(store.users[wa_id]["registration_state"], "declined")
        self.assertEqual(wa.texts[-1], (wa_id, DECLINED_REPLY))


if __name__ == "__main__":
    unittest.main()
