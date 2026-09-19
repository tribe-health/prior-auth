#!/bin/sh
set -eu
# This checks local service readiness without contacting the model provider.
exec curl --fail --silent --show-error --max-time 3 http://127.0.0.1:4000/readyz -o /dev/null
