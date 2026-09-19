import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import { isNativeRuntime } from '@/shared/native-command-client';

export type SessionHintReason = 'scope-change' | 'access-change';

interface SessionHintMessage {
  readonly schema: 1;
  readonly type: 'revalidate';
  readonly reason: SessionHintReason;
  readonly sourceId: string;
  readonly nonce: string;
}

export interface SessionHintBus {
  publish(reason: SessionHintReason): void;
  subscribe(listener: () => void): () => void;
  close(): void;
}

const CHANNEL_NAME = 'aso-session-lifecycle-v1';
const STORAGE_KEY = 'aso:session-lifecycle-hint:v1';
export const NATIVE_SESSION_INVALIDATED_EVENT = 'aso://session-invalidated';

type NativeSessionInvalidationReason = 'logout' | 'scope-change' | 'authentication-failed';

interface NativeSessionInvalidation {
  readonly schema: 1;
  readonly reason: NativeSessionInvalidationReason;
  readonly epoch: number;
}

function identifier(): string {
  return globalThis.crypto.randomUUID();
}

function parseHint(value: unknown): SessionHintMessage | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof candidate !== 'object' || candidate === null) return null;
  const hint = candidate as Record<string, unknown>;
  if (hint.schema !== 1 || hint.type !== 'revalidate') return null;
  if (hint.reason !== 'scope-change' && hint.reason !== 'access-change') return null;
  if (typeof hint.sourceId !== 'string' || typeof hint.nonce !== 'string') return null;
  return hint as unknown as SessionHintMessage;
}

function parseNativeInvalidation(value: unknown): NativeSessionInvalidation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !['schema', 'reason', 'epoch'].includes(key))) return null;
  if (candidate.schema !== 1) return null;
  if (
    candidate.reason !== 'logout'
    && candidate.reason !== 'scope-change'
    && candidate.reason !== 'authentication-failed'
  ) return null;
  if (!Number.isSafeInteger(candidate.epoch) || (candidate.epoch as number) < 0) return null;
  return candidate as unknown as NativeSessionInvalidation;
}

/**
 * Coordinate tabs with non-authoritative hints. A received message can only
 * trigger a fresh session read; it carries no identity, practice or grant.
 */
export function createBrowserSessionHintBus(sourceId = identifier()): SessionHintBus {
  const listeners = new Set<() => void>();
  let channel: BroadcastChannel | null = null;

  const receive = (value: unknown) => {
    const hint = parseHint(value);
    if (!hint || hint.sourceId === sourceId) return;
    for (const listener of new Set(listeners)) listener();
  };

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', (event) => receive(event.data));
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) receive(event.newValue);
  };
  if (!channel && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return {
    publish(reason) {
      const hint: SessionHintMessage = {
        schema: 1,
        type: 'revalidate',
        reason,
        sourceId,
        nonce: identifier(),
      };
      if (channel) {
        channel.postMessage(hint);
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(hint));
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // The local tab still fences itself. This channel is only a hint;
        // task 1.3 owns honest durable-control storage failure reporting.
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      channel?.close();
      if (!channel && typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    },
  };
}

/**
 * Tauri renderers receive only a host-originated epoch and reason. The event is
 * a lock/revalidation signal; it cannot grant a session or clinical authority.
 */
export function createNativeSessionHintBus(): SessionHintBus {
  const listeners = new Set<() => void>();
  let closed = false;
  let unlisten: UnlistenFn | null = null;

  void listen<unknown>(NATIVE_SESSION_INVALIDATED_EVENT, (event) => {
    if (!parseNativeInvalidation(event.payload)) return;
    for (const listener of new Set(listeners)) listener();
  }).then((registered) => {
    if (closed) registered();
    else unlisten = registered;
  });

  return {
    publish() {
      // Native authority changes originate in the Rust host. Renderer events
      // are intentionally unable to assert a new epoch or authenticated scope.
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      listeners.clear();
      unlisten?.();
      unlisten = null;
    },
  };
}

export function createSessionHintBus(): SessionHintBus {
  return isNativeRuntime()
    ? createNativeSessionHintBus()
    : createBrowserSessionHintBus();
}
