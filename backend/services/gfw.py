"""Global Forest Watch Data API client for EUDR deforestation checks."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://data-api.globalforestwatch.org"
EUDR_CUTOFF_YEAR = 2020  # EUDR: no deforestation after 31 Dec 2020
ALERT_WINDOW_DAYS = 180

LOSS_SQL = (
    "SELECT SUM(area__ha) AS ha FROM results "
    f"WHERE umd_tree_cover_loss__year > {EUDR_CUTOFF_YEAR}"
)
ALERTS_SQL = (
    "SELECT COUNT(*) AS n FROM results WHERE gfw_integrated_alerts__date >= '{since}'"
)


class GfwError(Exception):
    """The GFW API could not be queried."""


class GfwClient:
    def __init__(self, api_key: str, timeout: float = 30.0) -> None:
        self._api_key = api_key
        self._timeout = timeout

    def _query(self, dataset: str, sql: str, geometry: dict[str, Any]) -> float:
        url = f"{BASE_URL}/dataset/{dataset}/latest/query/json"
        try:
            response = httpx.post(
                url,
                json={"sql": sql, "geometry": geometry},
                headers={"x-api-key": self._api_key},
                timeout=self._timeout,
            )
            response.raise_for_status()
            rows = response.json().get("data") or []
        except (httpx.HTTPError, ValueError) as exc:
            raise GfwError(f"GFW query on {dataset} failed: {exc}") from exc
        value = next(iter(rows[0].values()), None) if rows else None
        return float(value or 0)

    def check_geometry(self, geometry: dict[str, Any]) -> str:
        """Return 'blocked' (loss after the EUDR cutoff), 'alert' (recent alerts), 'clear' or 'pending'."""
        try:
            loss_ha = self._query("umd_tree_cover_loss", LOSS_SQL, geometry)
            since = (date.today() - timedelta(days=ALERT_WINDOW_DAYS)).isoformat()
            alerts = self._query(
                "gfw_integrated_alerts", ALERTS_SQL.format(since=since), geometry
            )
        except GfwError:
            logger.exception("GFW check failed; leaving status pending")
            return "pending"
        if loss_ha > 0:
            return "blocked"
        return "alert" if alerts > 0 else "clear"
