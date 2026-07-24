/**
 * A named DXF text style. Always renders with Arial — the font file is hard-coded
 * in `serialize()`. Add a `fontFile` parameter (or a font registry) when a future
 * renderer needs a different family.
 */
export class DxfTextStyle {
  constructor(
    public readonly name: string,
    public readonly bold = false,
  ) {}

  serialize(handle: number): string[] {
    const fontFile = this.bold ? 'arialbd.ttf' : 'arial.ttf';
    // TrueType family and weight ride in XDATA under the "ACAD" appid
    // (registered in the writer's APPID table). 1071 flags: 0x01000000
    // italic, 0x02000000 bold.
    const ttfFlags = this.bold ? 0x2000000 : 0;
    return [
      `  0\nSTYLE`,
      `  5\n${handle.toString(16).toUpperCase()}`,
      `  100\nAcDbSymbolTableRecord`,
      `  100\nAcDbTextStyleTableRecord`,
      `  2\n${this.name}`,
      `  70\n0`,
      `  40\n0.0`,
      `  41\n1.0`,
      `  50\n0.0`,
      `  71\n0`,
      `  42\n2.5`,
      `  3\n${fontFile}`,
      `  4\n`,
      `  1001\nACAD`,
      `  1000\nArial`,
      `  1071\n${ttfFlags}`,
    ];
  }
}
