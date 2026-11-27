"""WhatsApp Business Cloud API client."""

from __future__ import annotations

import httpx


class WhatsAppClient:
    """Client for sending messages and downloading media via Meta Graph API."""

    def __init__(
        self,
        access_token: str,
        phone_number_id: str,
        api_version: str = "v21.0",
    ) -> None:
        self._access_token = access_token
        self._phone_number_id = phone_number_id
        self._base_url = f"https://graph.facebook.com/{api_version}"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._access_token}"}

    def send_text(self, to_wa_id: str, body: str) -> None:
        """Send a plain text WhatsApp message."""
        url = f"{self._base_url}/{self._phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": to_wa_id,
            "type": "text",
            "text": {"body": body},
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()

    def send_consent_buttons(self, to_wa_id: str, body: str) -> None:
        """Send interactive consent reply buttons ('Sí, acepto' / 'No')."""
        url = f"{self._base_url}/{self._phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": to_wa_id,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {"id": "consent_yes", "title": "Sí, acepto"},
                        },
                        {
                            "type": "reply",
                            "reply": {"id": "consent_no", "title": "No"},
                        },
                    ]
                },
            },
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()

    def send_role_buttons(self, to_wa_id: str, body: str) -> None:
        """Send interactive role reply buttons ('Soy productor' / 'Centro de acopio')."""
        url = f"{self._base_url}/{self._phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": to_wa_id,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {"id": "role_productor", "title": "Soy productor"},
                        },
                        {
                            "type": "reply",
                            "reply": {"id": "role_acopio", "title": "Centro de acopio"},
                        },
                    ]
                },
            },
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()

    def send_location_request(self, to_wa_id: str, body: str) -> None:
        """Send a message with a one-tap 'Send location' button."""
        url = f"{self._base_url}/{self._phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": to_wa_id,
            "type": "interactive",
            "interactive": {
                "type": "location_request_message",
                "body": {"text": body},
                "action": {"name": "send_location"},
            },
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()

    def download_media(self, media_id: str) -> tuple[bytes, str]:
        """Fetch media metadata and download raw bytes from WhatsApp Cloud API."""
        meta_url = f"{self._base_url}/{media_id}"
        with httpx.Client(timeout=30.0) as client:
            meta_resp = client.get(meta_url, headers=self._headers())
            meta_resp.raise_for_status()
            meta = meta_resp.json()
            media_url = meta["url"]
            mime_type = meta.get("mime_type", "audio/ogg")

            media_resp = client.get(media_url, headers=self._headers())
            media_resp.raise_for_status()
            return media_resp.content, mime_type
