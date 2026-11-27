# Database & Storage Architecture Decision

**Project:** Lote Claro (Asoexport coffee traceability)  
**Date:** 2026-11-27  
**Status:** Accepted

## Context

The *Lote Claro* system captures coffee lot registrations from farmers and cooperatives over WhatsApp Business (voice notes, photos, and location pins), assembles farm GPS polygons for EUDR non-deforestation checks via Global Forest Watch (GFW), and emits GS1 EPCIS 2.0 traceability events for compliance dashboards (Power BI) and buyer QR pages.

We evaluated **Azure Cosmos DB (NoSQL)** versus **PostgreSQL (`JSONB` + PostGIS)** for storing lots, locations, and events, alongside object storage for compliance evidence and media handling rules for farmer voice notes.

## Decisions

1. **Primary Database — PostgreSQL (`JSONB` + PostGIS)**
   - Use **Azure Database for PostgreSQL (Flexible Server)** with the **PostGIS** extension enabled.
   - Store relational entities (`users`, `farms`, `lots`, `consent`) in typed SQL tables, geospatial data (`Point` pins and assembled `Polygon` boundaries) in PostGIS `geometry` columns, and GS1 **EPCIS 2.0** event payloads in `JSONB` columns.

2. **Compliance Evidence Storage — Azure Blob Storage**
   - Store EUDR due-diligence artifacts—satellite imagery, GFW deforestation check reports, and producer certifications—in **Azure Blob Storage**.
   - Link each stored artifact by URL/blob reference from the corresponding lot record in PostgreSQL.

3. **Voice Note Audio — Ephemeral Processing (No Storage)**
   - **Do not store farmer audio files.**
   - When a WhatsApp voice note arrives, the Azure Function downloads the media, converts it if needed for **Azure AI Speech (`es-CO`)**, transcribes it, extracts structured lot fields via Azure OpenAI/Foundry, and **immediately deletes the temporary audio** once processing completes.
   - Only the extracted structured fields, user confirmation state, and `source_message_id` (for webhook deduplication) are persisted.

## Rationale

- **Geospatial & EUDR Polygons:** PostGIS natively supports assembling 4–6 WhatsApp location pins into valid polygons (`ST_MakePolygon`), validating geometry, calculating farm area (ha), and tracking `captured_at` dates required by EUDR.
- **Relational Integrity + Flexible EPCIS 2.0:** Foreign keys enforce `farmer → farm → lot` ownership while `JSONB` accommodates nested, evolving GS1 EPCIS 2.0 event schemas without migrations.
- **Webhook Idempotency:** WhatsApp Cloud API webhooks retry on transient failures; a `UNIQUE (source_message_id)` constraint in PostgreSQL guarantees idempotent ingestion.
- **Privacy & Consent (`"BORRAR MIS DATOS"`):** Relational cascades simplify fulfilling data-revocation requests, and discarding raw voice notes immediately minimizes PII/voiceprint exposure and storage cost.
- **Azure & BI Alignment:** Both Azure Database for PostgreSQL and Azure Blob Storage integrate natively with Azure Functions and Power BI for the compliance dashboard.

## Logical Data Model (Minimum Scope)

| Entity | Key Fields | Notes |
|---|---|---|
| `users` | `id`, `wa_id`, `role`, `name`, `registration_state`, `verified_by_coop`, `consent_status`, `consent_updated_at` | Maps WhatsApp `wa_id` (phone) to `role` (`farmer` or `acopio`); tracks onboarding (`awaiting_consent`, `awaiting_name`, `awaiting_farm`, `complete`) and `"BORRAR MIS DATOS"` |
| `farms` | `id`, `user_id`, `name`, `boundary` (`geometry(Polygon, 4326)`), `captured_at` | EUDR farm polygon and capture timestamp |
| `location_pins` | `id`, `farm_id`, `user_id`, `point` (`geometry(Point, 4326)`), `captured_at`, `source_message_id` | Individual WhatsApp location pins; `source_message_id` is `UNIQUE` for deduplication |
| `lots` | `id`, `lot_code`, `farm_id`, `user_id`, `lot_name`, `quantity`, `unit`, `process`, `gfw_status`, `evidence_blob_url`, `created_at` | Structured lot data extracted from voice note + GFW result + Blob Storage evidence link |
| `epcis_events` | `id`, `lot_id`, `event_type`, `event_time`, `payload` (`JSONB`), `source_message_id` | GS1 EPCIS 2.0 events across *finca* → *acopio* → *trilladora* → export |

## Trade-offs & Future Evolution

- **Stage 1 (Current):** Single PostgreSQL instance + Blob Storage keeps hackathon and pilot infrastructure simple, low-cost, and easy to run locally.
- **Stage 2 (Scale / IoT):** If high-volume IoT telemetry or massive EPCIS event streams outgrow PostgreSQL, `epcis_events` can be streamed to Microsoft Fabric or Azure Cosmos DB without changing the relational farm/lot/PostGIS core.
