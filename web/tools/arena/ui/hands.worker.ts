import { parseHands } from './hands.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

let lines: string[] = [];

function reply(message: WorkerResponse): void {
  postMessage(message);
}

async function load(file: string): Promise<void> {
  try {
    const response = await fetch(`/api/hands?file=${encodeURIComponent(file)}`);
    if (!response.ok) throw new Error(`hands file ${file}: ${response.status}`);
    const parsed = parseHands(await response.text());
    lines = parsed.lines;
    reply({ type: 'loaded', summaries: parsed.summaries, skipped: parsed.skipped });
  } catch (error) {
    reply({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
  }
}

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'load') {
    void load(request.file);
    return;
  }
  const line = lines[request.line];
  if (line !== undefined) reply({ type: 'record', id: request.id, record: JSON.parse(line) });
});
