-- migrate:up
-- Cafeto supervision base (cooperatives, farms, lots, inputs, photos, certifications,
-- compliance rows, messages) served to the /cafeto dashboard via GET /api/cafeto/base,
-- and the acopio sheets (Recepción, Consolidación, Bodega) served via GET /api/cafeto/acopio.
-- One row per record keeps the dashboard's document shape intact; `position` preserves order.

CREATE TABLE IF NOT EXISTS cafeto_records (
    collection TEXT NOT NULL
        CHECK (collection IN (
            'meta', 'parametros', 'cooperativas', 'fincas', 'lotes',
            'insumos', 'fotos', 'certificaciones', 'expediente', 'mensajes',
            'acopio_encabezados', 'acopio_recepcion', 'acopio_consolidacion', 'acopio_bodega'
        )),
    record_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (collection, record_id)
);

-- migrate:down
DROP TABLE IF EXISTS cafeto_records;
