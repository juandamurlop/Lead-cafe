-- Optional seed for pre-registered cooperative manager (acopio)
-- Replace the placeholder wa_id with your test WhatsApp number (E.164 digits without '+').

INSERT INTO users (
    wa_id,
    role,
    name,
    registration_state,
    verified_by_coop,
    consent_status,
    consent_updated_at
)
VALUES (
    '573001112233',
    'acopio',
    'Hernán (Acopio)',
    'complete',
    TRUE,
    'accepted',
    NOW()
)
ON CONFLICT (wa_id) DO NOTHING;
