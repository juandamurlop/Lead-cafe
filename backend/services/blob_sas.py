"""Per-blob, short-lived Azure Storage SAS URL signing for evidence files."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
from urllib.parse import quote, unquote, urlencode, urlparse, urlunparse


_SAS_VERSION = "2022-11-02"
_DEFAULT_TTL_MINUTES = 15


def parse_storage_connection_string(conn_str: str) -> tuple[str, str] | None:
    """Extract (AccountName, AccountKey) from an Azure Storage connection string."""
    parts: dict[str, str] = {}
    for segment in conn_str.split(";"):
        if "=" not in segment:
            continue
        key, value = segment.split("=", 1)
        parts[key.strip()] = value.strip()
    account_name = parts.get("AccountName")
    account_key = parts.get("AccountKey")
    if not account_name or not account_key:
        return None
    return account_name, account_key


def _sign_blob_sas(
    account_name: str,
    account_key: str,
    container_name: str,
    blob_name: str,
    ttl_minutes: int = _DEFAULT_TTL_MINUTES,
    now: datetime | None = None,
) -> str:
    """Generate a read-only, per-blob (sr=b) SAS query string."""
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    start = (current - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    expiry = (current + timedelta(minutes=ttl_minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")
    canonicalized_resource = f"/blob/{account_name}/{container_name}/{blob_name}"

    string_to_sign = "\n".join(
        [
            "r",                    # signedPermissions
            start,                  # signedStart
            expiry,                 # signedExpiry
            canonicalized_resource, # canonicalizedResource
            "",                     # signedIdentifier
            "",                     # signedIP
            "https",                # signedProtocol
            _SAS_VERSION,           # signedVersion
            "b",                    # signedResource (per-blob, not container)
            "",                     # signedSnapshotTime
            "",                     # signedEncryptionScope
            "",                     # rscc
            "",                     # rscd
            "",                     # rsce
            "",                     # rscl
            "",                     # rsct
        ]
    )

    key_bytes = base64.b64decode(account_key)
    digest = hmac.new(key_bytes, string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    signature = base64.b64encode(digest).decode("utf-8")

    return urlencode(
        {
            "sv": _SAS_VERSION,
            "st": start,
            "se": expiry,
            "sr": "b",
            "sp": "r",
            "spr": "https",
            "sig": signature,
        },
        quote_via=quote,
    )


def sign_evidence_url(
    raw_url: str | None,
    conn_str: str | None = None,
    ttl_minutes: int | None = None,
    now: datetime | None = None,
) -> str | None:
    """Replace any static/container SAS on an evidence URL with a short-lived per-blob SAS.

    If no matching storage account credentials are configured, returns the URL unchanged
    so local dev and tests without storage keys continue to work.
    """
    if not raw_url:
        return raw_url

    parsed = urlparse(raw_url)
    effective_conn = (
        conn_str
        or os.environ.get("EVIDENCE_STORAGE_CONNECTION_STRING")
        or os.environ.get("AzureWebJobsStorage")
        or ""
    )
    creds = parse_storage_connection_string(effective_conn)
    if creds is None:
        return raw_url

    account_name, account_key = creds
    host = (parsed.hostname or "").lower()
    if host != f"{account_name.lower()}.blob.core.windows.net":
        return raw_url

    path = parsed.path.lstrip("/")
    if "/" not in path:
        return raw_url
    container_name, blob_name = path.split("/", 1)
    blob_name = unquote(blob_name)

    effective_ttl = ttl_minutes
    if effective_ttl is None:
        try:
            effective_ttl = int(os.environ.get("EVIDENCE_SAS_TTL_MINUTES", str(_DEFAULT_TTL_MINUTES)))
        except ValueError:
            effective_ttl = _DEFAULT_TTL_MINUTES

    sas_query = _sign_blob_sas(
        account_name=account_name,
        account_key=account_key,
        container_name=container_name,
        blob_name=blob_name,
        ttl_minutes=effective_ttl,
        now=now,
    )
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", sas_query, ""))
