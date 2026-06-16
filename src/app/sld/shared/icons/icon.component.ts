import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
  input,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import type { SafeHtml } from '@angular/platform-browser';
import { IconRegistryService } from './icon-registry.service';
import type { IconName } from './icon-name';

/**
 * Renders a named SVG icon from `assets/icons/`.
 *
 * Usage:
 *   <app-icon name="zoom-in" [size]="18" />   <!-- explicit pixel size -->
 *   <app-icon name="search" class="my-icon" /> <!-- size from your own CSS -->
 *
 * Why a component (instead of inline `<svg>` in templates): it keeps markup
 * out of HTML, gives one compile-checked list of icons, and lets icons be
 * fetched lazily and cached. The SVG is inlined (not an `<img>`) so its
 * `currentColor` strokes follow the surrounding text colour and theme.
 *
 * Sizing: pass `[size]` for a square pixel size, or leave it unset and size the
 * host `<app-icon>` element via a CSS class — the inner `<svg>` always fills the
 * host. `ViewEncapsulation.None` is used so the `<svg>` (injected via innerHTML,
 * which carries no component scoping attributes) is still reachable by these
 * styles; every rule is namespaced under `app-icon`, so nothing leaks out.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<span class="app-icon__svg" [innerHTML]="markup()"></span>`,
  styles: `
    app-icon {
      display: inline-flex;
      flex-shrink: 0;
      line-height: 0;
    }
    app-icon .app-icon__svg {
      display: contents;
    }
    app-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
  host: {
    // Icons are decorative — the interactive element (button/link) carries the
    // accessible name, so hide the glyph from assistive tech.
    'aria-hidden': 'true',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
})
export class IconComponent {
  private readonly registry = inject(IconRegistryService);

  /** Name of the icon to render — must match a file in `assets/icons/`. */
  readonly name = input.required<IconName>();

  /** Optional square size in px. When unset, size comes from host CSS. */
  readonly size = input<number>();

  // Re-fetch whenever `name` changes; null until the (cached) file resolves.
  protected readonly markup = toSignal<SafeHtml | null>(
    toObservable(this.name).pipe(switchMap((name) => this.registry.load(name))),
    { initialValue: null },
  );
}
