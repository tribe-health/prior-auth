export async function recordUnhandledRejectionCheck(
  checks: Record<string, boolean>,
  unhandledRejections: readonly string[],
  expectedRejections: readonly string[] = [],
  afterBehaviorChecks?: () => void,
): Promise<void> {
  afterBehaviorChecks?.();
  await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
  checks.noUnexpectedUnhandledRejections =
    unhandledRejections.length === 0 ||
    (unhandledRejections.length === 1 &&
      expectedRejections.length === 1 &&
      unhandledRejections[0] === expectedRejections[0]);
}

export async function completeTeardownAndRecordUnhandledRejectionCheck(
  checks: Record<string, boolean>,
  unhandledRejections: readonly string[],
  teardown: () => Promise<void>,
  expectedRejections: readonly string[] = [],
): Promise<unknown | undefined> {
  let teardownFailure: unknown;
  try {
    await teardown();
  } catch (error) {
    teardownFailure = error;
  }
  checks.finalTeardown = teardownFailure === undefined;
  await recordUnhandledRejectionCheck(
    checks,
    unhandledRejections,
    expectedRejections,
  );
  return teardownFailure;
}

export function outcomeFromChecks(
  checks: Record<string, boolean>,
): { exitCode: 0 | 1; result: "Failed" | "Passed" } {
  const passed = Object.values(checks).every(Boolean);
  return passed
    ? { exitCode: 0, result: "Passed" }
    : { exitCode: 1, result: "Failed" };
}

export function outcomeFromFailureChecks(
  checks: Record<string, boolean>,
  facadeCapabilityGap: boolean,
): { exitCode: 1 | 2; result: "Blocked" | "Failed" } {
  const cleanFailure = Object.values(checks).every(Boolean);
  return facadeCapabilityGap && cleanFailure
    ? { exitCode: 2, result: "Blocked" }
    : { exitCode: 1, result: "Failed" };
}

export async function createOwnedResource<T>(
  create: () => Promise<T>,
  own: (resource: T) => void,
  initialize: (resource: T) => Promise<void>,
): Promise<T> {
  const resource = await create();
  own(resource);
  await initialize(resource);
  return resource;
}

interface FacadeFailureObservation {
  bodyPreview: string;
  path: string;
  query: Record<string, string[]>;
  status: number;
}

export function exactLogFullFacadeRejection(
  failure: string,
  observations: readonly FacadeFailureObservation[],
): boolean {
  const failedObservations = observations.filter(
    (observation) => observation.status >= 400,
  );
  if (failedObservations.length !== 1) return false;
  const observation = failedObservations[0];
  const match = failure.match(
    /^HTTP Error 400 at (https?:\/\/\S+): parameter not allowed: log$/u,
  );
  if (match === null) return false;
  const url = new URL(match[1]);
  const failureQuery: Record<string, string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    failureQuery[key] = url.searchParams.getAll(key);
  }
  return observation.status === 400 &&
    observation.path === "/v1/shape" &&
    observation.bodyPreview === "parameter not allowed: log" &&
    observation.query.log?.length === 1 &&
    observation.query.log[0] === "full" &&
    url.pathname === observation.path &&
    JSON.stringify(failureQuery) === JSON.stringify(observation.query);
}
