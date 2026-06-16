import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldType, FieldTypeConfig, FormlyAttributes } from '@ngx-formly/core';

// Custom Formly field type for the `sld-input` key: a themed text/number input
// for the properties panel. Logic-free — the template binds the inherited
// `formControl`/`props`; this exists only to own the markup and styling.
@Component({
  selector: 'sld-formly-input',
  imports: [ReactiveFormsModule, FormlyAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sld-input.type.html',
  styleUrl: './sld-field.scss',
})
export class SldFormlyInputType extends FieldType<FieldTypeConfig> {}
