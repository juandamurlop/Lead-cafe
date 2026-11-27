"""Meta WhatsApp webhook verification and HMAC signature validation."""

from __future__ import annotations

import hashlib
import hmac
from typing import Mapping


def verify_challenge(params: Mapping[str, str], expected_verify_token: str) -> tuple[int, str]:
    """Handle Meta GET webhook verification (hub.challenge)."""
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and expected_verify_token and hmac.compare_digest(
        token or "", expected_verify_token
    ):
        return 200, challenge or ""
    return 403, "Forbidden"


def verify_signature(raw_body: bytes, signature_header: str | None, app_secret: str) -> bool:
    """Validate X-Hub-Signature-256 against the Meta App Secret."""
    if not signature_header or not app_secret:
        return False
    if not signature_header.startswith("sha256="):
        return False

    received_sig = signature_header.removeprefix("sha256=")
    expected_sig = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(received_sig, expected_sig)
