export type TaskEventFrame = { readonly id: string | null; readonly data: unknown };

/** Parse bounded SSE frames across UTF-8 and CRLF chunk boundaries. */
export async function readTaskEvents(response: Response, signal: AbortSignal, receive: (frame: TaskEventFrame) => void): Promise<void> {
  if (!response.body) throw new Error('The task stream has no body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const abort = () => { void reader.cancel(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (!signal.aborted) {
      const result = await reader.read();
      pending += decoder.decode(result.value, { stream: !result.done });
      if (pending.length > 2_100_000) throw new Error('The task event exceeds its contract.');
      let separator = /\r?\n\r?\n/.exec(pending);
      while (separator) {
        const frame = pending.slice(0, separator.index);
        pending = pending.slice(separator.index + separator[0].length);
        const data: string[] = [];
        let id: string | null = null;
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
          if (line.startsWith('id:')) id = line.slice(3).replace(/^ /, '');
        }
        if (data.length && !signal.aborted) receive({ id, data: JSON.parse(data.join('\n')) as unknown });
        separator = /\r?\n\r?\n/.exec(pending);
      }
      if (result.done) {
        if (pending.trim()) throw new Error('The task stream ended inside an event.');
        return;
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
