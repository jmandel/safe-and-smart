import type {SecurityProbeResult} from '../shared/protocol';
import {nativeGlobals} from './native-globals';

export async function runSecurityProbe(probeUrl: string): Promise<SecurityProbeResult> {
  const details: Record<string, string> = {};
  // Measure the *native* worker environment captured before Remote DOM installed
  // its synthetic rendering tree. The synthetic document is not a window onto the
  // host page; it only serializes mutations across the MessagePort.
  const directDomUnavailable = !nativeGlobals.hadDocument && !nativeGlobals.hadWindow;
  details.dom = directDomUnavailable
    ? 'No native window or document in the worker; UI is a host-serialized Remote DOM tree.'
    : 'Unexpected native DOM global detected.';

  let directNetworkBlocked = false;
  try {
    const response = await fetch(probeUrl, {cache: 'no-store'});
    directNetworkBlocked = false;
    details.network = `Unexpected direct fetch response: ${response.status}`;
  } catch (error) {
    directNetworkBlocked = true;
    details.network = error instanceof Error ? error.message : 'Direct fetch failed.';
  }

  let persistentStorageBlocked = false;
  try {
    if (!('indexedDB' in globalThis)) {
      persistentStorageBlocked = true;
      details.storage = 'IndexedDB is unavailable.';
    } else {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('clinical-sandbox-probe', 1);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB failed.'));
        request.onupgradeneeded = () => request.result.createObjectStore('probe');
        request.onsuccess = () => {
          request.result.close();
          indexedDB.deleteDatabase('clinical-sandbox-probe');
          resolve();
        };
      });
      details.storage = 'IndexedDB unexpectedly opened in the applet origin.';
    }
  } catch (error) {
    persistentStorageBlocked = true;
    details.storage = error instanceof Error ? error.message : 'Persistent storage failed.';
  }

  return {
    directDomUnavailable,
    directNetworkBlocked,
    persistentStorageBlocked,
    details,
  };
}
