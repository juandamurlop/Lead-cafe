"""Acopio delivery handler: a voice note per farmer delivery becomes a Recepción record."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Protocol

from services.pricing import expected_payment, quality_status

logger = logging.getLogger(__name__)

NO_DELIVERY_REPLY = (
    "No pudimos entender la entrega. Envía una nota de voz con el nombre del productor, "
    "el peso en kilos y la humedad. Por ejemplo: «Luis Pérez, finca El Mirador, 48 kilos, "
    "humedad 11,5, pagué 310 mil en efectivo»."
)
FAILED_REPLY = "No pudimos registrar la entrega. Intenta de nuevo en un momento."
DELIVERY_SAVED_TEMPLATE = (
    "✅ Entrega {code}\n"
    "Productor: {producer}\n"
    "Peso: {kg} kg · Humedad: {humidity}\n"
    "Estado: {status}\n"
    "Origen: {origin}\n"
    "Pago de referencia: {expected}\n"
    "Pago registrado: {paid}{diff}\n"
    "Escribe {code} en el saco."
)
STATUS_TEXT = {
    "aceptado": "aceptada",
    "retenido": "retenida para evaluación (humedad fuera de 10–12 %)",
    "rechazado": "rechazada (humedad sobre 14 %)",
}
# Differences below this fraction of the reference payment are not worth flagging.
PAYMENT_TOLERANCE = 0.02


class DeliveryStoreProtocol(Protocol):
    def get_user_by_wa_id(self, wa_id: str) -> dict[str, Any] | None: ...
    def find_farm(self, producer_name: str, farm_name: str | None) -> dict[str, Any] | None: ...
    def create_delivery(self, delivery: dict[str, Any]) -> bool: ...


class WhatsAppProtocol(Protocol):
    def send_text(self, to_wa_id: str, body: str) -> None: ...
    def download_media(self, media_id: str) -> tuple[bytes, str]: ...


class FoundryProtocol(Protocol):
    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str: ...
    def extract_delivery(self, transcript: str) -> dict[str, Any]: ...


def new_delivery_code() -> str:
    return f"EN-{datetime.now(timezone.utc):%y%m%d}-{secrets.token_hex(2).upper()}"


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _cop(value: float | None) -> str:
    return f"{value:,.0f} COP".replace(",", ".") if value is not None else "—"


def handle_delivery(
    message: dict[str, Any],
    store: DeliveryStoreProtocol,
    whatsapp: WhatsAppProtocol,
    foundry: FoundryProtocol,
) -> bool:
    """Register a delivery from an acopio voice note. True if the message was consumed."""
    if message.get("type") != "audio" or not message.get("audio_id"):
        return False

    wa_id = str(message["wa_id"])
    user = store.get_user_by_wa_id(wa_id)
    if user is None or user.get("role") != "acopio":
        return False

    audio_bytes, mime_type = whatsapp.download_media(str(message["audio_id"]))
    transcript = foundry.transcribe_audio(audio_bytes, mime_type)
    fields = foundry.extract_delivery(transcript) if transcript else {}
    logger.info("Delivery note ...%s transcript=%r fields=%s", wa_id[-4:], transcript, fields)

    kg = _number(fields.get("kg"))
    producer = _text(fields.get("producer_name"))
    if kg is None or kg <= 0 or producer is None:
        whatsapp.send_text(wa_id, NO_DELIVERY_REPLY)
        return True

    farm_name = _text(fields.get("farm_name"))
    humidity = _number(fields.get("humidity_pct"))
    paid = _number(fields.get("paid_cop"))
    farm = store.find_farm(producer, farm_name)
    traced = farm is not None
    status = quality_status(humidity)
    expected = expected_payment(kg, humidity, traced)
    code = new_delivery_code()

    saved = store.create_delivery({
        "delivery_code": code,
        "acopio_user_id": user["id"],
        "farm_id": farm["farm_id"] if farm else None,
        "producer_name": farm["producer_name"] if farm else producer,
        "farm_name": farm["farm_name"] if farm else farm_name,
        "kg": kg,
        "humidity_pct": humidity,
        "defects": _text(fields.get("defects")),
        "paid_cop": paid,
        "payment_method": _text(fields.get("payment_method")),
        "expected_cop": expected,
        "quality_status": status,
        "traced": traced,
        "source_message_id": str(message["source_message_id"]),
    })
    logger.info("Delivery %s for ...%s saved=%s traced=%s", code, wa_id[-4:], saved, traced)
    if not saved:
        whatsapp.send_text(wa_id, FAILED_REPLY)
        return True

    diff = ""
    if expected is not None and paid is not None and abs(paid - expected) > expected * PAYMENT_TOLERANCE:
        diff = f"\n⚠️ Difiere del pago de referencia en {_cop(paid - expected)}."
    if farm:
        origin = f"verificado ({farm['farm_name']})"
    else:
        origin = "⚠️ sin verificar: guárdalo en una pila separada"
    whatsapp.send_text(wa_id, DELIVERY_SAVED_TEMPLATE.format(
        code=code,
        producer=farm["producer_name"] if farm else producer,
        kg=f"{kg:g}",
        humidity=f"{humidity:g} %" if humidity is not None else "no informada",
        status=STATUS_TEXT[status],
        origin=origin,
        expected=_cop(expected) if expected is not None else "no aplica",
        paid=_cop(paid),
        diff=diff,
    ))
    return True
