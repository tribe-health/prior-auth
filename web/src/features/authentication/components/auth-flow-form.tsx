import { useId, type FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useAuthFlowModel } from '@/features/authentication/hooks/use-auth-flow-model';
import type {
  AuthFlowInputNode,
  AuthFlowKind,
} from '@/features/authentication/model/auth-flow';

function visibleMessages(node: AuthFlowInputNode) {
  const errors = node.messages
    .filter((message) => message.kind === 'error')
    .map((message) => ({ message: message.text }));
  const descriptions = node.messages
    .filter((message) => message.kind !== 'error')
    .map((message) => message.text);
  return { errors, descriptions };
}

function FlowInput({ node, disabled }: { node: AuthFlowInputNode; disabled: boolean }) {
  const fieldId = `${useId()}-${node.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  if (node.type === 'hidden') {
    return <input type="hidden" name={node.name} value={String(node.value)} />;
  }
  if (node.type === 'submit') {
    return (
      <Button
        type="submit"
        name={node.name}
        value={String(node.value)}
        disabled={disabled || node.disabled}
        className="min-h-11 w-full"
      >
        {node.label}
      </Button>
    );
  }

  const { errors, descriptions } = visibleMessages(node);
  const invalid = errors.length > 0;
  if (node.type === 'checkbox') {
    return (
      <Field data-invalid={invalid || undefined} orientation="horizontal">
        <input
          id={fieldId}
          name={node.name}
          type="checkbox"
          value="true"
          defaultChecked={node.value === true}
          required={node.required}
          disabled={disabled || node.disabled}
          aria-invalid={invalid || undefined}
          className="mt-0.5 size-4"
        />
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor={fieldId}>{node.label}</FieldLabel>
          {descriptions.map((description) => (
            <FieldDescription key={description}>{description}</FieldDescription>
          ))}
          <FieldError errors={errors} />
        </div>
      </Field>
    );
  }

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={fieldId}>{node.label}</FieldLabel>
      <Input
        id={fieldId}
        name={node.name}
        type={node.type}
        defaultValue={String(node.value)}
        required={node.required}
        disabled={disabled || node.disabled}
        autoComplete={node.autocomplete}
        aria-invalid={invalid || undefined}
        className="min-h-11"
      />
      {descriptions.map((description) => (
        <FieldDescription key={description}>{description}</FieldDescription>
      ))}
      <FieldError errors={errors} />
    </Field>
  );
}

export function AuthFlowForm({
  kind,
  flowId,
}: {
  kind: AuthFlowKind;
  flowId: string | null;
}) {
  const model = useAuthFlowModel(kind, flowId);
  const actionLabel = kind === 'login' ? 'sign-in' : 'recovery';

  if (model.phase === 'idle') {
    return (
      <a className={buttonVariants({ className: 'min-h-11 w-full' })} href={model.startUrl}>
        Start {actionLabel}
      </a>
    );
  }

  if (model.phase === 'loading') {
    return (
      <div className="flex min-h-24 items-center justify-center gap-2" role="status">
        <Spinner />
        <span>Loading account access form…</span>
      </div>
    );
  }

  if (!model.flow) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>
            {model.phase === 'expired' ? 'Account access form expired' : 'Account access unavailable'}
          </AlertTitle>
          <AlertDescription>{model.message}</AlertDescription>
        </Alert>
        <a className={buttonVariants({ className: 'min-h-11 w-full' })} href={model.startUrl}>
          Start a new {actionLabel} form
        </a>
      </div>
    );
  }

  const submitting = model.phase === 'submitting';
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name) {
      data.append(submitter.name, submitter.value);
    }
    void model.submit(data);
  };

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-4">
      {model.flow.messages.map((message) => (
        <Alert key={message.id} variant={message.kind === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ))}
      <FieldGroup>
        {model.flow.nodes.map((node) => (
          <FlowInput key={node.key} node={node} disabled={submitting} />
        ))}
      </FieldGroup>
      {submitting ? (
        <p className="flex items-center gap-2 text-sm text-ui-muted-foreground" role="status">
          <Spinner />
          Submitting…
        </p>
      ) : null}
    </form>
  );
}
