import type { VerifiedSession } from '@/shared/model/session';

export type StartupSessionStatus =
  | 'loading'
  | 'authenticated'
  | 'none'
  | 'unreachable'
  | 'logout-pending'
  | 'logout-storage-unavailable';

export interface StartupSession {
  readonly status: StartupSessionStatus;
  readonly session: VerifiedSession | null;
}
