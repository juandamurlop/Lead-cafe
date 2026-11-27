"""PostgreSQL/PostGIS data access for Lote Claro registration and messaging."""

from __future__ import annotations

from typing import Any
import psycopg
from psycopg.rows import dict_row


CAFETO_SINGLETONS = ("meta", "parametros")
CAFETO_LISTS = (
    "cooperativas", "fincas", "lotes", "insumos",
    "fotos", "certificaciones", "expediente", "mensajes",
)
CAFETO_ACOPIO_SHEETS = ("acopio_recepcion", "acopio_consolidacion", "acopio_bodega")


class PostgresStore:
    """Thin data access layer backed by PostgreSQL."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def _connect(self) -> psycopg.Connection[Any]:
        return psycopg.connect(self._database_url, row_factory=dict_row)

    def dashboard_summary(self) -> dict[str, int]:
        """Return aggregate counts without exposing individual records."""
        with self._connect() as conn:
            row = conn.execute("""
                SELECT
                    (SELECT COUNT(DISTINCT farm_id) FROM lots) AS farms,
                    (SELECT COUNT(*) FROM lots) AS lots,
                    (SELECT COUNT(*) FROM epcis_events) AS events
            """).fetchone()
            assert row is not None
            return row

    def _cafeto_records(self, collections: tuple[str, ...]) -> list[dict[str, Any]]:
        with self._connect() as conn:
            return conn.execute(
                "SELECT collection, data FROM cafeto_records WHERE collection = ANY(%s) ORDER BY collection, position",
                (list(collections),),
            ).fetchall()

    def get_cafeto_base(self) -> dict[str, Any] | None:
        """Assemble the Cafeto supervision base from cafeto_records, or None when empty."""
        rows = self._cafeto_records(CAFETO_SINGLETONS + CAFETO_LISTS)
        if not rows:
            return None
        base: dict[str, Any] = {name: [] for name in CAFETO_LISTS}
        for row in rows:
            if row["collection"] in CAFETO_SINGLETONS:
                base[row["collection"]] = row["data"]
            else:
                base[row["collection"]].append(row["data"])
        return base

    def get_cafeto_acopio(self) -> dict[str, Any] | None:
        """Assemble the acopio sheets (headers + rows keyed by header), or None when empty."""
        rows = self._cafeto_records(("acopio_encabezados",) + CAFETO_ACOPIO_SHEETS)
        if not rows:
            return None
        acopio: dict[str, Any] = {"encabezados": {}, "recepcion": [], "consolidacion": [], "bodega": []}
        for row in rows:
            if row["collection"] == "acopio_encabezados":
                acopio["encabezados"] = row["data"]
            else:
                acopio[row["collection"].removeprefix("acopio_")].append(row["data"])
        return acopio

    def mark_message_processed(self, source_message_id: str, wa_id: str) -> bool:
        """Record message ID atomically. Returns True if new, False if duplicate."""
        sql = """
            INSERT INTO processed_messages (source_message_id, wa_id)
            VALUES (%s, %s)
            ON CONFLICT (source_message_id) DO NOTHING
            RETURNING source_message_id
        """
        with self._connect() as conn:
            row = conn.execute(sql, (source_message_id, wa_id)).fetchone()
            conn.commit()
            return row is not None

    def get_user_by_wa_id(self, wa_id: str) -> dict[str, Any] | None:
        """Fetch user record by WhatsApp ID."""
        sql = """
            SELECT id, wa_id, role, name, registration_state,
                   verified_by_coop, consent_status, consent_updated_at
            FROM users
            WHERE wa_id = %s
        """
        with self._connect() as conn:
            return conn.execute(sql, (wa_id,)).fetchone()

    def create_pending_user(self, wa_id: str) -> dict[str, Any]:
        """Insert a new self-registered farmer awaiting consent."""
        sql = """
            INSERT INTO users (wa_id, role, registration_state, verified_by_coop, consent_status)
            VALUES (%s, 'farmer', 'awaiting_consent', FALSE, 'pending')
            ON CONFLICT (wa_id) DO UPDATE
                SET registration_state = 'awaiting_consent',
                    consent_status = 'pending',
                    updated_at = NOW()
            RETURNING id, wa_id, role, name, registration_state,
                      verified_by_coop, consent_status, consent_updated_at
        """
        with self._connect() as conn:
            row = conn.execute(sql, (wa_id,)).fetchone()
            conn.commit()
            assert row is not None
            return row

    def accept_consent(self, wa_id: str) -> None:
        """Mark consent accepted and advance onboarding to awaiting_name."""
        sql = """
            UPDATE users
            SET consent_status = 'accepted',
                consent_updated_at = NOW(),
                registration_state = 'awaiting_name',
                updated_at = NOW()
            WHERE wa_id = %s
        """
        with self._connect() as conn:
            conn.execute(sql, (wa_id,))
            conn.commit()

    def decline_consent(self, wa_id: str) -> None:
        """Mark consent declined and stop onboarding."""
        sql = """
            UPDATE users
            SET consent_status = 'declined',
                consent_updated_at = NOW(),
                registration_state = 'declined',
                updated_at = NOW()
            WHERE wa_id = %s
        """
        with self._connect() as conn:
            conn.execute(sql, (wa_id,))
            conn.commit()

    def save_user_name(self, wa_id: str, name: str) -> None:
        """Persist producer name and advance onboarding to awaiting_farm."""
        sql = """
            UPDATE users
            SET name = %s,
                registration_state = 'awaiting_farm',
                updated_at = NOW()
            WHERE wa_id = %s
        """
        with self._connect() as conn:
            conn.execute(sql, (name, wa_id))
            conn.commit()

    def save_location_pin(
        self, user_id: Any, source_message_id: str, latitude: float, longitude: float
    ) -> bool:
        """Store a location pin on the user's most recent farm. False if the user has no farm."""
        sql = """
            WITH farm AS (
                SELECT id FROM farms WHERE user_id = %s ORDER BY created_at DESC LIMIT 1
            ), pin AS (
                INSERT INTO location_pins (farm_id, user_id, point, source_message_id)
                SELECT farm.id, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s FROM farm
                ON CONFLICT (source_message_id) DO NOTHING
                RETURNING farm_id
            )
            UPDATE farms SET captured_at = NOW()
            WHERE id IN (SELECT farm_id FROM pin)
            RETURNING id
        """
        with self._connect() as conn:
            row = conn.execute(
                sql, (user_id, user_id, longitude, latitude, source_message_id)
            ).fetchone()
            conn.commit()
            return row is not None

    def get_check_geometry(self, user_id: Any) -> dict[str, Any] | None:
        """GeoJSON for the user's latest farm: its polygon, else a 50 m buffer around the newest pin."""
        sql = """
            SELECT ST_AsGeoJSON(COALESCE(
                f.boundary,
                (SELECT ST_Buffer(p.point::geography, 50)::geometry FROM location_pins p
                 WHERE p.farm_id = f.id ORDER BY p.captured_at DESC LIMIT 1)
            ))::json AS geometry
            FROM farms f WHERE f.user_id = %s ORDER BY f.created_at DESC LIMIT 1
        """
        with self._connect() as conn:
            row = conn.execute(sql, (user_id,)).fetchone()
            return row["geometry"] if row else None

    def set_farm_lots_gfw_status(self, user_id: Any, gfw_status: str) -> None:
        """Apply a GFW result to every lot on the user's latest farm."""
        sql = """
            UPDATE lots SET gfw_status = %s
            WHERE farm_id = (
                SELECT id FROM farms WHERE user_id = %s ORDER BY created_at DESC LIMIT 1
            )
        """
        with self._connect() as conn:
            conn.execute(sql, (gfw_status, user_id))
            conn.commit()

    def create_lot(
        self,
        user_id: Any,
        source_message_id: str,
        lot_code: str,
        lot_name: str | None,
        quantity: float | None,
        unit: str | None,
        process: str | None,
    ) -> bool:
        """Create a lot on the user's most recent farm. False if no farm or duplicate."""
        sql = """
            INSERT INTO lots (lot_code, farm_id, user_id, lot_name, quantity, unit, process,
                              source_message_id)
            SELECT %s, f.id, %s, %s, %s, %s, %s, %s
            FROM farms f
            WHERE f.user_id = %s
            ORDER BY f.created_at DESC
            LIMIT 1
            ON CONFLICT (source_message_id) DO NOTHING
            RETURNING id
        """
        with self._connect() as conn:
            row = conn.execute(
                sql,
                (lot_code, user_id, lot_name, quantity, unit, process, source_message_id, user_id),
            ).fetchone()
            conn.commit()
            return row is not None

    def complete_registration_with_farm(self, user_id: Any, wa_id: str, farm_name: str) -> None:
        """Create initial farm record and mark registration complete."""
        insert_farm = """
            INSERT INTO farms (user_id, name)
            VALUES (%s, %s)
        """
        update_user = """
            UPDATE users
            SET registration_state = 'complete',
                updated_at = NOW()
            WHERE wa_id = %s
        """
        with self._connect() as conn:
            conn.execute(insert_farm, (user_id, farm_name))
            conn.execute(update_user, (wa_id,))
            conn.commit()

    def list_lots(
        self,
        gfw_status: str | None = None,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        """List lots joined with farm polygons and producer info."""
        clauses: list[str] = []
        params: list[Any] = []
        if gfw_status:
            clauses.append("l.gfw_status = %s")
            params.append(gfw_status)
        if search:
            like = f"%{search}%"
            clauses.append("(l.lot_code ILIKE %s OR l.lot_name ILIKE %s OR f.name ILIKE %s OR u.name ILIKE %s)")
            params.extend([like, like, like, like])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
            SELECT
                l.id,
                l.lot_code,
                l.lot_name,
                l.quantity,
                l.unit,
                l.process,
                l.gfw_status,
                l.evidence_blob_url,
                l.created_at,
                f.id AS farm_id,
                f.name AS farm_name,
                f.captured_at,
                CASE
                    WHEN f.boundary IS NOT NULL THEN ST_AsGeoJSON(f.boundary)::json
                    ELSE NULL
                END AS boundary_geojson,
                u.name AS producer_name,
                u.verified_by_coop
            FROM lots l
            JOIN farms f ON f.id = l.farm_id
            JOIN users u ON u.id = l.user_id
            {where_sql}
            ORDER BY l.created_at DESC
        """
        with self._connect() as conn:
            return conn.execute(sql, params).fetchall()

    def get_lot_by_code(self, lot_code: str) -> dict[str, Any] | None:
        """Fetch a single lot with its farm polygon and EPCIS 2.0 events."""
        lot_sql = """
            SELECT
                l.id,
                l.lot_code,
                l.lot_name,
                l.quantity,
                l.unit,
                l.process,
                l.gfw_status,
                l.evidence_blob_url,
                l.created_at,
                f.id AS farm_id,
                f.name AS farm_name,
                f.captured_at,
                CASE
                    WHEN f.boundary IS NOT NULL THEN ST_AsGeoJSON(f.boundary)::json
                    ELSE NULL
                END AS boundary_geojson,
                u.name AS producer_name,
                u.verified_by_coop
            FROM lots l
            JOIN farms f ON f.id = l.farm_id
            JOIN users u ON u.id = l.user_id
            WHERE l.lot_code = %s
        """
        events_sql = """
            SELECT id, event_type, event_time, payload
            FROM epcis_events
            WHERE lot_id = %s
            ORDER BY event_time ASC
        """
        with self._connect() as conn:
            lot = conn.execute(lot_sql, (lot_code,)).fetchone()
            if lot is None:
                return None
            lot["epcis_events"] = conn.execute(events_sql, (lot["id"],)).fetchall()
            return lot
