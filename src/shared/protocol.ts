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
  audit(event: AppletAudit): Promise<void>;
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
