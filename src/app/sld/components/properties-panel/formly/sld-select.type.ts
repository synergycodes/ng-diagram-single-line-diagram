import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldType, FieldTypeConfig, FormlyAttributes } from '@ngx-formly/core';

interface SelectOption {
  readonly label: string;
  readonly value: string;
}

// Custom Formly field type for the `sld-select` key: a themed dropdown for
// enumerated symbol properties in the properties panel.
@Component({
  selector: 'sld-formly-select',
  imports: [ReactiveFormsModule, FormlyAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sld-select.type.html',
  styleUrl: './sld-field.scss',
})
export class SldFormlySelectType extends FieldType<FieldTypeConfig> {
  selectOptions(): readonly SelectOption[] {
    const fromProps = this.props['options'] as readonly SelectOption[] | undefined;
    return fromProps ?? [];
  }
}
