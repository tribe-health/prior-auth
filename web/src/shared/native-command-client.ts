import { invoke, isTauri as tauriIsTauri } from '@tauri-apps/api/core';

import { ApiError } from '@/shared/api/http-client';

interface NativeIpcError {
  readonly status: number;
  readonly code: string;
}

function ipcError(value: unknown): NativeIpcError | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>).status;
  const code = (value as Record<string, unknown>).code;
  return typeof status === 'number' && typeof code === 'string' ? { status, code } : null;
}

export function isNativeRuntime(): boolean {
  return tauriIsTauri();
}

export async function invokeNative<T>(command: string, input?: unknown): Promise<T> {
  try {
    return await invoke<T>(command, input === undefined ? undefined : { input });
  } catch (cause) {
    const error = ipcError(cause);
    if (error) throw new ApiError(error.status, error.code, error.code);
    throw new ApiError(503, 'native_ipc_unavailable', 'native_ipc_unavailable');
  }
}

export function requireNativeEpoch(epoch: number | undefined): number {
  if (!Number.isSafeInteger(epoch) || (epoch ?? -1) < 0) {
    throw new ApiError(503, 'native_epoch_unavailable', 'native_epoch_unavailable');
  }
  return epoch!;
}
