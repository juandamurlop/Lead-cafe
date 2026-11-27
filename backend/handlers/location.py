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
    def get_check_geometry(self, user_id: Any) -> dict[str, Any] | None: ...
    def set_farm_lots_gfw_status(self, user_id: Any, gfw_status: str) -> None: ...


class GfwProtocol(Protocol):
    def check_geometry(self, geometry: dict[str, Any]) -> str: ...


class WhatsAppProtocol(Protocol):
    def send_text(self, to_wa_id: str, body: str) -> None: ...


def handle_location(
    message: dict[str, Any],
    store: LocationStoreProtocol,
    whatsapp: WhatsAppProtocol,
    gfw: GfwProtocol | None = None,
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
    if saved and gfw is not None:
        geometry = store.get_check_geometry(user["id"])
        if geometry:
            status = gfw.check_geometry(geometry)
            store.set_farm_lots_gfw_status(user["id"], status)
            logger.info("GFW status for ...%s: %s", wa_id[-4:], status)
    return True
