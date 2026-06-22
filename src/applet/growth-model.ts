import type {Observation} from '../shared/fhir';

export type Metric = 'height' | 'weight' | 'bmi';
export type ReferencePopulation = 'general-a' | 'general-b' | 'condition-cohort';
export type Sex = 'female' | 'male';

export interface MeasurementPoint {
  age: number;
  date: string;
  value: number;
  unit: string;
}

const codeByMetric: Record<Metric, string> = {
  height: '8302-2',
  weight: '29463-7',
  bmi: '39156-5',
};

export const metricLabels: Record<Metric, string> = {
  height: 'Height',
  weight: 'Weight',
  bmi: 'BMI',
};

export function extractMeasurements(
  observations: Observation[],
  metric: Metric,
  birthDate: string,
): MeasurementPoint[] {
  return observations
    .filter((observation) => observation.code.coding?.some((coding) => coding.code === codeByMetric[metric]))
    .flatMap((observation) => {
      const effective = observation.effectiveDateTime;
      const value = observation.valueQuantity?.value;
      if (!effective || value == null) return [];
      return [
        {
          age: Number(ageInYears(birthDate, effective).toFixed(2)),
          date: effective.slice(0, 10),
          value: Number(value.toFixed(1)),
          unit: observation.valueQuantity?.unit ?? '',
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildGrowthSpec({
  measurements,
  metric,
  sex,
  population,
  maximumAge,
}: {
  measurements: MeasurementPoint[];
  metric: Metric;
  sex: Sex;
  population: ReferencePopulation;
  maximumAge: number;
}): Record<string, unknown> {
  const percentiles = [3, 10, 50, 90, 97];
  const reference = percentiles.flatMap((percentile) =>
    Array.from({length: Math.floor(maximumAge) + 1}, (_, index) => {
      const age = index; // reference curves run from birth (age 0)
      return {
        kind: 'Reference',
        series: `${percentile}th percentile`,
        age,
        value: referenceValue(metric, age, percentile, sex, population),
        date: '',
      };
    }),
  );
  const patient = measurements
    .filter((point) => point.age <= maximumAge)
    .map((point) => ({
      kind: 'Patient',
      series: 'Avery Rivera',
      age: point.age,
      value: point.value,
      date: point.date,
    }));

  const unit = measurements.at(-1)?.unit ?? (metric === 'height' ? 'cm' : metric === 'weight' ? 'kg' : 'kg/m²');

  return {
    width: 'container',
    height: 400,
    background: 'transparent',
    data: {values: [...reference, ...patient]},
    layer: [
      {
        transform: [{filter: "datum.kind === 'Reference'"}],
        mark: {type: 'line', opacity: 0.5, strokeWidth: 1.25},
        encoding: {
          x: {
            field: 'age',
            type: 'quantitative',
            title: 'Age (years)',
            scale: {domain: [0, 18]},
          },
          y: {
            field: 'value',
            type: 'quantitative',
            title: `${metricLabels[metric]} (${unit})`,
            scale: {zero: false},
          },
          detail: {field: 'series'},
          color: {
            field: 'series',
            type: 'nominal',
            legend: {title: 'Synthetic reference'},
          },
          tooltip: [
            {field: 'series', type: 'nominal', title: 'Curve'},
            {field: 'age', type: 'quantitative', title: 'Age'},
            {field: 'value', type: 'quantitative', title: metricLabels[metric], format: '.1f'},
          ],
        },
      },
      {
        transform: [{filter: "datum.kind === 'Patient'"}],
        mark: {type: 'line', point: {filled: true, size: 75}, strokeWidth: 3},
        encoding: {
          x: {field: 'age', type: 'quantitative'},
          y: {field: 'value', type: 'quantitative'},
          color: {value: '#111827'},
          tooltip: [
            {field: 'date', type: 'temporal', title: 'Date'},
            {field: 'age', type: 'quantitative', title: 'Age', format: '.2f'},
            {field: 'value', type: 'quantitative', title: metricLabels[metric], format: '.1f'},
          ],
        },
      },
    ],
    config: {
      axis: {labelFontSize: 11, titleFontSize: 12},
      legend: {labelFontSize: 10, orient: 'bottom'},
      view: {stroke: null},
    },
  };
}

function ageInYears(birthDate: string, date: string): number {
  // Birth dates are date-only (force UTC midnight); observation effective times
  // may be full ISO datetimes, which Date parses directly.
  const born = new Date(`${birthDate.slice(0, 10)}T00:00:00Z`).getTime();
  const measured = new Date(date.length > 10 ? date : `${date}T00:00:00Z`).getTime();
  return (measured - born) / (365.2425 * 24 * 60 * 60 * 1000);
}

function referenceValue(
  metric: Metric,
  age: number,
  percentile: number,
  sex: Sex,
  population: ReferencePopulation,
): number {
  const zByPercentile: Record<number, number> = {3: -1.88, 10: -1.28, 50: 0, 90: 1.28, 97: 1.88};
  const z = zByPercentile[percentile] ?? 0;
  const median = interpolate(medians[metric][sex], age);
  const cohortFactor =
    population === 'general-b'
      ? metric === 'height'
        ? 1.004
        : 0.985
      : population === 'condition-cohort'
        ? metric === 'height'
          ? 0.955
          : metric === 'weight'
            ? 0.91
            : 0.97
        : 1;

  if (metric === 'height') return Number((median * cohortFactor + z * (3.5 + age * 0.12)).toFixed(1));
  if (metric === 'weight') return Number((median * cohortFactor * Math.exp(z * 0.13)).toFixed(1));
  return Number((median * cohortFactor + z * 1.35).toFixed(1));
}

function interpolate(values: number[], age: number): number {
  // Median arrays are indexed by whole-year age starting at birth (index 0 = age 0).
  const bounded = Math.max(0, Math.min(18, age));
  const lowerAge = Math.floor(bounded);
  const upperAge = Math.ceil(bounded);
  const lower = values[lowerAge] ?? values[0]!;
  const upper = values[upperAge] ?? values.at(-1)!;
  return lower + (upper - lower) * (bounded - lowerAge);
}

// Index 0 = birth (age 0), index 1 = age 1, then ages 2..18. Synthetic medians.
const medians: Record<Metric, Record<Sex, number[]>> = {
  height: {
    female: [50, 74, 86, 95, 102, 109, 115, 121, 127, 133, 139, 145, 151, 156, 160, 162, 163, 164, 164],
    male: [50, 76, 87, 96, 103, 110, 116, 122, 128, 134, 140, 146, 152, 159, 166, 171, 174, 176, 177],
  },
  weight: {
    female: [3.3, 9.2, 12.5, 14.3, 16.2, 18.2, 20.6, 23.2, 26.4, 30.1, 34.5, 39.4, 44.2, 48.5, 51.8, 54.0, 55.4, 56.2, 56.7],
    male: [3.5, 9.6, 13.0, 14.7, 16.7, 18.7, 21.0, 23.7, 26.8, 30.5, 34.8, 39.5, 44.5, 49.7, 55.2, 60.4, 64.4, 67.1, 68.8],
  },
  bmi: {
    female: [13.3, 17.2, 16.5, 16.1, 15.8, 15.6, 15.5, 15.6, 15.8, 16.2, 16.8, 17.5, 18.2, 18.8, 19.3, 19.7, 20.0, 20.2, 20.3],
    male: [13.4, 17.3, 16.6, 16.2, 15.9, 15.6, 15.5, 15.6, 15.8, 16.1, 16.5, 17.0, 17.6, 18.2, 18.8, 19.4, 19.9, 20.3, 20.6],
  },
};
