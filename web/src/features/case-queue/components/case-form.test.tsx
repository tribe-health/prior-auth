import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CaseInput, ResolutionInputField } from '../model/case-command';
import { CaseForm } from './case-form';

afterEach(cleanup);

const INITIAL: CaseInput = {
  caseNumber: 'SYNTHETIC-001', patientId: 'patient-1', surgeonId: 'surgeon-1',
  coordinatorId: null, facilityId: null, payerId: 'payer-1', memberId: null,
  dateOfService: null, procedureCode: null, planKey: null, data: {},
};

function ControlledCaseForm({
  onSubmit,
  focusField = null,
}: {
  onSubmit: () => Promise<unknown>;
  focusField?: ResolutionInputField | null;
}) {
  const [value, setValue] = useState(INITIAL);
  return (
    <CaseForm
      value={value}
      focusField={focusField}
      submitLabel="Save case"
      onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
      onSubmit={onSubmit}
    />
  );
}

describe('case form adaptive interaction', () => {
  it('keeps the same labeled form state across mobile and desktop resize and submits semantically', () => {
    const submit = vi.fn(async () => undefined);
    const { container } = render(<ControlledCaseForm onSubmit={submit} />);
    const caseNumber = screen.getByLabelText('Case number') as HTMLInputElement;
    expect(caseNumber.value).toBe('SYNTHETIC-001');
    expect((screen.getByLabelText('Patient identifier') as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText('Surgeon identifier') as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText('Payer identifier') as HTMLInputElement).required).toBe(true);

    fireEvent.change(caseNumber, { target: { value: 'SYNTHETIC-RESIZED' } });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    fireEvent(window, new Event('resize'));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    fireEvent(window, new Event('resize'));

    expect(screen.getByLabelText('Case number')).toBe(caseNumber);
    expect(caseNumber.value).toBe('SYNTHETIC-RESIZED');
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save case' }).getAttribute('type')).toBe('submit');
  });

  it.each([
    ['memberId', 'Payer member identifier'],
    ['planKey', 'Plan key'],
    ['procedureCode', 'Procedure code'],
    ['dateOfService', 'Date of service'],
  ] as const)('focuses the requested missing %s field', (focusField, label) => {
    render(<ControlledCaseForm onSubmit={vi.fn(async () => undefined)} focusField={focusField} />);
    expect(document.activeElement).toBe(screen.getByLabelText(label));
  });
});
