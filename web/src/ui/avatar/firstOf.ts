export interface Found<T> {
  value: T;
  index: number;
}

export async function firstOf<T>(
  attempts: ReadonlyArray<() => Promise<T>>,
  from = 0,
): Promise<Found<T>> {
  let last: unknown = new Error('nothing left to try');
  for (let index = from; index < attempts.length; index++) {
    try {
      return { value: await attempts[index]!(), index };
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
