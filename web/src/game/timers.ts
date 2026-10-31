export interface Timers {
  sleep(ms: number): Promise<void>;
  cancel(): void;
}

export function createTimers(): Timers {
  const pending = new Map<ReturnType<typeof setTimeout>, () => void>();
  return {
    sleep: (ms) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(timer);
          resolve();
        }, ms);
        pending.set(timer, resolve);
      }),
    cancel: () => {
      for (const [timer, resolve] of pending) {
        clearTimeout(timer);
        resolve();
      }
      pending.clear();
    },
  };
}
