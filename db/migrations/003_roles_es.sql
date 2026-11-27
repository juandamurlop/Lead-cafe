-- migrate:up
-- Spanish role names (farmer -> productor) and role request during WhatsApp onboarding.
-- Self-registered users always get role = 'productor'; choosing "acopio" only fills
-- requested_role until an administrator approves it (see docs/architecture/registration.md).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_registration_state_check;

UPDATE users SET role = 'productor' WHERE role = 'farmer';

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'productor';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('productor', 'acopio'));
ALTER TABLE users ADD CONSTRAINT users_registration_state_check
    CHECK (registration_state IN (
        'awaiting_consent', 'awaiting_role', 'awaiting_name', 'awaiting_farm', 'complete', 'declined'
    ));

ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_role TEXT
    CHECK (requested_role IN ('productor', 'acopio'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS acopio_name TEXT;

-- migrate:down
ALTER TABLE users DROP COLUMN IF EXISTS acopio_name;
ALTER TABLE users DROP COLUMN IF EXISTS requested_role;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_registration_state_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET registration_state = 'awaiting_name' WHERE registration_state = 'awaiting_role';
UPDATE users SET role = 'farmer' WHERE role = 'productor';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'farmer';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('farmer', 'acopio'));
ALTER TABLE users ADD CONSTRAINT users_registration_state_check
    CHECK (registration_state IN ('awaiting_consent', 'awaiting_name', 'awaiting_farm', 'complete', 'declined'));
