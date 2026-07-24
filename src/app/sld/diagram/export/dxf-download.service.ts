import { Injectable } from '@angular/core';

// Triggers a browser download of a DXF string — the client-side file-saving
// step for an exported diagram, separate from the model-to-DXF serialization
// (parallel to SvgDownloadService).
@Injectable({ providedIn: 'root' })
export class DxfDownloadService {
  download(dxf: string, baseName = 'sld'): void {
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName}.dxf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
