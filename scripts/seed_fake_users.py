"""Register fake users by driving the registration flow directly (no Meta webhook).

Each fake user walks the real state machine in backend/handlers/registration.py
(consent -> name -> farm) against the database in DATABASE_URL. WhatsApp and
Foundry are stubbed, so nothing is sent to Meta and no signature is needed.

    DATABASE_URL=postgresql://... python scripts/seed_fake_users.py --count 10
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from handlers.registration import handle_registration  # noqa: E402
from services.store import PostgresStore  # noqa: E402

FIRST_NAMES = ["Juan", "María", "Luis", "Ana", "Carlos", "Rosa", "Pedro", "Lucía", "Jorge", "Elena"]
LAST_NAMES = ["Ramírez", "Gómez", "Quintero", "Herrera", "Ospina", "Vargas", "Mejía", "Cárdenas"]
FARM_PREFIXES = ["Finca El", "Finca La", "Cooperativa", "Hacienda"]
FARM_NAMES = ["Mirador", "Esperanza", "Cafetal", "Aurora", "Palmar", "Nogal", "Cima", "Vega"]

# Fake wa_ids use this prefix so they are easy to recognise and clean up.
WA_ID_PREFIX = "570000"


class NullWhatsApp:
    def send_text(self, to_wa_id: str, body: str) -> None: ...
    def send_consent_buttons(self, to_wa_id: str, body: str) -> None: ...
    def download_media(self, media_id: str) -> tuple[bytes, str]:
        raise NotImplementedError("fake users only send text")


class NullFoundry:
    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
        raise NotImplementedError("fake users only send text")


def _envelope(wa_id: str, **fields: Any) -> dict[str, Any]:
    """Same shape as webhook.enqueue.extract_messages produces."""
    return {
        "source_message_id": f"fake.{uuid.uuid4().hex}",
        "wa_id": wa_id,
        "type": "text",
        "timestamp": "",
        "text": None,
        "button_id": None,
        "button_title": None,
        "audio_id": None,
        "audio_mime_type": None,
        **fields,
    }


def register_fake_user(store: PostgresStore, wa_id: str, name: str, farm: str) -> None:
    whatsapp, foundry = NullWhatsApp(), NullFoundry()
    steps = [
        _envelope(wa_id, text="hola"),  # creates pending user, sends consent prompt
        _envelope(wa_id, type="interactive", button_id="consent_yes", button_title="Sí, acepto"),
        _envelope(wa_id, text=name),
        _envelope(wa_id, text=farm),
    ]
    for step in steps:
        handle_registration(step, store, whatsapp, foundry)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--count", type=int, default=5, help="how many fake users to register")
    parser.add_argument("--seed", type=int, help="seed the RNG for reproducible data")
    parser.add_argument("--allow-remote", action="store_true", help="allow a non-localhost DATABASE_URL")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit("DATABASE_URL is not set")
    host = urlparse(database_url).hostname
    if host not in {"localhost", "127.0.0.1", "::1"} and not args.allow_remote:
        sys.exit(f"Refusing to seed fake users into remote database {host!r}; pass --allow-remote to override")

    rng = random.Random(args.seed)
    store = PostgresStore(database_url)
    for _ in range(args.count):
        wa_id = f"{WA_ID_PREFIX}{rng.randrange(10**6):06d}"
        name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
        farm = f"{rng.choice(FARM_PREFIXES)} {rng.choice(FARM_NAMES)}"
        register_fake_user(store, wa_id, name, farm)
        print(f"registered {wa_id}  {name}  /  {farm}")


if __name__ == "__main__":
    main()
