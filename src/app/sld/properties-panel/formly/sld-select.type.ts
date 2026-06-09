import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldType, FieldTypeConfig, FormlyAttributes } from '@ngx-formly/core';

interface SelectOption {
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'sld-formly-select',
  imports: [ReactiveFormsModule, FormlyAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sld-select.type.html',
  styleUrl: './sld-field.scss',
})
export class SldFormlySelectType extends FieldType<FieldTypeConfig> {
  // Can't name this `options` — FieldType already exposes `options: FormlyFormOptions`.
  selectOptions(): readonly SelectOption[] {
    const fromProps = this.props['options'] as readonly SelectOption[] | undefined;
    return fromProps ?? [];
  }
}
