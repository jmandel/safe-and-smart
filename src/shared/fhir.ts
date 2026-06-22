export interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

export interface FhirBundle<T extends FhirResource = FhirResource>
  extends FhirResource {
  resourceType: 'Bundle';
  type: 'searchset' | 'collection';
  total?: number;
  entry?: Array<{fullUrl?: string; resource: T}>;
}

export interface Observation extends FhirResource {
  resourceType: 'Observation';
  status: string;
  code: {coding?: Array<{system?: string; code?: string; display?: string}>; text?: string};
  subject?: {reference?: string};
  effectiveDateTime?: string;
  valueQuantity?: {value?: number; unit?: string; system?: string; code?: string};
}

export interface Patient extends FhirResource {
  resourceType: 'Patient';
  name?: Array<{given?: string[]; family?: string; text?: string}>;
  gender?: string;
  birthDate?: string;
}
