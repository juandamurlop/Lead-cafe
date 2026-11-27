#!/usr/bin/env bash
set -euo pipefail

# Deploy the Lote Claro resource group and core Azure resources via Bicep
# (including Storage, PostgreSQL/PostGIS, Function App, and Microsoft Foundry).
#
# Required environment variables:
#   PG_ADMIN_PASSWORD
#
# Optional environment variables:
#   LOCATION                  (default: eastus2)
#   WHATSAPP_VERIFY_TOKEN     (default: "")
#   META_APP_SECRET           (default: "")
#   WHATSAPP_ACCESS_TOKEN     (default: "")
#   WHATSAPP_PHONE_NUMBER_ID  (default: "")
#   FOUNDRY_MODEL             (default: gpt-4o-transcribe)
#   FOUNDRY_MODEL_VERSION     (default: 2025-03-20)
#   FOUNDRY_MODEL_SKU         (default: GlobalStandard)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${PG_ADMIN_PASSWORD:-}" ]]; then
  echo "Error: PG_ADMIN_PASSWORD must be set." >&2
  exit 1
fi

LOCATION="${LOCATION:-eastus2}"

echo "Deploying Bicep template '${INFRA_DIR}/main.bicep' to '${LOCATION}'..."
az deployment sub create \
  --name "loteclaro-$(date +%Y%m%d-%H%M%S)" \
  --location "${LOCATION}" \
  --template-file "${INFRA_DIR}/main.bicep" \
  --parameters "${INFRA_DIR}/main.bicepparam" \
  --parameters \
    pgAdminPassword="${PG_ADMIN_PASSWORD}" \
    whatsappVerifyToken="${WHATSAPP_VERIFY_TOKEN:-}" \
    metaAppSecret="${META_APP_SECRET:-}" \
    whatsappAccessToken="${WHATSAPP_ACCESS_TOKEN:-}" \
    whatsappPhoneNumberId="${WHATSAPP_PHONE_NUMBER_ID:-}" \
    foundryModel="${FOUNDRY_MODEL:-gpt-4o-transcribe}" \
    foundryModelVersion="${FOUNDRY_MODEL_VERSION:-2025-03-20}" \
    foundryModelSku="${FOUNDRY_MODEL_SKU:-GlobalStandard}"
