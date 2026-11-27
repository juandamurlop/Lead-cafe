#!/usr/bin/env bash
set -euo pipefail

# Deploy the Lote Claro resource group and core Azure resources via Bicep
# (including Storage, PostgreSQL/PostGIS, Function App, and Microsoft Foundry).
#
# Reads WHATSAPP_* / META_APP_SECRET from environment variables first,
# falling back to backend/local.settings.json if present.
#
# Required:
#   PG_ADMIN_PASSWORD (or set in env before running)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${INFRA_DIR}/.." && pwd)"
LOCAL_SETTINGS="${ROOT_DIR}/backend/local.settings.json"

if [[ -f "${LOCAL_SETTINGS}" ]]; then
  while IFS='=' read -r key val; do
    if [[ -n "${key}" && -z "${!key:-}" ]]; then
      export "${key}=${val}"
    fi
  done < <(python3 -c '
import json, sys, urllib.parse
with open(sys.argv[1], "r", encoding="utf-8") as f:
    vals = json.load(f).get("Values", {})
for k in (
    "WHATSAPP_VERIFY_TOKEN",
    "META_APP_SECRET",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "FOUNDRY_MODEL",
):
    if vals.get(k):
        print(f"{k}={vals[k]}")
db_url = vals.get("DATABASE_URL", "")
if db_url:
    parsed = urllib.parse.urlparse(db_url)
    if parsed.password:
        print(f"PG_ADMIN_PASSWORD={urllib.parse.unquote(parsed.password)}")
' "${LOCAL_SETTINGS}")
fi

if [[ -z "${PG_ADMIN_PASSWORD:-}" ]]; then
  read -r -s -p "Enter PostgreSQL admin password (PG_ADMIN_PASSWORD): " PG_ADMIN_PASSWORD
  echo
  export PG_ADMIN_PASSWORD
fi

LOCATION="${LOCATION:-canadacentral}"

DEPLOYMENT_NAME="loteclaro-$(date +%Y%m%d-%H%M%S)"
echo "Deploying Bicep template '${INFRA_DIR}/main.bicep' to '${LOCATION}'..."
az deployment sub create \
  --name "${DEPLOYMENT_NAME}" \
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

RG_NAME="$(az deployment sub show --name "${DEPLOYMENT_NAME}" --query 'properties.outputs.resourceGroupName.value' -o tsv)"
STORAGE_ACCOUNT="$(az deployment sub show --name "${DEPLOYMENT_NAME}" --query 'properties.outputs.storageAccountName.value' -o tsv)"
STORAGE_KEY="$(az storage account keys list --resource-group "${RG_NAME}" --account-name "${STORAGE_ACCOUNT}" --query '[0].value' -o tsv)"

echo "Enabling static website hosting on '${STORAGE_ACCOUNT}'..."
az storage blob service-properties update \
  --account-name "${STORAGE_ACCOUNT}" \
  --account-key "${STORAGE_KEY}" \
  --static-website \
  --index-document index.html \
  --404-document index.html \
  --output none
