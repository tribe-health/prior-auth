import { useId, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { CaseInput, ResolutionInputField } from '../model/case-command';

interface CaseFormProps {
  readonly value: CaseInput;
  readonly submitLabel: string;
  readonly disabled?: boolean;
  readonly focusField?: ResolutionInputField | null;
  readonly onChange: (patch: Partial<CaseInput>) => void;
  readonly onSubmit: () => Promise<unknown>;
  readonly onCancel?: () => void;
}

export function CaseForm({
  value,
  submitLabel,
  disabled = false,
  focusField = null,
  onChange,
  onSubmit,
  onCancel,
}: CaseFormProps) {
  const prefix = useId();
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const nullable = (text: string) => text.trim() === '' ? null : text;

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5" aria-label="Case intake form">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${prefix}-case-number`}>Case number</FieldLabel>
          <Input
            id={`${prefix}-case-number`}
            value={value.caseNumber}
            required
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ caseNumber: event.currentTarget.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-date-of-service`}>Date of service</FieldLabel>
          <Input
            id={`${prefix}-date-of-service`}
            type="date"
            autoFocus={focusField === 'dateOfService'}
            value={value.dateOfService ?? ''}
            disabled={disabled}
            className="min-h-11"
            onChange={(event) => onChange({ dateOfService: nullable(event.currentTarget.value) })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-patient-id`}>Patient identifier</FieldLabel>
          <Input
            id={`${prefix}-patient-id`}
            value={value.patientId}
            required
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ patientId: event.currentTarget.value })}
          />
          <FieldDescription>Use the authorized patient identifier from the practice system.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-member-id`}>Payer member identifier</FieldLabel>
          <Input
            id={`${prefix}-member-id`}
            value={value.memberId ?? ''}
            autoFocus={focusField === 'memberId'}
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ memberId: nullable(event.currentTarget.value) })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-surgeon-id`}>Surgeon identifier</FieldLabel>
          <Input
            id={`${prefix}-surgeon-id`}
            value={value.surgeonId}
            required
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ surgeonId: event.currentTarget.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-coordinator-id`}>Coordinator identifier</FieldLabel>
          <Input
            id={`${prefix}-coordinator-id`}
            value={value.coordinatorId ?? ''}
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ coordinatorId: nullable(event.currentTarget.value) })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-payer-id`}>Payer identifier</FieldLabel>
          <Input
            id={`${prefix}-payer-id`}
            value={value.payerId}
            required
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ payerId: event.currentTarget.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-facility-id`}>Facility identifier</FieldLabel>
          <Input
            id={`${prefix}-facility-id`}
            value={value.facilityId ?? ''}
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ facilityId: nullable(event.currentTarget.value) })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-procedure-code`}>Procedure code</FieldLabel>
          <Input
            id={`${prefix}-procedure-code`}
            value={value.procedureCode ?? ''}
            autoFocus={focusField === 'procedureCode'}
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ procedureCode: nullable(event.currentTarget.value) })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-plan-key`}>Plan key</FieldLabel>
          <Input
            id={`${prefix}-plan-key`}
            value={value.planKey ?? ''}
            autoFocus={focusField === 'planKey'}
            disabled={disabled}
            autoComplete="off"
            className="min-h-11"
            onChange={(event) => onChange({ planKey: nullable(event.currentTarget.value) })}
          />
        </Field>
      </FieldGroup>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={disabled}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
