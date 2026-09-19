import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const report = { status: "Failed", checks: [], packages: [], dependencies: [], startedAt: new Date().toISOString() };
let output;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function flag(name) {
  const index = process.argv.indexOf(name);
  assert(index >= 0 && process.argv[index + 1], `${name} requires an absolute path`);
  const value = process.argv[index + 1];
  assert(isAbsolute(value), `${name} must be absolute`);
  return resolve(value);
}
function within(parent, child) {
  const path = relative(parent, child);
  return path !== "" && !path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path);
}
function digest(value, label) {
  assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), `${label} must be SHA256`);
}
async function fileIdentity(path) {
  const canonical = await realpath(path);
  assert((await stat(canonical)).isFile(), `Expected file: ${canonical}`);
  return { path: canonical, sha256: sha256(await readFile(canonical)) };
}
async function packageAt(entry, expectedName, consumer) {
  const canonicalEntry = await realpath(entry);
  assert(within(join(consumer, "node_modules"), canonicalEntry), `${expectedName} resolves outside consumer node_modules: ${canonicalEntry}`);
  let directory = dirname(canonicalEntry);
  while (within(consumer, directory)) {
    try {
      const manifestPath = join(directory, "package.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest.name === expectedName) {
        return { root: directory, entry: canonicalEntry, manifestPath, manifest };
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    directory = dirname(directory);
  }
  throw new Error(`Cannot locate installed manifest for ${expectedName}`);
}
async function installedCoreRoots(consumer) {
  const boundary = join(consumer, "node_modules");
  const directories = [boundary];
  const visited = new Set();
  const roots = new Set();
  while (directories.length) {
    const directory = await realpath(directories.pop());
    assert(directory === boundary || within(boundary, directory),
      `Installed dependency directory aliases outside consumer node_modules: ${directory}`);
    if (visited.has(directory)) continue;
    visited.add(directory);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.name === "package.json" && !entry.isDirectory()) {
        const manifestPath = await realpath(path);
        assert(within(boundary, manifestPath), `Installed manifest aliases outside consumer node_modules: ${manifestPath}`);
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        if (manifest.name === "@prometheus-ags/entity-graph-core") roots.add(directory);
      }
      if (entry.isDirectory() || (entry.isSymbolicLink() && (await stat(path)).isDirectory())) directories.push(path);
    }
  }
  return { count: roots.size, paths: [...roots].sort(), directoriesVisited: visited.size };
}
function parseLock(path) {
  const parser = spawnSync("python3", ["-c", [
    "import json, sys, yaml",
    "with open(sys.argv[1], encoding='utf-8') as stream: data = yaml.safe_load(stream)",
    "print(json.dumps({'parser': {'tool': 'PyYAML.safe_load', 'version': yaml.__version__, 'executable': sys.executable}, 'data': data}))",
  ].join("\n"), path], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert(!parser.error && parser.status === 0, `Lock parser failed: ${parser.error ?? parser.stderr}`);
  const parsed = JSON.parse(parser.stdout);
  assert.equal(parsed.parser.version, "6.0.2", "Lock parser must use the verified PyYAML version");
  return parsed;
}
async function installedPackageFiles(root) {
  const files = [];
  const directories = [root];
  while (directories.length) {
    const directory = directories.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(path);
      else files.push(relative(root, path).split(sep).join("/"));
    }
  }
  return files.sort();
}
try {
  // Resolve output first so later prerequisite failures still produce a receipt.
  output = flag("--output");
  const consumer = await realpath(flag("--consumer"));
  const candidatePath = await realpath(flag("--candidate"));
  const candidateBytes = await readFile(candidatePath);
  const candidate = JSON.parse(candidateBytes.toString("utf8"));
  assert(typeof candidate.version === "string" && candidate.version.length > 0, "Candidate version is required");
  assert(typeof candidate.source_revision === "string" && candidate.source_revision.length > 0, "Candidate source revision is required");
  digest(candidate.source_digest, "Candidate source digest");
  report.consumer = consumer;
  report.candidate = { path: candidatePath, sha256: sha256(candidateBytes), version: candidate.version,
    source_revision: candidate.source_revision, source_digest: candidate.source_digest };
  const consumerManifestPath = join(consumer, "package.json");
  const consumerManifest = JSON.parse(await readFile(consumerManifestPath, "utf8"));
  report.consumerManifest = await fileIdentity(consumerManifestPath);
  report.lock = await fileIdentity(join(consumer, "pnpm-lock.yaml"));
  const parsedLock = parseLock(report.lock.path);
  report.lock.parser = parsedLock.parser;
  const lock = parsedLock.data;
  const importer = lock?.importers?.["."]?.dependencies;
  assert(importer && lock.packages && lock.snapshots, "Lock must contain root importer, packages, and snapshots");
  const consumerRequire = createRequire(consumerManifestPath);
  const names = ["@prometheus-ags/entity-graph-core", "@prometheus-ags/entity-graph-react"];
  assert(Array.isArray(candidate.packages) && candidate.packages.length === names.length,
    "Candidate must inventory exactly core and React");
  const installed = new Map();
  for (const name of names) {
    const matches = candidate.packages.filter((entry) => entry.name === name);
    assert.equal(matches.length, 1, `Candidate package inventory for ${name} must be unique`);
    const expected = matches[0];
    assert.equal(expected.version, candidate.version, `${name} candidate version mismatch`);
    assert(isAbsolute(expected.tarball), `${name} tarball path must be absolute`);
    digest(expected.sha256, `${name} tarball hash`);
    const tarball = await fileIdentity(expected.tarball);
    assert.equal(tarball.sha256, expected.sha256, `${name} tarball bytes differ from candidate`);
    const declaration = consumerManifest.dependencies?.[name];
    assert(typeof declaration === "string", `Consumer must directly depend on ${name}`);
    const locked = importer[name];
    assert(locked && typeof locked.version === "string", `${name} lock importer is missing`);
    assert.equal(locked.specifier, declaration, `${name} lock specifier differs from consumer manifest`);
    const bareVersion = locked.version.split("(")[0];
    assert(/^file:.+\.(tgz|tar\.gz)$/.test(bareVersion), `${name} lock version must resolve a packed tarball`);
    assert.equal(await realpath(resolve(consumer, bareVersion.slice(5))), tarball.path,
      `${name} lock importer resolves a different candidate tarball`);
    const packageKey = `${name}@${bareVersion}`;
    const lockedPackage = lock.packages[packageKey];
    assert(lockedPackage, `${name} lock package entry is missing`);
    assert.equal(lockedPackage.version, candidate.version, `${name} lock package version differs from candidate`);
    assert(typeof lockedPackage.resolution?.tarball === "string" && lockedPackage.resolution.tarball.startsWith("file:"),
      `${name} lock resolution must name a local candidate tarball`);
    assert.equal(await realpath(resolve(consumer, lockedPackage.resolution.tarball.slice(5))), tarball.path,
      `${name} lock resolution names a different candidate tarball`);
    const integrity = `sha512-${createHash("sha512").update(await readFile(tarball.path)).digest("base64")}`;
    assert.equal(lockedPackage.resolution.integrity, integrity, `${name} lock integrity differs from candidate tarball bytes`);
    const snapshotKey = `${name}@${locked.version}`;
    assert(lock.snapshots[snapshotKey], `${name} lock snapshot is missing`);
    if (declaration.startsWith("file:")) {
      assert(/\.(tgz|tar\.gz)$/.test(declaration), `${name} dependency must name a packed tarball, not source`);
      const declaredTarball = await realpath(resolve(consumer, declaration.slice("file:".length)));
      assert.equal(declaredTarball, tarball.path, `${name} dependency names a different candidate artifact`);
    } else {
      assert.equal(declaration, candidate.version, `${name} dependency must use exact candidate version or tarball; source aliases are forbidden`);
    }
    const actual = await packageAt(consumerRequire.resolve(name), name, consumer);
    installed.set(name, actual);
    assert.equal(actual.manifest.version, expected.version, `${name} installed version differs from candidate`);
    assert.equal(relative(actual.root, actual.entry), join("dist", "index.mjs"), `${name} must resolve public packaged ESM entry`);
    assert(Array.isArray(expected.files) && expected.files.length > 0, `${name} candidate file inventory is required`);
    const seen = new Set();
    const evidence = { name, version: actual.manifest.version, declaration, packageRoot: actual.root,
      entry: await fileIdentity(actual.entry), tarball, peerDependencies: actual.manifest.peerDependencies ?? {}, files: [],
      lock: { specifier: locked.specifier, version: locked.version, packageKey, snapshotKey, integrity, resolution: lockedPackage.resolution } };
    report.packages.push(evidence);
    for (const file of expected.files) {
      assert(typeof file.path === "string" && file.path.length > 0 && !isAbsolute(file.path), "Inventory path must be package-relative");
      assert(!seen.has(file.path), `Duplicate candidate file ${name}/${file.path}`);
      seen.add(file.path);
      digest(file.sha256, `${name}/${file.path} hash`);
      const target = resolve(actual.root, file.path);
      assert(within(actual.root, target), `Inventory path escapes package: ${file.path}`);
      const identity = await fileIdentity(target);
      assert(within(actual.root, identity.path), `Installed file aliases external source: ${file.path}`);
      evidence.files.push({ path: file.path, installedPath: identity.path, sha256: identity.sha256, expectedSha256: file.sha256 });
      assert.equal(identity.sha256, file.sha256, `Installed bytes differ from candidate: ${name}/${file.path}`);
    }
    assert(seen.has("package.json") && seen.has("dist/index.mjs"), `${name} inventory must include manifest and public entry`);
    evidence.installedFiles = await installedPackageFiles(actual.root);
    evidence.extraFiles = evidence.installedFiles.filter((path) => !seen.has(path));
    evidence.missingFiles = [...seen].filter((path) => !evidence.installedFiles.includes(path));
    assert.equal(evidence.extraFiles.length, 0, `${name} has un-inventoried installed files: ${evidence.extraFiles.join(", ")}`);
    assert.equal(evidence.missingFiles.length, 0, `${name} installed file inventory is incomplete`);
    report.checks.push(`${name} version, tarball, manifest, and every inventoried installed file match candidate`);
  }
  const reactSnapshot = lock.snapshots[`${names[1]}@${importer[names[1]].version}`];
  assert.equal(reactSnapshot.dependencies?.[names[0]], importer[names[0]].version,
    "React lock snapshot must link the exact consumer core importer version");
  report.lock.reactCoreLink = reactSnapshot.dependencies[names[0]];
  report.checks.push("Lock importer, candidate versions, canonical tarballs, SHA512 integrity, and React core snapshot link are consistent");
  const core = installed.get(names[0]);
  const react = installed.get(names[1]);
  report.installedCorePackages = await installedCoreRoots(consumer);
  assert.equal(report.installedCorePackages.count, 1,
    "Hidden alternate core packages detected: expected exactly one canonical installed core package");
  assert.equal(report.installedCorePackages.paths[0], core.root,
    "Installed core inventory must contain only the resolved candidate package");
  report.checks.push("Full node_modules inventory, including .pnpm and symlinks, contains exactly one canonical candidate core package");
  assert.equal(react.manifest.peerDependencies?.[names[0]], candidate.version, "React must require exact candidate core peer");
  const reactRequire = createRequire(react.entry);
  const coreFromReact = await realpath(reactRequire.resolve(names[0]));
  assert.equal(coreFromReact, core.entry, "Consumer and React must resolve the same canonical core entry");
  const devtools = await packageAt(consumerRequire.resolve(`${names[0]}/devtools`), names[0], consumer);
  assert.equal(devtools.root, core.root, "Core/devtools must resolve the same installed core package");
  assert.equal(await realpath(reactRequire.resolve(`${names[0]}/devtools`)), devtools.entry,
    "React and consumer must resolve identical core/devtools entry");
  report.resolution = { coreFromConsumer: core.entry, coreFromReact, coreDevtools: await fileIdentity(devtools.entry), reactEntry: react.entry };
  report.checks.push("Consumer, React, and core/devtools share canonical installed core package paths");

  for (const [name, version] of [["react", "19.2.0"], ["react-dom", "19.2.0"], ["@electric-sql/pglite", null]]) {
    const actual = await packageAt(consumerRequire.resolve(name), name, consumer);
    if (version) {
      assert.equal(actual.manifest.version, version, `${name} must preserve ASO ${version}`);
      assert.equal(consumerManifest.dependencies?.[name], version, `${name} manifest must retain exact ASO pin`);
      assert.equal(await realpath(reactRequire.resolve(name)), actual.entry, `PEM React must share consumer ${name}`);
    }
    report.dependencies.push({ name, version: actual.manifest.version, entry: await fileIdentity(actual.entry) });
  }
  report.checks.push("ASO React 19.2.0 and ReactDOM 19.2.0 pins remain exact; PGlite is installed locally");

  // Import only after candidate byte checks; the public exports must retain shared identity.
  const coreExports = await import(pathToFileURL(core.entry).href);
  const reactExports = await import(pathToFileURL(react.entry).href);
  assert(coreExports.graphStore && typeof coreExports.graphStore.getState === "function", "Core graphStore must be operational");
  const requiredFactories = ["createGraphStore", "createRuntimeScope", "createGraphSyncStatusStore",
    "createGraphActionScope", "startScopedLocalFirstGraph", "createCommittedReplicaProjector"];
  for (const name of requiredFactories) {
    assert.equal(typeof coreExports[name], "function", `Core ${name} must be a public factory`);
    assert.equal(typeof reactExports[name], "function", `React ${name} must re-export the public factory`);
  }
  // Core exposes its vanilla store alias; React intentionally supplies its own
  // context-aware hook from src/graph-store.ts under the same export name.
  const intentionalOverrides = {
    useGraphStore: "React provides its context-aware hook; core exposes the vanilla graph store alias.",
  };
  assert.equal(typeof reactExports.useGraphStore, "function", "React useGraphStore must remain a hook");
  assert.equal(coreExports.useGraphStore, coreExports.graphStore, "Core useGraphStore must remain the vanilla store alias");
  const commonNames = Object.keys(coreExports).filter((name) => Object.hasOwn(reactExports, name)).sort();
  const checkedNames = commonNames.filter((name) => !Object.hasOwn(intentionalOverrides, name));
  for (const name of checkedNames) {
    assert.equal(coreExports[name], reactExports[name], `Public core/React ${name} identity differs`);
  }
  report.exportIdentity = { graphStore: true, createGraphStore: true, createCommittedReplicaProjector: true,
    commonExportCount: commonNames.length, checkedCount: checkedNames.length, checkedNames, intentionalOverrides, requiredFactories };
  report.checks.push("Every shared public core/React re-export has identical identity, excluding the verified intentional React useGraphStore override");
  report.status = "Passed";
  process.stdout.write(`[ra09-pem-consumer] Passed: ${report.checks.length} installed candidate checks\n`);
} catch (error) {
  report.error = { message: String(error), stack: error?.stack };
  process.stderr.write(`[ra09-pem-consumer] Failed: ${String(error)}\n`);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  if (output) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
}
