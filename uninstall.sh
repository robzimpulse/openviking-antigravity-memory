#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="/home/vladimir/.gemini/config/plugins/openviking-memory"
RUNTIME_DIR="${HOME}/.openviking/antigravity"

PURGE=false
for arg in "$@"; do
  if [[ "${arg}" == "--purge" ]]; then
    PURGE=true
  fi
done

echo "[uninstall] Removing installed plugin from ${PLUGIN_DIR}..."
if [[ -d "${PLUGIN_DIR}" ]]; then
  rm -rf "${PLUGIN_DIR}"
  echo "[uninstall] Plugin successfully removed."
else
  echo "[uninstall] Plugin directory not found (already uninstalled)."
fi

if [[ "${PURGE}" == "true" ]]; then
  echo "[uninstall] Purging runtime state, credentials, and logs from ${RUNTIME_DIR}..."
  rm -rf "${RUNTIME_DIR}"
  echo "[uninstall] Purge complete."
else
  echo "[uninstall] Preserved runtime state and credentials in ${RUNTIME_DIR}."
  echo "[uninstall] (Use --purge to remove credentials and logs as well)."
fi
