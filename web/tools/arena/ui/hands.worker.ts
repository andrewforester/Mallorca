import { decodeHands, parseHands } from './hands.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

let lines: string[] = [];

function reply(message: WorkerResponse): void {
  postMessage(message);
}

async function load(url: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const parsed = parseHands(await decodeHands(new Uint8Array(await response.arrayBuffer())));
    lines = parsed.lines;
    reply({ type: 'loaded', summaries: parsed.summaries, skipped: parsed.skipped });
  } catch (error) {
    reply({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
  }
}

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'load') {
    void load(request.url);
    return;
  }
  const line = lines[request.line];
  if (line === undefined) reply({ type: 'missing', id: request.id, line: request.line });
  else reply({ type: 'record', id: request.id, record: JSON.parse(line) });
});
