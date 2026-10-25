// TJ-ARCH-MOB-001 compliant
// Exhaustive ContentBlock dispatcher. The scaffold renders Text and Divider;
// every other variant renders a labelled placeholder rather than being dropped.
import type { ContentBlock } from '../../../app/transport/dto'

const VARIANT_NAME = {
  text: 'Text',
  thinking: 'Thinking',
  code: 'Code',
  citation: 'Citation',
  memory: 'Memory',
  toolUse: 'ToolUse',
  toolResult: 'ToolResult',
  skill: 'Skill',
  artifact: 'Artifact',
  image: 'Image',
  divider: 'Divider',
} as const satisfies Record<ContentBlock['type'], string>

function TextBlock({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return <p className={isStreaming ? 'prose streaming' : 'prose'}>{text}</p>
}

function DividerBlock() {
  return <div className="block-divider" role="separator" />
}

function NotRendered({ variant }: { variant: ContentBlock['type'] }) {
  return <p className="stopped">Not rendered in this build: {VARIANT_NAME[variant]}</p>
}

export function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlock text={block.text} isStreaming={block.isStreaming} />
    case 'divider':
      return <DividerBlock />
    case 'thinking':
      return <NotRendered variant={block.type} />
    case 'code':
      return <NotRendered variant={block.type} />
    case 'citation':
      return <NotRendered variant={block.type} />
    case 'memory':
      return <NotRendered variant={block.type} />
    case 'toolUse':
      return <NotRendered variant={block.type} />
    case 'toolResult':
      return <NotRendered variant={block.type} />
    case 'skill':
      return <NotRendered variant={block.type} />
    case 'artifact':
      return <NotRendered variant={block.type} />
    case 'image':
      return <NotRendered variant={block.type} />
  }
}
