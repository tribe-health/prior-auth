import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const binary = process.env.IMPECCABLE_BIN;
if (!binary) { console.error('Impeccable native engine is not configured. Read project PRODUCT.md and DESIGN.md directly. Set IMPECCABLE_BIN only to an explicitly installed engine; this launcher never downloads a runtime.'); process.exit(127); }
const args = process.argv.slice(2);
if (args[0] === 'hooks' && args[1] === 'on') { console.error('Prometheus runs verification only at the complete phase boundary; per-edit native hooks are not installed.'); process.exit(2); }
const result = spawnSync(binary, args, { stdio: 'inherit', shell: false, env: { ...process.env, IMPECCABLE_SKILL_DIR: resolve(dirname(fileURLToPath(import.meta.url)), '..'), IMPECCABLE_SELF: 'node <skill-base-dir>/scripts/engine.mjs' } });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
