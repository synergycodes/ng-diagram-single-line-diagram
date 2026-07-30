import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldType, FieldTypeConfig, FormlyAttributes } from '@ngx-formly/core';

// Custom Formly field type for the `sld-input` key: a themed text/number input
// for the properties panel.
@Component({
  selector: 'sld-formly-input',
  imports: [ReactiveFormsModule, FormlyAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sld-input.type.html',
  styleUrl: './sld-field.scss',
})
export class SldFormlyInputType extends FieldType<FieldTypeConfig> {
  // Rejects edits that would leave a decimal field non-numeric (stray letters,
  // a second separator) before they reach the value.
  protected onBeforeInput(event: InputEvent): void {
    if (this.props['inputMode'] !== 'decimal') return;
    const inserted = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
    if (!inserted) return;
    const input = event.target as HTMLInputElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = input.value.slice(0, start) + inserted + input.value.slice(end);
    if (!/^\d*[.,]?\d*$/.test(next)) event.preventDefault();
  }
}
