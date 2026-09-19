import { describe, expect, it, vi } from 'vitest';
import { readTaskEvents } from './task-event-stream';

describe('document SSE framing', () => {
  it('reassembles UTF-8 split bytes, CRLF and multiline data without treating keepalives as events', async () => {
    const bytes = new TextEncoder().encode(': keepalive\r\n\r\nid: task:1\r\ndata: {"type":"TEXT_MESSAGE_CONTENT",\r\ndata: "delta":"Synthetic café"}\r\n\r\n');
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    const receive = vi.fn();
    await readTaskEvents(new Response(body), new AbortController().signal, receive);
    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenCalledWith({ id: 'task:1', data: { type: 'TEXT_MESSAGE_CONTENT', delta: 'Synthetic café' } });
  });
  it('refuses truncated events without publishing their partial payload', async () => {
    const receive = vi.fn();
    await expect(readTaskEvents(new Response('id: task:1\ndata: {"type":'), new AbortController().signal, receive)).rejects.toThrow();
    expect(receive).not.toHaveBeenCalled();
  });
});
