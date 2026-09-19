import { RoutePlaceholder } from './route-placeholder';

export function Component() {
  return <RoutePlaceholder eyebrow="Practice settings · Integrations" title="Connected systems, visible boundaries." description="Review the services that supply identity, chart records, payer policy, real-time updates, and submission delivery." items={['AdvancedMD chart connection', 'Ory Kratos identity service', 'Electric real-time fabric']} note="Connection changes require an administrator and remain unavailable in the clinical demo." action="Configure connection" />;
}
