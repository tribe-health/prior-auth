// TJ-ARCH-MOB-001 compliant
import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/native-helpers/docusaurus-verify.mts
import { existsSync as existsSync2 } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";

// src/native-helpers/common.mts
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
var ToolError = class extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
  code;
};
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, env: options.env ?? process.env, encoding: "utf8", stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit", shell: false, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new ToolError(`required tool failed: ${command}: ${result.error.message}`, 127);
  if (result.status !== 0 && !options.allowFailure) throw new ToolError(`${command} failed (${result.status ?? result.signal})${result.stderr ? `: ${result.stderr.trim()}` : ""}`, result.status ?? 1);
  return result.status === 0 ? result.stdout ?? "" : "";
}
function npm(args, cwd) {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    candidates.push(join(dir, "node_modules/npm/bin/npm-cli.js"));
    const command = join(dir, "npm");
    if (existsSync(command)) {
      const real = realpathSync(command);
      if (real.endsWith("npm-cli.js")) candidates.push(real);
    }
  }
  const entry = candidates.find((candidate) => Boolean(candidate && candidate.endsWith("npm-cli.js") && existsSync(candidate)));
  if (!entry) throw new ToolError("npm JavaScript entrypoint not found; install Node.js with npm or set npm_execpath to npm-cli.js", 127);
  run(process.execPath, [entry, ...args], { cwd });
}
function files(root) {
  if (!existsSync(root)) throw new ToolError(`required directory not found: ${root}`);
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => entry.isDirectory() ? files(join(root, entry.name)) : entry.isFile() ? [join(root, entry.name)] : []);
}
function text(path) {
  return readFileSync(path, "utf8");
}
function assert(condition, message, code = 1) {
  if (!condition) throw new ToolError(message, code);
}
async function main(fn) {
  try {
    await fn();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error instanceof ToolError ? error.code : 1;
  }
}

// src/native-helpers/docusaurus-verify.mts
await main(() => {
  const site = resolve2(process.argv[2] ?? "site");
  assert(existsSync2(join2(site, "package-lock.json")), `missing package-lock.json: ${site}`);
  npm(["ci"], site);
  npm(["run", "sanitize"], site);
  npm(["run", "build"], site);
  for (const file of files(join2(site, "build"))) assert(!/\/Users\/|\.prometheus\/|BEGIN .*PRIVATE KEY/.test(text(file)), `private material found in site output: ${file}`);
  console.log("branded Docusaurus verification passed");
});
