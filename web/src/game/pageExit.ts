export interface PageEvents {
  addEventListener(type: string, listener: () => void): void;
}

export interface PageDocument extends PageEvents {
  readonly visibilityState: string;
}

export function onPageExit(win: PageEvents, doc: PageDocument, exit: () => void): void {
  win.addEventListener('pagehide', exit);
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      exit();
    }
  });
}
