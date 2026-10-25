// TJ-ARCH-MOB-001 compliant
// Minimal text/event-stream reader for a fetch response body. A POST cannot
// use EventSource, so the stream is read and split on blank lines here.
// Only `data:` fields are used; the AG-UI event JSON is the data payload.

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = drain(buffer, onData)
  }
  buffer += decoder.decode()
  if (buffer.trim() !== '') drain(`${buffer}\n\n`, onData)
}

function drain(buffer: string, onData: (data: string) => void): string {
  const normalized = buffer.replace(/\r\n?/g, '\n')
  const frames = normalized.split('\n\n')
  const rest = frames.pop() ?? ''
  for (const frame of frames) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (data !== '') onData(data)
  }
  return rest
}
