export interface Device {
  webgl: boolean;
  cores?: number;
  memoryGb?: number;
}

export function renderable(device: Device): boolean {
  if (!device.webgl) return false;
  if (device.cores !== undefined && device.cores <= 2) return false;
  return device.memoryGb === undefined || device.memoryGb > 2;
}

function hasWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  } catch {
    return false;
  }
}

export function canRender(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return renderable({
    webgl: hasWebgl(),
    cores: nav.hardwareConcurrency || undefined,
    memoryGb: nav.deviceMemory,
  });
}
