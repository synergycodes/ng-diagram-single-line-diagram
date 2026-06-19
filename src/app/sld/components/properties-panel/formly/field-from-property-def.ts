import type { FormlyFieldConfig } from '@ngx-formly/core';
import type { PropertyDef } from '../../../symbols/types';

// `<input type="number">` emits strings — parsers coerce back to numeric so JSON-serialised data stays typed.
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
      inputType: property.type === 'number' ? 'number' : 'text',
    },
    parsers:
      property.type === 'number'
        ? [(value) => (value === '' || value == null ? null : Number(value))]
        : undefined,
  };
}
