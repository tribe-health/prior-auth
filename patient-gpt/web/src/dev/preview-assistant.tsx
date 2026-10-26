import { useState } from "react"
import { AssistantRuntimeProvider, useLocalRuntime, type ChatModelAdapter, type ThreadMessageLike } from "@assistant-ui/react"
import { CopyIcon } from "lucide-react"
import { Thread } from "@/components/assistant-ui/elements/thread.aui"
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui"
import { Image } from "@/components/assistant-ui/elements/image"
import { File } from "@/components/assistant-ui/elements/file"
import { AudioPlayer, VideoPlayer } from "@/components/assistant-ui/elements/media-player"
import { ReasoningRoot, ReasoningTrigger, ReasoningContent, ReasoningText } from "@/components/assistant-ui/elements/reasoning"
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from "@/components/assistant-ui/elements/collapsible-root"
import { ShimmerLabel, SwapLabel, paper, floating, field } from "@/components/assistant-ui/elements/surfaces"
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button"
import { Button } from "@/components/ui/button"
import type { PreviewFixture } from "./preview-types"
import toneUrl from "./fixture-tone.wav?url"
import videoUrl from "./fixture-video.mp4?url"
import brandIcon from "../../public/brand/icon.svg?raw"

const imageUrl = `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(brandIcon)))}`
const textFile = "data:text/plain;base64,U3ludGhldGljIGZpeHR1cmUuIE5vIHBhdGllbnQgZGF0YS4="
const markdown = `## Synthetic review

This is **fixture prose** with a [local reference](#assistant).

| Evidence | State |
| --- | --- |
| Document A | Met (circle/check) |
| Document B | Gap (diamond/minus) |
| Document C | Void (dashed circle) |

> Synthetic document · page 1 · October 15, 2026.

\`\`\`typescript
const evidence = { state: "void", source: null };
\`\`\`

- Labels accompany every state.
- No clinical assertion is made by this fixture.`

const initialMessages: ThreadMessageLike[] = [
  {
    id: "preview-user",
    role: "user",
    content: "Show the synthetic review and its attachments.",
    attachments: [
      { id: "preview-document", type: "document", name: "synthetic-document.txt", contentType: "text/plain", status: { type: "complete" }, content: [{ type: "text", text: "Synthetic fixture. No patient data." }] },
      { id: "preview-image", type: "image", name: "brand-icon.svg", contentType: "image/svg+xml", status: { type: "complete" }, content: [{ type: "image", image: imageUrl }] },
    ],
  },
  {
    id: "preview-assistant",
    role: "assistant",
    content: [
      { type: "reasoning", text: "Synthetic reasoning disclosure for styling review. No clinical reasoning was performed." },
      { type: "tool-call", toolCallId: "preview-tool-one", toolName: "preview_document", args: { document: "synthetic-document.txt" }, result: { text: "Synthetic fixture record", page: 1, date: "2026-10-15" } },
      { type: "tool-call", toolCallId: "preview-tool-two", toolName: "preview_missing_source", args: { document: "fixture-missing.txt" }, result: "Synthetic source unavailable", isError: true },
      { type: "text", text: markdown },
      { type: "image", image: imageUrl, filename: "Synthetic brand image" },
      { type: "file", data: textFile, mimeType: "text/plain", filename: "synthetic-document.txt" },
    ],
    status: { type: "complete", reason: "stop" },
  },
]

// An isolated visual fixture: no service, tools, persistence or inference endpoint.
const previewAdapter: ChatModelAdapter = {
  async *run({ abortSignal }) {
    yield { content: [{ type: "text", text: "Preparing the local fixture…" }] }
    await new Promise(resolve => window.setTimeout(resolve, 1200))
    if (abortSignal.aborted) return
    yield { content: [{ type: "text", text: "Local fixture completed. Synthetic document · page 1 · October 15, 2026." }] }
  },
}

const suggestionAdapter = {
  async generate() {
    return [{ prompt: "Show fixture details", title: "Fixture details" }, { prompt: "Show synthetic source", title: "Synthetic source" }]
  },
}

function AssistantConversation() {
  const runtime = useLocalRuntime(previewAdapter, {
    initialMessages,
    adapters: { suggestion: suggestionAdapter },
  })
  return <AssistantRuntimeProvider runtime={runtime}>
    <div className="preview-stack">
      <div className="preview-row">
        <Button variant="secondary" onClick={() => runtime.thread.reset(initialMessages)}>Restore messages</Button>
        <Button variant="secondary" onClick={() => runtime.thread.reset([])}>Empty thread</Button>
        <Button variant="secondary" onClick={() => runtime.thread.reset([{ role: "assistant", content: "Synthetic failure fixture.", status: { type: "incomplete", reason: "error", error: "Synthetic preview error. No request was sent." } }])}>Error message</Button>
        <Button onClick={() => runtime.thread.append("Run the local fixture")}>Streaming and suggestions</Button>
        <Button variant="secondary" onClick={() => runtime.thread.composer.addAttachment({ type: "document", name: "synthetic-composer.txt", contentType: "text/plain", content: [{ type: "text", text: "Synthetic composer attachment" }] })}>Attach synthetic document</Button>
      </div>
      <p className="preview-note">Expand the reasoning and tool groups. Use the controls above for empty, error, streaming, follow-up suggestions, and composer attachments. Thread actions remain in memory.</p>
      <div className="preview-thread-list"><ThreadList /></div>
      <div className="preview-thread"><Thread autoFocus={false} /></div>
    </div>
  </AssistantRuntimeProvider>
}

function AssistantMedia() {
  return <div className="preview-stack">
    <Image.Root><Image.Zoom src={imageUrl} alt="PatientGPT brand fixture"><Image.Preview src={imageUrl} alt="PatientGPT brand fixture" ratio="16:9" /></Image.Zoom><Image.Filename>synthetic-brand.svg</Image.Filename></Image.Root>
    <Image.Generating /><Image.ContentFilterError />
    <File.Root><File.Icon mimeType="text/plain" /><File.Name>synthetic-document.txt</File.Name><File.Size bytes={35} /><File.Download data={textFile} mimeType="text/plain" filename="synthetic-document.txt" /></File.Root>
    <AudioPlayer src={toneUrl} title="Synthetic one-second tone" durationMs={1000} />
    <VideoPlayer src={videoUrl} title="Synthetic one-second color frame" durationMs={1000} />
  </div>
}

function AssistantDisclosure() {
  const [active, setActive] = useState(false)
  return <div className="preview-stack">
    {(["outline", "muted", "ghost"] as const).map(variant => <ReasoningRoot key={variant} variant={variant} defaultOpen><ReasoningTrigger duration={2} /><ReasoningContent><ReasoningText>{variant} reasoning fixture. No clinical content.</ReasoningText></ReasoningContent></ReasoningRoot>)}
    <ReasoningRoot streaming><ReasoningTrigger active /><ReasoningContent><ReasoningText>Streaming reasoning fixture.</ReasoningText></ReasoningContent></ReasoningRoot>
    <CollapsibleRoot><CollapsibleTrigger asChild><Button variant="secondary">Assistant disclosure</Button></CollapsibleTrigger><CollapsibleContent>Local synthetic detail.</CollapsibleContent></CollapsibleRoot>
    <div className="preview-row"><div className={`${paper} preview-swatch`}>Paper</div><div className={`${floating} preview-swatch`}>Inverse</div><div className={`${field} preview-swatch`}>Field</div></div>
    <div className="preview-row"><ShimmerLabel active>Working fixture</ShimmerLabel><Button variant="secondary" onClick={() => setActive(value => !value)}><SwapLabel active={active ? 1 : 0}>{["First label", "Second label"]}</SwapLabel></Button><TooltipIconButton tooltip="Fixture copy control"><CopyIcon /></TooltipIconButton></div>
  </div>
}

export const assistantFixtures: PreviewFixture[] = [
  { id: "assistant", title: "Assistant UI conversation", modules: ["assistant/thread.aui", "assistant/thread-list.aui", "assistant/attachment.aui", "assistant/follow-up-suggestions.aui", "assistant/markdown-text", "assistant/reasoning.aui", "assistant/tool-fallback.aui", "assistant/tool-group.aui"], states: "Seeded user and assistant, attachments, markdown, reasoning, successful and failed tool records; controls enable empty/error/streaming/suggestions", Component: AssistantConversation },
  { id: "assistant-media", title: "Assistant UI files and media", modules: ["assistant/image", "assistant/file", "assistant/media-player"], states: "Image zoom, generating, content-filter error, file download, playable local audio/video", Component: AssistantMedia },
  { id: "assistant-disclosure", title: "Assistant UI surfaces and disclosure", modules: ["assistant/reasoning", "assistant/collapsible-root", "assistant/surfaces", "assistant/tooltip-icon-button"], states: "Outline/muted/ghost, open and streaming reasoning, surface roles, shimmer, label swap, tooltip", Component: AssistantDisclosure },
]
