-- Lote Claro: Initial PostgreSQL + PostGIS schema
-- Matches docs/architecture/db.md and docs/architecture/registration.md

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'farmer' CHECK (role IN ('farmer', 'acopio')),
    name TEXT,
    registration_state TEXT NOT NULL DEFAULT 'awaiting_consent'
        CHECK (registration_state IN ('awaiting_consent', 'awaiting_name', 'awaiting_farm', 'complete', 'declined')),
    verified_by_coop BOOLEAN NOT NULL DEFAULT FALSE,
    consent_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (consent_status IN ('pending', 'accepted', 'declined', 'revoked')),
    consent_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    boundary geometry(Polygon, 4326),
    captured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS location_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    point geometry(Point, 4326) NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_message_id TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_code TEXT NOT NULL UNIQUE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lot_name TEXT,
    quantity NUMERIC,
    unit TEXT,
    process TEXT,
    gfw_status TEXT NOT NULL DEFAULT 'pending',
    evidence_blob_url TEXT,
    source_message_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS epcis_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL,
    source_message_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks every processed WhatsApp message ID for idempotent queue consumption
-- (including registration messages that do not insert into location_pins or lots).
CREATE TABLE IF NOT EXISTS processed_messages (
    source_message_id TEXT PRIMARY KEY,
    wa_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_wa_id ON users (wa_id);
CREATE INDEX IF NOT EXISTS idx_farms_user_id ON farms (user_id);
CREATE INDEX IF NOT EXISTS idx_farms_boundary_gist ON farms USING GIST (boundary);
CREATE INDEX IF NOT EXISTS idx_location_pins_farm_id ON location_pins (farm_id);
CREATE INDEX IF NOT EXISTS idx_location_pins_point_gist ON location_pins USING GIST (point);
CREATE INDEX IF NOT EXISTS idx_lots_farm_id ON lots (farm_id);
CREATE INDEX IF NOT EXISTS idx_lots_user_id ON lots (user_id);
CREATE INDEX IF NOT EXISTS idx_epcis_events_lot_id ON epcis_events (lot_id);
