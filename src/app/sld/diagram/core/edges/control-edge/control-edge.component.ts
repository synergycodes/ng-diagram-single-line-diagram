import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDiagramBaseEdgeComponent, type Edge, type NgDiagramEdgeTemplate } from 'ng-diagram';
import { CONTROL_DASHARRAY } from '../../geometry/constants';
import type { SldLinkEdgeData } from '../../geometry/node-types';

// Hover / select states come from the `.default-edge` CSS rules in `diagram.component.scss`.
@Component({
  selector: 'app-sld-control-edge',
  imports: [NgDiagramBaseEdgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-diagram-base-edge class="default-edge" [edge]="edge()" [strokeDasharray]="dasharray" />
  `,
})
export class SldControlEdgeComponent implements NgDiagramEdgeTemplate<SldLinkEdgeData> {
  readonly edge = input.required<Edge<SldLinkEdgeData>>();
  protected readonly dasharray = CONTROL_DASHARRAY;
}
