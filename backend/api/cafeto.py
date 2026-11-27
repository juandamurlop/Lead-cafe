"""Read API handler for the Cafeto supervision base."""

from __future__ import annotations

from typing import Any, Protocol


class CafetoStore(Protocol):
    def get_cafeto_base(self) -> dict[str, Any] | None: ...


def handle_get_cafeto_base(store: CafetoStore) -> tuple[int, dict[str, Any]]:
    """Return the full Cafeto base, or 404 when the table has not been loaded."""
    base = store.get_cafeto_base()
    if base is None:
        return 404, {"error": "Cafeto base not loaded"}
    return 200, base



class AcopioStore(Protocol):
    def get_cafeto_acopio(self) -> dict[str, Any] | None: ...


def handle_get_cafeto_acopio(store: AcopioStore) -> tuple[int, dict[str, Any]]:
    """Return the acopio sheets (headers + rows), or 404 when they have not been loaded."""
    acopio = store.get_cafeto_acopio()
    if acopio is None:
        return 404, {"error": "Cafeto acopio not loaded"}
    return 200, acopio
