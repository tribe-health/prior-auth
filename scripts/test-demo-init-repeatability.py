#!/usr/bin/env python3
"""Exercise demo identity reuse without reaching a database or identity server.

This checks shell orchestration only. SQL revision stability requires the local
Compose integration check against an existing synthetic case.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DemoInitRepeatability(unittest.TestCase):
    def test_repeat_init_preserves_identity_and_credentials(self):
        with tempfile.TemporaryDirectory() as folder:
            temp = Path(folder)
            curl = temp / "curl"
            curl.write_text("""#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ['DEMO_TEST_STATE'])
args = sys.argv[1:]
state = root / 'identity.json'
url = next(value for value in args if value.startswith('http'))
method = args[args.index('-X') + 1] if '-X' in args else 'GET'
with (root / 'calls.jsonl').open('a') as stream:
    stream.write(json.dumps({'method': method, 'url': url}) + '\\n')
if url.endswith('/health/ready'):
    print('{}')
elif method == 'GET':
    print('[' + state.read_text() + ']' if state.exists() else '[]')
elif method == 'POST':
    payload = json.loads(args[args.index('--data-binary') + 1])
    payload['id'] = '20000000-0000-4000-8000-000000000001'
    state.write_text(json.dumps(payload))
    print(json.dumps(payload))
else:
    raise SystemExit('Unexpected identity mutation')
""")
            psql = temp / "psql"
            psql.write_text("""#!/usr/bin/env python3
import os, pathlib, sys
root = pathlib.Path(os.environ['DEMO_TEST_STATE'])
with (root / 'database-identities.txt').open('a') as stream:
    stream.write(next(value for value in sys.argv if value.startswith('identity_id=')) + '\\n')
sys.stdin.read()
""")
            curl.chmod(0o755)
            psql.chmod(0o755)
            env = dict(os.environ, PATH=f"{temp}:{os.environ['PATH']}", DEMO_TEST_STATE=str(temp),
                       ASO_KRATOS_ADMIN_URL='http://synthetic.invalid',
                       ASO_DEMO_EMAIL='test@example.invalid', ASO_DEMO_PASSWORD='synthetic-original',
                       ASO_MIGRATION_DATABASE_URL='synthetic', ASO_RUNTIME_DATABASE_PASSWORD='synthetic',
                       ASO_AUTHORITY_DATABASE_PASSWORD='synthetic', ASO_GATE_AUTHORITY_DATABASE_PASSWORD='synthetic')
            subprocess.run(['sh', str(ROOT / 'docker/demo-init.sh')], env=env, check=True, capture_output=True)
            first = json.loads((temp / 'identity.json').read_text())
            env['ASO_DEMO_PASSWORD'] = 'synthetic-changed'
            subprocess.run(['sh', str(ROOT / 'docker/demo-init.sh')], env=env, check=True, capture_output=True)
            self.assertEqual(first, json.loads((temp / 'identity.json').read_text()))
            calls = [json.loads(line) for line in (temp / 'calls.jsonl').read_text().splitlines()]
            self.assertEqual(['POST'], [call['method'] for call in calls if call['method'] != 'GET'])
            identities = (temp / 'database-identities.txt').read_text().splitlines()
            self.assertEqual(2, len(identities))
            self.assertEqual(identities[0], identities[1])


if __name__ == '__main__':
    unittest.main()
