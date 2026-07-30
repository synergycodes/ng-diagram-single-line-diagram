import type { FormlyFieldConfig } from '@ngx-formly/core';
import type { PropertyDef } from '../../../symbols/types';

export function parseDecimal(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
}

export function fieldFromPropertyDef(property: PropertyDef): FormlyFieldConfig {
  if (property.type === 'select') {
    return {
      key: property.key,
      type: 'sld-select',
      props: {
        label: property.label,
        options: (property.options ?? []).map((value) => ({ label: value, value })),
      },
    };
  }
  return {
    key: property.key,
    type: 'sld-input',
    props: {
      label: property.label,
      unit: property.unit,
      inputMode: property.type === 'number' ? 'decimal' : undefined,
    },
  };
}
