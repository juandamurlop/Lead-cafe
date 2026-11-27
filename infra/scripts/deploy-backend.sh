#!/usr/bin/env bash
set -euo pipefail

# Apply pending db/migrations/*.sql to the deployed PostgreSQL server with dbmate
# (tracked in schema_migrations) and publish backend/ to the Azure Function App.
#
# Optional env vars:
#   RG_NAME          resource group (default: rg-loteclaro-dev)
#   FUNCTION_APP     Function App name (default: first one in the resource group)
#   SKIP_MIGRATIONS  set to 1 to only publish the code
#   RUN_SEEDS        set to 1 to also apply db/seeds/*.sql (demo data)
#
# Requires: az (logged in), dbmate, psql (only for RUN_SEEDS), zip, curl.

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
  if ! command -v dbmate >/dev/null 2>&1; then
    echo "Error: dbmate not found. Install it (brew install dbmate) or set SKIP_MIGRATIONS=1." >&2
    exit 1
  fi
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

  # dbmate records applied versions in schema_migrations, so only new files run.
  echo "Applying pending migrations with dbmate..."
  DATABASE_URL="${DATABASE_URL}" dbmate \
    --migrations-dir "${DB_DIR}/migrations" --no-dump-schema up

  if [[ "${RUN_SEEDS:-0}" == "1" ]]; then
    shopt -s nullglob
    for f in "${DB_DIR}"/seeds/*.sql; do
      echo "Applying ${f#"${ROOT_DIR}/"}..."
      psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q -f "${f}"
    done
  fi
fi

echo "Publishing '${BACKEND_DIR}' to Function App '${FUNCTION_APP}'..."
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "${BUILD_DIR}"' EXIT
cp -R "${BACKEND_DIR}/." "${BUILD_DIR}/"
rm -f "${BUILD_DIR}/local.settings.json"
rm -rf "${BUILD_DIR}/.venv" "${BUILD_DIR}/__pycache__" "${BUILD_DIR}/.pytest_cache" "${BUILD_DIR}/.git"

python3 -m pip install --quiet \
  --target "${BUILD_DIR}/.python_packages/lib/site-packages" \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  -r "${BUILD_DIR}/requirements.txt"

ZIP_FILE="${BUILD_DIR}/backend.zip"
(
  cd "${BUILD_DIR}"
  zip -qr "${ZIP_FILE}" . -x 'tests/*' '*/__pycache__/*'
)

ACCESS_TOKEN="$(az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)"
PUBLISH_HEADERS="$(mktemp)"
curl -fsS -D "${PUBLISH_HEADERS}" -o /dev/null \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/zip" \
  -X POST --data-binary @"${ZIP_FILE}" \
  "https://${FUNCTION_APP}.scm.azurewebsites.net/api/publish"

DEPLOY_STATUS_URL="$(awk 'tolower($1)=="location:" {gsub(/\r/,"",$2); print $2}' "${PUBLISH_HEADERS}")"
rm -f "${PUBLISH_HEADERS}"

if [[ -n "${DEPLOY_STATUS_URL}" ]]; then
  for _ in $(seq 1 60); do
    DEPLOY_JSON="$(curl -fsS -H "Authorization: Bearer ${ACCESS_TOKEN}" "${DEPLOY_STATUS_URL}")"
    read -r IS_COMPLETE DEPLOY_STATUS STATUS_TEXT < <(python3 -c '
import json, sys
d = json.load(sys.stdin)
print(int(bool(d.get("complete"))), d.get("status", 0), (d.get("status_text") or "").replace("\n", " "))
' <<< "${DEPLOY_JSON}")
    if [[ "${IS_COMPLETE}" == "1" ]]; then
      if [[ "${DEPLOY_STATUS}" != "4" ]]; then
        echo "Error: Deployment failed (status=${DEPLOY_STATUS}): ${STATUS_TEXT}" >&2
        exit 1
      fi
      break
    fi
    sleep 3
  done
fi

FUNCTION_HOST="$(az functionapp show -g "${RG_NAME}" -n "${FUNCTION_APP}" --query defaultHostName -o tsv)"
echo "Backend deployed: https://${FUNCTION_HOST}"
echo "Set the Meta webhook callback URL to https://${FUNCTION_HOST}/api/webhook with your verify token."
