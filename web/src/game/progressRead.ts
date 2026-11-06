export type OnProgress = (received: number, total: number) => void;

function joined(chunks: Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function readWithProgress(
  response: Response,
  onProgress: OnProgress,
): Promise<Uint8Array<ArrayBuffer>> {
  const total = Number(response.headers.get('content-length') ?? 0) || 0;
  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress(bytes.length, total);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }
  return joined(chunks, received);
}
