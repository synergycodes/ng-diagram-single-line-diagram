import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { map, shareReplay, type Observable } from 'rxjs';
import type { IconName } from './icon-name';

/** Where the icon SVG files are served from (see angular.json `assets`). */
const ICON_BASE_PATH = 'assets/icons';

/**
 * Loads and caches icon SVG markup.
 *
 * Icons live as real files on disk (`assets/icons/*.svg`) and are fetched once
 * over HTTP, then inlined into the DOM so their `currentColor` strokes pick up
 * the current theme. We cache the request `Observable` per name (`shareReplay`)
 * so the file is fetched a single time no matter how many `<app-icon>` instances
 * reference it.
 *
 * The markup is passed through `DomSanitizer` — the icons are first-party assets,
 * not user input, so trusting them is safe and keeps `currentColor` working
 * (Angular's default sanitiser would otherwise strip parts of the SVG).
 */
@Injectable({ providedIn: 'root' })
export class IconRegistryService {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cache = new Map<IconName, Observable<SafeHtml>>();

  /** Returns a (shared, cached) stream of the icon's trusted SVG markup. */
  load(name: IconName): Observable<SafeHtml> {
    let request = this.cache.get(name);
    if (!request) {
      request = this.http.get(`${ICON_BASE_PATH}/${name}.svg`, { responseType: 'text' }).pipe(
        map((svg) => this.sanitizer.bypassSecurityTrustHtml(svg)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.cache.set(name, request);
    }
    return request;
  }
}
