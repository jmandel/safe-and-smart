// Applet runtime / SDK. A standalone applet (built with Bun/Vite, using React +
// any pure libraries like Zustand) compiles against this: it imports `runApplet`
// and passes its root component. The runtime owns the worker-side protocol —
// handshake, security probe, and Remote DOM wiring — so applet authors write
// only their React app. Bundled as a self-contained CLASSIC worker script, the
// result can be hosted anywhere (GitHub Pages, a CDN, S3) and loaded at runtime
// by any wrapper that speaks this protocol.
//
// Import order matters: the worker prelude runs FIRST (it neutralizes
// importScripts / nested workers before any other code can capture them), then
// native-globals before the Remote DOM polyfills so isolation reporting can tell
// the synthetic worker DOM from a real one.
import './worker-prelude';
import './native-globals';
import '@remote-dom/core/polyfill';
import '@remote-dom/react/polyfill';

import React from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {BatchingRemoteConnection} from '@remote-dom/core/elements';
import {ThreadMessagePort} from '@quilted/threads';
import {
  PROTOCOL_VERSION,
  type AppletThreadExports,
  type HostThreadExports,
  type Session,
} from '../shared/protocol';
import {RootElement} from './remote-elements';
import {runSecurityProbe} from './security-probe';

export interface AppletProps {
  session: Session;
}

export interface AppletManifest {
  appletId: string;
  appletVersion: string;
}

let reactRoot: Root | undefined;
let connected = false;

export function runApplet(App: React.ComponentType<AppletProps>, manifest: AppletManifest) {
  self.addEventListener(
    'message',
    (event: MessageEvent<{type?: string; probeUrl?: string}>) => {
      if (connected || event.data?.type !== 'clinical-applet/connect') return;
      const port = event.ports[0];
      if (!port) throw new Error('Applet worker did not receive its MessagePort.');
      connected = true;
      port.start();
      void start(App, manifest, port, event.data.probeUrl ?? 'http://127.0.0.1:4174/probe');
    },
  );
}

async function start(
  App: React.ComponentType<AppletProps>,
  manifest: AppletManifest,
  port: MessagePort,
  probeUrl: string,
) {
  const thread = new ThreadMessagePort<HostThreadExports, AppletThreadExports>(port, {
    exports: {
      async ping() {
        return {ok: true as const, at: new Date().toISOString()};
      },
      async dispose() {
        reactRoot?.unmount();
        reactRoot = undefined;
      },
    },
  });

  const handshake = await thread.imports.connect({
    protocolVersion: PROTOCOL_VERSION,
    appletId: manifest.appletId,
    appletVersion: manifest.appletVersion,
  });

  if (handshake.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version ${handshake.protocolVersion}.`);
  }

  const probe = await runSecurityProbe(probeUrl);
  // The handshake already speaks `session.*` (the host built it from its handler
  // registry). The applet runtime just attaches the worker-side isolation probe.
  const session: Session = {...handshake.capabilities, probe};

  // Install the capability fetch facades AFTER the probe (so the probe still
  // measures real native-fetch isolation). They give applets clean, familiar
  // ergonomics — `fetch('https://llm.internal/v1/chat/completions', …)` (or the
  // real `openai` client at that baseURL) and `fetch('https://fhir.internal/<rel>')`
  // — by routing into the SAME session handlers. No key, no token, no real network.
  installCapabilityBridges(session);
  await session.audit({
    kind: 'security-probe',
    code: 'applet.security-probe',
    message: `DOM=${probe.directDomUnavailable}; network=${probe.directNetworkBlocked}; storage=${probe.persistentStorageBlocked}`,
    detail: probe.details,
  });

  const rootElement = document.createElement('remote-root') as InstanceType<typeof RootElement>;
  rootElement.connect(new BatchingRemoteConnection(handshake.remoteConnection));
  document.body.append(rootElement);

  reactRoot = createRoot(rootElement);
  reactRoot.render(<App session={session} />);
}

// Sentinel bases the applet's HTTP-style calls target. Neither is a real host;
// both are recognized by the fetch shim and routed to the broker, giving applets
// clean, familiar `fetch()` ergonomics with NO token and NO raw resource URL ever
// present in the sandbox. Use LLM_BASE as the `baseURL` for the openai client, and
// FHIR_BASE like a normal FHIR endpoint (`fetch('https://fhir.internal/Patient/1')`).
const LLM_BASE = 'https://llm.internal/';
const FHIR_BASE = 'https://fhir.internal/';

let bridgeInstalled = false;

function installCapabilityBridges(session: Session) {
  if (bridgeInstalled) return;
  bridgeInstalled = true;
  const realFetch = typeof self.fetch === 'function' ? self.fetch.bind(self) : undefined;

  self.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(LLM_BASE)) return bridgeChatCompletion(session, init, input);
    if (url.startsWith(FHIR_BASE)) return bridgeFhirRequest(session, url, init, input);
    // Everything else stays unavailable — the applet has no ambient network.
    // (Native fetch is already CSP-blocked; we surface a clear error.)
    if (realFetch) return realFetch(input as RequestInfo, init);
    throw new TypeError('Direct network is blocked in the applet sandbox.');
  }) as typeof fetch;
}

// Translate a `fetch('https://fhir.internal/<relative FHIR URL>')` into a brokered
// fhirRequest and return the parsed resource as a normal JSON Response. The broker
// attaches the SMART token, validates/relativizes the URL, and enforces budgets;
// the applet never sees the credential or the absolute server URL.
async function bridgeFhirRequest(
  session: Session,
  url: string,
  init: RequestInit | undefined,
  input: RequestInfo | URL,
): Promise<Response> {
  const relative = url.slice(FHIR_BASE.length);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() as
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE';
  const headers: Record<string, string> = {};
  if (init?.headers) new Headers(init.headers).forEach((value, key) => (headers[key] = value));
  const rawBody =
    init?.body != null
      ? typeof init.body === 'string'
        ? init.body
        : new TextDecoder().decode(init.body as ArrayBuffer)
      : input instanceof Request
        ? await input.text().catch(() => '')
        : '';

  try {
    const resource = await session.smart.request(relative, {
      method,
      headers,
      body: rawBody ? rawBody : undefined,
    });
    return new Response(JSON.stringify(resource), {
      status: 200,
      headers: {'content-type': 'application/fhir+json'},
    });
  } catch (error) {
    // Surface broker rejections as an HTTP-shaped error the applet can handle,
    // mirroring how a real FHIR server would respond with an OperationOutcome.
    const outcome = {
      resourceType: 'OperationOutcome',
      issue: [{severity: 'error', code: 'processing', diagnostics: (error as Error).message}],
    };
    return new Response(JSON.stringify(outcome), {
      status: 400,
      headers: {'content-type': 'application/fhir+json'},
    });
  }
}

// Translate an OpenAI /v1/chat/completions request into a brokered llmComplete
// call and return an OpenAI-shaped chat.completion response. When the caller asks
// for JSON (response_format), the message content is the JSON-encoded structured
// result — exactly the contract OpenAI's JSON mode uses.
async function bridgeChatCompletion(
  session: Session,
  init: RequestInit | undefined,
  input: RequestInfo | URL,
): Promise<Response> {
  const raw =
    init?.body != null
      ? typeof init.body === 'string'
        ? init.body
        : new TextDecoder().decode(init.body as ArrayBuffer)
      : input instanceof Request
        ? await input.text()
        : '{}';
  const body = JSON.parse(raw || '{}') as {
    model?: string;
    messages?: Array<{role: 'system' | 'user' | 'assistant'; content: unknown}>;
    response_format?: {type?: string; json_schema?: {schema?: Record<string, unknown>}};
  };

  const messages = (body.messages ?? []).map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  // Streaming: present an OpenAI-style SSE chunk stream, fed by the broker's
  // llmStream (which pushes deltas through a proxied onToken callback).
  if ((body as {stream?: boolean}).stream) {
    const encoder = new TextEncoder();
    const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const onToken = (delta: string) =>
          controller.enqueue(
            sse({
              id: 'chatcmpl-sandbox',
              object: 'chat.completion.chunk',
              choices: [{index: 0, delta: {content: delta}, finish_reason: null}],
            }),
          );
        try {
          await session.ai.stream({profile: body.model ?? 'default', messages}, onToken);
          controller.enqueue(sse({choices: [{index: 0, delta: {}, finish_reason: 'stop'}]}));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(stream, {status: 200, headers: {'content-type': 'text/event-stream'}});
  }

  const wantsJson =
    body.response_format?.type === 'json_object' || body.response_format?.type === 'json_schema';

  const result = await session.ai.complete({
    profile: body.model ?? 'default', // in the brokered world, "model" == approved profile
    messages,
    responseSchema: wantsJson ? body.response_format?.json_schema?.schema ?? {} : undefined,
  });

  const content =
    result.data !== undefined
      ? JSON.stringify({summary: result.text, ...(result.data as object)})
      : result.text;

  const completion = {
    id: 'chatcmpl-sandbox',
    object: 'chat.completion',
    created: 0,
    model: result.model,
    choices: [{index: 0, message: {role: 'assistant', content}, finish_reason: 'stop'}],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.inputTokens + result.usage.outputTokens,
    },
  };
  return new Response(JSON.stringify(completion), {
    status: 200,
    headers: {'content-type': 'application/json'},
  });
}
