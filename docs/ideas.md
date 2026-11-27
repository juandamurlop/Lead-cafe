# Hackathon ideas: Asoexport coffee traceability

The question is how AI can build farm-to-port traceability for small farms with little signal and low digital adoption. You're acting as a Microsoft account team, so the pitch should combine Microsoft tech with Asoexport's own design principles. Those principles are stages of digital maturity, offline-first, WhatsApp/USSD, EPCIS 2.0 and consent.

## Top pick: "Lote Claro", WhatsApp-first lot traceability

**Idea:** Rosa Elvira, a farmer, and Hernán, the cooperative's collection manager, register lots through WhatsApp Business using voice notes, photos and a shared location pin. AI turns that input into a structured lot record.

- **Capture:** Azure AI Speech and a multimodal LLM (Azure OpenAI/Foundry) turn a Spanish voice note ("Entregué 12 arrobas de café lavado, lote La Esperanza") into structured fields. This gives farmers a voice and pictogram interface that needs no typing or app.
- **Offline polygon:** A lightweight PWA or Android app, which the cooperative could run, captures the GPS polygon by walking the farm boundary. It stores the polygon offline and syncs at the acopio Wi-Fi point.
- **Lot ID:** A QR or lot code follows the coffee through acopio and the trilladora. Events are stored as GS1 EPCIS 2.0, so the export is interoperable.
- **Compliance:** A pipeline checks each polygon against GLAD/GFW deforestation alerts and produces a due-diligence report per lot for Laura (the exporter's compliance manager) and Anke (the Hamburg buyer).

**Why it wins:** it hits all four of Asoexport's principles, and it maps directly onto the four personas.

## Alternative ideas

1. **Copilot de cumplimiento EUDR for Laura.** A RAG agent over EUDR, CS3D, DIAN and VUCE rules plus the lot data. It answers "can lot X ship to Hamburg?", flags missing polygons and drafts the due-diligence statement. It could be a Copilot Studio agent with Power Automate flows into DIAN/VUCE. It's quick to demo and strong for the "account team" angle.
2. **Polygon-from-satellite assist.** Many farms are under 1.5 ha and walking the boundary is a hurdle. Use satellite imagery (Planetary Computer) and a segmentation model to propose the farm polygon, and let the farmer confirm it with one tap. This tackles the polygon bottleneck. The risk is that it's harder to build in a hackathon.
3. **Cash-to-digital payment trail.** Acopio payments are mostly in cash, so there is no financial traceability. Record each purchase, with weight, price and farmer, as a lot event. Give farmers a WhatsApp receipt, which also serves as proof of fair price (Rosa's need) and builds a credit history.
4. **Acopio quality assistant (Hernán).** Photo-based AI checks green-bean defects and humidity, working offline on-device. Add a drying alert for artisanal secado, based on weather and a simple sensor later (stage 2 of the maturity ladder).
5. **Buyer transparency view (Anke).** A QR on the sack leads to a story page with the farm polygon, a deforestation-free check, certifications and harvest dates. It's good for the demo's "wow" moment.
6. **Data governance layer.** Consent via WhatsApp ("Do you authorize sharing your farm location with X?"), plus farmer-owned data and revocation. Asoexport lists this as a principle, so even a small version of it differentiates you.

## Suggested demo and pitch

1. **Story:** follow one lot from Rosa's finca in Huila → Hernán's acopio in Cauca → Laura's export file → Anke's QR in Hamburg.
2. **Build:** a thin vertical slice with a WhatsApp or Telegram mock, voice note → structured lot → EPCIS event → compliance check → buyer QR page.
3. **Use these numbers in the pitch:**
   - The EU buys 25–27% of Colombian coffee, which is the revenue at risk.
   - Rural mobile internet penetration is 28%, so offline-first and WhatsApp are required.
   - Cauca has the most digital-poor and smallest farms (0.81 ha average), so start there.
4. **Roadmap:** stage 1 is data and lot traceability. Stage 2 is IoT and analytics. This follows Asoexport's "madurez por etapas" advice and shows you listened.

Because the exercise is Microsoft-framed, I'd also add an "Azure architecture" slide: Speech, Document Intelligence, Foundry/OpenAI, Cosmos DB or Fabric for events, Power BI for the compliance dashboard, and Copilot Studio.

I can sketch the architecture, scaffold the demo or draft the pitch outline. The repo is named `excel-en-te`, so if your hackathon has an Excel or Power Platform angle, tell me and I'll tailor the ideas to it.



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
3. **Download** the audio with `GET /{media-id}`, then fetch the media URL with your bearer token.
4. **Transcribe** with Azure AI Speech (`es-CO`). WhatsApp voice notes are OGG/Opus, so convert to WAV or use a compatible format.
5. **Extract fields** with an LLM using structured output (JSON schema): `farmer`, `lot_name`, `quantity`, `unit`, `process`, `date`.
6. **Ask for the location pin** if no polygon exists yet: "Comparte tu ubicación 📍". WhatsApp sends lat/long natively.
7. **Confirm** with interactive reply buttons: "¿Es correcto? [Sí] [No]". Confirmation matters because speech and LLM errors are real.
8. **Store** the event as EPCIS 2.0 JSON and **reply** with a receipt and a lot code or QR image.

## 4. Handling the poor-signal reality

- **WhatsApp already queues offline.** The farmer records and sends the voice note with no signal, and it delivers when the connection returns. That gives you offline-first without building an app.
- **Make the bot idempotent.** Deduplicate on the WhatsApp message ID, because webhooks retry.
- **Keep replies short and visual:** emojis, buttons, few words, optional voice replies via Azure TTS for low-literacy users.
- **Polygons are the hard part.** WhatsApp only sends single location pins. Options:
  - The farmer sends 4–6 pins while walking the boundary, and the bot assembles the polygon.
  - Use a small PWA or Android app for polygon capture, linked from WhatsApp, which syncs at the acopio Wi-Fi point.
  - Use the satellite-assisted polygon idea, with the farmer confirming a proposed shape.

## 5. Constraints to know

- **24-hour window:** your service can send free-form messages only within 24 hours of the user's last message. Outside it you need pre-approved **template messages**, for example harvest reminders.
- **Opt-in is required** for business-initiated messages. That fits the consent and data-governance principle, so show it in the demo.
- **Phone-number identity:** map each number to a farmer or cooperative record, and verify it through the cooperative (Hernán) at onboarding.
- **Privacy:** location and farm data is sensitive. Store consent records and offer a revoke command ("BORRAR MIS DATOS").

## 6. Minimal hackathon build (about a day)

1. Create a Twilio sandbox, or a Meta app with the WhatsApp product.
2. Write one Azure Function (Python or Node) as the webhook. Tunnel it with `ngrok` or `devtunnel` while developing.
3. Wire it to Speech and Azure OpenAI with a JSON schema.
4. Store lots in Cosmos DB or even a Postgres/JSON file.
5. Add a simple Power BI or web page showing lots on a map, so judges see the result.

If you tell me your stack (Python or Node, Azure or local), I can scaffold the webhook, the voice-note-to-JSON pipeline and a mock sender so you can test without WhatsApp. The mock needs no accounts.
