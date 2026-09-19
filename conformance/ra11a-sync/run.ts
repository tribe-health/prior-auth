import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { electricSync } from "@electric-sql/pglite-sync";

import {
  PGLITE_SCHEMA_SQL,
  type PGliteTable,
} from "../../web/src/shared/sync/pglite-schema.ts";
import {
  completeTeardownAndRecordUnhandledRejectionCheck,
  createOwnedResource,
  exactLogFullFacadeRejection,
  outcomeFromFailureChecks,
  outcomeFromChecks,
} from "./report-gate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const CATALOG_PATH = resolve(ROOT, "docker/frf/shape-catalog.json");
const LOCKFILE_PATH = resolve(HERE, "pnpm-lock.yaml");
const COORDINATOR_PATH = resolve(ROOT, "scripts/test-ra11a-sync-conformance.py");
const EXECUTABLE_PATH = fileURLToPath(import.meta.url);
const LOCAL_INPUT_PATHS = [
  "conformance/ra11a-sync/package.json",
  "conformance/ra11a-sync/pnpm-lock.yaml",
  "conformance/ra11a-sync/pnpm-workspace.yaml",
  "conformance/ra11a-sync/report-gate.ts",
  "conformance/ra11a-sync/run.ts",
  "docker-compose.ra05.yaml",
  "docker-compose.yaml",
  "docker/flint-gate/config.ra05.yaml",
  "docker/frf/shape-catalog.json",
  "scripts/ra05-stack.sh",
  "scripts/ra06c_campaign_config.py",
  "scripts/test-authorized-shape-composition.py",
  "scripts/test-ra11a-sync-conformance.py",
  "versions.toml",
  "web/src/shared/sync/pglite-schema.ts",
  "web/package.json",
] as const;
const SUBSCRIPTION_KEY = "ra11a-multi-shape-v1";
const TABLE_ORDER: readonly PGliteTable[] = [
  "evidence_states",
  "cases",
  "documents",
  "case_evidence",
  "evidence_citations",
];
const DELETE_ORDER: readonly PGliteTable[] = [
  "evidence_citations",
  "case_evidence",
  "documents",
  "cases",
  "evidence_states",
];

interface Input {
  dataDir: string;
  expectedCounts: Record<PGliteTable, number>;
  gateUrl: string;
  sessionToken: string;
  timeoutMs: number;
}

interface HttpObservation {
  bodyPreview: string;
  method: string;
  path: string;
  query: Record<string, string[]>;
  responseHeaders: Record<string, string>;
  status: number;
}

interface MemoryPeak {
  heapUsedBytes: number;
  rssBytes: number;
}

interface PhaseResult {
  counts: Record<PGliteTable, number>;
  metadataRows: number;
  relationshipViolations: number;
}

interface Report {
  candidate: Record<string, string>;
  checks: Record<string, boolean>;
  committedBoundary: PhaseResult | null;
  elapsedMs: number;
  execution: {
    coordinatorSha256: string;
    executableSha256: string;
    localInputs: Record<string, string>;
    lockfileSha256: string;
    packageArtifacts: Record<string, { entrySha256: string; version: string }>;
  };
  failure?: string;
  failureClass?: string;
  http: HttpObservation[];
  memory: {
    baseline: MemoryPeak;
    incrementalPeak: MemoryPeak;
    peak: MemoryPeak;
  };
  refetchCallbacks: number;
  result: "Blocked" | "Failed" | "Passed";
  unhandledRejections: string[];
}

class FacadeCapabilityError extends Error {
  readonly name = "FacadeCapabilityError";
}

function createDatabase(dataDir: string) {
  return PGlite.create(dataDir, { extensions: { sync: electricSync() } });
}

type SyncDatabase = Awaited<ReturnType<typeof createDatabase>>;

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function packageAttestation(
  name: string,
  packageRoot: string,
  resolvedEntry?: string,
): Promise<{ entrySha256: string; version: string }> {
  const metadata = JSON.parse(
    await readFile(resolve(packageRoot, "package.json"), "utf8"),
  ) as {
    exports?: { "."?: { import?: { default?: unknown } } };
    name?: unknown;
    version?: unknown;
  };
  if (metadata.name !== name || typeof metadata.version !== "string") {
    throw new Error(`${name} installed package metadata is invalid`);
  }
  let entry = resolvedEntry;
  if (entry === undefined) {
    const relativeEntry = metadata.exports?.["."]?.import?.default;
    if (typeof relativeEntry !== "string") {
      throw new Error(`${name} has no ESM export entry`);
    }
    entry = resolve(packageRoot, relativeEntry);
  }
  return { entrySha256: await sha256(entry), version: metadata.version };
}

async function installedClosure(): Promise<{
  candidate: Record<string, string>;
  packageArtifacts: Record<string, { entrySha256: string; version: string }>;
}> {
  const pgliteEntry = fileURLToPath(import.meta.resolve("@electric-sql/pglite"));
  const syncEntry = fileURLToPath(import.meta.resolve("@electric-sql/pglite-sync"));
  const pgliteRoot = resolve(dirname(pgliteEntry), "..");
  const syncRoot = resolve(dirname(syncEntry), "..");
  const packageArtifacts = {
    "@electric-sql/client": await packageAttestation(
      "@electric-sql/client",
      resolve(syncRoot, "../client"),
    ),
    "@electric-sql/experimental": await packageAttestation(
      "@electric-sql/experimental",
      resolve(syncRoot, "../experimental"),
    ),
    "@electric-sql/pglite": await packageAttestation(
      "@electric-sql/pglite",
      pgliteRoot,
      pgliteEntry,
    ),
    "@electric-sql/pglite-sync": await packageAttestation(
      "@electric-sql/pglite-sync",
      syncRoot,
      syncEntry,
    ),
  };
  const versions: Record<string, string> = {};
  for (const [name, artifact] of Object.entries(packageArtifacts)) {
    versions[name] = artifact.version;
  }
  return { candidate: versions, packageArtifacts };
}

function checkInput(value: unknown): Input {
  if (typeof value !== "object" || value === null) {
    throw new Error("stdin must contain one JSON configuration object");
  }
  const candidate = value as Partial<Input>;
  if (
    typeof candidate.dataDir !== "string" ||
    typeof candidate.gateUrl !== "string" ||
    typeof candidate.sessionToken !== "string" ||
    candidate.sessionToken.length < 16 ||
    typeof candidate.timeoutMs !== "number" ||
    candidate.timeoutMs <= 0 ||
    typeof candidate.expectedCounts !== "object" ||
    candidate.expectedCounts === null
  ) {
    throw new Error("stdin configuration has an invalid shape");
  }
  for (const table of TABLE_ORDER) {
    const count = candidate.expectedCounts[table];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`expectedCounts.${table} must be a non-negative integer`);
    }
  }
  return candidate as Input;
}

async function readInput(): Promise<Input> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return checkInput(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

let runtimeSecrets: readonly string[] = [];

function redact(value: string): string {
  let redacted = value.replace(/Bearer\s+[^\s"']+/giu, "Bearer [REDACTED]");
  for (const secret of runtimeSecrets) {
    redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redact(message);
}

const unhandledRejections: string[] = [];
process.on("unhandledRejection", (error) => {
  unhandledRejections.push(safeError(error));
});

function memoryPeak(current: MemoryPeak, sample = process.memoryUsage()): MemoryPeak {
  return {
    heapUsedBytes: Math.max(current.heapUsedBytes, sample.heapUsed),
    rssBytes: Math.max(current.rssBytes, sample.rss),
  };
}

function responseHeaders(response: Response): Record<string, string> {
  const names = [
    "content-type",
    "electric-cursor",
    "electric-handle",
    "electric-offset",
    "electric-schema",
    "electric-up-to-date",
  ];
  return Object.fromEntries(
    names
      .map(
        (name) =>
          [name, response.headers.get(name)] as readonly [string, string | null],
      )
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  );
}

function redactedResponseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(
    Object.entries(responseHeaders(response)).map(([name, value]) => [
      name,
      redact(value),
    ]),
  );
}

function observedFetch(observations: HttpObservation[]): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const response = await fetch(request);
    const query: Record<string, string[]> = {};
    for (const key of new Set(url.searchParams.keys())) {
      query[redact(key)] = url.searchParams.getAll(key).map(redact);
    }
    observations.push({
      bodyPreview: redact(await response.clone().text()).slice(0, 240),
      method: request.method,
      path: redact(url.pathname),
      query,
      responseHeaders: redactedResponseHeaders(response),
      status: response.status,
    });
    return response;
  };
}

async function openDatabase(
  dataDir: string,
  own: (database: SyncDatabase) => void,
) {
  return createOwnedResource(
    () => createDatabase(dataDir),
    own,
    async (database) => {
      await database.exec(PGLITE_SCHEMA_SQL);
      await database.sync.initMetadataTables();
    },
  );
}

async function installAuditTriggers(pg: SyncDatabase): Promise<void> {
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS ra11a_commit_audit (
      table_name TEXT NOT NULL,
      local_txid BIGINT NOT NULL
    );
    CREATE OR REPLACE FUNCTION ra11a_record_commit() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO ra11a_commit_audit(table_name, local_txid)
      VALUES (TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, txid_current());
      RETURN COALESCE(NEW, OLD);
    END $$;
  `);
  for (const table of TABLE_ORDER) {
    await pg.exec(`
      DROP TRIGGER IF EXISTS ra11a_audit_commit ON "${table}";
      CREATE TRIGGER ra11a_audit_commit
      AFTER INSERT OR UPDATE OR DELETE ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION ra11a_record_commit();
    `);
  }
  await pg.exec(`
    DROP TRIGGER IF EXISTS ra11a_audit_commit
      ON electric.subscriptions_metadata;
    CREATE TRIGGER ra11a_audit_commit
    AFTER INSERT OR UPDATE OR DELETE ON electric.subscriptions_metadata
    FOR EACH ROW EXECUTE FUNCTION ra11a_record_commit();
  `);
}

async function countRows(pg: SyncDatabase, table: PGliteTable): Promise<number> {
  const result = await pg.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM "${table}"`,
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function inspectCommittedBoundary(pg: SyncDatabase): Promise<PhaseResult> {
  const counts = {} as Record<PGliteTable, number>;
  for (const table of TABLE_ORDER) {
    counts[table] = await countRows(pg, table);
  }
  const metadata = await pg.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM electric.subscriptions_metadata WHERE key = $1",
    [SUBSCRIPTION_KEY],
  );
  const relationships = await pg.query<{ count: string }>(`
    SELECT (
      SELECT count(*) FROM case_evidence ce
      LEFT JOIN cases c ON c.id = ce.case_id
      LEFT JOIN evidence_states es ON es.key = ce.state
      WHERE c.id IS NULL OR es.key IS NULL
    ) + (
      SELECT count(*) FROM evidence_citations ec
      LEFT JOIN case_evidence ce ON ce.id = ec.case_evidence_id
      LEFT JOIN documents d ON d.id = ec.document_id
      WHERE ce.id IS NULL OR d.id IS NULL
    ) AS count
  `);
  return {
    counts,
    metadataRows: Number(metadata.rows[0]?.count ?? "0"),
    relationshipViolations: Number(relationships.rows[0]?.count ?? "0"),
  };
}

async function hasCrossTableCommit(pg: SyncDatabase): Promise<boolean> {
  const result = await pg.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM (
      SELECT local_txid
      FROM ra11a_commit_audit
      GROUP BY local_txid
      HAVING count(DISTINCT table_name) = 6
    ) coherent
  `);
  return Number(result.rows[0]?.count ?? "0") > 0;
}

async function coherentRefetchCleanup(tx: Transaction): Promise<void> {
  for (const table of DELETE_ORDER) {
    await tx.exec(`DELETE FROM "${table}"`);
  }
}

async function synchronize(
  pg: SyncDatabase,
  config: Input,
  observations: HttpObservation[],
  onRefetch: () => void,
): Promise<void> {
  let cleanRefetchPerformed = false;
  let resolveInitial!: () => void;
  let rejectInitial!: (error: Error) => void;
  const completion = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveInitial = resolvePromise;
    rejectInitial = rejectPromise;
  });
  let subscription: Awaited<ReturnType<typeof pg.sync.syncShapesToTables>> | null = null;
  try {
    const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    for (const table of TABLE_ORDER) {
      if (!(table in catalog)) {
        throw new Error(`shape catalog is missing ${table}`);
      }
    }
    const fetchClient = observedFetch(observations);
    const onMustRefetch = async (tx: Transaction) => {
      onRefetch();
      if (!cleanRefetchPerformed) {
        await coherentRefetchCleanup(tx);
        cleanRefetchPerformed = true;
      }
    };
    subscription = await pg.sync.syncShapesToTables({
      key: SUBSCRIPTION_KEY,
      shapes: Object.fromEntries(
        TABLE_ORDER.map((table) => [
          table,
          {
            onMustRefetch,
            primaryKey: [table === "evidence_states" ? "key" : "id"],
            shape: {
              fetchClient,
              headers: {
                Authorization: () => `Bearer ${config.sessionToken}`,
              },
              params: { shape: table },
              subscribe: false,
              url: config.gateUrl,
            },
            table,
          },
        ]),
      ),
      onError: (error) => rejectInitial(new Error(safeError(error))),
      onInitialSync: resolveInitial,
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        completion,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`materializer timed out after ${config.timeoutMs} ms`)),
            config.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  } catch (error) {
    const failure = safeError(error);
    if (exactLogFullFacadeRejection(failure, observations)) {
      throw new FacadeCapabilityError(failure);
    }
    throw error;
  } finally {
    subscription?.unsubscribe();
  }
}

async function insertObsoleteRows(pg: SyncDatabase): Promise<void> {
  await pg.exec(`
    INSERT INTO cases(id, practice_id, status)
    VALUES ('00000000-0000-4000-8000-000000000011',
            '00000000-0000-4000-8000-000000000012', 'obsolete');
    INSERT INTO documents(
      id, practice_id, document_type_id, case_id, name, effective_date
    ) VALUES (
      '00000000-0000-4000-8000-000000000013',
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000014',
      '00000000-0000-4000-8000-000000000011', 'obsolete', '2000-01-01'
    );
    INSERT INTO case_evidence(
      id, practice_id, case_id, criterion_id, state
    ) VALUES (
      '00000000-0000-4000-8000-000000000015',
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000016', 'met'
    );
    INSERT INTO evidence_citations(
      id, practice_id, case_evidence_id, document_id, relevance
    ) VALUES (
      '00000000-0000-4000-8000-000000000017',
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000015',
      '00000000-0000-4000-8000-000000000013', 'supports'
    );
    UPDATE electric.subscriptions_metadata
    SET shape_metadata = (
      SELECT jsonb_object_agg(
        key,
        jsonb_set(value, '{handle}', to_jsonb('ra11a-fabricated-handle'::text))
      )
      FROM jsonb_each(shape_metadata)
    )
    WHERE key = '${SUBSCRIPTION_KEY}';
  `);
}

function exactCounts(
  actual: Record<PGliteTable, number>,
  expected: Record<PGliteTable, number>,
): boolean {
  return TABLE_ORDER.every((table) => actual[table] === expected[table]);
}

async function main(): Promise<number> {
  const started = performance.now();
  const config = await readInput();
  runtimeSecrets = [config.sessionToken, `Bearer ${config.sessionToken}`];
  const { candidate, packageArtifacts } = await installedClosure();
  const localInputs = Object.fromEntries(
    await Promise.all(
      LOCAL_INPUT_PATHS.map(async (path) => [path, await sha256(resolve(ROOT, path))]),
    ),
  );
  const execution = {
    coordinatorSha256: await sha256(COORDINATOR_PATH),
    executableSha256: await sha256(EXECUTABLE_PATH),
    localInputs,
    lockfileSha256: await sha256(LOCKFILE_PATH),
    packageArtifacts,
  };
  const baselineUsage = process.memoryUsage();
  const baseline = {
    heapUsedBytes: baselineUsage.heapUsed,
    rssBytes: baselineUsage.rss,
  };
  let peak = baseline;
  const observations: HttpObservation[] = [];
  let refetchCallbacks = 0;
  let committedBoundary: PhaseResult | null = null;
  const checks: Record<string, boolean> = {};
  const sampler = setInterval(() => {
    peak = memoryPeak(peak);
  }, 10);
  let pg: SyncDatabase | null = null;
  let failure: unknown;
  try {
    pg = await openDatabase(config.dataDir, (database) => { pg = database; });
    await installAuditTriggers(pg);
    await synchronize(pg, config, observations, () => refetchCallbacks++);
    committedBoundary = await inspectCommittedBoundary(pg);
    checks.initialCounts = exactCounts(
      committedBoundary.counts,
      config.expectedCounts,
    );
    checks.initialRelationships = committedBoundary.relationshipViolations === 0;
    checks.checkpointPresent = committedBoundary.metadataRows === 1;
    checks.crossTableTransaction = await hasCrossTableCommit(pg);
    checks.initialWithinTimeBudget = performance.now() - started <= 120_000;
    await pg.close();
    pg = null;

    pg = await openDatabase(config.dataDir, (database) => { pg = database; });
    await synchronize(pg, config, observations, () => refetchCallbacks++);
    const resumed = await inspectCommittedBoundary(pg);
    checks.resumeIsIdempotent =
      exactCounts(resumed.counts, config.expectedCounts) &&
      resumed.relationshipViolations === 0 &&
      resumed.metadataRows === 1;
    await insertObsoleteRows(pg);
    await pg.close();
    pg = null;

    pg = await openDatabase(config.dataDir, (database) => { pg = database; });
    await synchronize(pg, config, observations, () => refetchCallbacks++);
    const refetched = await inspectCommittedBoundary(pg);
    checks.fabricatedCheckpointRejected = refetchCallbacks > 0;
    checks.refetchIsCoherent =
      exactCounts(refetched.counts, config.expectedCounts) &&
      refetched.relationshipViolations === 0;
    peak = memoryPeak(peak);
    checks.memoryBudget =
      peak.rssBytes - baseline.rssBytes <= 512 * 1024 * 1024 &&
      peak.heapUsedBytes - baseline.heapUsedBytes <= 256 * 1024 * 1024;
  } catch (error) {
    failure = error;
  }

  const finalDatabase = pg;
  pg = null;
  const facadeFailure = failure instanceof FacadeCapabilityError;
  const failureMessage = failure === undefined ? undefined : safeError(failure);
  const teardownFailure = await completeTeardownAndRecordUnhandledRejectionCheck(
    checks,
    unhandledRejections,
    async () => {
      await finalDatabase?.close();
    },
    facadeFailure && failureMessage !== undefined ? [failureMessage] : [],
  );
  clearInterval(sampler);
  peak = memoryPeak(peak);

  const outcome = failure === undefined && teardownFailure === undefined
    ? outcomeFromChecks(checks)
    : outcomeFromFailureChecks(checks, facadeFailure);
  const teardownMessage = teardownFailure === undefined
    ? undefined
    : safeError(teardownFailure);
  const effectiveFailure = [
    failureMessage,
    teardownMessage === undefined
      ? undefined
      : `database teardown failed: ${teardownMessage}`,
  ].filter((message): message is string => message !== undefined).join("; ") ||
    "unexpected unhandled rejection";
  const report: Report = {
    candidate,
    checks,
    committedBoundary,
    elapsedMs: Math.round(performance.now() - started),
    execution,
    ...(outcome.result === "Passed"
      ? {}
      : {
          failure: effectiveFailure,
          failureClass: outcome.result === "Blocked"
            ? "authorized-shape-facade-protocol-incompatibility"
            : "conformance-harness-failure",
        }),
    http: observations,
    memory: {
      baseline,
      incrementalPeak: {
        heapUsedBytes: peak.heapUsedBytes - baseline.heapUsedBytes,
        rssBytes: peak.rssBytes - baseline.rssBytes,
      },
      peak,
    },
    refetchCallbacks,
    result: outcome.result,
    unhandledRejections,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return outcome.exitCode;
}

process.exitCode = await main();
