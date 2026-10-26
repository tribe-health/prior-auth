// TJ-ARCH-MOB-001 compliant
// Fail closed, in place. The runtime rejects a whole batch that names a
// component outside the catalog; the Flutter shell instead renders a labelled
// stand-in where that component would have been. To match it, each unknown
// component is replaced, before the runtime sees it, by a caption Text that
// names what was skipped. None of the skipped component's properties survive.
import { notRenderedLabel } from './a2ui-contract'

export type QuarantinedComponent = { surfaceId: string; componentId: string; name: string }

export type QuarantineResult = {
  messages: readonly unknown[]
  quarantined: readonly QuarantinedComponent[]
}

type Rec = Record<string, unknown>

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stand(component: Rec, name: string): Rec {
  return { id: component.id, component: 'Text', variant: 'caption', text: notRenderedLabel(name) }
}

export function quarantineUnknownComponents(input: readonly unknown[], allowed: ReadonlySet<string>): QuarantineResult {
  const quarantined: QuarantinedComponent[] = []
  const messages = input.map((message) => {
    if (!isRec(message) || !isRec(message.updateComponents)) return message
    const update = message.updateComponents
    const { surfaceId, components } = update
    if (typeof surfaceId !== 'string' || !Array.isArray(components)) return message
    const next = components.map((c: unknown) => {
      if (!isRec(c) || typeof c.component !== 'string' || typeof c.id !== 'string') return c
      if (allowed.has(c.component)) return c
      quarantined.push({ surfaceId, componentId: c.id, name: c.component })
      return stand(c, c.component)
    })
    return { ...message, updateComponents: { ...update, components: next } }
  })
  return { messages, quarantined }
}
