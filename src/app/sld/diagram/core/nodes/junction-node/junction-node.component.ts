import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgDiagramPortComponent, type NgDiagramNodeTemplate, type Node } from 'ng-diagram';
import { SLD_JUNCTION_PORT_IDS, type SldJunctionNodeData } from '../../geometry/node-types';

// Each port gets a different `side` so the orthogonal router has a direction
// hint for edges meeting here.
@Component({
  selector: 'app-sld-junction-node',
  imports: [NgDiagramPortComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'kind-' + kind()" },
  templateUrl: './junction-node.component.html',
  styleUrl: './junction-node.component.scss',
})
export class SldJunctionNodeComponent implements NgDiagramNodeTemplate<SldJunctionNodeData> {
  readonly node = input.required<Node<SldJunctionNodeData>>();

  protected readonly portIds = SLD_JUNCTION_PORT_IDS;
  protected readonly kind = computed(() => this.node().data.kind ?? 'power');
}
