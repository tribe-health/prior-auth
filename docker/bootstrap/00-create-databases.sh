#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Create the databases Kratos and flint-gate own.
#
# Numbered 00 so it runs before the ASO schema load. Postgres executes
# /docker-entrypoint-initdb.d in filename order.
#
# This is explicit rather than `POSTGRES_MULTIPLE_DATABASES`, which is a
# convention some community images implement and this one does not. Setting
# that variable would have looked correct and silently created nothing —
# Kratos and flint-gate would then fail to connect at startup, one layer away
# from the actual cause.
#
# Kratos owns and migrates its own schema. `aso.*` must never FK into it;
# `users.kratos_identity_id` is a soft reference by design.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

for db in kratos flintgate; do
  echo "  creating database $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
	SELECT 'CREATE DATABASE $db'
	 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
SQL
done
