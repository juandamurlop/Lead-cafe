# Cafeto

Dashboard de demostración para Lote Claro. Las siete vistas usan el conjunto ficticio incluido en `data/cafeto.json`. Panorama también muestra los totales de fincas, lotes y eventos EPCIS de PostgreSQL cuando está disponible la API.

## Desarrollo local

```sh
cd dashboard
npm ci
npm run check
npm run dev
```

Abre `http://127.0.0.1:8000`. Para generar los archivos que sirve un hosting estático, ejecuta `npm run build` y publica `index.html`, `app.js`, `styles.css` y `data/`.

## Conexión con Azure Functions

1. Aplica la migración existente `db/migrations/001_init_schema.sql` a la base configurada en `DATABASE_URL`.
2. Configura `DASHBOARD_SUMMARY_ENABLED=true` en Azure Functions o en `Values` de `backend/local.settings.json` para publicar los tres contadores agregados.
3. El dashboard consulta `/api/dashboard/summary` en su mismo origen. Si el backend usa otro origen, cambia la etiqueta `cafeto-summary-url` en `index.html` a la URL completa y agrega el origen del dashboard a CORS. En local, usa `http://localhost:7071/api/dashboard/summary` y ejecuta `func start --cors http://127.0.0.1:8000` desde `backend/`.

Si la API está deshabilitada o sin conexión, Panorama muestra su estado y las vistas de demostración siguen disponibles. Los controles de señal, acopio y pagos son simulaciones del dashboard original.
