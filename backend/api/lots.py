"""Read API handlers for lots, EUDR farm polygons, and EPCIS 2.0 traceability."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import json
from typing import Any, Protocol
from uuid import UUID

from services.blob_sas import sign_evidence_url


class LotStore(Protocol):
    """Minimal store interface required by the dashboard & QR read API."""

    def dashboard_summary(self) -> dict[str, int]: ...
    def list_lots(
        self,
        gfw_status: str | None = None,
        search: str | None = None,
    ) -> list[dict[str, Any]]: ...
    def get_lot_by_code(self, lot_code: str) -> dict[str, Any] | None: ...


def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def to_json(payload: Any) -> str:
    """Serialize API payloads containing UUID, Decimal, and datetime fields."""
    return json.dumps(payload, default=_json_default)


def handle_list_lots(
    store: LotStore,
    gfw_status: str | None = None,
    search: str | None = None,
) -> tuple[int, dict[str, Any]]:
    """Return all registered lots with optional GFW status and text filters."""
    normalized_status = gfw_status.strip() if gfw_status and gfw_status.strip() else None
    if normalized_status and normalized_status.lower() == "all":
        normalized_status = None
    normalized_search = search.strip() if search and search.strip() else None

    lots = store.list_lots(gfw_status=normalized_status, search=normalized_search)
    for lot in lots:
        if lot.get("evidence_blob_url"):
            lot["evidence_blob_url"] = sign_evidence_url(lot["evidence_blob_url"])
    return 200, {"lots": lots, "count": len(lots)}


def handle_get_lot(store: LotStore, lot_code: str) -> tuple[int, dict[str, Any]]:
    """Return a single lot's EUDR polygon, evidence link, and EPCIS 2.0 timeline."""
    code = lot_code.strip()
    if not code:
        return 400, {"error": "lot_code is required"}

    lot = store.get_lot_by_code(code)
    if lot is None:
        return 404, {"error": f"Lot '{code}' not found"}

    if lot.get("evidence_blob_url"):
        lot["evidence_blob_url"] = sign_evidence_url(lot["evidence_blob_url"])
    return 200, lot
