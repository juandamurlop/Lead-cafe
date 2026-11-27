"""Unit tests for the Cafeto base read API."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.cafeto import handle_get_cafeto_base


class FakeCafetoStore:
    def __init__(self, base: dict | None) -> None:
        self.base = base

    def get_cafeto_base(self) -> dict | None:
        return self.base


def test_get_cafeto_base_returns_loaded_base() -> None:
    base = {"meta": {"nFincas": 1}, "fincas": [{"id": "F-001"}]}
    assert handle_get_cafeto_base(FakeCafetoStore(base)) == (200, base)


def test_get_cafeto_base_404_when_not_loaded() -> None:
    status, payload = handle_get_cafeto_base(FakeCafetoStore(None))
    assert status == 404
    assert "not loaded" in payload["error"]



class FakeAcopioStore:
    def __init__(self, acopio: dict | None) -> None:
        self.acopio = acopio

    def get_cafeto_acopio(self) -> dict | None:
        return self.acopio


def test_get_cafeto_acopio_returns_loaded_sheets() -> None:
    from api.cafeto import handle_get_cafeto_acopio

    acopio = {"encabezados": {"Bodega": ["Zona"]}, "recepcion": [], "consolidacion": [], "bodega": [{"Zona": "A"}]}
    assert handle_get_cafeto_acopio(FakeAcopioStore(acopio)) == (200, acopio)


def test_get_cafeto_acopio_404_when_not_loaded() -> None:
    from api.cafeto import handle_get_cafeto_acopio

    status, payload = handle_get_cafeto_acopio(FakeAcopioStore(None))
    assert status == 404 and "not loaded" in payload["error"]
