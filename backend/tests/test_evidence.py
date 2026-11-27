"""Unit tests for EUDR compliance evidence blob upload."""

from __future__ import annotations

import base64
from decimal import Decimal
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.evidence import EvidenceUploader


class EvidenceUploaderTests(unittest.TestCase):
    def test_from_env_returns_none_for_dev_storage(self) -> None:
        with patch.dict(os.environ, {"AzureWebJobsStorage": "UseDevelopmentStorage=true"}, clear=True):
            self.assertIsNone(EvidenceUploader.from_env())

    def test_from_env_uses_connection_string_and_container(self) -> None:
        fake_key = base64.b64encode(b"0123456789abcdef0123456789abcdef").decode("ascii")
        conn_str = (
            "DefaultEndpointsProtocol=https;"
            "AccountName=loteclaroblob;"
            f"AccountKey={fake_key};"
            "EndpointSuffix=core.windows.net"
        )
        with patch.dict(
            os.environ,
            {
                "EVIDENCE_STORAGE_CONNECTION_STRING": conn_str,
                "EVIDENCE_CONTAINER_NAME": "compliance-evidence",
            },
            clear=True,
        ):
            uploader = EvidenceUploader.from_env()
        self.assertIsNotNone(uploader)
        assert uploader is not None
        self.assertEqual(uploader.account_name, "loteclaroblob")
        self.assertEqual(uploader.container_name, "compliance-evidence")

    def test_upload_lot_evidence_puts_json_with_write_sas(self) -> None:
        fake_key = base64.b64encode(b"0123456789abcdef0123456789abcdef").decode("ascii")
        uploader = EvidenceUploader(
            account_name="loteclaroblob",
            account_key=fake_key,
            container_name="compliance-evidence",
        )
        lot = {
            "id": "lot-1",
            "lot_code": "LC-261127-A3F0",
            "lot_name": "San Benites",
            "quantity": Decimal("50"),
            "unit": "kg",
            "process": "lavado",
            "gfw_status": "clear",
            "farm_name": "San Benites",
            "producer_name": "Saruki",
        }
        geometry = {"type": "Polygon", "coordinates": [[[-75.5, 5.0], [-75.4, 5.0], [-75.4, 5.1], [-75.5, 5.0]]]}

        fake_resp = MagicMock()
        with patch("services.evidence.httpx.put", return_value=fake_resp) as mock_put:
            url = uploader.upload_lot_evidence(lot, geometry)

        self.assertEqual(
            url,
            "https://loteclaroblob.blob.core.windows.net/compliance-evidence/LC-261127-A3F0.json",
        )
        fake_resp.raise_for_status.assert_called_once()
        signed_url = mock_put.call_args.args[0]
        qs = parse_qs(urlparse(signed_url).query)
        self.assertEqual(qs["sr"], ["b"])
        self.assertEqual(qs["sp"], ["cw"])
        headers = mock_put.call_args.kwargs["headers"]
        self.assertEqual(headers["x-ms-blob-type"], "BlockBlob")
        body = json.loads(mock_put.call_args.kwargs["content"].decode("utf-8"))
        self.assertEqual(body["lot_code"], "LC-261127-A3F0")
        self.assertEqual(body["quantity"], 50.0)
        self.assertEqual(body["farm"], "San Benites")
        self.assertEqual(body["producer"], "Saruki")
        self.assertEqual(body["gfw_status"], "clear")
        self.assertEqual(body["boundary"], geometry)


if __name__ == "__main__":
    unittest.main()
