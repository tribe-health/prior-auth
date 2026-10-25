// TJ-ARCH-MOB-001 compliant
import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/native-helpers/docusaurus-scaffold.mts
import { copyFileSync, existsSync as existsSync2, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname as dirname2, join as join2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

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

// src/native-helpers/docusaurus-scaffold.mts
await main(() => {
  assert(process.argv.length === 6, "usage: node scaffold.mjs SITE_DIR SITE_NAME SITE_URL BASE_URL", 64);
  const [siteArg, name, url, base] = process.argv.slice(2);
  const site = resolve2(siteArg), assets = resolve2(dirname2(fileURLToPath(import.meta.url)), "../assets");
  assert(!existsSync2(site), `refusing to overwrite existing path: ${site}`);
  mkdirSync(dirname2(site), { recursive: true });
  npm(["exec", "--yes", "--package=create-docusaurus@3.10.1", "--", "create-docusaurus", basename(site), "classic", "--javascript", "--package-manager", "npm", "--skip-install"], dirname2(site));
  mkdirSync(join2(site, "scripts"), { recursive: true });
  rmSync(join2(site, "docusaurus.config.js"), { force: true });
  for (const [source, destination] of [["docusaurus.config.mjs", "docusaurus.config.mjs"], ["flat2.css", "src/css/custom.css"], ["index.jsx", "src/pages/index.js"], ["content-sources.yaml", "content-sources.yaml"], ["sanitize.mjs", "scripts/sanitize.mjs"]]) copyFileSync(join2(assets, source), join2(site, destination));
  copyFileSync(resolve2(assets, "../scripts/build-site.mjs"), join2(site, "scripts/build.mjs"));
  const configPath = join2(site, "docusaurus.config.mjs");
  const literal = (value) => JSON.stringify(value).slice(1, -1).replaceAll("'", "\\'");
  writeFileSync(configPath, text(configPath).replaceAll("__SITE_NAME__", () => literal(name)).replaceAll("__SITE_URL__", () => literal(url)).replaceAll("__BASE_URL__", () => literal(base)));
  const packagePath = join2(site, "package.json");
  const pkg = JSON.parse(text(packagePath));
  pkg.scripts = { ...pkg.scripts, sanitize: "node scripts/sanitize.mjs", build: "node scripts/build.mjs" };
  pkg.overrides = { ...pkg.overrides, "serialize-javascript": "7.0.5" };
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
  npm(["install", "--save-exact", "@docusaurus/core@3.10.1", "@docusaurus/preset-classic@3.10.1", "@docusaurus/theme-mermaid@3.10.1", "@mdx-js/react@3.1.1", "@easyops-cn/docusaurus-search-local@0.55.2", "mermaid@11.16.0"], site);
  npm(["install", "--package-lock-only"], site);
  console.log(`scaffolded ${site}; classify sources before replacing starter content`);
});
