"""Location pin handler for registered users."""

from __future__ import annotations

import logging
from typing import Any, Protocol

logger = logging.getLogger(__name__)

LOCATION_SAVED_REPLY = "📍 ¡Ubicación guardada! La asociamos a tu finca."
LOCATION_FAILED_REPLY = "No pudimos guardar tu ubicación. Intenta enviarla de nuevo."


class LocationStoreProtocol(Protocol):
    def get_user_by_wa_id(self, wa_id: str) -> dict[str, Any] | None: ...
    def save_location_pin(
        self, user_id: Any, source_message_id: str, latitude: float, longitude: float
    ) -> bool: ...


class WhatsAppProtocol(Protocol):
    def send_text(self, to_wa_id: str, body: str) -> None: ...


def handle_location(
    message: dict[str, Any], store: LocationStoreProtocol, whatsapp: WhatsAppProtocol
) -> bool:
    """Save a WhatsApp location pin. Returns True if the message was a location."""
    if message.get("type") != "location":
        return False

    wa_id = str(message["wa_id"])
    user = store.get_user_by_wa_id(wa_id)
    latitude, longitude = message.get("latitude"), message.get("longitude")
    if user is None or latitude is None or longitude is None:
        whatsapp.send_text(wa_id, LOCATION_FAILED_REPLY)
        return True

    saved = store.save_location_pin(
        user["id"], str(message["source_message_id"]), float(latitude), float(longitude)
    )
    logger.info("Location pin for ...%s saved=%s", wa_id[-4:], saved)
    whatsapp.send_text(wa_id, LOCATION_SAVED_REPLY if saved else LOCATION_FAILED_REPLY)
    return True
