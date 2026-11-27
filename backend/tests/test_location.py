"""Unit tests for location message parsing and handling."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from handlers.location import LOCATION_SAVED_REPLY, handle_location
from webhook.enqueue import extract_messages


class FakeStore:
    def __init__(self, user: dict | None, saved: bool = True, lots: list[dict] | None = None) -> None:
        self.user, self.saved, self.pins = user, saved, []
        self.lots = lots or []
        self.evidence_urls: list[tuple[str, str]] = []

    def get_user_by_wa_id(self, wa_id: str):
        return self.user

    def save_location_pin(self, user_id, source_message_id, latitude, longitude) -> bool:
        self.pins.append((user_id, source_message_id, latitude, longitude))
        return self.saved

    def get_check_geometry(self, user_id):
        return {"type": "Polygon", "coordinates": []}

    def set_farm_lots_gfw_status(self, user_id, gfw_status) -> None:
        self.gfw_status = gfw_status

    def get_latest_farm_lots(self, user_id):
        return self.lots

    def set_lot_evidence_url(self, lot_id, evidence_blob_url: str) -> None:
        self.evidence_urls.append((lot_id, evidence_blob_url))


class FakeGfw:
    def check_geometry(self, geometry) -> str:
        return "blocked"


class FakeEvidence:
    def __init__(self, should_fail: bool = False) -> None:
        self.should_fail = should_fail
        self.uploaded: list[tuple[str, dict]] = []

    def upload_lot_evidence(self, lot, geometry) -> str:
        if self.should_fail:
            raise RuntimeError("blob upload failed")
        self.uploaded.append((lot["lot_code"], geometry))
        return f"https://example.blob.core.windows.net/compliance-evidence/{lot['lot_code']}.json"


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

    def test_location_uploads_evidence_for_farm_lots(self) -> None:
        store = FakeStore(
            {"id": "u1"},
            lots=[{"id": "lot-1", "lot_code": "LC-261127-A3F0"}],
        )
        evidence = FakeEvidence()
        msg = {"type": "location", "wa_id": "573", "source_message_id": "wamid.1",
               "latitude": 4.6, "longitude": -74.1}
        handle_location(msg, store, FakeWhatsApp(), FakeGfw(), evidence)
        self.assertEqual(
            store.evidence_urls,
            [("lot-1", "https://example.blob.core.windows.net/compliance-evidence/LC-261127-A3F0.json")],
        )

    def test_location_continues_if_evidence_upload_fails(self) -> None:
        store = FakeStore(
            {"id": "u1"},
            lots=[{"id": "lot-1", "lot_code": "LC-261127-A3F0"}],
        )
        wa = FakeWhatsApp()
        msg = {"type": "location", "wa_id": "573", "source_message_id": "wamid.1",
               "latitude": 4.6, "longitude": -74.1}
        self.assertTrue(handle_location(msg, store, wa, FakeGfw(), FakeEvidence(should_fail=True)))
        self.assertEqual(store.evidence_urls, [])
        self.assertEqual(wa.sent, [LOCATION_SAVED_REPLY])

    def test_ignores_non_location(self) -> None:
        self.assertFalse(handle_location({"type": "text", "wa_id": "1"}, FakeStore(None), FakeWhatsApp()))


if __name__ == "__main__":
    unittest.main()
