# Backend & WhatsApp Webhook Architecture Decision

**Project:** Lote Claro (Asoexport coffee traceability)  
**Date:** 2026-11-27  
**Status:** Accepted

## Context

The *Lote Claro* backend receives WhatsApp Business Cloud API webhooks (voice notes, location pins, photos, and interactive button/text replies) from both **farmers** (e.g., Rosa Elvira) and **cooperative collection center managers** (*acopio*, e.g., Hernán), processes them using **Microsoft Foundry** (for both audio transcription and structured extraction) and geospatial tools, persists data to PostgreSQL/PostGIS and Azure Blob Storage, and serves read endpoints for the TypeScript/React compliance dashboard and buyer QR pages.

## Decisions

1. **Runtime & Language — Python**
   - Implement the backend in **Python** on **Azure Functions (Consumption / Flex Consumption)** (or a scale-to-zero container on **Azure Container Apps** if bundling `ffmpeg` via Docker is preferred).
   - Python is chosen for native compatibility with the **Microsoft Foundry** SDK, geospatial libraries (`shapely`, `pyproj`), and existing audio tooling ([scripts/convert_audio.py](../../scripts/convert_audio.py)).

2. **Role Identification & Unregistered `wa_id` Onboarding (`users` Table)**
   - Identify whether a sender is a **productor** or **acopio** manager by looking up their WhatsApp `wa_id` (phone number) in the `users` table (`role` ∈ `{'productor', 'acopio'}`).
   - **Unregistered `wa_id` Flow (`handlers/registration.py`):** If `wa_id` is not found (or `registration_state != 'complete'`), route the message to the WhatsApp onboarding state machine before normal lot/location handling:
     1. **Consent:** Send interactive buttons asking for data & location consent (*"¿Aceptas? [Sí, acepto] [No]"*). If declined, stop without storing personal data.
     2. **Role, Name & Farm/Coop:** Offer `[Soy productor]` / `[Centro de acopio]` buttons, then Ask for their full name and farm/cooperative (accepting **either text or a voice note** transcribed via Microsoft Foundry for low-literacy users).
     3. **Create Record:** Insert into `users` (`role = 'productor'` by default (or `'acopio'` if chosen in onboarding), `consent_status = 'accepted'`, `registration_state = 'complete'`, `verified_by_coop = false` unless pre-seeded by the cooperative).
     4. **Cooperative Verification:** Farmers can immediately submit lots/pins (flagged as unverified until an `acopio` manager or Laura approves them in the dashboard).

3. **WhatsApp Webhook Security & Async Ingestion**
   - **Verification (`GET`):** Answer Meta's `hub.challenge` verification request when `hub.verify_token` matches.
   - **Signature Check (`POST`):** Validate `X-Hub-Signature-256` against the Meta App Secret before parsing or enqueueing.
   - **Fast `200 OK` via Azure Queue Storage:** Meta retries webhooks aggressively if a `200` is not returned within a few seconds. The HTTP trigger (`webhook/enqueue.py`) stays **DB-free**: it validates the signature, parses the message envelope, pushes the payload to **Azure Queue Storage** (chosen over Service Bus to minimize Azure cost), and immediately returns `200 OK`.
   - **Idempotent Worker:** A separate queue-triggered function processes messages asynchronously and enforces deduplication atomically in PostgreSQL (`ON CONFLICT (source_message_id) DO NOTHING`).

4. **Unified Audio Transcription & Lot Registration via Microsoft Foundry**
   - Use **Microsoft Foundry** as the single AI platform to **both transcribe** WhatsApp `.ogg` (Opus) voice notes (in Colombian Spanish) **and extract structured fields** (lot fields or onboarding name/farm) to register in PostgreSQL via `services/store.py`.
   - If the selected Foundry audio/speech model requires `.wav` or `.mp3` instead of `.ogg`, convert ephemerally with `ffmpeg` ([scripts/convert_audio.py](../../scripts/convert_audio.py)) and delete the temporary file immediately after processing.

## Module Layout

```text
backend/
├── function_app.py        # Azure Functions triggers only (HTTP webhook, Queue worker, Dashboard GET API)
├── webhook/
│   ├── verify.py          # GET hub.challenge + X-Hub-Signature-256 HMAC validation
│   └── enqueue.py         # Parse Meta payload, push to Azure Queue Storage, return 200 OK
├── handlers/
│   ├── registration.py    # Unregistered wa_id onboarding: consent buttons → name/farm (text or voice)
│   ├── audio.py           # Download .ogg → (optional convert) → Foundry transcribe & extract → store in DB
│   ├── location.py        # Store location pins → assemble & validate EUDR farm polygon (shapely/pyproj)
│   ├── image.py           # Download photo → upload to Azure Blob Storage → link to lot
│   └── text.py            # Interactive button replies ("Sí"/"No") & commands ("BORRAR MIS DATOS")
├── api/
│   └── lots.py            # HTTP GET endpoints for the React compliance dashboard & buyer QR page
└── services/
    ├── whatsapp.py        # Cloud API client: send text/button replies, fetch & download media
    ├── store.py           # PostgreSQL/PostGIS data access (users, farms, pins, lots, epcis_events)
    ├── gfw.py             # Global Forest Watch non-deforestation check client
    └── epcis.py           # GS1 EPCIS 2.0 JSON event builder
```

## Rationale

- **Cost Efficiency:** Azure Queue Storage reuses the Function App's Storage Account at near-zero cost, and serverless Python scales to $0 when idle.
- **Reliability Under Retries:** Keeping PostgreSQL out of the HTTP webhook hot path prevents cold/slow DB connections from causing Meta webhook timeouts and duplicate deliveries.
- **Separation of Concerns:** `function_app.py` holds only trigger bindings; business logic, external APIs, and SQL live in dedicated `handlers/` and `services/` modules.

## Trade-offs & Future Evolution

- **Stage 1 (Current):** Single Python Function App + Azure Queue Storage handles both WhatsApp ingestion and lightweight read APIs for the React dashboard.
- **Stage 2 (Scale):** If queue volume or latency requirements grow, the queue worker can move to dedicated workers or Azure Service Bus without changing `handlers/` or `services/`.
