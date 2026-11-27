# WhatsApp User Registration & Consent Flow

**Project:** Lote Claro (Asoexport coffee traceability)  
**Date:** 2026-11-27  
**Status:** Accepted

## Context

When a message arrives at the WhatsApp Business webhook from an unknown or incomplete `wa_id` (phone number), *Lote Claro* must register the producer, capture explicit data/location consent (EUDR & privacy compliance), and identify their role (`productor` or `acopio`) without requiring a separate app or heavy typing.

This document specifies the onboarding state machine implemented in `handlers/registration.py` (see [backend.md](backend.md) and [db.md](db.md)).

## Decisions

1. **Pre-Seeded Cooperative List vs. Self-Registration**
   - Known cooperative managers (`acopio`) and pre-registered producers can be seeded into `users` with `verified_by_coop = true` and `registration_state = 'complete'`.
   - Any **unregistered `wa_id`** defaults to `role = 'productor'` and `verified_by_coop = false`, picks a role in the flow, and enters the WhatsApp onboarding flow.

2. **Voice-Friendly, Consent-First State Machine**
   - Every onboarding prompt accepts **plain Spanish text or a voice note** (transcribed via **Microsoft Foundry**) for name and farm/cooperative inputs, except consent which uses interactive WhatsApp reply buttons.
   - Until `registration_state = 'complete'`, incoming messages from that `wa_id` are routed to `handlers/registration.py` instead of lot/location handlers.

## State Machine

| `registration_state` | Bot Action / Prompt | Expected Input | Next State |
|---|---|---|---|
| *(not in `users`)* | Create row (`consent_status = 'pending'`), send consent buttons: *"¡Hola! Bienvenido a Lote Claro ☕. Para registrar tus lotes necesitamos tu permiso para guardar tus datos y ubicación. ¿Aceptas?"* `[Sí, acepto]` `[No]` | — | `awaiting_consent` |
| `awaiting_consent` | If `[Sí, acepto]`: set `consent_status = 'accepted'`, `consent_updated_at = NOW()`, ask *"¿Cómo participas en Lote Claro?"* with `[Soy productor]` `[Centro de acopio]`.<br>If `[No]`: delete/mark declined and reply *"Entendido, no guardaremos tus datos."* | Button reply | `awaiting_role` (or `declined`) |
| `awaiting_role` | Save `requested_role` and set `role` to it (hackathon: always allowed), ask *"¿Cuál es tu nombre completo? (Puedes escribir o enviar nota de voz)"*. Unrecognized replies re-send the buttons. | Button reply | `awaiting_name` |
| `awaiting_name` | Save `users.name` (from text or Foundry transcript), ask *"¿Cómo se llama tu finca o cooperativa?"* (acopio: *"¿Cómo se llama tu centro de acopio?"*) | Text or voice note | `awaiting_farm` |
| `awaiting_farm` | Acopio: save `users.acopio_name` (no `farms` record) and complete. Productor: create initial `farms` record linked to `user_id`, set `registration_state = 'complete'`, reply *"¡Listo, [Nombre]! Ya puedes enviarnos notas de voz de tus lotes o compartir tu ubicación 📍."* | Text or voice note | `complete` |

## Edge Cases & Governance

- **Immediate Utility Before Coop Verification:** Once `registration_state = 'complete'`, producers can immediately register lots and send location pins. Records are flagged `verified_by_coop = false` until an `acopio` manager (e.g., Hernán) or compliance manager (Laura) confirms them in the dashboard.
- **Role Elevation (`acopio`):** **Hackathon shortcut:** choosing *Centro de acopio* grants `role = 'acopio'` immediately, with no approval. Before production, restore approval: keep `role = 'productor'` (only `requested_role = 'acopio'`) until an administrator or cooperative seed script promotes the user, so nobody can claim `acopio` just by tapping a button.
- **Consent Revocation (`"BORRAR MIS DATOS"`):** Handled in `handlers/text.py`; cascades/anonymizes personal data (`name`, `wa_id`, `location_pins`, `farms`) in PostgreSQL while preserving anonymized audit/compliance integrity where required.
