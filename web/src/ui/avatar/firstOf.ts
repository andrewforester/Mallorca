export async function firstOf<T>(attempts: ReadonlyArray<() => Promise<T>>): Promise<T> {
  let last: unknown = new Error('nothing to try');
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
