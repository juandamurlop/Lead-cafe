"""Upload EUDR compliance evidence JSON documents to Azure Blob Storage."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from typing import Any

import httpx

from services.blob_sas import build_blob_urls, parse_storage_connection_string

_DEFAULT_CONTAINER = "compliance-evidence"


class EvidenceUploader:
    """Uploads per-lot EUDR due-diligence evidence JSON to Azure Blob Storage."""

    def __init__(
        self,
        account_name: str,
        account_key: str,
        container_name: str = _DEFAULT_CONTAINER,
        timeout: float = 15.0,
    ) -> None:
        self.account_name = account_name
        self.account_key = account_key
        self.container_name = container_name
        self._timeout = timeout

    @classmethod
    def from_env(cls) -> EvidenceUploader | None:
        """Build an uploader from environment settings, or None if storage isn't configured."""
        conn_str = (
            os.environ.get("EVIDENCE_STORAGE_CONNECTION_STRING")
            or os.environ.get("AzureWebJobsStorage")
            or ""
        )
        creds = parse_storage_connection_string(conn_str)
        if creds is None:
            return None
        account_name, account_key = creds
        container = os.environ.get("EVIDENCE_CONTAINER_NAME") or _DEFAULT_CONTAINER
        return cls(account_name=account_name, account_key=account_key, container_name=container)

    def upload_lot_evidence(self, lot: dict[str, Any], geometry: dict[str, Any]) -> str:
        """Upload evidence JSON for a lot and return its unsigned Azure Blob URL."""
        lot_code = str(lot["lot_code"])
        blob_name = f"{lot_code}.json"
        quantity = lot.get("quantity")
        payload = {
            "lot_code": lot_code,
            "lot_name": lot.get("lot_name"),
            "quantity": float(quantity) if quantity is not None else None,
            "unit": lot.get("unit"),
            "process": lot.get("process"),
            "farm": lot.get("farm_name"),
            "producer": lot.get("producer_name"),
            "gfw_status": lot.get("gfw_status") or "pending",
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "boundary": geometry,
        }
        body = json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")

        base_url, signed_url = build_blob_urls(
            account_name=self.account_name,
            account_key=self.account_key,
            container_name=self.container_name,
            blob_name=blob_name,
            permissions="cw",
        )
        response = httpx.put(
            signed_url,
            content=body,
            headers={
                "x-ms-blob-type": "BlockBlob",
                "Content-Type": "application/json; charset=utf-8",
            },
            timeout=self._timeout,
        )
        response.raise_for_status()
        return base_url
