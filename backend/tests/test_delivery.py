"""Unit tests for the acopio delivery handler and reference pricing."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from handlers.delivery import NO_DELIVERY_REPLY, handle_delivery
from services.pricing import expected_payment, humidity_discount, quality_status

ACOPIO_WA = "573001112233"
AUDIO = {"wa_id": ACOPIO_WA, "type": "audio", "audio_id": "m1", "source_message_id": "wamid.1"}


class FakeStore:
    def __init__(self, role: str = "acopio", farm: dict | None = None) -> None:
        self.user = {"id": "acopio-1", "role": role}
        self.farm = farm
        self.deliveries: list[dict] = []

    def get_user_by_wa_id(self, wa_id: str) -> dict | None:
        return self.user

    def find_farm(self, producer_name: str, farm_name: str | None) -> dict | None:
        return self.farm

    def create_delivery(self, delivery: dict) -> bool:
        self.deliveries.append(delivery)
        return True


class FakeWhatsApp:
    def __init__(self) -> None:
        self.texts: list[str] = []

    def send_text(self, to_wa_id: str, body: str) -> None:
        self.texts.append(body)

    def download_media(self, media_id: str) -> tuple[bytes, str]:
        return b"ogg", "audio/ogg"


class FakeFoundry:
    def __init__(self, fields: dict) -> None:
        self.fields = fields

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
        return "transcript"

    def extract_delivery(self, transcript: str) -> dict:
        return self.fields


FARM = {"farm_id": "farm-1", "farm_name": "Finca El Mirador", "producer_name": "Luis Pérez"}
FIELDS = {"producer_name": "Luis Pérez", "farm_name": "El Mirador", "kg": 48,
          "humidity_pct": 11.5, "paid_cop": 836_000, "payment_method": "efectivo"}


class PricingTests(unittest.TestCase):
    def test_quality_bands(self) -> None:
        self.assertEqual(quality_status(11.5), "aceptado")
        self.assertEqual(quality_status(12.8), "retenido")
        self.assertEqual(quality_status(9.0), "retenido")
        self.assertEqual(quality_status(14.5), "rechazado")
        self.assertEqual(quality_status(None), "retenido")

    def test_discount_and_payment(self) -> None:
        self.assertEqual(humidity_discount(11.5), 0.0)
        self.assertAlmostEqual(humidity_discount(13.0), 0.015)
        self.assertIsNone(expected_payment(48, 15.0, True))
        self.assertIsNone(expected_payment(48, None, True))
        # 48 kg = 0.384 cargas; base 2,180,000 per carga; traced premium 60,000 per carga.
        self.assertAlmostEqual(expected_payment(125, 11.0, False), 2_180_000)
        self.assertAlmostEqual(expected_payment(125, 11.0, True), 2_240_000)


class DeliveryTests(unittest.TestCase):
    def test_traced_delivery_is_saved_and_confirmed(self) -> None:
        store, wa = FakeStore(farm=FARM), FakeWhatsApp()
        self.assertTrue(handle_delivery(AUDIO, store, wa, FakeFoundry(FIELDS)))
        saved = store.deliveries[0]
        self.assertEqual(saved["farm_id"], "farm-1")
        self.assertTrue(saved["traced"])
        self.assertEqual(saved["quality_status"], "aceptado")
        self.assertIn("verificado (Finca El Mirador)", wa.texts[-1])
        self.assertIn(saved["delivery_code"], wa.texts[-1])

    def test_unmatched_producer_goes_to_separate_pile(self) -> None:
        store, wa = FakeStore(farm=None), FakeWhatsApp()
        handle_delivery(AUDIO, store, wa, FakeFoundry(FIELDS))
        self.assertIsNone(store.deliveries[0]["farm_id"])
        self.assertFalse(store.deliveries[0]["traced"])
        self.assertIn("pila separada", wa.texts[-1])

    def test_payment_mismatch_is_flagged(self) -> None:
        store, wa = FakeStore(farm=FARM), FakeWhatsApp()
        handle_delivery(AUDIO, store, wa, FakeFoundry({**FIELDS, "paid_cop": 500_000}))
        self.assertIn("Difiere del pago de referencia", wa.texts[-1])

    def test_wet_coffee_is_rejected_without_payment_reference(self) -> None:
        store, wa = FakeStore(farm=FARM), FakeWhatsApp()
        handle_delivery(AUDIO, store, wa, FakeFoundry({**FIELDS, "humidity_pct": 15}))
        self.assertEqual(store.deliveries[0]["quality_status"], "rechazado")
        self.assertIn("no aplica", wa.texts[-1])

    def test_missing_weight_asks_again(self) -> None:
        store, wa = FakeStore(farm=FARM), FakeWhatsApp()
        handle_delivery(AUDIO, store, wa, FakeFoundry({"producer_name": "Luis", "kg": None}))
        self.assertEqual(store.deliveries, [])
        self.assertEqual(wa.texts[-1], NO_DELIVERY_REPLY)

    def test_productor_audio_is_not_consumed(self) -> None:
        store, wa = FakeStore(role="productor"), FakeWhatsApp()
        self.assertFalse(handle_delivery(AUDIO, store, wa, FakeFoundry(FIELDS)))
        self.assertEqual(wa.texts, [])

    def test_non_audio_is_not_consumed(self) -> None:
        store, wa = FakeStore(), FakeWhatsApp()
        msg = {"wa_id": ACOPIO_WA, "type": "text", "text": "hola"}
        self.assertFalse(handle_delivery(msg, store, wa, FakeFoundry(FIELDS)))


if __name__ == "__main__":
    unittest.main()
