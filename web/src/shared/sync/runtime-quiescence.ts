type RuntimeQuiescer = () => Promise<void>;

const alreadyQuiescent: RuntimeQuiescer = async () => undefined;
let activeQuiescer: RuntimeQuiescer = alreadyQuiescent;

/** Install the single private-runtime drain owned by the composition root. */
export function installPrivateRuntimeQuiescer(quiescer: RuntimeQuiescer): void {
  activeQuiescer = quiescer;
}

/** Wait until the previous private runtime can no longer publish or persist. */
export function quiescePrivateRuntime(): Promise<void> {
  return activeQuiescer();
}

export function resetPrivateRuntimeQuiescerForTests(): void {
  activeQuiescer = alreadyQuiescent;
}
