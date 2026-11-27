#!/usr/bin/env bash
set -euo pipefail

# Apply db/migrations/*.sql to the deployed PostgreSQL server (idempotent) and
# publish backend/ to the Azure Function App.
#
# Optional env vars:
#   RG_NAME          resource group (default: rg-loteclaro-dev)
#   FUNCTION_APP     Function App name (default: first one in the resource group)
#   SKIP_MIGRATIONS  set to 1 to only publish the code
#   RUN_SEEDS        set to 1 to also apply db/seeds/*.sql (demo data)
#
# Requires: az (logged in), psql, zip, curl.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${INFRA_DIR}/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
DB_DIR="${ROOT_DIR}/db"

RG_NAME="${RG_NAME:-rg-loteclaro-dev}"

if [[ -z "${FUNCTION_APP:-}" ]]; then
  FUNCTION_APP="$(az functionapp list -g "${RG_NAME}" --query '[0].name' -o tsv)"
fi

if [[ -z "${FUNCTION_APP}" ]]; then
  echo "Error: Could not resolve FUNCTION_APP in resource group '${RG_NAME}'." >&2
  exit 1
fi

if [[ "${SKIP_MIGRATIONS:-0}" != "1" ]]; then
  PG_SERVER="$(az postgres flexible-server list -g "${RG_NAME}" --query '[0].name' -o tsv)"
  if [[ -z "${PG_SERVER}" ]]; then
    echo "Error: No PostgreSQL server found in resource group '${RG_NAME}'." >&2
    exit 1
  fi

  # Reuse the connection string the Function App already runs with.
  DATABASE_URL="$(az functionapp config appsettings list -g "${RG_NAME}" -n "${FUNCTION_APP}" \
    --query "[?name=='DATABASE_URL'].value | [0]" -o tsv)"
  if [[ -z "${DATABASE_URL}" ]]; then
    echo "Error: DATABASE_URL app setting not found on '${FUNCTION_APP}'." >&2
    exit 1
  fi

  # Temporarily allow this machine through the PostgreSQL firewall.
  MY_IP="$(curl -fsS https://api.ipify.org)"
  RULE_NAME="deploy-backend-$(whoami)"
  echo "Opening PostgreSQL firewall for ${MY_IP} (rule '${RULE_NAME}')..."
  az postgres flexible-server firewall-rule create \
    -g "${RG_NAME}" --server-name "${PG_SERVER}" --name "${RULE_NAME}" \
    --start-ip-address "${MY_IP}" --end-ip-address "${MY_IP}" --output none
  trap 'az postgres flexible-server firewall-rule delete -g "${RG_NAME}" --server-name "${PG_SERVER}" --name "${RULE_NAME}" --yes --output none || true' EXIT

  shopt -s nullglob
  SQL_FILES=("${DB_DIR}"/migrations/*.sql)
  if [[ "${RUN_SEEDS:-0}" == "1" ]]; then
    SQL_FILES+=("${DB_DIR}"/seeds/*.sql)
  fi
  for f in "${SQL_FILES[@]}"; do
    echo "Applying ${f#"${ROOT_DIR}/"}..."
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q -f "${f}"
  done
fi

echo "Publishing '${BACKEND_DIR}' to Function App '${FUNCTION_APP}'..."
ZIP_FILE="$(mktemp -t loteclaro-backend-XXXXXX.zip)"
rm -f "${ZIP_FILE}"
(
  cd "${BACKEND_DIR}"
  zip -qr "${ZIP_FILE}" . \
    -x 'local.settings.json' '.venv/*' '__pycache__/*' '*/__pycache__/*' '.pytest_cache/*' '*/.pytest_cache/*' '.git/*'
)
az functionapp deployment source config-zip \
  -g "${RG_NAME}" \
  -n "${FUNCTION_APP}" \
  --src "${ZIP_FILE}" \
  --build-remote true
rm -f "${ZIP_FILE}"

FUNCTION_HOST="$(az functionapp show -g "${RG_NAME}" -n "${FUNCTION_APP}" --query defaultHostName -o tsv)"
echo "Backend deployed: https://${FUNCTION_HOST}"
echo "Set the Meta webhook callback URL to https://${FUNCTION_HOST}/api/webhook with your verify token."
