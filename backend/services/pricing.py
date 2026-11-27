"""Reference payment for an acopio delivery (port of dashboard/src/domain/pricing.ts).

Prices use the FNC internal reference price of 2026-11-25 at yield factor 94. The humidity
discount is the dashboard's illustrative rule: each cooperative applies its own.
"""

from __future__ import annotations

PRECIO_CARGA_FR94 = 2_180_000
KG_POR_CARGA = 125
H_MIN_PCT = 10.0
H_MAX_PCT = 12.0
H_RECHAZO_PCT = 14.0
PREMIO_TRAZABILIDAD_POR_CARGA = 60_000


def humidity_discount(humidity_pct: float) -> float:
    """Fraction discounted for humidity above 12 %; 1.0 means the delivery is not received."""
    if humidity_pct <= H_MAX_PCT:
        return 0.0
    if humidity_pct > H_RECHAZO_PCT:
        return 1.0
    return min(0.9, (humidity_pct - H_MAX_PCT) * 0.015)


def quality_status(humidity_pct: float | None) -> str:
    """aceptado inside 10-12 %, rechazado above 14 %, otherwise retenido para evaluación."""
    if humidity_pct is None:
        return "retenido"
    if humidity_pct > H_RECHAZO_PCT:
        return "rechazado"
    if H_MIN_PCT <= humidity_pct <= H_MAX_PCT:
        return "aceptado"
    return "retenido"


def expected_payment(kg: float, humidity_pct: float | None, traced: bool) -> float | None:
    """Reference COP total, or None when humidity is unknown or the delivery is rejected."""
    if humidity_pct is None:
        return None
    discount = humidity_discount(humidity_pct)
    if discount >= 1.0:
        return None
    cargas = kg / KG_POR_CARGA
    subtotal = cargas * PRECIO_CARGA_FR94
    premium = cargas * PREMIO_TRAZABILIDAD_POR_CARGA if traced else 0.0
    return subtotal * (1 - discount) + premium
