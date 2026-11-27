# Lote Claro — Dashboard & Buyer QR Web App

TypeScript + React (Vite) SPA con mapas Leaflet para polígonos EUDR, acorde con [docs/architecture/dashboard.md](../docs/architecture/dashboard.md).

## Rutas

- `/` — Tablero de cumplimiento EUDR para Laura (filtros GFW, mapa Leaflet de polígonos, tabla de lotes y enlaces a evidencia en Azure Blob Storage).
- `/lot/:lotCode` — Pasaporte público QR para compradores (polígono GPS de la finca, fecha de captura, estado GFW y línea de tiempo GS1 EPCIS 2.0).

## Desarrollo local

```sh
cd dashboard
npm ci
npm run check
npm run dev
```

En desarrollo, Vite proxea `/api/*` hacia `http://localhost:7071` (Azure Functions). Si el backend no está encendido, el frontend usa `public/data/cafeto.json` en modo demostración.

Para compilar el paquete estático para Azure Static Web Apps (`dist/`):

```sh
npm run build
```
