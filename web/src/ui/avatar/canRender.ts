export interface Device {
  webgl: boolean;
  renderer?: string;
  cores?: number;
  memoryGb?: number;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function renderable(device: Device): boolean {
  if (!device.webgl || SOFTWARE.test(device.renderer ?? '')) return false;
  if (device.cores !== undefined && device.cores <= 2) return false;
  return device.memoryGb === undefined || device.memoryGb > 2;
}

function probe(): Pick<Device, 'webgl' | 'renderer'> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl === null) return { webgl: false };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : undefined;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl: true, renderer };
  } catch {
    return { webgl: false };
  }
}

export function canRender(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return renderable({
    ...probe(),
    cores: nav.hardwareConcurrency || undefined,
    memoryGb: nav.deviceMemory,
  });
}
