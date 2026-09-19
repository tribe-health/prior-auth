import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api/http-client';
import { documentErrorMessage } from './document-intake';

describe('document intake error copy', () => {
  it.each([
    [401, 'session_required', 'Sign in to continue.'],
    [403, 'action_forbidden', 'You do not have permission to perform this action.'],
    [404, 'resource_not_found', 'This record is unavailable in the selected practice.'],
    [409, 'command_conflict', 'This request ID was already used for different data. Start the action again.'],
    [409, 'stale_revision', 'This record changed. Review the current version before trying again.'],
    [413, 'document_too_large', 'This file exceeds the permitted size.'],
    [415, 'document_type_unsupported', 'Upload a supported PDF or text document.'],
    [422, 'document_integrity_failed', 'The uploaded file did not pass its integrity check.'],
    [422, 'document_processing_failed', 'This document could not be processed. Review the file and try again.'],
    [503, 'service_unavailable', 'This service is temporarily unavailable. Your committed work is unchanged.'],
  ])('maps %i %s to the frozen browser copy', (status, code, expected) => {
    expect(documentErrorMessage(new ApiError(status, code, code))).toBe(expected);
  });
});
