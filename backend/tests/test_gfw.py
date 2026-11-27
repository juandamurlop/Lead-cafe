"""Unit tests for the GFW deforestation status mapping."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.gfw import GfwClient, GfwError


class StubClient(GfwClient):
    def __init__(self, loss=0.0, alerts=0.0, fail=False) -> None:
        super().__init__("key")
        self.loss, self.alerts, self.fail = loss, alerts, fail

    def _query(self, dataset, sql, geometry) -> float:
        if self.fail:
            raise GfwError("down")
        return self.loss if dataset == "umd_tree_cover_loss" else self.alerts


class GfwTests(unittest.TestCase):
    def test_statuses(self) -> None:
        geom = {"type": "Polygon", "coordinates": []}
        self.assertEqual(StubClient().check_geometry(geom), "clear")
        self.assertEqual(StubClient(alerts=3).check_geometry(geom), "alert")
        self.assertEqual(StubClient(loss=0.4, alerts=3).check_geometry(geom), "blocked")
        self.assertEqual(StubClient(fail=True).check_geometry(geom), "pending")


if __name__ == "__main__":
    unittest.main()
