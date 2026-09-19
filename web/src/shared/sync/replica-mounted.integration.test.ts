// @vitest-environment node

import { readFile, writeFile } from "node:fs/promises";

import type { CommittedReplicaProjector } from "@prometheus-ags/entity-graph-core";
import { afterEach, describe, expect, it } from "vitest";

import { subscribeSessionRevocation } from "../session-revocation-events";
import {
  ReplicaAuthorityFailure,
  startReplicaRuntime,
} from "./replica-runtime";
import { currentGeneration } from "./migration-ledger";
import {
  REPLICA_SHAPES,
  REPLICA_TARGETS,
  createPGliteCheckpointStore,
  entityTypeFor,
} from "./replica-wiring";
import {
  ReplicaWorkerOwner,
  type ExclusiveLockManager,
} from "./replica-worker-owner";
import {
  authorizedTransport,
  captureRevision,
  closeMountedClients,
  closeRuntime,
  counts,
  expectedCheckpointShapes,
  expectedCounts,
  expectedEvidenceStateIds,
  markProgress,
  mounted,
  mountedPhase,
  openRuntime,
  required,
  restartStatePath,
  revisionHas,
  serverSql,
  storageKey,
  sync,
  trackProcessMemory,
  waitFor,
  type RestartState,
} from "./replica-mounted-runtime";

afterEach(closeMountedClients);

describe("mounted RA11c SQL materialization", () => {
  const initialIt = mounted && mountedPhase === "initial" ? it : it.skip;
  const continuationIt = mounted && mountedPhase === "continuation" ? it : it.skip;

  initialIt("commits the initial graph and rolls back a captured revision before process restart", async () => {
    await markProgress("opening-initial-runtime");
    const memory = trackProcessMemory();
    memory.enter("open-runtime");
    const runtime = await openRuntime();
    const coldRevision = await authorizedTransport().fetch(null);
    expect(coldRevision).not.toBeNull();
    expect(coldRevision?.mustRefetch).not.toBe(true);
    await expect(startReplicaRuntime({
      client: runtime.client,
      transport: { async fetch() { return coldRevision; } },
      checkpoints: {
        async read() { return { value: null, checkpoint: null }; },
        async write() { throw new Error("synthetic crash before cold checkpoint commit"); },
      },
      projector: runtime.projector,
      lease: runtime.lease,
      ownership: "held",
      leaseLifetime: "caller",
      storageKey,
      targets: REPLICA_TARGETS,
      checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
      entityTypeFor,
    })).rejects.toThrow("synthetic crash before cold checkpoint commit");
    const coldCrashCounts = await counts(runtime.client);
    const coldCrashCheckpoint = (
      await createPGliteCheckpointStore(runtime.client).read(storageKey)
    ).checkpoint;
    const coldCrashLeftNoPartialBatch = Object.values(coldCrashCounts).every((count) => count === 0)
      && coldCrashCheckpoint === null
      && Object.keys(runtime.store.getState().entities).length === 0
      && Object.keys(runtime.store.getState().lists).length === 0;
    expect(coldCrashLeftNoPartialBatch).toBe(true);
    memory.enter("initial-sync");
    let parityObservedBeforeReadiness = false;
    await sync(runtime, authorizedTransport(), () => {
      const projected = runtime.store.getState();
      parityObservedBeforeReadiness = runtime.graph.getStatus().isSynced === false
        && Object.entries(expectedCounts).every(([table, expected]) => {
          const type = entityTypeFor(table);
          return Object.keys(projected.entities[type] ?? {}).length === expected
            && projected.lists[`replica:${table}`]?.ids.length === expected;
        });
    });
    expect(parityObservedBeforeReadiness).toBe(true);
    memory.sample("initial-sync");
    expect(await counts(runtime.client)).toEqual(expectedCounts);
    const initial = runtime.store.getState();
    for (const [table, expected] of Object.entries(expectedCounts)) {
      const type = entityTypeFor(table);
      expect(Object.keys(initial.entities[type] ?? {})).toHaveLength(expected);
      expect(initial.lists[`replica:${table}`]?.ids).toHaveLength(expected);
    }
    expect(Object.keys(initial.entities.EvidenceState ?? {}).sort()).toEqual(expectedEvidenceStateIds);
    expect(runtime.graph.getStatus()).toMatchObject({ phase: "ready", isSynced: true });

    const selectedCase = await runtime.client.query<{ id: string }>("SELECT id::text AS id FROM cases ORDER BY id LIMIT 1");
    const caseId = selectedCase.rows[0]!.id;
    const durable = createPGliteCheckpointStore(runtime.client);
    const checkpoint = (await durable.read(storageKey)).checkpoint!;
    expect(Object.keys(checkpoint.shapes).sort()).toEqual(expectedCheckpointShapes);
    serverSql(`
      BEGIN;
      UPDATE aso.cases SET status='policy_review', updated_at=now()
        WHERE id='${caseId}'::uuid;
      SELECT set_config('aso.kratos_identity_id', u.kratos_identity_id::text, true),
             set_config('aso.actor_id', u.id::text, true),
             set_config('aso.practice_id', c.practice_id::text, true),
             set_config('aso.principal', 'user', true),
             set_config('aso.session_expires_at', (clock_timestamp() + interval '5 minutes')::text, true)
        FROM aso.cases c JOIN aso.users u ON u.id = c.surgeon_id
        WHERE c.id='${caseId}'::uuid;
      SET LOCAL ROLE aso_gate_executor;
      SELECT aso.apply_gate_command(
        md5('${caseId}:ra11c:' || kind)::uuid,
        '${caseId}'::uuid,
        kind,
        'affirm'
      )
      FROM unnest(ARRAY['policy','section','pathway','plan']) kind;
      COMMIT;
    `);
    memory.enter("capture-revision");
    const update = await captureRevision(checkpoint, (revision) => revisionHas(revision, "cases", caseId));
    memory.enter("crash-rollback");
    await expect(startReplicaRuntime({
      client: runtime.client,
      transport: { async fetch() { return update; } },
      checkpoints: { read: durable.read, async write() { throw new Error("synthetic crash before checkpoint commit"); } },
      projector: runtime.projector,
      lease: runtime.lease,
      ownership: "held",
      leaseLifetime: "caller",
      storageKey,
      targets: REPLICA_TARGETS,
      checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
      entityTypeFor,
    })).rejects.toThrow("synthetic crash before checkpoint commit");
    const rolledBackStatus = (
      await runtime.client.query<{ status: string }>("SELECT status FROM cases WHERE id=$1", [caseId])
    ).rows[0]?.status;
    const rolledBackCheckpoint = (await durable.read(storageKey)).checkpoint;
    const crashRolledBackRowAndCheckpoint = rolledBackStatus === "evidence"
      && JSON.stringify(rolledBackCheckpoint) === JSON.stringify(checkpoint);
    expect(crashRolledBackRowAndCheckpoint).toBe(true);
    const failedAfterCommit: CommittedReplicaProjector = {
      getStatus: () => runtime.projector.getStatus(),
      advanceGeneration: (generation) => runtime.projector.advanceGeneration(generation),
      dispose: () => runtime.projector.dispose(),
      async publish(_batch, committed) {
        await committed;
        throw new Error("synthetic process death after SQL commit before graph publication");
      },
    };
    await expect(startReplicaRuntime({
      client: runtime.client,
      transport: { async fetch() { return update; } },
      checkpoints: durable,
      projector: failedAfterCommit,
      lease: runtime.lease,
      ownership: "held",
      leaseLifetime: "caller",
      storageKey,
      targets: REPLICA_TARGETS,
      checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
      entityTypeFor,
    })).rejects.toThrow("synthetic process death after SQL commit before graph publication");
    const committedStatus = (
      await runtime.client.query<{ status: string }>("SELECT status FROM cases WHERE id=$1", [caseId])
    ).rows[0]?.status;
    const committedCheckpoint = (await durable.read(storageKey)).checkpoint!;
    const expectedCommittedCheckpoint = {
      generation: await currentGeneration(runtime.client),
      shapes: update.checkpoint,
    };
    const sqlAndCheckpointCommittedBeforePublication = committedStatus === "policy_review"
      && JSON.stringify(committedCheckpoint) === JSON.stringify(expectedCommittedCheckpoint)
      && runtime.store.getState().entities.Case?.[caseId]?.status === "evidence";
    expect(sqlAndCheckpointCommittedBeforePublication).toBe(true);
    memory.sample("crash-rollback");
    const memoryReport = memory.finish();
    await writeFile(restartStatePath(), `${JSON.stringify({
      caseId,
      checkpoint: committedCheckpoint,
      initialMemory: memoryReport,
      parityObservedBeforeReadiness,
      coldCrashLeftNoPartialBatch,
      crashRolledBackRowAndCheckpoint,
      sqlAndCheckpointCommittedBeforePublication,
    } satisfies RestartState, null, 2)}\n`);
    await closeRuntime(runtime);
  }, 180_000);

  continuationIt("reopens durable SQL in a new process and fences owner disposal through replacement", async () => {
    const memory = trackProcessMemory();
    const state = JSON.parse(await readFile(restartStatePath(), "utf8")) as RestartState;
    const runtime = await openRuntime();
    const durableBeforeRevalidation = (await runtime.client.query<{ status: string; gate_affirmed: boolean }>(
      "SELECT status, gate_affirmed_at IS NOT NULL AS gate_affirmed FROM cases WHERE id=$1",
      [state.caseId],
    )).rows[0];
    expect(durableBeforeRevalidation).toEqual({ status: "policy_review", gate_affirmed: true });
    expect(runtime.store.getState().entities.Case?.[state.caseId]).toBeUndefined();
    const durableStateSurvivedRestart = durableBeforeRevalidation?.status === "policy_review"
      && durableBeforeRevalidation.gate_affirmed === true;
    let authorizedResponseObserved = false;
    const revalidatedTransport = authorizedTransport(async (input, init) => {
      const response = await fetch(input, init);
      authorizedResponseObserved = true;
      return response;
    });
    const restartProjector: CommittedReplicaProjector = {
      getStatus: () => runtime.projector.getStatus(),
      advanceGeneration: (generation) => runtime.projector.advanceGeneration(generation),
      dispose: () => runtime.projector.dispose(),
      async publish(batch, committed) {
        expect(authorizedResponseObserved).toBe(true);
        return runtime.projector.publish(batch, committed);
      },
    };
    const restartOutcome = await startReplicaRuntime({
      client: runtime.client,
      transport: revalidatedTransport,
      checkpoints: createPGliteCheckpointStore(runtime.client),
      projector: restartProjector,
      lease: runtime.lease,
      ownership: "held",
      leaseLifetime: "caller",
      storageKey,
      targets: REPLICA_TARGETS,
      checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
      entityTypeFor,
      onCaughtUp: () => runtime.graph.markServerCaughtUp(),
    });
    expect(restartOutcome).toMatchObject({ status: "syncing", resumed: true });
    memory.sample("restart-update");
    expect(runtime.store.getState().entities.Case?.[state.caseId]?.status).toBe("policy_review");
    expect(runtime.store.getState().entities.Case?.[state.caseId]?.gate_affirmed_at).not.toBeNull();
    const restartResumedWithoutSkip = state.sqlAndCheckpointCommittedBeforePublication
      && durableStateSurvivedRestart
      && authorizedResponseObserved
      && restartOutcome.status === "syncing"
      && restartOutcome.resumed
      && runtime.store.getState().entities.Case?.[state.caseId]?.status === "policy_review";
    expect(restartResumedWithoutSkip).toBe(true);

    const citation = await runtime.client.query<{ id: string }>("SELECT id::text AS id FROM evidence_citations ORDER BY id LIMIT 1");
    const citationId = citation.rows[0]!.id;
    const generationBeforeDelete = await currentGeneration(runtime.client);
    serverSql(`DELETE FROM aso.evidence_citations WHERE id='${citationId}'::uuid;`);
    await waitFor(runtime, async () => (
      await runtime.client.query<{ count: number }>("SELECT count(*)::int AS count FROM evidence_citations WHERE id=$1", [citationId])
    ).rows[0]?.count === 0, "delete replacement");
    memory.sample("delete-replacement");
    const deletedCitationCount = (
      await runtime.client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM evidence_citations WHERE id=$1",
        [citationId],
      )
    ).rows[0]?.count;
    const generationAfterDelete = await currentGeneration(runtime.client);
    const deleteForcedReplacement = deletedCitationCount === 0
      && runtime.store.getState().entities.EvidenceCitation?.[citationId] === undefined
      && !runtime.store.getState().lists["replica:evidence_citations"]?.ids.includes(citationId)
      && generationAfterDelete > generationBeforeDelete;
    expect(deleteForcedReplacement).toBe(true);

    const secondCase = await runtime.client.query<{ id: string }>("SELECT id::text AS id FROM cases WHERE id <> $1 ORDER BY id LIMIT 1", [state.caseId]);
    const secondCaseId = secondCase.rows[0]!.id;
    const beforeDispose = (await createPGliteCheckpointStore(runtime.client).read(storageKey)).checkpoint!;
    serverSql(`UPDATE aso.cases SET status='drafting', updated_at=now() WHERE id='${secondCaseId}'::uuid;`);
    const pendingRevision = await captureRevision(beforeDispose, (revision) => revisionHas(revision, "cases", secondCaseId));
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    const locks: ExclusiveLockManager = {
      async request(name, _options, callback) { await callback({ name }); },
    };
    const owner = new ReplicaWorkerOwner({
      locks,
      lockName: "ra11c-mounted-owner",
      factory: {
        async open(signal) {
          await startReplicaRuntime({
            client: runtime.client,
            transport: {
              async fetch() {
                requestStarted();
                await new Promise<void>((_resolve, reject) => {
                  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                });
                return pendingRevision;
              },
            },
            checkpoints: createPGliteCheckpointStore(runtime.client),
            projector: runtime.projector,
            lease: runtime.lease,
            ownership: "held",
            leaseLifetime: "caller",
            signal,
            storageKey,
            targets: REPLICA_TARGETS,
            checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
            entityTypeFor,
          });
          return { drain: async () => undefined, close: async () => undefined };
        },
      },
    });
    const claim = owner.tryOpen();
    await started;
    owner.requestClose();
    await expect(claim).resolves.toEqual({ status: "closed" });
    await owner.closed;
    const disposedStatus = (
      await runtime.client.query<{ status: string }>("SELECT status FROM cases WHERE id=$1", [secondCaseId])
    ).rows[0]?.status;
    const disposedCheckpoint = (
      await createPGliteCheckpointStore(runtime.client).read(storageKey)
    ).checkpoint;
    const disposedOwnerFencedPendingRevision = disposedStatus === "evidence"
      && JSON.stringify(disposedCheckpoint) === JSON.stringify(beforeDispose);
    expect(disposedOwnerFencedPendingRevision).toBe(true);

    await waitFor(runtime, async () => (
      await runtime.client.query<{ status: string }>("SELECT status FROM cases WHERE id=$1", [secondCaseId])
    ).rows[0]?.status === "drafting", "replacement owner update");
    const replacementStatus = (
      await runtime.client.query<{ status: string }>("SELECT status FROM cases WHERE id=$1", [secondCaseId])
    ).rows[0]?.status;
    const replacementOwnerAppliedPendingRevision = replacementStatus === "drafting"
      && runtime.store.getState().entities.Case?.[secondCaseId]?.status === "drafting";
    expect(replacementOwnerAppliedPendingRevision).toBe(true);

    const thirdCase = await runtime.client.query<{ id: string }>(
      "SELECT id::text AS id FROM cases WHERE id <> ALL($1::uuid[]) ORDER BY id LIMIT 1",
      [[state.caseId, secondCaseId]],
    );
    const thirdCaseId = thirdCase.rows[0]!.id;
    const beforeAuthorityFailure = (await createPGliteCheckpointStore(runtime.client).read(storageKey)).checkpoint!;
    serverSql(`UPDATE aso.cases SET status='submitted', updated_at=now() WHERE id='${thirdCaseId}'::uuid;`);
    const rejectedRevision = await captureRevision(
      beforeAuthorityFailure,
      (revision) => revisionHas(revision, "cases", thirdCaseId),
    );
    const authorityReasons: string[] = [];
    const unsubscribe = subscribeSessionRevocation((reason) => authorityReasons.push(reason));
    let authorityChecks = 0;
    try {
      await expect(startReplicaRuntime({
        client: runtime.client,
        transport: { async fetch() { return rejectedRevision; } },
        checkpoints: createPGliteCheckpointStore(runtime.client),
        projector: runtime.projector,
        lease: runtime.lease,
        ownership: "held",
        leaseLifetime: "caller",
        storageKey,
        targets: REPLICA_TARGETS,
        checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
        entityTypeFor,
        assertAuthority() {
          authorityChecks += 1;
          if (authorityChecks >= 6) {
            throw new ReplicaAuthorityFailure("Replica grant changed during materialization.");
          }
        },
      })).rejects.toThrow("Replica grant changed during materialization.");
    } finally {
      unsubscribe();
    }
    const authorityFailureStatus = (await runtime.client.query<{ status: string }>(
      "SELECT status FROM cases WHERE id=$1",
      [thirdCaseId],
    )).rows[0]?.status;
    const authorityFailureCheckpoint = (
      await createPGliteCheckpointStore(runtime.client).read(storageKey)
    ).checkpoint;
    const authorityFailureEventPublishedAndFenced = authorityReasons.length === 1
      && authorityReasons[0] === "Replica grant changed during materialization."
      && authorityFailureStatus === "evidence"
      && JSON.stringify(authorityFailureCheckpoint) === JSON.stringify(beforeAuthorityFailure)
      && runtime.store.getState().entities.Case?.[thirdCaseId]?.status === "evidence";
    expect(authorityFailureEventPublishedAndFenced).toBe(true);
    memory.sample("replacement-owner");
    const memoryReport = memory.finish();
    const finalCounts = await counts(runtime.client);
    const expectedFinalCounts = {
      ...expectedCounts,
      evidence_citations: expectedCounts.evidence_citations - 1,
    };
    const finalEvidenceStates = Object.keys(
      runtime.store.getState().entities.EvidenceState ?? {},
    ).sort();
    const finalCheckpoint = (
      await createPGliteCheckpointStore(runtime.client).read(storageKey)
    ).checkpoint;
    const finalCheckpointShapes = Object.keys(finalCheckpoint?.shapes ?? {}).sort();
    const finalGeneration = await currentGeneration(runtime.client);
    const checks = {
      initialSqlGraphParity: state.parityObservedBeforeReadiness,
      completeShapeCheckpoint: finalCheckpointShapes.join(",") === expectedCheckpointShapes.join(","),
      gateSummaryUpdatedInSqlAndGraph: durableBeforeRevalidation?.gate_affirmed === true
        && runtime.store.getState().entities.Case?.[state.caseId]?.gate_affirmed_at != null,
      evidenceStateReferenceIdentitiesPreserved: finalEvidenceStates.join(",") === expectedEvidenceStateIds.join(","),
      coldCrashLeftNoPartialBatch: state.coldCrashLeftNoPartialBatch,
      crashRolledBackRowAndCheckpoint: state.crashRolledBackRowAndCheckpoint,
      restartResumedWithoutSkip,
      deleteForcedReplacement,
      disposedOwnerFencedPendingRevision,
      replacementOwnerAppliedPendingRevision,
      authorityFailureEventPublishedAndFenced,
      finalSqlAndGraphCountsMatchExpected: Object.entries(expectedFinalCounts).every(([table, expected]) => {
        const type = entityTypeFor(table);
        return finalCounts[table as keyof typeof finalCounts] === expected
          && Object.keys(runtime.store.getState().entities[type] ?? {}).length === expected
          && runtime.store.getState().lists[`replica:${table}`]?.ids.length === expected;
      }),
      finalGenerationMatchesCheckpoint: finalCheckpoint?.generation === finalGeneration,
    };
    const result = Object.values(checks).every(Boolean) ? "Passed" : "Failed";
    await writeFile(required("RA11C_MATERIALIZER_OUTPUT"), `${JSON.stringify({
      result,
      counts: finalCounts,
      evidenceStates: finalEvidenceStates,
      checkpointShapes: finalCheckpointShapes,
      generation: finalGeneration,
      checks,
      memory: {
        durableInitialProcess: state.initialMemory,
        durableContinuationProcess: memoryReport,
      },
    }, null, 2)}\n`);
    expect(result).toBe("Passed");
    await closeRuntime(runtime);
  }, 180_000);
});
