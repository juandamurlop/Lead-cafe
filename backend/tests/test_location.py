"""Unit tests for location message parsing and handling."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from handlers.location import LOCATION_SAVED_REPLY, handle_location
from webhook.enqueue import extract_messages


class FakeStore:
    def __init__(self, user: dict | None, saved: bool = True) -> None:
        self.user, self.saved, self.pins = user, saved, []

    def get_user_by_wa_id(self, wa_id: str):
        return self.user

    def save_location_pin(self, user_id, source_message_id, latitude, longitude) -> bool:
        self.pins.append((user_id, source_message_id, latitude, longitude))
        return self.saved

    def get_check_geometry(self, user_id):
        return {"type": "Polygon", "coordinates": []}

    def set_farm_lots_gfw_status(self, user_id, gfw_status) -> None:
        self.gfw_status = gfw_status


class FakeGfw:
    def check_geometry(self, geometry) -> str:
        return "blocked"


class FakeWhatsApp:
    def __init__(self) -> None:
        self.sent: list[str] = []

    def send_text(self, to_wa_id: str, body: str) -> None:
        self.sent.append(body)


class LocationTests(unittest.TestCase):
    def test_extract_location_message(self) -> None:
        payload = {"entry": [{"changes": [{"value": {"messages": [
            {"id": "wamid.1", "from": "573", "type": "location", "timestamp": "1",
             "location": {"latitude": 4.6, "longitude": -74.1}}
        ]}}]}]}
        (envelope,) = extract_messages(payload)
        self.assertEqual((envelope["latitude"], envelope["longitude"]), (4.6, -74.1))

    def test_handle_location_saves_pin(self) -> None:
        store, wa = FakeStore({"id": "u1"}), FakeWhatsApp()
        msg = {"type": "location", "wa_id": "573", "source_message_id": "wamid.1",
               "latitude": 4.6, "longitude": -74.1}
        self.assertTrue(handle_location(msg, store, wa))
        self.assertEqual(store.pins, [("u1", "wamid.1", 4.6, -74.1)])
        self.assertEqual(wa.sent, [LOCATION_SAVED_REPLY])

    def test_location_triggers_gfw_check(self) -> None:
        store = FakeStore({"id": "u1"})
        msg = {"type": "location", "wa_id": "573", "source_message_id": "wamid.1",
               "latitude": 4.6, "longitude": -74.1}
        handle_location(msg, store, FakeWhatsApp(), FakeGfw())
        self.assertEqual(store.gfw_status, "blocked")

    def test_ignores_non_location(self) -> None:
        self.assertFalse(handle_location({"type": "text", "wa_id": "1"}, FakeStore(None), FakeWhatsApp()))


if __name__ == "__main__":
    unittest.main()
