# Dashboard & Web App Architecture Decision

**Project:** Lote Claro (Asoexport coffee traceability)  
**Date:** 2026-11-27  
**Status:** Accepted

## Context

The *Lote Claro* system needs a web interface for two primary personas:
- **Laura (Exporter Compliance Manager):** Needs a compliance dashboard showing registered coffee lots, EUDR farm GPS polygons, capture dates, Global Forest Watch (GFW) deforestation check statuses, and links to due-diligence evidence.
- **Anke (Buyer, e.g., in Hamburg):** Needs a public, mobile-friendly lot traceability page opened by scanning a lot's QR code, displaying the farm-to-port EPCIS 2.0 timeline, polygon proof, and non-deforestation evidence.

We evaluated **Power BI**, **Python server-rendered/dashboard frameworks (Streamlit/FastAPI)**, and a **TypeScript + React static web app** hosted on **Azure Static Web Apps**.

## Decisions

1. **Frontend Language & Framework — TypeScript + React (Vite)**
   - Build the compliance dashboard and buyer QR traceability pages as a single-page application (SPA) using **TypeScript** and **React** (bundled with Vite).
   - Use open-source browser libraries for EUDR farm polygon visualization (e.g., **Leaflet** or **MapLibre GL**) and compliance charts, consuming JSON/GeoJSON from the backend API.

2. **Hosting — Azure Static Web Apps (Free Tier)**
   - Deploy the compiled static bundle (`HTML`/`JS`/`CSS`) to **Azure Static Web Apps (Free tier)**.
   - The frontend communicates with the **Python** serverless backend (**Azure Functions** / **Azure Container Apps** scale-to-zero) over HTTPS for lot, polygon, EPCIS 2.0, and evidence queries.

## Rationale

- **$0/Month Hosting & Zero Idle Compute:** Azure Static Web Apps Free tier provides global CDN hosting, SSL, and 100 GB/month of bandwidth at no cost, avoiding always-on App Service or container charges.
- **No Per-User BI Licensing:** Unlike Power BI Pro/Embedded, a custom React web app allows unlimited internal compliance users and external buyers (via QR codes) without per-user licensing fees.
- **No Cold Starts on Page Load:** Static assets load immediately when a buyer scans a QR code or Laura opens the dashboard, unlike scale-to-zero Python dashboard containers (e.g., Streamlit on Container Apps).
- **Clean Separation of Concerns:** Keeps the frontend purely in TypeScript/React while the Python backend handles WhatsApp webhooks, Microsoft Foundry (audio transcription + structured extraction), GFW checks, and PostgreSQL/PostGIS queries.

## Minimum Scope (Stage 1)

| Route / View | Audience | Purpose |
|---|---|---|
| `/` (Compliance Dashboard) | Laura (Exporter) | Lot table, GFW alert status filters, EUDR polygon map overlay, and links to Blob Storage evidence |
| `/lot/:lotCode` (Buyer QR Page) | Anke (Buyer) | Public lot summary, farm polygon + capture date, GS1 EPCIS 2.0 journey (*finca* → *acopio* → *trilladora* → export), and deforestation-free evidence |

## Trade-offs & Future Evolution

- **Stage 1 (Current):** Static React SPA on Azure Static Web Apps (Free) + serverless Python API keeps hosting at $0 while delivering a fast UX for both compliance and QR pages.
- **Stage 2 (Auth / Scale):** If role-based access control (RBAC) is needed for cooperatives and exporters, Azure Static Web Apps supports built-in authentication (Microsoft Entra ID / custom OIDC) or upgrading to the Standard tier without rewriting the React app.
