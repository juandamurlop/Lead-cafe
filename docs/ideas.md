# Hackathon ideas: Asoexport coffee traceability

Case question: how can AI help build farm-to-port traceability for small farms with little signal and low digital adoption? We act as a Microsoft account team, so the solution combines Microsoft tech with Asoexport's design principles: digital maturity by stages, offline-first, WhatsApp/USSD, EPCIS 2.0 and consent.

## Top pick: "Lote Claro", WhatsApp-first lot traceability

**Idea:** Rosa Elvira, a farmer, and Hernán, the cooperative's collection manager, register lots through WhatsApp Business using voice notes, photos and a shared location pin. AI turns that input into a structured lot record.

- **Capture:** Azure AI Speech and a multimodal LLM (Azure OpenAI/Foundry) turn a Spanish voice note ("Entregué 12 arrobas de café lavado, lote La Esperanza") into structured fields. This gives farmers a voice and pictogram interface that needs no typing or app.
- **Offline polygon:** A lightweight PWA or Android app, which the cooperative could run, captures the GPS polygon by walking the farm boundary. It stores the polygon offline and syncs at the acopio Wi-Fi point.
- **Lot ID:** A QR or lot code follows the coffee through acopio and the trilladora. Events are stored as GS1 EPCIS 2.0, so the export is interoperable.
- **Compliance:** A pipeline checks each polygon against GLAD/GFW deforestation alerts and produces a due-diligence report per lot for Laura (the exporter's compliance manager) and Anke (the Hamburg buyer).

**Fit:** covers all four of Asoexport's principles and maps onto the four personas.

## Suggested demo and pitch

1. **Story:** follow one lot from Rosa's finca in Huila → Hernán's acopio in Cauca → Laura's export file → Anke's QR in Hamburg.
2. **Build:** a thin vertical slice with a WhatsApp or Telegram mock, voice note → structured lot → EPCIS event → compliance check → buyer QR page.
3. **Use these numbers in the pitch:**
   - The EU buys 25–27% of Colombian coffee, which is the revenue at risk.
   - Rural mobile internet penetration is 28%, so offline-first and WhatsApp are required.
   - Cauca has the most digital-poor and smallest farms (0.81 ha average), so start there.
4. **Roadmap:** stage 1 is data and lot traceability. Stage 2 is IoT and analytics. This follows Asoexport's "madurez por etapas" principle.
5. **Azure architecture slide:** Speech, Document Intelligence, Foundry/OpenAI, Cosmos DB or Fabric for events, Power BI for the compliance dashboard, and Copilot Studio.

# Building the WhatsApp channel

## 1. Pick the integration route

Decision: use Meta's Cloud API test number.


## 2. Architecture

```
Farmer's WhatsApp
      │  (text / voice note / photo / location pin)
      ▼
WhatsApp Cloud API ──webhook──▶ Azure Function (HTTPS endpoint)
                                     │
        ┌────────────────────────────┼─────────────────────────┐
        ▼                            ▼                         ▼
 Download media            Azure AI Speech (es-CO)     Azure OpenAI / Foundry
 (voice)                   voice → text                text → structured lot JSON
                                                              │
                                                              ▼
                                           Cosmos DB / Fabric (EPCIS events)
                                                              │
                                        reply via Cloud API ◀─┘
                                 ("Lote La Esperanza registrado ✅ 12 arrobas")
```

## 3. Message flow for one lot

1. **Farmer sends a voice note:** "Entregué 12 arrobas de café lavado del lote La Esperanza."
2. **Webhook fires.** The function gets a `messages` payload with an audio media ID.
3. **Download** the audio with `GET /{media-id}`, then fetch the media URL with the bearer token.
4. **Transcribe** with Azure AI Speech (`es-CO`). WhatsApp voice notes are OGG/Opus, so convert to WAV or use a compatible format.
5. **Extract fields** with an LLM using structured output (JSON schema): `farmer`, `lot_name`, `quantity`, `unit`, `process`, `date`.
6. **Ask for the location pin** if no polygon exists yet: "Comparte tu ubicación 📍". WhatsApp sends lat/long natively.
7. **Confirm** with interactive reply buttons: "¿Es correcto? [Sí] [No]". Confirmation guards against speech and LLM errors.
8. **Store** the event as EPCIS 2.0 JSON and **reply** with a receipt and a lot code or QR image.

## 4. Handling poor signal

- **WhatsApp already queues offline.** The farmer records and sends the voice note with no signal, and it delivers when the connection returns. That gives offline-first without building an app.
- **Make the bot idempotent.** Deduplicate on the WhatsApp message ID, because webhooks retry.
- **Keep replies short and visual:** emojis, buttons, few words, optional voice replies via Azure TTS for low-literacy users.
- **Polygons are the hard part.** WhatsApp only sends single location pins. Options:
  - The farmer sends 4–6 pins while walking the boundary, and the bot assembles the polygon.
  - Use a small PWA or Android app for polygon capture, linked from WhatsApp, which syncs at the acopio Wi-Fi point.
  - Propose a polygon from satellite imagery (Planetary Computer) and have the farmer confirm the shape.

## 5. Constraints

- **24-hour window:** the service can send free-form messages only within 24 hours of the user's last message. Outside it, pre-approved **template messages** are required (for example, harvest reminders).
- **Opt-in is required** for business-initiated messages. That fits the consent and data-governance principle, so show it in the demo.
- **Phone-number identity:** map each number to a farmer or cooperative record, and verify it through the cooperative (Hernán) at onboarding.
- **Privacy:** location and farm data is sensitive. Store consent records and offer a revoke command ("BORRAR MIS DATOS").

## 6. Minimal hackathon build (about a day)

1. Create a Meta app with the WhatsApp product and use the test number.
2. Write one Azure Function (Python or Node) as the webhook. Tunnel it with `ngrok` or `devtunnel` while developing.
3. Wire it to Speech and Azure OpenAI with a JSON schema.
4. Store lots in Cosmos DB or even a Postgres/JSON file.
5. Add a simple Power BI or web page showing lots on a map, so judges see the result.

## 7. Deforestation evidence with Global Forest Watch

Decision: use **Global Forest Watch (GFW)** for the non-deforestation check, and keep our own database of the locations the producers send.

**What we can deliver (EUDR):** "Pueden entregar polígonos GPS por finca y la fecha de captura, más la documentación (imágenes satelitales o certificaciones) que pruebe no deforestación por lote."

- **Per farm:** the GPS polygon plus the capture date.
- **Per lot:** the documentation proving no deforestation, meaning satellite imagery or certifications.

**Locations database:** every location a producer sends over WhatsApp is recorded. Minimum fields:

| Field | Notes |
|---|---|
| `farmer_id` / `phone` | Mapped to the farmer record, verified by the cooperative |
| `farm_id` | One farmer can have several farms |
| `geometry` | Point from a location pin, or the polygon assembled from several pins |
| `captured_at` | Capture date, which EUDR asks for |
| `source_message_id` | WhatsApp message ID, for deduplication and audit |
| `consent` | Consent record and revocation status |

**Flow:**
1. The farmer sends location pins over WhatsApp, and the bot stores them in the locations database with the capture date.
2. Once a polygon exists, query GFW for tree-cover loss and deforestation alerts (GLAD) on that polygon, relative to the EUDR cutoff date (31 December 2020).
3. Save the result and the evidence (satellite imagery or the GFW report, plus any certifications) against each lot.
4. Laura (compliance) and Anke (buyer) read the polygon, capture date and evidence per lot from the due-diligence report or the QR page.

**Open questions:**
- Confirm which GFW access we use (Data API or the GFW Pro tools) and its rate limits.
- Decide where evidence files live (Blob Storage, linked from the lot record).
- Decide how we handle a polygon with alerts: flag it for review rather than reject it automatically.
