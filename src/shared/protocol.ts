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

/**
 * This is intentionally broad. It approximates possession of the current
 * clinician's SMART FHIR client without revealing its bearer token.
 */
export interface ClinicalCapabilityApi {
  fhirRequest(request: FhirRequest): Promise<unknown>;
  llmComplete(request: LlmRequest): Promise<LlmResponse>;
  // Streaming completion: the broker pushes text deltas through onToken (a proxied
  // callback over the MessagePort) as they are produced, optionally invoking
  // allowlisted tools first. Resolves with usage + the tool calls it made.
  llmStream(request: LlmRequest, onToken: (delta: string) => void): Promise<LlmStreamResult>;
  audit(event: AppletAudit): Promise<void>;
  // Register a validated, scoped stylesheet for this applet's surface. Resolves
  // {ok:false,error} if the CSS is rejected (url/scheme/@import/escape-hatch).
  registerStylesheet(input: Stylesheet): Promise<StylesheetResult>;
  // Fetch a (token-protected) attachment host-side and return an OPAQUE handle to
  // render via <ui-image>. The applet never receives the URL or the token.
  fetchAttachment(input: AttachmentRequest): Promise<AttachmentResult>;
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
  clinical: ClinicalCapabilityApi;
  context: ClinicalContext;
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
