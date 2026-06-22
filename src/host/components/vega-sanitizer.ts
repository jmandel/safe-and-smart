const forbiddenKeys = new Set([
  'url',
  'href',
  'src',
  'image',
  'loader',
  'baseURL',
]);

export function sanitizeVegaSpec(untrusted: unknown): Record<string, unknown> {
  const encoded = JSON.stringify(untrusted);
  if (encoded.length > 1_500_000) {
    throw new Error('Vega specification exceeds the 1.5 MB host budget.');
  }

  const clone = structuredClone(untrusted);
  assertSafeValue(clone, '$');

  if (!clone || typeof clone !== 'object' || Array.isArray(clone)) {
    throw new Error('Vega specification must be an object.');
  }

  return clone as Record<string, unknown>;
}

function assertSafeValue(value: unknown, path: string): void {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
    if (typeof value === 'string' && /(?:javascript|data|https?|wss?|file):/i.test(value)) {
      throw new Error(`External or executable URL rejected at ${path}.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > 100_000) throw new Error(`Array budget exceeded at ${path}.`);
    value.forEach((item, index) => assertSafeValue(item, `${path}[${index}]`));
    return;
  }

  if (typeof value !== 'object') {
    throw new Error(`Unsupported Vega value at ${path}.`);
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      throw new Error(`Vega key ${key} is not available in the sandbox at ${path}.`);
    }
    if (key === 'expr' || key === 'signal') {
      // Vega expressions are useful for interactive charts, but should be reviewed
      // separately before production. The spike allows ordinary string expressions
      // while rejecting URL-bearing values recursively.
      if (typeof child !== 'string' && typeof child !== 'object') {
        throw new Error(`Invalid expression at ${path}.${key}.`);
      }
    }
    assertSafeValue(child, `${path}.${key}`);
  }
}
