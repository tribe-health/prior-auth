#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KEY_DIR="$PROJECT_ROOT/.runtime/ra05/keys"

mkdir -p "$KEY_DIR"
chmod 700 "$PROJECT_ROOT/.runtime" "$PROJECT_ROOT/.runtime/ra05" "$KEY_DIR"

if [[ ! -s "$KEY_DIR/private.pem" || ! -s "$KEY_DIR/public.pem" ]]; then
  command -v openssl >/dev/null 2>&1 || {
    echo "openssl is required to generate the synthetic RA05 signing key" >&2
    exit 1
  }
  umask 077
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out "$KEY_DIR/private.pem" >/dev/null 2>&1
  openssl pkey -in "$KEY_DIR/private.pem" -pubout \
    -out "$KEY_DIR/public.pem" >/dev/null 2>&1
fi

export RA05_GATE_KEY_DIR="$KEY_DIR"
exec "${RA06_TOOL_DOCKER:-docker}" compose \
  -f "$PROJECT_ROOT/docker-compose.yaml" \
  -f "$PROJECT_ROOT/docker-compose.ra05.yaml" \
  --profile realtime \
  "$@"
