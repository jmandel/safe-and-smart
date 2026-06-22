// Build-time constants. Bun's build.ts replaces import.meta.env.* via --define;
// these declarations keep `tsc` happy without Vite's vite/client types.
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_SANDBOX_ORIGIN?: string;
  readonly VITE_FHIR_BASE_URL?: string;
  readonly VITE_FHIR_PATIENT_ID?: string;
  readonly VITE_USE_MOCK?: string;
  readonly VITE_SMART_ISS?: string;
  readonly VITE_SMART_CLIENT_ID?: string;
  readonly VITE_SMART_SCOPE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// CSS is bundled by Bun from these side-effect imports.
declare module '*.css';
