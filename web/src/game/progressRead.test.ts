import { describe, expect, it } from 'vitest';
import { readWithProgress } from './progressRead.ts';

function response(chunks: number[][], length: string | null): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new Uint8Array(chunk));
      }
      controller.close();
    },
  });
  const headers = new Headers();
  if (length !== null) {
    headers.set('content-length', length);
  }
  return new Response(body, { headers });
}

describe('readWithProgress', () => {
  it('returns every byte and reports the bytes received against the length', async () => {
    const seen: [number, number][] = [];
    const bytes = await readWithProgress(response([[1, 2], [3], [4, 5, 6]], '6'), (r, t) =>
      seen.push([r, t]),
    );
    expect([...bytes]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen.at(-1)).toEqual([6, 6]);
    expect(seen.map(([received]) => received)).toEqual(
      [...seen.map(([r]) => r)].sort((a, b) => a - b),
    );
  });

  it('reports a total of zero when the length is unknown', async () => {
    const seen: [number, number][] = [];
    await readWithProgress(response([[1], [2]], null), (r, t) => seen.push([r, t]));
    expect(seen.every(([, total]) => total === 0)).toBe(true);
  });
});
