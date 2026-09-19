#!/bin/sh
set -eu

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ "${ASO_LITER_DATA_CLASS:-}" = synthetic ] || fail 'Liter inference requires an explicit synthetic deployment.'

QWEN_TOKEN_PLAN_OPENAI_URL=${QWEN_TOKEN_PLAN_OPENAI_URL:-https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1}
QWEN_TOKEN_PLAN_MODEL=${QWEN_TOKEN_PLAN_MODEL:-qwen3.8-max}
[ "$QWEN_TOKEN_PLAN_OPENAI_URL" = https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1 ] || fail 'Unexpected synthetic inference endpoint.'
[ "$QWEN_TOKEN_PLAN_MODEL" = qwen3.8-max ] || fail 'Unexpected synthetic inference model.'

if [ -z "${QWEN_TOKEN_PLAN_API_KEY:-}" ] && [ -r /run/secrets/qwen_token_plan_api_key ]; then
  QWEN_TOKEN_PLAN_API_KEY=$(cat /run/secrets/qwen_token_plan_api_key)
fi
if [ -z "${ASO_LITER_SYNTHETIC_KEY:-}" ] && [ -r /run/secrets/aso_liter_synthetic_key ]; then
  ASO_LITER_SYNTHETIC_KEY=$(cat /run/secrets/aso_liter_synthetic_key)
fi
[ -n "${QWEN_TOKEN_PLAN_API_KEY:-}" ] || fail 'QWEN_TOKEN_PLAN_API_KEY is required.'
[ -n "${ASO_LITER_SYNTHETIC_KEY:-}" ] || fail 'ASO_LITER_SYNTHETIC_KEY is required.'

# Liter interpolates environment values into TOML before parsing. Refuse
# delimiters that could turn a credential into extra configuration or leak it
# through a parse diagnostic. Never print credential values.
case "$QWEN_TOKEN_PLAN_API_KEY" in *[!A-Za-z0-9._-]*) fail 'Provider credential has unsupported characters.' ;; esac
case "$ASO_LITER_SYNTHETIC_KEY" in *[!A-Za-z0-9._-]*) fail 'Internal credential has unsupported characters.' ;; esac
[ "$QWEN_TOKEN_PLAN_API_KEY" != "$ASO_LITER_SYNTHETIC_KEY" ] || fail 'Provider and internal credentials must differ.'

export QWEN_TOKEN_PLAN_OPENAI_URL QWEN_TOKEN_PLAN_MODEL QWEN_TOKEN_PLAN_API_KEY ASO_LITER_SYNTHETIC_KEY
# Keep inference payloads and credentials out of diagnostics and exporters.
unset LITER_LLM_MASTER_KEY OTEL_EXPORTER_OTLP_ENDPOINT
RUST_LOG=off
export RUST_LOG
exec liter-llm api --config /etc/liter-llm/proxy.toml --host 0.0.0.0 --port 4000
