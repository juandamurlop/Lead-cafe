"""WhatsApp onboarding & consent state machine (docs/architecture/registration.md)."""

from __future__ import annotations

from typing import Any, Protocol


CONSENT_PROMPT = (
    "¡Hola! Bienvenido a Lote Claro ☕. "
    "Para registrar tus lotes necesitamos tu permiso para guardar tus datos y ubicación. "
    "¿Aceptas?"
)
ASK_NAME_PROMPT = "¿Cuál es tu nombre completo? (Puedes escribir o enviar nota de voz)"
ASK_FARM_PROMPT = "¿Cómo se llama tu finca o cooperativa?"
DECLINED_REPLY = "Entendido, no guardaremos tus datos."
COMPLETE_REPLY_TEMPLATE = (
    "¡Listo, {name}! Ya puedes enviarnos notas de voz de tus lotes o compartir tu ubicación 📍."
)


class UserStoreProtocol(Protocol):
    def get_user_by_wa_id(self, wa_id: str) -> dict[str, Any] | None: ...
    def create_pending_user(self, wa_id: str) -> dict[str, Any]: ...
    def accept_consent(self, wa_id: str) -> None: ...
    def decline_consent(self, wa_id: str) -> None: ...
    def save_user_name(self, wa_id: str, name: str) -> None: ...
    def complete_registration_with_farm(self, user_id: Any, wa_id: str, farm_name: str) -> None: ...


class WhatsAppProtocol(Protocol):
    def send_text(self, to_wa_id: str, body: str) -> None: ...
    def send_consent_buttons(self, to_wa_id: str, body: str) -> None: ...
    def download_media(self, media_id: str) -> tuple[bytes, str]: ...


class FoundryProtocol(Protocol):
    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str: ...


def _extract_text_or_transcript(
    message: dict[str, Any],
    whatsapp: WhatsAppProtocol,
    foundry: FoundryProtocol,
) -> str:
    """Return plain text or Foundry transcription from a text/voice message."""
    if message.get("type") == "text" and message.get("text"):
        return str(message["text"]).strip()
    if message.get("type") == "audio" and message.get("audio_id"):
        audio_bytes, mime_type = whatsapp.download_media(str(message["audio_id"]))
        return foundry.transcribe_audio(audio_bytes, mime_type).strip()
    return ""


def _is_consent_accepted(message: dict[str, Any]) -> bool:
    if message.get("button_id") == "consent_yes":
        return True
    text = (message.get("text") or "").strip().lower()
    return text in {"si", "sí", "si, acepto", "sí, acepto", "acepto"}


def _is_consent_declined(message: dict[str, Any]) -> bool:
    if message.get("button_id") == "consent_no":
        return True
    text = (message.get("text") or "").strip().lower()
    return text in {"no", "no acepto"}


def handle_registration(
    message: dict[str, Any],
    store: UserStoreProtocol,
    whatsapp: WhatsAppProtocol,
    foundry: FoundryProtocol,
) -> bool:
    """Process onboarding if user is unregistered or incomplete.

    Returns True if the message was consumed by registration, False if the user
    already completed registration and should be routed to normal handlers.
    """
    wa_id = str(message["wa_id"])
    user = store.get_user_by_wa_id(wa_id)

    if user is None:
        store.create_pending_user(wa_id)
        whatsapp.send_consent_buttons(wa_id, CONSENT_PROMPT)
        return True

    state = user["registration_state"]
    if state == "complete":
        return False

    if state == "declined":
        store.create_pending_user(wa_id)
        whatsapp.send_consent_buttons(wa_id, CONSENT_PROMPT)
        return True

    if state == "awaiting_consent":
        if _is_consent_accepted(message):
            store.accept_consent(wa_id)
            whatsapp.send_text(wa_id, ASK_NAME_PROMPT)
        elif _is_consent_declined(message):
            store.decline_consent(wa_id)
            whatsapp.send_text(wa_id, DECLINED_REPLY)
        else:
            whatsapp.send_consent_buttons(wa_id, CONSENT_PROMPT)
        return True

    if state == "awaiting_name":
        name = _extract_text_or_transcript(message, whatsapp, foundry)
        if not name:
            whatsapp.send_text(wa_id, ASK_NAME_PROMPT)
            return True
        store.save_user_name(wa_id, name)
        whatsapp.send_text(wa_id, ASK_FARM_PROMPT)
        return True

    if state == "awaiting_farm":
        farm_name = _extract_text_or_transcript(message, whatsapp, foundry)
        if not farm_name:
            whatsapp.send_text(wa_id, ASK_FARM_PROMPT)
            return True
        store.complete_registration_with_farm(user["id"], wa_id, farm_name)
        display_name = user.get("name") or "productor"
        whatsapp.send_text(wa_id, COMPLETE_REPLY_TEMPLATE.format(name=display_name))
        return True

    return False
