import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseVerifiedSession } from './session-parse';

/** A payload shaped exactly as `SessionSummary` serializes it. */
function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    identityId: '11111111-1111-1111-1111-111111111111',
    sessionId: '22222222-2222-2222-2222-222222222222',
    userId: '33333333-3333-3333-3333-333333333333',
    practiceId: '44444444-4444-4444-4444-444444444444',
    displayName: 'Dr Rivera',
    principal: 'user',
    capabilities: ['affirm_gate', 'sign_letter'],
    expiresAt: '2099-01-01T00:00:00Z',
    authorizationRevision: 'membership:7',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseVerifiedSession', () => {
  it('accepts the server payload and preserves every scope field', () => {
    const session = parseVerifiedSession(wire());

    expect(session).toEqual({
      identityId: '11111111-1111-1111-1111-111111111111',
      sessionId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      practiceId: '44444444-4444-4444-4444-444444444444',
      displayName: 'Dr Rivera',
      capabilities: ['affirm_gate', 'sign_letter'],
      principal: 'user',
      expiresAt: '2099-01-01T00:00:00Z',
      authorizationRevision: 'membership:7',
    });
  });

  it('preserves the document upload capability granted by the server', () => {
    const session = parseVerifiedSession(wire({ capabilities: ['case:read', 'document_upload'] }));

    expect(session?.capabilities).toEqual(['case:read', 'document_upload']);
  });

  it('drops a capability this client does not know, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const session = parseVerifiedSession(
      wire({ capabilities: ['affirm_gate', 'prescribe_controlled_substance'] }),
    );

    // The known capability survives; the unknown one is not smuggled through
    // as a string that would silently match nothing in `can()`.
    expect(session?.capabilities).toEqual(['affirm_gate']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('refuses a principal outside the client union', () => {
    // `Service` exists server-side. current_session refuses it today; this
    // parse does not depend on that staying true.
    expect(parseVerifiedSession(wire({ principal: 'service' }))).toBeNull();
  });

  it.each([
    ['identityId', ''],
    ['sessionId', undefined],
    ['practiceId', null],
    ['authorizationRevision', ''],
  ])('refuses the whole payload when %s is unusable', (field, value) => {
    expect(parseVerifiedSession(wire({ [field]: value }))).toBeNull();
  });

  it('refuses an expiry that would never fire the local expiry fence', () => {
    // Date.parse("soon") is NaN, and NaN <= now is false forever — the session
    // would outlive its own authority on this device.
    expect(parseVerifiedSession(wire({ expiresAt: 'soon' }))).toBeNull();
  });

  it('refuses capabilities that are not a list', () => {
    expect(parseVerifiedSession(wire({ capabilities: 'affirm_gate' }))).toBeNull();
  });

  it.each([[null], [undefined], ['a string'], [42]])('refuses non-object payload %s', (payload) => {
    expect(parseVerifiedSession(payload)).toBeNull();
  });
});
