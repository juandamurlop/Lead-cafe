-- migrate:up
-- Acopio deliveries (Recepción sheet): one row per farmer delivery weighed at the collection center.
-- farm_id is NULL when the producer could not be matched to a registered farm (origen sin verificar).

CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_code TEXT NOT NULL UNIQUE,
    acopio_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    producer_name TEXT,
    farm_name TEXT,
    kg NUMERIC NOT NULL,
    humidity_pct NUMERIC,
    defects TEXT,
    paid_cop NUMERIC,
    payment_method TEXT,
    expected_cop NUMERIC,
    quality_status TEXT NOT NULL CHECK (quality_status IN ('aceptado', 'retenido', 'rechazado')),
    traced BOOLEAN NOT NULL DEFAULT FALSE,
    source_message_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_acopio_user_id ON deliveries (acopio_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_farm_id ON deliveries (farm_id);

-- migrate:down
DROP TABLE IF EXISTS deliveries;
