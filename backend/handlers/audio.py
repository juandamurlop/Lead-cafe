"""Voice note handler: transcribe, extract lot fields, register the lot."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Protocol

logger = logging.getLogger(__name__)

NO_LOT_REPLY = (
    "No pudimos entender los datos del lote. Envía otra nota de voz con el nombre, "
    "la cantidad y el proceso (lavado, honey o natural)."
)
FAILED_REPLY = "No pudimos registrar tu lote. Intenta de nuevo en un momento."
LOT_SAVED_TEMPLATE = (
    "✅ Lote {lot_code} registrado\n"
    "Nombre: {name}\nCantidad: {quantity}\nProceso: {process}\n"
    "Comparte tu ubicación 📍 para completar el registro."
)


class AudioStoreProtocol(Protocol):
    def get_user_by_wa_id(self, wa_id: str) -> dict[str, Any] | None: ...
    def create_lot(
        self,
        user_id: Any,
        source_message_id: str,
        lot_code: str,
        lot_name: str | None,
        quantity: float | None,
        unit: str | None,
        process: str | None,
    ) -> bool: ...


class WhatsAppProtocol(Protocol):
    def send_text(self, to_wa_id: str, body: str) -> None: ...
    def download_media(self, media_id: str) -> tuple[bytes, str]: ...


class FoundryProtocol(Protocol):
    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str: ...
    def extract_lot(self, transcript: str) -> dict[str, Any]: ...


def new_lot_code() -> str:
    return f"LC-{datetime.now(timezone.utc):%y%m%d}-{secrets.token_hex(2).upper()}"


def _clean(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def handle_audio(
    message: dict[str, Any],
    store: AudioStoreProtocol,
    whatsapp: WhatsAppProtocol,
    foundry: FoundryProtocol,
) -> bool:
    """Register a lot from a voice note. Returns True if the message was audio."""
    if message.get("type") != "audio" or not message.get("audio_id"):
        return False

    wa_id = str(message["wa_id"])
    user = store.get_user_by_wa_id(wa_id)
    if user is None:
        return False

    audio_bytes, mime_type = whatsapp.download_media(str(message["audio_id"]))
    transcript = foundry.transcribe_audio(audio_bytes, mime_type)
    fields = foundry.extract_lot(transcript) if transcript else {}

    quantity = fields.get("quantity")
    try:
        quantity = float(quantity) if quantity is not None else None
    except (TypeError, ValueError):
        quantity = None
    lot_name, unit, process = (_clean(fields.get(k)) for k in ("lot_name", "unit", "process"))

    if quantity is None and lot_name is None and process is None:
        logger.info("No lot fields extracted for ...%s", wa_id[-4:])
        whatsapp.send_text(wa_id, NO_LOT_REPLY)
        return True

    lot_code = new_lot_code()
    saved = store.create_lot(
        user["id"], str(message["source_message_id"]), lot_code, lot_name, quantity, unit, process
    )
    logger.info("Lot %s for ...%s saved=%s", lot_code, wa_id[-4:], saved)
    if not saved:
        whatsapp.send_text(wa_id, FAILED_REPLY)
        return True

    qty_text = f"{quantity:g} {unit or ''}".strip() if quantity is not None else "—"
    whatsapp.send_text(
        wa_id,
        LOT_SAVED_TEMPLATE.format(
            lot_code=lot_code, name=lot_name or "—", quantity=qty_text, process=process or "—"
        ),
    )
    return True
