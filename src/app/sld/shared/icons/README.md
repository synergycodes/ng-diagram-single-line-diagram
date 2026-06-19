# icons

All UI icons in one place. Each icon is an SVG file under
`src/assets/icons/<name>.svg` (served from `assets/icons/`), rendered by the
`<app-icon>` component.

## Add an icon

1. Drop `my-icon.svg` into `src/assets/icons/`. Keep its `viewBox`, drop fixed
   `width`/`height`, and use `stroke="currentColor"` / `fill="currentColor"` so
   it inherits text colour and theme.
2. Add `'my-icon'` to `ICON_NAMES` in `icon-name.ts` (the single source of truth
   — this makes `<app-icon name="my-icon">` compile-checked).

## Use it

```html
<app-icon name="zoom-in" [size]="18" />
<!-- pixel size -->
<app-icon name="search" class="my-css-class" />
<!-- size from your CSS -->
```

The SVG is fetched once, cached (`IconRegistryService`), and inlined so
`currentColor` works.
