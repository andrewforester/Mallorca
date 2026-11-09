import type { LoadProgress } from './workerProtocol.ts';

export function loadingOf(progress: LoadProgress): LoadProgress | null {
  return progress.total > 0 && progress.received >= progress.total ? null : progress;
}
