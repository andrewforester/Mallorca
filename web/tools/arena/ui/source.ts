export interface RunSource {
  runsUrl: string;
  handsUrl(file: string): string;
  empty: string;
}

export function sourceFor(dev: boolean, base: string): RunSource {
  if (dev) {
    return {
      runsUrl: '/api/runs',
      handsUrl: (file) => `/api/hands?file=${encodeURIComponent(file)}`,
      empty: 'No runs yet. Play one with npm run arena and it appears here.',
    };
  }
  return {
    runsUrl: `${base}index.json`,
    handsUrl: (file) => `${base}${encodeURIComponent(file)}`,
    empty: 'No published runs yet.',
  };
}
