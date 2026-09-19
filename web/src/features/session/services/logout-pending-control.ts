const STORAGE_KEY = 'aso:logout-pending:v1';

interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LogoutPendingMarker {
  readonly schemaVersion: 1;
  readonly generation: string;
  readonly createdAt: string;
}

export type LogoutControlRead =
  | { readonly status: 'clear' }
  | { readonly status: 'pending'; readonly marker: LogoutPendingMarker }
  | { readonly status: 'unavailable' };

export type LogoutControlClear = 'cleared' | 'superseded' | 'unavailable';

export interface LogoutPendingControl {
  read(): LogoutControlRead;
  ensurePending(): LogoutControlRead;
  clear(generation: string): LogoutControlClear;
  resolveExplicitLogin(): LogoutControlClear;
}

function parseMarker(value: string): LogoutPendingMarker | null {
  try {
    const candidate = JSON.parse(value) as Record<string, unknown>;
    const keys = Object.keys(candidate).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['createdAt', 'generation', 'schemaVersion'])) {
      return null;
    }
    if (
      candidate.schemaVersion !== 1
      || typeof candidate.generation !== 'string'
      || candidate.generation.length === 0
      || candidate.generation.length > 128
      || typeof candidate.createdAt !== 'string'
      || !Number.isFinite(Date.parse(candidate.createdAt))
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      generation: candidate.generation,
      createdAt: candidate.createdAt,
    };
  } catch {
    return null;
  }
}

export function createLogoutPendingControl(
  storage: StoragePort | undefined,
  generation: () => string = () => crypto.randomUUID(),
  now: () => Date = () => new Date(),
): LogoutPendingControl {
  const read = (): LogoutControlRead => {
    if (!storage) return { status: 'unavailable' };
    try {
      const value = storage.getItem(STORAGE_KEY);
      if (value === null) return { status: 'clear' };
      const marker = parseMarker(value);
      return marker ? { status: 'pending', marker } : { status: 'unavailable' };
    } catch {
      return { status: 'unavailable' };
    }
  };

  const clearMarker = (expectedGeneration?: string): LogoutControlClear => {
    const current = read();
    if (current.status === 'unavailable') return 'unavailable';
    if (current.status === 'clear') return 'cleared';
    if (expectedGeneration && current.marker.generation !== expectedGeneration) {
      return 'superseded';
    }
    try {
      storage?.removeItem(STORAGE_KEY);
      return read().status === 'clear' ? 'cleared' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  };

  return {
    read,
    ensurePending() {
      const current = read();
      if (current.status !== 'clear') return current;
      const marker: LogoutPendingMarker = {
        schemaVersion: 1,
        generation: generation(),
        createdAt: now().toISOString(),
      };
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(marker));
      } catch {
        return { status: 'unavailable' };
      }
      const persisted = read();
      return persisted.status === 'pending'
        && persisted.marker.generation === marker.generation
        ? persisted
        : { status: 'unavailable' };
    },
    clear: (expectedGeneration) => clearMarker(expectedGeneration),
    resolveExplicitLogin: () => clearMarker(),
  };
}

function browserStorage(): StoragePort | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export const browserLogoutPendingControl = createLogoutPendingControl(browserStorage());
