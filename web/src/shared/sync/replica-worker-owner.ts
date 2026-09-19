/**
 * Owns one browser replica for the lifetime of a worker or tab.
 *
 * The Web Locks callback is the ownership boundary. The lock remains held
 * while the callback waits, including while active work drains and the
 * database handle closes. A context that has closed is permanently fenced;
 * replacement ownership requires a new owner instance and a new lock grant.
 */

export interface ExclusiveLock {
  readonly name: string;
}

export interface ExclusiveLockManager {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: ExclusiveLock | null) => Promise<void>,
  ): Promise<void>;
}

export interface OwnedReplicaResource {
  /** Wait for persistence work internal to the resource to settle. */
  drain(): Promise<void>;
  /** Close the database/worker handle. */
  close(): Promise<void>;
}

export interface ReplicaResourceFactory<Resource extends OwnedReplicaResource> {
  /** Stop opening promptly when the scope is invalidated. */
  open(signal: AbortSignal): Promise<Resource>;
}

export type ReplicaWorkerOwnerState =
  | "idle"
  | "opening"
  | "owner"
  | "follower"
  | "quiescing"
  | "closed";

export type ReplicaClaim =
  | { status: "owner"; epoch: number }
  | { status: "follower" }
  | { status: "closed" };

export class ReplicaOwnerFenceError extends Error {
  constructor(message = "Replica ownership is not active") {
    super(message);
    this.name = "ReplicaOwnerFenceError";
  }
}

/**
 * Coordinates an exclusive owner and drainable handover for one replica key.
 *
 * `tryOpen` is deliberately non-blocking when another context owns the lock.
 * Followers can retry after an owner-close notification or another explicit
 * coordination signal. The Web Locks queue is not used because a queued stale
 * identity must never acquire after its scope has been invalidated.
 */
export class ReplicaWorkerOwner<Resource extends OwnedReplicaResource> {
  readonly #locks: ExclusiveLockManager;
  readonly #lockName: string;
  readonly #factory: ReplicaResourceFactory<Resource>;

  #state: ReplicaWorkerOwnerState = "idle";
  #epoch = 0;
  #resource: Resource | null = null;
  #claiming: Promise<ReplicaClaim> | null = null;
  #lockRequest: Promise<void> | null = null;
  #releaseLock: (() => void) | null = null;
  #closing: Promise<void> | null = null;
  #invokingOperation = false;
  #openingTeardownError: unknown;
  #openingAbort: AbortController | null = null;
  readonly #active = new Set<Promise<unknown>>();

  constructor(options: {
    locks: ExclusiveLockManager;
    lockName: string;
    factory: ReplicaResourceFactory<Resource>;
  }) {
    this.#locks = options.locks;
    this.#lockName = options.lockName;
    this.#factory = options.factory;
  }

  get state(): ReplicaWorkerOwnerState {
    return this.#state;
  }

  get epoch(): number {
    return this.#epoch;
  }

  async tryOpen(): Promise<ReplicaClaim> {
    if (this.#state === "closed" || this.#state === "quiescing") {
      return { status: "closed" };
    }
    if (this.#state === "owner") {
      return { status: "owner", epoch: this.#epoch };
    }
    if (this.#claiming) return this.#claiming;

    const attemptEpoch = this.#epoch;
    this.#state = "opening";
    const openingAbort = new AbortController();
    this.#openingAbort = openingAbort;

    let settle!: (claim: ReplicaClaim) => void;
    let reject!: (reason: unknown) => void;
    const claim = new Promise<ReplicaClaim>((resolve, rejectClaim) => {
      settle = resolve;
      reject = rejectClaim;
    });
    this.#claiming = claim;

    let claimSettled = false;
    const settleOnce = (value: ReplicaClaim) => {
      if (claimSettled) return;
      claimSettled = true;
      settle(value);
    };
    const rejectOnce = (reason: unknown) => {
      if (claimSettled) return;
      claimSettled = true;
      reject(reason);
    };

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    let request!: Promise<void>;
    try {
      request = this.#locks
        .request(
        this.#lockName,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) {
            if (this.#state === "opening" && this.#epoch === attemptEpoch) {
              this.#state = "follower";
            }
            settleOnce({ status: "follower" });
            return;
          }

          let opened: Resource;
          try {
            opened = await this.#factory.open(openingAbort.signal);
          } catch (error) {
            if (openingAbort.signal.aborted && this.#state === "quiescing") {
              settleOnce({ status: "closed" });
              return;
            }
            if (this.#state === "opening" && this.#epoch === attemptEpoch) {
              this.#state = "idle";
            }
            rejectOnce(error);
            return;
          }

          if (this.#state === "quiescing" || this.#state === "closed" || this.#epoch !== attemptEpoch) {
            let teardownError: unknown;
            try {
              await opened.drain();
            } catch (error) {
              teardownError = error;
            }
            try {
              await opened.close();
            } catch (error) {
              teardownError ??= error;
            }
            if (teardownError) {
              this.#openingTeardownError = teardownError;
              rejectOnce(teardownError);
            } else {
              settleOnce({ status: "closed" });
            }
            return;
          }

          this.#resource = opened;
          this.#releaseLock = release;
          this.#state = "owner";
          settleOnce({ status: "owner", epoch: attemptEpoch });
          await held;
        },
        )
        .catch((error) => {
          if (this.#state === "opening" && this.#epoch === attemptEpoch) {
            this.#state = "idle";
          }
          rejectOnce(error);
        })
        .finally(() => {
          if (this.#lockRequest === request) this.#lockRequest = null;
          if (this.#openingAbort === openingAbort) this.#openingAbort = null;
        });
    } catch (error) {
      if (this.#state === "opening" && this.#epoch === attemptEpoch) {
        this.#state = "idle";
      }
      rejectOnce(error);
      request = Promise.resolve();
    }

    this.#lockRequest = request;
    try {
      return await claim;
    } finally {
      if (this.#claiming === claim) this.#claiming = null;
    }
  }

  /**
   * Run work through the live owner without exposing a reusable handle.
   * Work accepted before quiescing is retained in the drain set; work offered
   * after quiescing or close is rejected by the epoch fence.
   */
  async withOwner<Result>(operation: (resource: Resource) => Promise<Result>): Promise<Result> {
    const resource = this.#resource;
    if (this.#state !== "owner" || !resource) throw new ReplicaOwnerFenceError();

    const operationEpoch = this.#epoch;
    let active: Promise<Result>;
    this.#invokingOperation = true;
    try {
      active = operation(resource);
    } finally {
      this.#invokingOperation = false;
    }
    this.#active.add(active);
    try {
      const result = await active;
      if (operationEpoch !== this.#epoch) {
        throw new ReplicaOwnerFenceError("Replica ownership changed while work was active");
      }
      return result;
    } finally {
      this.#active.delete(active);
    }
  }

  /** The retained drain barrier after `requestClose`; resolved when already closed. */
  get closed(): Promise<void> {
    if (this.#closing) return this.#closing;
    if (this.#state === "closed") return Promise.resolve();
    return Promise.reject(new ReplicaOwnerFenceError("Replica close has not been requested"));
  }

  /**
   * Permanently fence this context and schedule drain, close, then release.
   * This signal is safe while work is active because it returns no promise an
   * owner operation could await and form a cycle with.
   */
  requestClose(): void {
    const closing = this.#startClosing();
    void closing.catch(() => undefined);
  }

  /** Close immediately when idle. Active callers use `requestClose` + `closed`. */
  close(): Promise<void> {
    if (this.#invokingOperation || this.#active.size > 0) {
      return Promise.reject(
        new ReplicaOwnerFenceError(
          "Owner work is active; request close and await the retained closed barrier externally",
        ),
      );
    }
    return this.#startClosing();
  }

  #startClosing(): Promise<void> {
    if (this.#closing) return this.#closing;
    if (this.#state === "closed") return Promise.resolve();

    this.#epoch += 1;
    this.#state = "quiescing";
    this.#openingAbort?.abort();
    // Defer the drain one microtask. If requestClose is called synchronously
    // inside an operation, withOwner records that operation before this takes
    // the active-work snapshot.
    const closing = Promise.resolve().then(async () => {
      if (this.#claiming) await this.#claiming.catch(() => undefined);

      const resource = this.#resource;
      let teardownError: unknown = this.#openingTeardownError;
      this.#openingTeardownError = undefined;
      if (resource) {
        await Promise.allSettled(this.#active);
        try {
          await resource.drain();
        } catch (error) {
          teardownError = error;
        }
        try {
          await resource.close();
        } catch (error) {
          teardownError ??= error;
        }
        this.#resource = null;
      }

      this.#releaseLock?.();
      this.#releaseLock = null;
      if (this.#lockRequest) await this.#lockRequest.catch(() => undefined);
      this.#state = "closed";
      if (teardownError) throw teardownError;
    });

    this.#closing = closing;
    return closing;
  }
}

/** Adapt the browser or worker `LockManager` without coupling tests to DOM globals. */
export function browserExclusiveLockManager(
  locks: LockManager | undefined = globalThis.navigator?.locks,
): ExclusiveLockManager {
  if (!locks) throw new Error("Web Locks API is unavailable for replica ownership");
  return {
    request: (name, options, callback) => locks.request(name, options, callback),
  };
}

export interface ReplicaWorkerScope {
  deployment: string;
  principal: string;
  practiceId: string;
  identityId: string;
  authorizationRevision: string;
  generation: number;
}

/** Every authority and schema boundary participates in the storage namespace. */
export function replicaWorkerScopeKey(scope: ReplicaWorkerScope): string {
  return [
    "aso",
    scope.deployment,
    `g${scope.generation}`,
    scope.principal,
    scope.practiceId,
    scope.identityId,
    scope.authorizationRevision,
  ].map(encodeURIComponent).join(":");
}

export type ScopedReplicaClaim =
  | ReplicaClaim
  | { status: "invalidated" }
  | { status: "recovery-required"; reason: "scope-quarantine-failed" };

/**
 * Replaces a worker owner when identity, practice, authority, or generation
 * changes. An incoming scope invalidates an opening owner immediately and
 * waits for its close before creating the replacement namespace.
 */
export class ReplicaWorkerScopeManager<Resource extends OwnedReplicaResource> {
  readonly #createOwner: (
    scope: ReplicaWorkerScope,
    storageKey: string,
  ) => ReplicaWorkerOwner<Resource>;
  readonly #afterScopeClosed: ((storageKey: string) => Promise<void>) | undefined;
  readonly #onScopeCloseError: ((error: unknown, storageKey: string) => void) | undefined;
  #revision = 0;
  #current: { key: string; owner: ReplicaWorkerOwner<Resource> } | null = null;
  #transitionBarrier: Promise<void> = Promise.resolve();
  #recoveryRequired = false;
  readonly #quarantines = new WeakMap<ReplicaWorkerOwner<Resource>, Promise<boolean>>();

  constructor(
    createOwner: (
      scope: ReplicaWorkerScope,
      storageKey: string,
    ) => ReplicaWorkerOwner<Resource>,
    afterScopeClosed?: (storageKey: string) => Promise<void>,
    onScopeCloseError?: (error: unknown, storageKey: string) => void,
  ) {
    this.#createOwner = createOwner;
    this.#afterScopeClosed = afterScopeClosed;
    this.#onScopeCloseError = onScopeCloseError;
  }

  async open(scope: ReplicaWorkerScope): Promise<ScopedReplicaClaim> {
    const key = replicaWorkerScopeKey(scope);
    if (this.#current?.key === key) return this.#current.owner.tryOpen();

    const requestRevision = ++this.#revision;
    const previous = this.#current;
    this.#current = null;
    previous?.owner.requestClose();

    const priorTransition = this.#transitionBarrier;
    const transition = priorTransition.then(async (): Promise<ScopedReplicaClaim> => {
      if (this.#recoveryRequired) {
        return { status: "recovery-required", reason: "scope-quarantine-failed" };
      }
      if (previous) {
        const closed = await this.#closeAndQuarantine(previous);
        if (!closed) {
          this.#recoveryRequired = true;
          return { status: "recovery-required", reason: "scope-quarantine-failed" };
        }
      }
      if (requestRevision !== this.#revision) return { status: "invalidated" };

      const owner = this.#createOwner(scope, key);
      this.#current = { key, owner };
      const claim = await owner.tryOpen();
      if (requestRevision !== this.#revision || this.#current?.owner !== owner) {
        const closed = await this.#closeAndQuarantine({ key, owner });
        if (!closed) {
          this.#recoveryRequired = true;
          return { status: "recovery-required", reason: "scope-quarantine-failed" };
        }
        return { status: "invalidated" };
      }
      return claim;
    });
    this.#transitionBarrier = transition.then(
      () => undefined,
      () => undefined,
    );
    return transition;
  }

  /** Clear a failed quarantine only after an explicit recovery step succeeds. */
  async recoverScopeQuarantine(recover: () => Promise<void>): Promise<void> {
    const priorTransition = this.#transitionBarrier;
    const recovery = priorTransition.then(async () => {
      await recover();
      this.#recoveryRequired = false;
    });
    this.#transitionBarrier = recovery.catch(() => undefined);
    await recovery;
  }

  async withCurrent<Result>(
    scope: ReplicaWorkerScope,
    operation: (resource: Resource) => Promise<Result>,
  ): Promise<Result> {
    const current = this.#current;
    if (!current || current.key !== replicaWorkerScopeKey(scope)) {
      throw new ReplicaOwnerFenceError("Replica scope is no longer current");
    }
    return current.owner.withOwner(operation);
  }

  async close(): Promise<void> {
    this.#revision += 1;
    const current = this.#current;
    this.#current = null;
    current?.owner.requestClose();
    const priorTransition = this.#transitionBarrier;
    const closing = priorTransition.then(async () => {
      if (current) await current.owner.closed;
    });
    this.#transitionBarrier = closing.catch(() => undefined);
    await closing;
  }

  async #closeAndQuarantine(entry: {
    key: string;
    owner: ReplicaWorkerOwner<Resource>;
  }): Promise<boolean> {
    const existing = this.#quarantines.get(entry.owner);
    if (existing) return existing;
    const quarantine = (async () => {
      entry.owner.requestClose();
      let closeFailed = false;
      try {
        await entry.owner.closed;
      } catch (error) {
        // Both handle close and lock release were attempted before this error.
        closeFailed = true;
        this.#onScopeCloseError?.(error, entry.key);
      }
      if (closeFailed && !this.#afterScopeClosed) return false;
      try {
        await this.#afterScopeClosed?.(entry.key);
        return true;
      } catch {
        return false;
      }
    })();
    this.#quarantines.set(entry.owner, quarantine);
    return quarantine;
  }
}
