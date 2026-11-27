#!/usr/bin/env bash
set -euo pipefail

# Build dashboard/ with VITE_API_BASE_URL pointing to the deployed Function App
# and upload dist/ to the Azure Storage static website ($web) container.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${INFRA_DIR}/.." && pwd)"
DASHBOARD_DIR="${ROOT_DIR}/dashboard"

RG_NAME="${RG_NAME:-rg-loteclaro-dev}"

if [[ -z "${STORAGE_ACCOUNT:-}" ]]; then
  STORAGE_ACCOUNT="$(az storage account list -g "${RG_NAME}" --query '[0].name' -o tsv)"
fi

if [[ -z "${FUNCTION_APP_HOST:-}" ]]; then
  FUNCTION_APP_HOST="$(az functionapp list -g "${RG_NAME}" --query '[0].defaultHostName' -o tsv)"
fi

if [[ -z "${STORAGE_ACCOUNT}" || -z "${FUNCTION_APP_HOST}" ]]; then
  echo "Error: Could not resolve STORAGE_ACCOUNT or FUNCTION_APP_HOST in resource group '${RG_NAME}'." >&2
  exit 1
fi

export VITE_API_BASE_URL="https://${FUNCTION_APP_HOST}"
echo "Building dashboard with VITE_API_BASE_URL=${VITE_API_BASE_URL}..."
(
  cd "${DASHBOARD_DIR}"
  npm run build
)

STORAGE_KEY="$(az storage account keys list --resource-group "${RG_NAME}" --account-name "${STORAGE_ACCOUNT}" --query '[0].value' -o tsv)"

echo "Uploading '${DASHBOARD_DIR}/dist' to '\$web' on '${STORAGE_ACCOUNT}'..."
az storage blob upload-batch \
  --account-name "${STORAGE_ACCOUNT}" \
  --account-key "${STORAGE_KEY}" \
  --source "${DASHBOARD_DIR}/dist" \
  --destination '$web' \
  --overwrite

DASHBOARD_URL="$(az storage account show -g "${RG_NAME}" -n "${STORAGE_ACCOUNT}" --query 'primaryEndpoints.web' -o tsv)"
echo "Dashboard deployed: ${DASHBOARD_URL}"
