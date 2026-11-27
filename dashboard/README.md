# Cafeto

Dashboard de demostración para Lote Claro. Las siete vistas usan el conjunto ficticio incluido en `data/cafeto.json`. Panorama también muestra los totales de fincas, lotes y eventos EPCIS de PostgreSQL cuando está disponible la API.

## Desarrollo local

```sh
cd dashboard
npm ci
npm run check
npm run dev
```

Abre `http://127.0.0.1:8000`. Para generar los archivos que sirve un hosting estático, ejecuta `npm run build` y publica `index.html`, `app.js`, `styles.css`, `sw.js` y `data/` desde la misma ruta. El Service Worker requiere HTTPS o localhost. Abre Cafeto una vez con conexión y espera a que termine la primera carga antes de probar el modo sin conexión.

## Operación de Hernán

**Mapa** es la vista inicial. Selecciona una zona, un centro o una finca en el mapa, o usa el buscador. Los centros se ubican aproximadamente a partir de sus fincas asociadas. Cada panel de centro consulta los registros de su `coopId` y permite descargar sus cinco hojas de Excel. Los filtros del mapa afectan la visualización geográfica. Los filtros del panel se aplican a la descarga cuando eliges **Filtrados**.

- **Ventanilla** es para supervisores. Consulta recepción, pruebas de horno, lotes que requieren atención, consolidaciones, pagos y bodega. Cada entrega vincula `fincaId`, `nroId` y `coopId` con el catálogo existente. La coincidencia identifica la procedencia y la verificación ambiental se muestra por separado. Los rangos iniciales de 10–12 % son referencias de demostración pendientes de validar en acopio. La decisión reportada y la recomendación aparecen en columnas distintas.
- **Horno** muestra mediciones estructuradas. El ejemplo ficticio de la entrega ENT-010 tiene 25 g y 21,5 g para demostrar una prueba finalizada. Cafeto calcula humedad en base húmeda con dos pesos netos positivos de la misma muestra. El instrumento Gravimet sigue disponible en Secado.
- **Bodega** muestra lecturas ambientales puntuales por zona, su tendencia y el tiempo transcurrido. La alerta de antigüedad usa un umbral de 48 horas para la demostración. La recomendación psicrométrica requiere las dos lecturas exteriores.
- **Excel** carga `data/Acopio_Hernan_vinculado_repo.xlsx` y valida las entregas contra `cafeto.json`. La hoja `Referencias repo` permanece en el libro original. En Consolidación, cada aporte se identifica por `ID entrega` y su peso debe coincidir con el de la entrega. Una fila inválida cancela la importación e indica dónde ocurrió el error.
- La plantilla vinculada incluye importe y método, sin una columna de confirmación. Un importe informado se conserva en Recepción. El monto efectivamente pagado se completa solo con estado explícito «Pagado» o «Parcial». La indicación «Pendiente» de la plantilla permanece como tal. El origen ambiental de los consolidados queda sin verificar cuando no hay confirmación explícita.
- **Descargar Excel** incluye Recepción, Consolidación, Bodega, Pruebas de horno y Pagos. **Filtrados** conserva todos los aportes de los consolidados vinculados y aplica el intervalo de fechas a Bodega. Los valores financieros desconocidos quedan vacíos.
- **Datos locales** se guardan en el navegador por origen. Usa **Descargar Excel** para respaldarlos. Borrar el almacenamiento del sitio o cerrar una sesión privada puede eliminar el registro local. La capacidad está sujeta a la cuota del navegador.

## Formato para la futura integración

Las interfaces de `src/data/supervision.ts` documentan el modelo de visualización que se debe acordar con el equipo de WhatsApp.

- Entrega: ID estable, identificación `nroId` y finca `fincaId` separados, cooperativa, lote, recepción ISO 8601 con zona, kg, humedad, método, muestra, defectos y decisión confirmada.
- Horno: ID de entrega, lote, ID de muestra, pesos inicial y final en gramos con ID de muestra y confirmación de peso neto, fechas, estado, temperatura, duración, observaciones y destino confirmado.
- Consolidación: ID y lote comercial, fecha, entregas originales, finca y kg por aporte, calidad física y estado ambiental independientes.
- Pago: ID de entrega, valor de compra, monto pagado, método, estado, fecha, descuentos y premio. Usa `null` para importes desconocidos.
- Bodega: ID, fecha, zona, responsable, temperatura y humedad relativa interiores, lecturas exteriores opcionales, acción y observaciones.
- Fuente: canal, ID externo estable, distintivo ficticio y evidencia fechada de confirmación. La confirmación real de persistencia es necesaria para mostrar «Confirmado por el servidor». Los registros del libro están disponibles localmente.

La futura integración depende del contrato de WhatsApp y del mecanismo de confirmación del equipo de backend. El resumen PostgreSQL de Panorama usa su API de solo lectura existente.

## Conexión con Azure Functions

1. Aplica la migración existente `db/migrations/001_init_schema.sql` a la base configurada en `DATABASE_URL`.
2. Configura `DASHBOARD_SUMMARY_ENABLED=true` en Azure Functions o en `Values` de `backend/local.settings.json` para publicar los tres contadores agregados.
3. El dashboard consulta `/api/dashboard/summary` en su mismo origen. Si el backend usa otro origen, cambia la etiqueta `cafeto-summary-url` en `index.html` a la URL completa y agrega el origen del dashboard a CORS. En local, usa `http://localhost:7071/api/dashboard/summary` y ejecuta `func start --cors http://127.0.0.1:8000` desde `backend/`.

Si la API está deshabilitada o sin conexión, Panorama muestra su estado y las vistas de demostración siguen disponibles. Los controles de señal, acopio y pagos son simulaciones del dashboard original.
