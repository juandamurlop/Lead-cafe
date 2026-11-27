"""Register fake users by driving the registration flow directly (no Meta webhook).

Each fake user walks the real state machine in backend/handlers/registration.py
(consent -> name -> farm) against the database in DATABASE_URL. WhatsApp and
Foundry are stubbed, so nothing is sent to Meta and no signature is needed.

    python scripts/seed_fake_users.py --count 10

DATABASE_URL comes from the environment, else from backend/local.settings.json.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import psycopg
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from handlers.registration import handle_registration  # noqa: E402
from services.store import PostgresStore  # noqa: E402

FIRST_NAMES = ["Juan", "María", "Luis", "Ana", "Carlos", "Rosa", "Pedro", "Lucía", "Jorge", "Elena"]
LAST_NAMES = ["Ramírez", "Gómez", "Quintero", "Herrera", "Ospina", "Vargas", "Mejía", "Cárdenas"]
FARM_CATALOG = [
    "Finca El Mirador",
    "Finca La Esperanza",
    "Finca El Cafetal",
    "Finca La Aurora",
    "Finca El Palmar",
    "Finca El Nogal",
    "Cooperativa La Cima",
    "Hacienda La Vega",
    "Finca Villa María",
    "Finca Los Pinos",
    "Finca El Paraíso",
    "Finca Buena Vista",
    "Finca Santa Elena",
    "Finca El Roble",
    "Finca Las Brisas",
    "Cooperativa Alto del Café",
]
ACOPIO_LOCATIONS = [
    "Centro de Acopio Cooperativo",
    "Bodega Central de Acopio",
    "Punto de Acopio Veredal",
]
TRILLADORA_LOCATIONS = [
    "Trilladora Regional",
    "Planta de Trilla Cafetera",
]

# Fake wa_ids use this prefix so they are easy to recognise and clean up.
WA_ID_PREFIX = "570000"

# (lat, lon) of coffee-growing areas: Huila, Nariño, Quindío.
FARM_CENTERS = [(2.50, -75.80), (1.20, -77.30), (4.50, -75.70)]
GFW_STATUSES = ["clear", "clear", "clear", "alert", "pending", "blocked"]
PROCESSES = ["Lavado", "Honey", "Natural"]
# (event_type, stage, bizStep) in supply-chain order: finca -> acopio -> trilladora.
EPCIS_STAGES = [
    ("ObjectEvent", "finca", "harvesting"),
    ("AggregationEvent", "acopio", "receiving"),
    ("TransformationEvent", "trilladora", "commissioning"),
]


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


def seed_farm_data(
    database_url: str,
    wa_id: str,
    rng: random.Random,
    lots_per_user: int,
    evidence_dir: Path | None,
    evidence_base_url: str | None,
) -> list[str]:
    """Give a registered fake user a farm polygon, GPS pin, lots and EPCIS events."""
    now = datetime.now(timezone.utc)
    lat, lon = rng.choice(FARM_CENTERS)
    lat, lon = lat + rng.uniform(-0.05, 0.05), lon + rng.uniform(-0.05, 0.05)
    half = rng.uniform(0.0004, 0.001)  # ~45-110 m, a small smallholder plot
    ring = [(lon - half, lat - half), (lon + half, lat - half), (lon + half, lat + half),
            (lon - half, lat + half), (lon - half, lat - half)]
    wkt = "POLYGON((" + ", ".join(f"{x:.6f} {y:.6f}" for x, y in ring) + "))"
    captured_at = now - timedelta(days=rng.randint(10, 60))
    # Deforestation status is a property of the farm polygon, shared by all lots on the farm.
    farm_gfw_status = rng.choice(GFW_STATUSES)
    acopio_location = rng.choice(ACOPIO_LOCATIONS)
    trilladora_location = rng.choice(TRILLADORA_LOCATIONS)
    lot_codes: list[str] = []

    with psycopg.connect(database_url) as conn:
        user_id, = conn.execute("SELECT id FROM users WHERE wa_id = %s", (wa_id,)).fetchone()
        farm_id, farm_name = conn.execute(
            "SELECT id, name FROM farms WHERE user_id = %s ORDER BY created_at LIMIT 1", (user_id,)
        ).fetchone()
        producer = conn.execute("SELECT name FROM users WHERE id = %s", (user_id,)).fetchone()[0]

        conn.execute(
            "UPDATE farms SET boundary = ST_GeomFromText(%s, 4326), captured_at = %s WHERE id = %s",
            (wkt, captured_at, farm_id),
        )
        conn.execute(
            "UPDATE users SET verified_by_coop = %s WHERE id = %s", (rng.random() < 0.5, user_id)
        )
        conn.execute(
            """INSERT INTO location_pins (farm_id, user_id, point, captured_at, source_message_id)
               VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s)""",
            (farm_id, user_id, lon, lat, captured_at, f"fake.{uuid.uuid4().hex}"),
        )

        for i in range(lots_per_user):
            lot_code = f"LC-{wa_id[-6:]}-{i + 1}"
            harvested_at = now - timedelta(days=rng.randint(3, 14), hours=rng.randint(1, 12))
            evidence_url = None
            if evidence_base_url:
                evidence_url = f"{evidence_base_url.rstrip('/')}/{lot_code}.json"
            lot_id, = conn.execute(
                """INSERT INTO lots (lot_code, farm_id, user_id, lot_name, quantity, unit, process,
                                     gfw_status, evidence_blob_url, source_message_id, created_at)
                   VALUES (%s, %s, %s, %s, %s, 'kg', %s, %s, %s, %s, %s)
                   ON CONFLICT (lot_code) DO NOTHING RETURNING id""",
                (lot_code, farm_id, user_id, f"{farm_name} · Lote {i + 1}", rng.randint(50, 800),
                 rng.choice(PROCESSES), farm_gfw_status, evidence_url, f"fake.{uuid.uuid4().hex}", harvested_at),
            ).fetchone() or (None,)
            if lot_id is None:
                continue
            lot_codes.append(lot_code)

            stage_locations = {
                "finca": farm_name,
                "acopio": acopio_location,
                "trilladora": trilladora_location,
            }
            for step, (event_type, stage, biz_step) in enumerate(EPCIS_STAGES[: rng.randint(1, 3)]):
                event_time = min(
                    harvested_at + timedelta(days=step, hours=3 * step),
                    now - timedelta(minutes=15 * (3 - step)),
                )
                conn.execute(
                    """INSERT INTO epcis_events (lot_id, event_type, event_time, payload, source_message_id)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (lot_id, event_type, event_time,
                     Jsonb({"stage": stage, "bizStep": biz_step, "location": stage_locations[stage],
                            "producer": producer, "gfwStatus": farm_gfw_status}),
                     f"fake.{uuid.uuid4().hex}"),
                )

            if evidence_dir:
                evidence_dir.mkdir(parents=True, exist_ok=True)
                (evidence_dir / f"{lot_code}.json").write_text(json.dumps({
                    "synthetic": True,
                    "lot_code": lot_code,
                    "farm": farm_name,
                    "producer": producer,
                    "gfw_status": farm_gfw_status,
                    "checked_at": now.isoformat(),
                    "boundary": {"type": "Polygon", "coordinates": [[list(p) for p in ring]]},
                }, indent=2, ensure_ascii=False))
    return lot_codes


def _database_url_from_local_settings() -> str | None:
    """Fall back to the Functions runtime config when DATABASE_URL isn't exported."""
    path = Path(__file__).resolve().parent.parent / "backend" / "local.settings.json"
    try:
        return json.loads(path.read_text())["Values"].get("DATABASE_URL")
    except (OSError, KeyError, json.JSONDecodeError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--count", type=int, default=5, help="how many fake users to register")
    parser.add_argument("--seed", type=int, help="seed the RNG for reproducible data")
    parser.add_argument("--lots-per-user", type=int, default=2, help="lots (with EPCIS events) per user")
    parser.add_argument("--evidence-dir", type=Path, help="write a synthetic evidence JSON per lot here")
    parser.add_argument("--evidence-base-url", help="blob URL prefix stored in lots.evidence_blob_url")
    parser.add_argument("--reset", action="store_true", help=f"first delete users with wa_id {WA_ID_PREFIX}*")
    parser.add_argument("--allow-remote", action="store_true", help="allow a non-localhost DATABASE_URL")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL") or _database_url_from_local_settings()
    if not database_url:
        sys.exit("DATABASE_URL is not set and backend/local.settings.json has none")
    host = urlparse(database_url).hostname
    if host not in {"localhost", "127.0.0.1", "::1"} and not args.allow_remote:
        sys.exit(f"Refusing to seed fake users into remote database {host!r}; pass --allow-remote to override")

    if args.reset:
        with psycopg.connect(database_url) as conn:
            deleted = conn.execute(
                "DELETE FROM users WHERE wa_id LIKE %s", (f"{WA_ID_PREFIX}%",)
            ).rowcount
        print(f"removed {deleted} previous fake user(s) (farms, lots and events cascade)")

    rng = random.Random(args.seed)
    store = PostgresStore(database_url)
    available_farms = list(FARM_CATALOG)
    rng.shuffle(available_farms)
    for idx in range(args.count):
        wa_id = f"{WA_ID_PREFIX}{rng.randrange(10**6):06d}"
        name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
        farm = available_farms[idx] if idx < len(available_farms) else f"{FARM_CATALOG[idx % len(FARM_CATALOG)]} #{idx + 1}"
        register_fake_user(store, wa_id, name, farm)
        lots = seed_farm_data(
            database_url, wa_id, rng, args.lots_per_user, args.evidence_dir, args.evidence_base_url
        )
        print(f"registered {wa_id}  {name}  /  {farm}  lots: {', '.join(lots) or '-'}")


if __name__ == "__main__":
    main()
