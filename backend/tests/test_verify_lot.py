"""Unit tests for cooperative lot verification endpoint."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.lots import handle_verify_lot


class FakeVerifyStore:
    def __init__(self, known_codes: set[str]) -> None:
        self.known_codes = known_codes
        self.verified: list[str] = []

    def dashboard_summary(self):
        return {}

    def list_lots(self, gfw_status=None, search=None):
        return []

    def get_lot_by_code(self, lot_code: str):
        return None

    def verify_lot_producer(self, lot_code: str) -> bool:
        if lot_code not in self.known_codes:
            return False
        self.verified.append(lot_code)
        return True


class VerifyLotTests(unittest.TestCase):
    def test_verify_existing_lot(self) -> None:
        store = FakeVerifyStore({"LC-261127-A3F0"})
        status, body = handle_verify_lot(store, "LC-261127-A3F0")
        self.assertEqual(status, 200)
        self.assertEqual(body, {"lot_code": "LC-261127-A3F0", "verified_by_coop": True})
        self.assertEqual(store.verified, ["LC-261127-A3F0"])

    def test_verify_missing_lot_returns_404(self) -> None:
        store = FakeVerifyStore(set())
        status, _ = handle_verify_lot(store, "LC-MISSING")
        self.assertEqual(status, 404)

    def test_verify_empty_code_returns_400(self) -> None:
        store = FakeVerifyStore(set())
        status, _ = handle_verify_lot(store, "   ")
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
