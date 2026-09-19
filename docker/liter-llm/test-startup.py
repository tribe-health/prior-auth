"""Local startup boundary checks using synthetic credentials and a CLI stub."""
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib


root = Path(__file__).resolve().parent
config = tomllib.loads((root / "proxy.toml").read_text())
assert "cache" not in config
assert "master_key" not in config["general"]
assert len(config["models"]) == 1
assert config["models"][0]["fallbacks"] == []
assert config["keys"][0]["models"] == ["qwen3.8-max"]

with tempfile.TemporaryDirectory(prefix="aso-liter-startup-") as directory:
    stub = Path(directory) / "liter-llm"
    stub.write_text("""#!/bin/sh
set -eu
[ "$RUST_LOG" = off ]
[ -z "${LITER_LLM_MASTER_KEY:-}" ]
[ -z "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]
[ "$QWEN_TOKEN_PLAN_MODEL" = qwen3.8-max ]
[ "$QWEN_TOKEN_PLAN_OPENAI_URL" = https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1 ]
[ "$*" = 'api --config /etc/liter-llm/proxy.toml --host 0.0.0.0 --port 4000' ]
""")
    stub.chmod(0o700)
    baseline = {
        "PATH": directory + os.pathsep + os.defpath,
        "ASO_LITER_DATA_CLASS": "synthetic",
        "QWEN_TOKEN_PLAN_API_KEY": "synthetic-provider-key",
        "ASO_LITER_SYNTHETIC_KEY": "synthetic-internal-key",
        "LITER_LLM_MASTER_KEY": "unwanted-master-key",
        "OTEL_EXPORTER_OTLP_ENDPOINT": "https://unwanted-exporter.invalid",
        "RUST_LOG": "trace",
    }
    scenarios = [
        ({}, True),
        ({"ASO_LITER_DATA_CLASS": "production"}, False),
        ({"ASO_LITER_DATA_CLASS": ""}, False),
        ({"QWEN_TOKEN_PLAN_API_KEY": ""}, False),
        ({"ASO_LITER_SYNTHETIC_KEY": ""}, False),
        ({"ASO_LITER_SYNTHETIC_KEY": "synthetic-provider-key"}, False),
        ({"QWEN_TOKEN_PLAN_API_KEY": 'synthetic-"-key'}, False),
        ({"ASO_LITER_SYNTHETIC_KEY": "synthetic-\n-key"}, False),
        ({"QWEN_TOKEN_PLAN_MODEL": "other-model"}, False),
        ({"QWEN_TOKEN_PLAN_OPENAI_URL": "https://other-provider.invalid/v1"}, False),
    ]
    for overrides, accepted in scenarios:
        environment = baseline | overrides
        result = subprocess.run(
            ["/bin/sh", str(root / "start.sh")],
            env=environment, capture_output=True, text=True, check=False,
        )
        assert (result.returncode == 0) == accepted
        assert not result.stdout
        for key in ("QWEN_TOKEN_PLAN_API_KEY", "ASO_LITER_SYNTHETIC_KEY"):
            value = environment[key]
            if value:
                assert value not in result.stderr

print("Liter startup boundary: Passed (10 scenarios; configuration assertions)")
