// Host-side attachment registry. The broker fetches a token-protected attachment,
// mints a same-origin blob object URL, and stores it here under an OPAQUE handle.
// The applet only ever receives the handle — never the URL or the token — and the
// ui-image renderer resolves the handle back to the URL host-side. This is why an
// applet can display a protected document without being able to exfiltrate its URL
// or re-point an <img> at an arbitrary destination.
interface Attachment {
  url: string; // blob: object URL (host origin)
  contentType: string;
}

const registry = new Map<string, Attachment>();
let counter = 0;

export function registerAttachment(url: string, contentType: string): string {
  const handle = `att_${counter++}_${Math.random().toString(36).slice(2, 10)}`;
  registry.set(handle, {url, contentType});
  return handle;
}

export function getAttachment(handle: string): Attachment | undefined {
  return registry.get(handle);
}

export function revokeAttachment(handle: string): void {
  const entry = registry.get(handle);
  if (entry) {
    URL.revokeObjectURL(entry.url);
    registry.delete(handle);
  }
}
