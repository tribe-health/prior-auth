import { describe, expect, it } from 'vitest';

import { createLogoutPendingControl } from './logout-pending-control';

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('logout pending control', () => {
  it('persists only noncredential control fields and reuses the pending generation', () => {
    const durable = storage();
    const control = createLogoutPendingControl(
      durable,
      () => 'generation-1',
      () => new Date('2026-09-15T09:00:00Z'),
    );

    expect(control.ensurePending()).toEqual({
      status: 'pending',
      marker: {
        schemaVersion: 1,
        generation: 'generation-1',
        createdAt: '2026-09-15T09:00:00.000Z',
      },
    });
    expect(control.ensurePending()).toEqual(control.read());
    expect(JSON.parse([...durable.values.values()][0]!)).toEqual({
      schemaVersion: 1,
      generation: 'generation-1',
      createdAt: '2026-09-15T09:00:00.000Z',
    });
  });

  it('uses generation comparison so an old tab cannot clear a newer marker', () => {
    const durable = storage();
    const first = createLogoutPendingControl(durable, () => 'generation-1');
    const firstMarker = first.ensurePending();
    expect(firstMarker.status).toBe('pending');

    durable.values.clear();
    const second = createLogoutPendingControl(durable, () => 'generation-2');
    second.ensurePending();

    expect(first.clear('generation-1')).toBe('superseded');
    expect(second.read()).toMatchObject({
      status: 'pending',
      marker: { generation: 'generation-2' },
    });
    expect(second.clear('generation-2')).toBe('cleared');
    expect(second.read()).toEqual({ status: 'clear' });
  });

  it('reports unavailable storage, malformed markers and failed writes', () => {
    expect(createLogoutPendingControl(undefined).read()).toEqual({ status: 'unavailable' });

    const malformed = storage();
    malformed.values.set('aso:logout-pending:v1', JSON.stringify({ sessionId: 'must-not-exist' }));
    expect(createLogoutPendingControl(malformed).read()).toEqual({ status: 'unavailable' });

    const failed = {
      getItem: () => null,
      setItem: () => { throw new Error('storage denied'); },
      removeItem: () => undefined,
    };
    expect(createLogoutPendingControl(failed).ensurePending()).toEqual({ status: 'unavailable' });
  });

  it('allows only an explicit login completion to clear without an old generation', () => {
    const durable = storage();
    const control = createLogoutPendingControl(durable, () => 'generation-1');
    control.ensurePending();

    expect(control.resolveExplicitLogin()).toBe('cleared');
    expect(control.read()).toEqual({ status: 'clear' });
  });
});
