"""PostgreSQL/PostGIS data access for Lote Claro registration and messaging."""

from __future__ import annotations

from typing import Any
import psycopg
from psycopg.rows import dict_row


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
                    (SELECT COUNT(*) FROM farms) AS farms,
                    (SELECT COUNT(*) FROM lots) AS lots,
                    (SELECT COUNT(*) FROM epcis_events) AS events
            """).fetchone()
            assert row is not None
            return row

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
