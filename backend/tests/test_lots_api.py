"""Unit tests for the dashboard & buyer QR lot read API."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import json
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.lots import handle_get_lot, handle_list_lots, to_json


class FakeLotStore:
    def __init__(self) -> None:
        self.lots = [
            {
                "id": UUID("11111111-1111-1111-1111-111111111111"),
                "lot_code": "LC-2026-001",
                "lot_name": "La Esperanza Lavado",
                "quantity": Decimal("450.5"),
                "unit": "kg",
                "process": "lavado",
                "gfw_status": "clear",
                "evidence_blob_url": "https://example.blob.core.windows.net/evidence/lc-2026-001.pdf",
                "created_at": datetime(2026, 11, 20, 14, 30, tzinfo=timezone.utc),
                "farm_id": UUID("22222222-2222-2222-2222-222222222222"),
                "farm_name": "Finca La Esperanza",
                "captured_at": datetime(2026, 11, 18, 9, 0, tzinfo=timezone.utc),
                "producer_name": "Rosa Elvira",
                "verified_by_coop": True,
                "boundary_geojson": {
                    "type": "Polygon",
                    "coordinates": [[[-75.56, 5.06], [-75.55, 5.06], [-75.55, 5.07], [-75.56, 5.06]]],
                },
                "epcis_events": [
                    {
                        "id": UUID("33333333-3333-3333-3333-333333333333"),
                        "event_type": "ObjectEvent",
                        "event_time": datetime(2026, 11, 20, 15, 0, tzinfo=timezone.utc),
                        "payload": {"bizStep": "harvesting", "stage": "finca"},
                    }
                ],
            }
        ]

    def dashboard_summary(self) -> dict[str, int]:
        return {"farms": 1, "lots": len(self.lots), "events": 1}

    def list_lots(self, gfw_status: str | None = None, search: str | None = None):
        items = self.lots
        if gfw_status:
            items = [item for item in items if item["gfw_status"] == gfw_status]
        if search:
            q = search.lower()
            items = [
                item
                for item in items
                if q in item["lot_code"].lower()
                or q in (item["farm_name"] or "").lower()
                or q in (item["producer_name"] or "").lower()
            ]
        return items

    def get_lot_by_code(self, lot_code: str):
        for item in self.lots:
            if item["lot_code"] == lot_code:
                return item
        return None


def test_list_lots_filters_and_serializes() -> None:
    store = FakeLotStore()
    status, body = handle_list_lots(store, gfw_status="all", search="Rosa")
    assert status == 200
    assert body["count"] == 1
    parsed = json.loads(to_json(body))
    assert parsed["lots"][0]["lot_code"] == "LC-2026-001"
    assert parsed["lots"][0]["quantity"] == 450.5


def test_list_lots_status_filter_excludes_non_matching() -> None:
    store = FakeLotStore()
    status, body = handle_list_lots(store, gfw_status="alert")
    assert status == 200
    assert body == {"lots": [], "count": 0}


def test_get_lot_by_code_found_and_not_found() -> None:
    store = FakeLotStore()
    status, body = handle_get_lot(store, "LC-2026-001")
    assert status == 200
    assert body["farm_name"] == "Finca La Esperanza"
    assert len(body["epcis_events"]) == 1

    status_404, body_404 = handle_get_lot(store, "UNKNOWN-999")
    assert status_404 == 404
    assert "not found" in body_404["error"]

    status_400, _ = handle_get_lot(store, "   ")
    assert status_400 == 400
