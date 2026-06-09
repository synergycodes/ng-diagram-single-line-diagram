import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import type { SldWireNodeData } from '../../geometry/node-types';

// No ng-diagram ports — endpoints are inferred geometrically; connections come from `ConnectivityService`.
@Component({
  selector: 'app-sld-wire-node',
  imports: [NgDiagramNodeResizeAdornmentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: NgDiagramNodeSelectedDirective, inputs: ['node'] }],
  templateUrl: './wire-node.component.html',
  styleUrl: './wire-node.component.scss',
})
export class SldWireNodeComponent implements NgDiagramNodeTemplate<SldWireNodeData> {
  readonly node = input.required<Node<SldWireNodeData>>();

  readonly isVertical = computed(() => this.node().data.orientation === 'vertical');

  protected readonly resizeHorizontal = computed(() => !this.isVertical());
  protected readonly resizeVertical = computed(() => this.isVertical());
}
