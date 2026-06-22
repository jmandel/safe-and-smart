import {
  AppletAuditSchema,
  FhirRequestSchema,
  LlmRequestSchema,
  type AppletAudit,
  type ClinicalCapabilityApi,
  type ClinicalContext,
  type LlmRequest,
  type LlmResponse,
} from '../../shared/protocol';
import {FhirRequestCapability, LiveFhirTransport, MockFhirTransport, type FhirTransport} from './fhir-capability';
import {adjudicate, type MedListEntry, type NoteInput} from '../../shared/med-recon';

// Demo wiring: point at an open SMART R4 sandbox server and a real Synthea
// patient with longitudinal vital-signs. Override via build-time env vars, or
// set VITE_USE_MOCK=1 to fall back to the fully offline synthetic transport.
const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';
const FHIR_BASE_URL = import.meta.env.VITE_FHIR_BASE_URL ?? 'https://r4.smarthealthit.org';
const FHIR_PATIENT_ID =
  import.meta.env.VITE_FHIR_PATIENT_ID ?? '0d1c4ee3-084d-4818-9689-783e94162748';

export interface AuditRecord {
  at: string;
  source: 'host' | 'applet';
  operation: string;
  summary: string;
  outcome: 'success' | 'denied' | 'error';
  durationMs?: number;
}

export class ClinicalBroker {
  readonly context: ClinicalContext;
  readonly #fhir: FhirRequestCapability;
  readonly #auditSubscribers = new Set<(record: AuditRecord) => void>();

  // When `init` is provided (e.g. after a real SMART launch), the broker uses that
  // live transport + launch context; otherwise it falls back to the configured
  // live/mock open-endpoint demo.
  constructor(init?: {
    transport: FhirTransport;
    patient: {id: string; display: string};
    user?: {id: string; display: string; practitioner?: string};
    encounter?: {id: string};
    scopes?: string[];
  }) {
    const transport = init?.transport ?? (USE_MOCK ? new MockFhirTransport() : new LiveFhirTransport(FHIR_BASE_URL));
    const patient = init?.patient ?? {
      id: USE_MOCK ? 'demo' : FHIR_PATIENT_ID,
      display: USE_MOCK ? 'Demo patient' : 'SMART sandbox patient',
    };

    this.context = {
      // No fabricated clinician identity. A real SMART launch supplies the user
      // via openid/fhirUser; the open-endpoint demo has no authenticated user.
      user: init?.user ?? {id: '', display: 'Open FHIR demo (no SMART launch)'},
      patient,
      ...(init?.encounter ? {encounter: init.encounter} : {}),
      fhirBaseUrl: transport.baseUrl,
      grantedScopes: init?.scopes ?? [],
      applet: {id: 'unknown', version: '0'}, // replaced with the applet's declared id on connect
    };
    this.#fhir = new FhirRequestCapability(transport, {
      allowWrites: false,
      maximumResponseBytes: 4_000_000,
    });
  }

  subscribeAudit(callback: (record: AuditRecord) => void): () => void {
    this.#auditSubscribers.add(callback);
    return () => this.#auditSubscribers.delete(callback);
  }

  capabilityApi(): ClinicalCapabilityApi {
    return {
      fhirRequest: async (untrustedInput) => {
        const started = performance.now();
        try {
          const request = FhirRequestSchema.parse(untrustedInput);
          const result = await this.#fhir.request(request);
          this.#emit({
            at: new Date().toISOString(),
            source: 'applet',
            operation: 'fhir.request',
            summary: summarizeFhirUrl(request.url),
            outcome: 'success',
            durationMs: Math.round(performance.now() - started),
          });
          return result;
        } catch (error) {
          this.#emit({
            at: new Date().toISOString(),
            source: 'applet',
            operation: 'fhir.request',
            summary: error instanceof Error ? error.message : 'FHIR request failed',
            outcome: error instanceof Error && error.message.includes('disabled') ? 'denied' : 'error',
            durationMs: Math.round(performance.now() - started),
          });
          throw error;
        }
      },
      llmComplete: async (untrustedInput): Promise<LlmResponse> => {
        const started = performance.now();
        const request = LlmRequestSchema.parse(untrustedInput);
        // Deterministic stand-in for a real model so the repo runs without PHI,
        // credentials, or network. A production adapter lives in the trusted shell
        // behind this same interface and forwards to a covered model profile.
        const response = mockLlmComplete(request);
        this.#emit({
          at: new Date().toISOString(),
          source: 'applet',
          operation: 'llm.complete',
          summary: `profile=${request.profile}; messages=${request.messages.length}`,
          outcome: 'success',
          durationMs: Math.round(performance.now() - started),
        });
        return response;
      },
      audit: async (untrustedInput: AppletAudit) => {
        const event = AppletAuditSchema.parse(untrustedInput);
        this.#emit({
          at: new Date().toISOString(),
          source: 'applet',
          operation: `applet.${event.kind}`,
          summary: event.message,
          outcome: 'success',
        });
      },
    };
  }

  #emit(record: AuditRecord) {
    for (const callback of this.#auditSubscribers) callback(record);
  }
}

// Deterministic stand-in for a frontier model. For the med-reconciliation
// profile it does the actual extraction + reconciliation work the model would do
// (taking the structured list + notes and returning structured findings); other
// profiles get a short narrative. A production adapter replaces this with a real
// model call behind the identical LlmResponse contract.
function mockLlmComplete(request: LlmRequest): LlmResponse {
  const inputTokens = Math.ceil(
    request.messages.reduce((sum, item) => sum + item.content.length, 0) / 4,
  );
  const base = {profile: request.profile, model: 'local-deterministic-demo'} as const;

  if (request.profile.includes('med-reconciliation')) {
    const userMessage = [...request.messages].reverse().find((m) => m.role === 'user');
    try {
      const payload = JSON.parse(userMessage?.content ?? '{}') as {
        medList?: MedListEntry[];
        notes?: NoteInput[];
      };
      const result = adjudicate(payload.medList ?? [], payload.notes ?? []);
      return {
        ...base,
        text: result.summary,
        data: {discrepancies: result.discrepancies, structured: result.structured},
        usage: {inputTokens, outputTokens: Math.ceil(result.summary.length / 4)},
      };
    } catch {
      return {...base, text: 'Unable to parse reconciliation input.', usage: {inputTokens, outputTokens: 8}};
    }
  }

  return {
    ...base,
    text:
      'The synthetic longitudinal measurements show steady height and weight gain. ' +
      'The most recent values remain close to the selected reference trajectory. ' +
      'This demonstration is not a clinical interpretation and uses fabricated data.',
    usage: {inputTokens, outputTokens: 45},
  };
}

function summarizeFhirUrl(url: string): string {
  const [path, query] = url.split('?', 2);
  const params = new URLSearchParams(query ?? '');
  const names = Array.from(new Set(params.keys())).sort();
  return names.length === 0 ? path : `${path}?${names.join('&')}`;
}
