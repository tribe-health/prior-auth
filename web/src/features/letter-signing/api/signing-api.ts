import { httpClient } from '@/shared/api/http-client';
import { invokeNative, isNativeRuntime, requireNativeEpoch } from '@/shared/native-command-client';
import type { SignLetterResult, SigningTarget } from '../model/signing';

function path(letterId: string, suffix: string, practiceId?: string): string {
  const query = practiceId ? `?practiceId=${encodeURIComponent(practiceId)}` : '';
  return `/api/letters/${encodeURIComponent(letterId)}${suffix}${query}`;
}

export const signingApi = {
  readTarget: (letterId: string, practiceId?: string, epoch?: number) =>
    isNativeRuntime()
      ? invokeNative<SigningTarget>('signing_target', {
          epoch: requireNativeEpoch(epoch),
          letterId,
          practiceId: practiceId ?? null,
        })
      : httpClient.get<SigningTarget>(path(letterId, '/signing-target', practiceId)),
  sign: (
    letterId: string,
    commandId: string,
    target: SigningTarget,
    practiceId?: string,
    epoch?: number,
  ) => {
    const request = {
      commandId,
      expectedLetterVersion: target.letterVersion,
      expectedQaRevision: target.qaRevision,
      expectedSignatureVersion: target.signatureVersion,
    };
    return isNativeRuntime()
      ? invokeNative<SignLetterResult>('sign_letter', {
          epoch: requireNativeEpoch(epoch),
          letterId,
          practiceId: practiceId ?? null,
          request,
        })
      : httpClient.post<SignLetterResult>(path(letterId, '/sign', practiceId), request);
  },
  lookup: (letterId: string, commandId: string, practiceId?: string, epoch?: number) =>
    isNativeRuntime()
      ? invokeNative<SignLetterResult>('lookup_sign_letter_command', {
          epoch: requireNativeEpoch(epoch),
          letterId,
          practiceId: practiceId ?? null,
          commandId,
        })
      : httpClient.get<SignLetterResult>(
          path(letterId, `/sign/commands/${encodeURIComponent(commandId)}`, practiceId),
        ),
};
