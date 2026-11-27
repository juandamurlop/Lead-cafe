"""Unit tests for Meta webhook verification and payload extraction."""

from __future__ import annotations

import hashlib
import hmac
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from webhook.enqueue import extract_messages
from webhook.verify import verify_challenge, verify_signature


class WebhookTests(unittest.TestCase):
    def test_verify_challenge_success_and_failure(self) -> None:
        status, body = verify_challenge(
            {
                "hub.mode": "subscribe",
                "hub.verify_token": "my-secret",
                "hub.challenge": "12345",
            },
            "my-secret",
        )
        self.assertEqual((status, body), (200, "12345"))

        status, _ = verify_challenge(
            {
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong",
                "hub.challenge": "12345",
            },
            "my-secret",
        )
        self.assertEqual(status, 403)

    def test_verify_signature(self) -> None:
        body = b'{"object":"whatsapp_business_account"}'
        secret = "app-secret"
        sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        self.assertTrue(verify_signature(body, sig, secret))
        self.assertFalse(verify_signature(body, "sha256=deadbeef", secret))
        self.assertFalse(verify_signature(body, None, secret))

    def test_extract_messages_interactive_and_audio(self) -> None:
        payload = {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "messages": [
                                    {
                                        "id": "wamid.1",
                                        "from": "573001234567",
                                        "timestamp": "1732700000",
                                        "type": "interactive",
                                        "interactive": {
                                            "type": "button_reply",
                                            "button_reply": {
                                                "id": "consent_yes",
                                                "title": "Sí, acepto",
                                            },
                                        },
                                    },
                                    {
                                        "id": "wamid.2",
                                        "from": "573001234567",
                                        "timestamp": "1732700010",
                                        "type": "audio",
                                        "audio": {
                                            "id": "media-abc",
                                            "mime_type": "audio/ogg; codecs=opus",
                                        },
                                    },
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        envelopes = extract_messages(payload)
        self.assertEqual(len(envelopes), 2)
        self.assertEqual(envelopes[0]["button_id"], "consent_yes")
        self.assertEqual(envelopes[1]["audio_id"], "media-abc")


if __name__ == "__main__":
    unittest.main()
