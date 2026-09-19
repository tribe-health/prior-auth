import { RoutePlaceholder } from './route-placeholder';

export function Component() {
  return <RoutePlaceholder eyebrow="Administration · Practice controls" title="Configure access without clinical authority." description="Manage membership, integrations, and policy sources while keeping surgeon affirmations, approval, and signing separate." items={['Practice membership and roles', 'Policy source catalog', 'Integration health']} note="Administrative permission cannot affirm a gate, approve a letter, or apply a surgeon signature." action="Open configuration" />;
}
