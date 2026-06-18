/**
 * Single source of truth for every UI icon in the app.
 *
 * Each entry maps 1:1 to a file at `src/assets/icons/<name>.svg` (served from
 * `assets/icons/`). Adding an icon = drop the SVG file in that folder and add
 * its name here; the union type then makes `<app-icon name="…">` usages
 * compile-checked, so a typo or a missing file is caught at build time.
 *
 * SVG files keep their `viewBox` but no fixed `width`/`height` (size is driven
 * by the host — see `IconComponent`) and use `currentColor` so icons inherit
 * the surrounding text colour and theme automatically.
 */
export const ICON_NAMES = [
  'logo',
  'export',
  'palette-grid',
  'theme-light',
  'theme-dark',
  'zoom-in',
  'zoom-out',
  'fit',
  'minimap',
  'help',
  'collapse-library',
  'search',
  'chevron',
  'close',
  'reshape-arrow',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
