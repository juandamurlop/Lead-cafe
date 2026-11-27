# Backend & WhatsApp Webhook Architecture Decision

**Project:** Lote Claro (Asoexport coffee traceability)  
**Date:** 2026-11-27  
**Status:** Accepted

## Context

The *Lote Claro* backend receives WhatsApp Business Cloud API webhooks (voice notes, location pins, photos, and interactive button/text replies) from both **farmers** (e.g., Rosa Elvira) and **cooperative collection center managers** (*acopio*, e.g., Hernán), processes them using Azure AI Speech, Azure OpenAI/Foundry, and geospatial tools, persists data to PostgreSQL/PostGIS and Azure Blob Storage, and serves read endpoints for the TypeScript/React compliance dashboard and buyer QR pages.

## Decisions

1. **Runtime & Language — Python**
   - Implement the backend in **Python** on **Azure Functions (Consumption / Flex Consumption)** (or a scale-to-zero container on **Azure Container Apps** if bundling `ffmpeg` via Docker is preferred).
   - Python is chosen for native compatibility with Azure AI SDKs (Speech, OpenAI/Foundry), geospatial libraries (`shapely`, `pyproj`), and existing audio tooling ([scripts/convert_audio.py](../../scripts/convert_audio.py)).

2. **Role Identification & Unregistered `wa_id` Onboarding (`users` Table)**
   - Identify whether a sender is a **farmer** or **acopio** manager by looking up their WhatsApp `wa_id` (phone number) in the `users` table (`role` ∈ `{'farmer', 'acopio'}`).
   - **Unregistered `wa_id` Flow (`handlers/registration.py`):** If `wa_id` is not found (or `registration_state != 'complete'`), route the message to the WhatsApp onboarding state machine before normal lot/location handling:
     1. **Consent:** Send interactive buttons asking for data & location consent (*"¿Aceptas? [Sí, acepto] [No]"*). If declined, stop without storing personal data.
     2. **Name & Farm/Coop:** Ask for their full name and farm/cooperative (accepting **either text or a voice note** transcribed via Azure AI Speech for low-literacy users).
     3. **Create Record:** Insert into `users` (`role = 'farmer'` by default, `consent_status = 'accepted'`, `registration_state = 'complete'`, `verified_by_coop = false` unless pre-seeded by the cooperative).
     4. **Cooperative Verification:** Farmers can immediately submit lots/pins (flagged as unverified until an `acopio` manager or Laura approves them in the dashboard).

3. **WhatsApp Webhook Security & Async Ingestion**
   - **Verification (`GET`):** Answer Meta's `hub.challenge` verification request when `hub.verify_token` matches.
   - **Signature Check (`POST`):** Validate `X-Hub-Signature-256` against the Meta App Secret before parsing or enqueueing.
   - **Fast `200 OK` via Azure Queue Storage:** Meta retries webhooks aggressively if a `200` is not returned within a few seconds. The HTTP trigger (`webhook/enqueue.py`) stays **DB-free**: it validates the signature, parses the message envelope, pushes the payload to **Azure Queue Storage** (chosen over Service Bus to minimize Azure cost), and immediately returns `200 OK`.
   - **Idempotent Worker:** A separate queue-triggered function processes messages asynchronously and enforces deduplication atomically in PostgreSQL (`ON CONFLICT (source_message_id) DO NOTHING`).

4. **Audio Conversion (`ffmpeg`)**
   - WhatsApp voice notes arrive as `.ogg` (Opus) and must be converted to `16 kHz` mono `.wav` for Azure AI Speech (`es-CO`).
   - Because standard Azure Functions Linux Consumption does not include `ffmpeg`, either bundle a static `ffmpeg` binary in the deployment package or deploy as a custom Docker image on **Azure Container Apps (scale-to-zero)**.

## Module Layout

```text
backend/
├── function_app.py        # Azure Functions triggers only (HTTP webhook, Queue worker, Dashboard GET API)
├── webhook/
│   ├── verify.py          # GET hub.challenge + X-Hub-Signature-256 HMAC validation
│   └── enqueue.py         # Parse Meta payload, push to Azure Queue Storage, return 200 OK
├── handlers/
│   ├── registration.py    # Unregistered wa_id onboarding: consent buttons → name/farm (text or voice)
│   ├── audio.py           # Download .ogg → convert to .wav → Azure AI Speech → LLM lot extraction
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
