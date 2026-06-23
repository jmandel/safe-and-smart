import {z} from 'zod';
import type {RemoteConnection} from '@remote-dom/core';

export const PROTOCOL_VERSION = 1 as const;

export const FhirRequestSchema = z.object({
  url: z.string().min(1).max(4096),
  init: z
    .object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.unknown().optional(),
    })
    .optional(),
});

export type FhirRequest = z.infer<typeof FhirRequestSchema>;

export const LlmRequestSchema = z.object({
  profile: z.string().min(1).max(100),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().max(100_000),
      }),
    )
    .min(1)
    .max(50),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
});

export type LlmRequest = z.infer<typeof LlmRequestSchema>;

export interface LlmResponse {
  text: string;
  // Optional structured output when the caller passed a responseSchema (the model
  // is asked to return a parsed object, e.g. a list of reconciliation findings).
  data?: unknown;
  model: string;
  profile: string;
  usage: {inputTokens: number; outputTokens: number};
}

// Closed registry of brokered tools a model profile may invoke. The BROKER executes
// the tool (e.g. a scoped FHIR read) and feeds the result back into generation, so
// the applet never needs the underlying capability and a model can't reach beyond
// the allowlist. The model is given results, not raw access.
export const LLM_TOOLS = ['getLatestVitals'] as const;
export type LlmTool = (typeof LLM_TOOLS)[number];

export interface LlmToolCall {
  name: LlmTool;
  summary: string; // human-readable note for the audit log
}

export interface LlmStreamResult {
  model: string;
  profile: string;
  usage: {inputTokens: number; outputTokens: number};
  toolCalls: LlmToolCall[];
}

// Closed vocabulary of audit event codes an applet may emit. The host records the
// code as the authoritative, machine-readable event; the free-text `message` is
// retained only as a bounded, sanitized human label (never trusted, never parsed).
export const APPLET_AUDIT_CODES = [
  'applet.started',
  'applet.security-probe',
  'applet.user-action',
  'applet.review-accepted',
  'applet.review-dismissed',
  'applet.error',
] as const;

export const AppletAuditSchema = z.object({
  kind: z.enum(['lifecycle', 'security-probe', 'application']),
  code: z.enum(APPLET_AUDIT_CODES).optional(),
  message: z.string().min(1).max(2_000),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export type AppletAudit = z.infer<typeof AppletAuditSchema>;

// An applet-supplied stylesheet (CSS Modules / hand-written CSS). The host
// validates it (no url()/scheme/@import/escape-hatch) and installs it, scoped, into
// the applet's ShadowRoot surface. Bounded so a stylesheet can't be a memory DoS.
export const StylesheetSchema = z.object({
  css: z.string().min(1).max(256_000),
});

export type Stylesheet = z.infer<typeof StylesheetSchema>;

export interface StylesheetResult {
  ok: boolean;
  error?: string;
}

export interface ClinicalContext {
  user: {
    id: string;
    display: string;
    practitioner?: string;
  };
  patient: {
    id: string;
    display: string;
  };
  encounter?: {id: string};
  fhirBaseUrl: string;
  grantedScopes: string[];
  applet: {id: string; version: string};
}

// ─────────────────────────────────────────────────────────────────────────────
// The applet capability surface. The trusted wrapper builds this object from its
// handler registry and returns it over the handshake; the applet calls it as
// `session.smart.search(...)`, `session.ai.stream(...)`, etc. There is no separate
// "context" object or flat capability bag — the wire shape IS the API shape (the
// threads serializer proxies nested functions and clones nested data). Each
// namespace below corresponds to exactly one registered host handler.

export interface FhirRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
}

/** SMART-on-FHIR: launch context (data) + scoped FHIR access (methods). Mirrors a
 *  fhirclient client — `smart.patient` and `smart.request()` on one object. */
export interface SmartApi {
  readonly patient: {id: string; display: string};
  readonly user: {id: string; display: string; practitioner?: string};
  readonly encounter?: {id: string};
  readonly scopes: readonly string[];
  readonly fhirBaseUrl: string;
  /** GET a search, e.g. search('Observation', {patient, code}). */
  search(type: string, params?: Record<string, string | number | undefined>): Promise<unknown>;
  /** GET a single resource by id. */
  read(type: string, id: string): Promise<unknown>;
  /** Escape hatch: a relative FHIR URL + init (token attached host-side). */
  request(url: string, init?: FhirRequestInit): Promise<unknown>;
}

/** The model. Also reachable as fetch('https://llm.internal/v1/…') (OpenAI shape). */
export interface AiApi {
  complete(request: LlmRequest): Promise<LlmResponse>;
  stream(request: LlmRequest, onToken: (delta: string) => void): Promise<LlmStreamResult>;
}

/** Presentation: install a validated, ShadowRoot-scoped stylesheet. */
export interface StylesApi {
  add(css: string): Promise<StylesheetResult>;
}

/** Documents: open a token-protected attachment → opaque handle for <Image>. */
export interface FilesApi {
  open(ref: AttachmentRequest): Promise<AttachmentResult>;
}

/** What the trusted host builds + returns over the handshake (the registry). */
export interface HostCapabilities {
  smart: SmartApi;
  ai: AiApi;
  styles: StylesApi;
  files: FilesApi;
  audit(event: AppletAudit): Promise<void>;
}

/** What the applet author sees: host capabilities + the worker-side isolation
 *  probe (added applet-side, since the worker measures its own sandbox). */
export interface Session extends HostCapabilities {
  probe: SecurityProbeResult;
}

export const AttachmentRequestSchema = z.object({
  // A relative FHIR reference (e.g. "Binary/123" or a DocumentReference content
  // url). The demo also accepts "demo:summary" to mint a generated sample doc.
  url: z.string().min(1).max(4096),
  title: z.string().max(200).optional(),
});
export type AttachmentRequest = z.infer<typeof AttachmentRequestSchema>;

export interface AttachmentResult {
  ok: boolean;
  handle?: string;
  contentType?: string;
  error?: string;
}

export interface HostHandshake {
  protocolVersion: typeof PROTOCOL_VERSION;
  remoteConnection: RemoteConnection;
  // The capability surface, namespaced to match the applet's `session.*`. The
  // applet runtime attaches `probe` to form the full Session.
  capabilities: HostCapabilities;
}

export interface HostThreadExports {
  connect(input: {
    protocolVersion: typeof PROTOCOL_VERSION;
    appletId: string;
    appletVersion: string;
  }): Promise<HostHandshake>;
}

export interface AppletThreadExports {
  ping(): Promise<{ok: true; at: string}>;
  dispose(): Promise<void>;
}

export type SecurityProbeResult = {
  directDomUnavailable: boolean;
  directNetworkBlocked: boolean;
  persistentStorageBlocked: boolean;
  details: Record<string, string>;
};
