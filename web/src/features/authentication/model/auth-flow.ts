export type AuthFlowKind = 'login' | 'recovery';
export type AuthMessageKind = 'error' | 'info' | 'success';
export type AuthInputType =
  | 'checkbox'
  | 'email'
  | 'hidden'
  | 'number'
  | 'password'
  | 'submit'
  | 'tel'
  | 'text'
  | 'url';

export interface AuthFlowMessage {
  readonly id: number | string;
  readonly kind: AuthMessageKind;
  readonly text: string;
}

export interface AuthFlowInputNode {
  readonly key: string;
  readonly group: string;
  readonly name: string;
  readonly type: AuthInputType;
  readonly value: string | boolean;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly autocomplete?: string;
  readonly label: string;
  readonly messages: readonly AuthFlowMessage[];
}

export interface AuthFlow {
  readonly id: string;
  readonly kind: AuthFlowKind;
  readonly expiresAt: string;
  readonly action: string;
  readonly method: 'POST';
  readonly messages: readonly AuthFlowMessage[];
  readonly nodes: readonly AuthFlowInputNode[];
}

const INPUT_TYPES = new Set<AuthInputType>([
  'checkbox',
  'email',
  'hidden',
  'number',
  'password',
  'submit',
  'tel',
  'text',
  'url',
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function messages(value: unknown): AuthFlowMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    const item = record(candidate);
    if (!item || typeof item.text !== 'string' || item.text.trim() === '') return [];
    const kind = item.type === 'error' || item.type === 'success' ? item.type : 'info';
    return [{
      id: typeof item.id === 'number' || typeof item.id === 'string' ? item.id : index,
      kind,
      text: item.text,
    }];
  });
}

function label(node: Record<string, unknown>, name: string): string {
  const meta = record(node.meta);
  const candidate = record(meta?.label)?.text;
  return typeof candidate === 'string' && candidate.trim() !== '' ? candidate : name;
}

function inputNode(value: unknown, index: number): AuthFlowInputNode | null {
  const node = record(value);
  const attributes = record(node?.attributes);
  if (node?.type !== 'input' || !attributes) return null;
  if (typeof attributes.name !== 'string' || attributes.name.trim() === '') return null;
  if (typeof attributes.type !== 'string' || !INPUT_TYPES.has(attributes.type as AuthInputType)) {
    return null;
  }
  const inputType = attributes.type as AuthInputType;
  const rawValue = attributes.value;
  const normalizedValue = typeof rawValue === 'boolean'
    ? rawValue
    : typeof rawValue === 'string' || typeof rawValue === 'number'
      ? String(rawValue)
      : '';
  return {
    key: `${String(node.group ?? 'default')}:${attributes.name}:${index}`,
    group: typeof node.group === 'string' ? node.group : 'default',
    name: attributes.name,
    type: inputType,
    value: normalizedValue,
    required: attributes.required === true,
    disabled: attributes.disabled === true,
    autocomplete: typeof attributes.autocomplete === 'string'
      ? attributes.autocomplete
      : undefined,
    label: label(node, attributes.name),
    messages: messages(node.messages),
  };
}

function actionPath(
  action: string,
  kind: AuthFlowKind,
  flowId: string,
  applicationUrl: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(action, applicationUrl);
  } catch {
    return null;
  }
  if (parsed.pathname !== `/self-service/${kind}` || parsed.searchParams.get('flow') !== flowId) {
    return null;
  }
  return `${parsed.pathname}${parsed.search}`;
}

export function parseAuthFlow(
  value: unknown,
  kind: AuthFlowKind,
  expectedId: string,
  applicationUrl: string,
): AuthFlow | null {
  const flow = record(value);
  const ui = record(flow?.ui);
  if (!flow || !ui) return null;
  if (flow.id !== expectedId || flow.type !== 'browser') return null;
  if (typeof flow.expires_at !== 'string' || !Number.isFinite(Date.parse(flow.expires_at))) {
    return null;
  }
  if (typeof ui.action !== 'string' || String(ui.method).toUpperCase() !== 'POST') return null;
  const action = actionPath(ui.action, kind, expectedId, applicationUrl);
  if (!action || !Array.isArray(ui.nodes)) return null;
  const nodes = ui.nodes.flatMap((node, index) => {
    const parsed = inputNode(node, index);
    return parsed ? [parsed] : [];
  });
  if (nodes.length === 0) return null;
  return {
    id: expectedId,
    kind,
    expiresAt: flow.expires_at,
    action,
    method: 'POST',
    messages: messages(ui.messages),
    nodes,
  };
}
