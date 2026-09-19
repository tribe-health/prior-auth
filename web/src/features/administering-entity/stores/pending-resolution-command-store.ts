import { createStore } from 'zustand/vanilla';

import type { VerifiedSession } from '@/shared/model/session';

export interface PendingResolutionCommand {
  readonly commandId: string;
  readonly expectedCaseInputRevision: number | null;
}

interface PendingResolutionCommandState {
  readonly commands: Readonly<Record<string, PendingResolutionCommand>>;
}

const store = createStore<PendingResolutionCommandState>(() => ({ commands: {} }));

export function pendingResolutionCommandKey(
  session: VerifiedSession,
  epoch: number,
  caseId: string,
): string {
  return `aso:administering-entity:pending:${JSON.stringify([
    session.identityId,
    session.sessionId,
    session.practiceId,
    session.authorizationRevision,
    epoch,
    caseId,
  ])}`;
}

function sessionStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

export const pendingResolutionCommands = {
  read(key: string): PendingResolutionCommand | null {
    const stored = sessionStorage()?.getItem(key) ?? null;
    if (!stored) return null;
    let command: PendingResolutionCommand;
    try {
      const parsed = JSON.parse(stored) as Partial<PendingResolutionCommand>;
      command = typeof parsed.commandId === 'string'
        ? {
            commandId: parsed.commandId,
            expectedCaseInputRevision: typeof parsed.expectedCaseInputRevision === 'number'
              ? parsed.expectedCaseInputRevision
              : null,
          }
        : { commandId: stored, expectedCaseInputRevision: null };
    } catch {
      command = { commandId: stored, expectedCaseInputRevision: null };
    }
    if (command.commandId) {
      store.setState((state) => ({
        commands: { ...state.commands, [key]: command },
      }));
    }
    return command;
  },

  retain(key: string, command: PendingResolutionCommand): void {
    sessionStorage()?.setItem(key, JSON.stringify(command));
    store.setState((state) => ({
      commands: { ...state.commands, [key]: command },
    }));
  },

  clear(key: string): void {
    sessionStorage()?.removeItem(key);
    store.setState((state) => {
      const commands = { ...state.commands };
      delete commands[key];
      return { commands };
    });
  },
} as const;
