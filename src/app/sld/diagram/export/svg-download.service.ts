import { Injectable } from '@angular/core';

// Triggers a browser download of an SVG string — the client-side file-saving
// step for an exported diagram, separate from the model-to-SVG serialization.
@Injectable({ providedIn: 'root' })
export class SvgDownloadService {
  // Wrap the markup in a Blob and click a synthetic <a download> — the standard
  // way to save a generated string client-side with no server round-trip.
  download(svg: string, baseName = 'sld'): void {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
