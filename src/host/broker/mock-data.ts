import type {FhirResource, Observation, Patient} from '../../shared/fhir';

export const syntheticPatient: Patient = {
  resourceType: 'Patient',
  id: 'demo',
  identifier: [{system: 'urn:synthetic', value: 'DEMO-001'}],
  name: [{given: ['Avery'], family: 'Rivera', text: 'Avery Rivera'}],
  gender: 'female',
  birthDate: '2010-04-10',
};

const measurements = [
  ['2014-06-11', 101.8, 15.8],
  ['2015-05-09', 107.0, 17.1],
  ['2016-05-14', 112.5, 19.0],
  ['2017-06-21', 118.8, 21.4],
  ['2018-07-02', 124.9, 24.6],
  ['2019-07-18', 131.2, 28.2],
  ['2020-08-20', 137.1, 32.1],
  ['2021-08-12', 143.8, 37.0],
  ['2022-09-01', 150.5, 42.9],
  ['2023-08-24', 156.2, 48.1],
  ['2024-09-14', 159.4, 52.0],
  ['2025-10-10', 161.1, 54.8],
] as const;

function observation(
  id: string,
  date: string,
  code: string,
  display: string,
  value: number,
  unit: string,
  unitCode: string,
): Observation {
  return {
    resourceType: 'Observation',
    id,
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs',
          },
        ],
      },
    ],
    code: {
      coding: [{system: 'http://loinc.org', code, display}],
      text: display,
    },
    subject: {reference: 'Patient/demo'},
    effectiveDateTime: date,
    valueQuantity: {
      value,
      unit,
      system: 'http://unitsofmeasure.org',
      code: unitCode,
    },
  };
}

export const syntheticObservations: Observation[] = measurements.flatMap(
  ([date, heightCm, weightKg], index) => {
    const heightM = heightCm / 100;
    const bmi = weightKg / (heightM * heightM);
    return [
      observation(
        `height-${index + 1}`,
        date,
        '8302-2',
        'Body height',
        heightCm,
        'cm',
        'cm',
      ),
      observation(
        `weight-${index + 1}`,
        date,
        '29463-7',
        'Body weight',
        weightKg,
        'kg',
        'kg',
      ),
      observation(
        `bmi-${index + 1}`,
        date,
        '39156-5',
        'Body mass index (BMI)',
        Number(bmi.toFixed(1)),
        'kg/m2',
        'kg/m2',
      ),
    ];
  },
);

export const syntheticConditions: FhirResource[] = [
  {
    resourceType: 'Condition',
    id: 'asthma',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
        },
      ],
    },
    code: {
      coding: [{system: 'http://snomed.info/sct', code: '195967001', display: 'Asthma'}],
      text: 'Asthma',
    },
    subject: {reference: 'Patient/demo'},
  },
];

export const syntheticMedicationRequests: FhirResource[] = [
  {
    resourceType: 'MedicationRequest',
    id: 'albuterol',
    status: 'active',
    intent: 'order',
    subject: {reference: 'Patient/demo'},
    medicationCodeableConcept: {
      text: 'Albuterol inhaler',
    },
    authoredOn: '2025-02-14',
  },
];
