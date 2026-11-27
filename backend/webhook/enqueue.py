"""Parse Meta WhatsApp webhook payloads and enqueue normalized message envelopes."""

from __future__ import annotations

import json
from typing import Any


def extract_messages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract normalized inbound message envelopes from a Meta webhook payload."""
    envelopes: list[dict[str, Any]] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                msg_type = msg.get("type", "")
                envelope: dict[str, Any] = {
                    "source_message_id": msg.get("id", ""),
                    "wa_id": msg.get("from", ""),
                    "type": msg_type,
                    "timestamp": msg.get("timestamp", ""),
                    "text": None,
                    "button_id": None,
                    "button_title": None,
                    "audio_id": None,
                    "audio_mime_type": None,
                }

                if msg_type == "text":
                    envelope["text"] = (msg.get("text") or {}).get("body", "").strip()
                elif msg_type == "interactive":
                    interactive = msg.get("interactive") or {}
                    button_reply = interactive.get("button_reply") or {}
                    envelope["button_id"] = button_reply.get("id")
                    envelope["button_title"] = button_reply.get("title")
                elif msg_type == "audio":
                    audio = msg.get("audio") or {}
                    envelope["audio_id"] = audio.get("id")
                    envelope["audio_mime_type"] = audio.get("mime_type", "audio/ogg")

                if envelope["source_message_id"] and envelope["wa_id"]:
                    envelopes.append(envelope)

    return envelopes


def enqueue_messages(envelopes: list[dict[str, Any]], queue_client: Any) -> int:
    """Push normalized message envelopes onto Azure Queue Storage."""
    count = 0
    for envelope in envelopes:
        queue_client.send_message(json.dumps(envelope, ensure_ascii=False))
        count += 1
    return count
