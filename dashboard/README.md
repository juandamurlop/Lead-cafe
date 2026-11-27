# Lote Claro — Dashboard & Buyer QR Web App

TypeScript + React (Vite) SPA con mapas Leaflet para polígonos EUDR, acorde con [docs/architecture/dashboard.md](../docs/architecture/dashboard.md).

## Rutas

- `/` — Tablero de cumplimiento EUDR para Laura (filtros GFW, mapa Leaflet de polígonos, tabla de lotes y enlaces a evidencia en Azure Blob Storage).
- `/cafeto` — Supervisión de acopio con mapa inicial, fincas, recepción, horno, consolidación, pagos, bodega y exportación de Excel.
- `/lot/:lotCode` — Pasaporte público QR para compradores (polígono GPS de la finca, fecha de captura, estado GFW y línea de tiempo GS1 EPCIS 2.0).

## Desarrollo local

```sh
cd dashboard
npm ci
npm run check
npm run dev
```

En desarrollo, Vite proxea `/api/*` hacia `http://localhost:7071` (Azure Functions). `/cafeto` lee la base desde `GET /api/cafeto/base` (tabla `cafeto_records`, migración `db/migrations/002_cafeto_records.sql`). La última base descargada queda en caché para abrir sin señal.

Las hojas de acopio (Recepción, Consolidación, Bodega) también viven en `cafeto_records` y se sirven en `GET /api/cafeto/acopio`; el tablero reconstruye el libro en memoria y lo importa con su lector de Excel. Las ediciones siguen guardándose en el navegador. Los datos ficticios se cargan con `RUN_SEEDS=1 infra/scripts/deploy-backend.sh` (`db/seeds/002_cafeto_base.sql` y `003_acopio.sql`). Los archivos estáticos (`public/data/cafeto.json` y el libro) solo se usan con `VITE_DEMO_DATA=true`.

Para compilar el paquete estático para Azure Static Web Apps (`dist/`):

```sh
npm run build
```

Para verificar que Cafeto abre y exporta sin conexión, ejecuta `npm run preview` después de compilar y abre `/cafeto` una vez con conexión. El Service Worker se instala en la versión compilada y necesita HTTPS o localhost.

## Supervisión de acopio

El mapa consulta el catálogo compartido `public/data/cafeto.json`. El Excel de demostración `public/data/Acopio_Hernan_vinculado_repo.xlsx` alimenta COOP-03. Los centros aparecen en una posición aproximada calculada a partir de sus fincas asociadas. La exportación respeta el centro y conserva los aportes completos de cada lote incluido. Incluye Recepción, Consolidación, Bodega, Pruebas de horno y Pagos.

Cafeto distingue la recomendación de calidad, la decisión reportada y la verificación ambiental. Los rangos de humedad son referencias de demostración pendientes de validar con el encargado. El cálculo de horno requiere dos pesos netos positivos de la misma muestra y un peso final menor o igual al inicial. La medición ambiental de bodega es puntual y usa un umbral de antigüedad de 48 horas para la demostración.

El monto informado del Excel se conserva. El monto efectivamente pagado necesita un estado explícito Pagado o Parcial. Los registros quedan disponibles localmente para consulta y exportación sin conexión. Guardar los datos en el navegador depende de la cuota y configuración de almacenamiento del sitio.

### Modelo para futura integración de WhatsApp

Las interfaces de `src/data/supervision.ts` definen los campos que se deben acordar con el equipo de integración:

- Entregas con ID estable, `nroId`, `fincaId`, cooperativa, lote, fecha con zona, peso, humedad, método, resultado de muestra, defectos y destino confirmado.
- Pruebas de horno con ID de entrega y muestra, pesos netos en gramos, fechas, estado, temperatura, duración y observaciones.
- Consolidaciones con lote comercial, fecha, peso y finca de cada aporte, estado físico y verificación ambiental.
- Pagos con método, estado, fecha, importe, descuentos y premio en COP. Usa `null` para un importe desconocido.
- Bodega con centro, fecha y hora, temperatura y humedad interior, lecturas exteriores opcionales, zona, acción y responsable.
- Fuente, ID externo y confirmación fechada del servidor para distinguir registros locales de registros confirmados.
