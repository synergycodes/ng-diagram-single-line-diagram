export class DxfLayer {
  constructor(
    public readonly name: string,
    public readonly color: number,
    public readonly lineType = 'Continuous',
  ) {}

  serialize(handle: number): string[] {
    return [
      `  0\nLAYER`,
      `  5\n${handle.toString(16).toUpperCase()}`,
      `  100\nAcDbSymbolTableRecord`,
      `  100\nAcDbLayerTableRecord`,
      `  2\n${this.name}`,
      `  70\n0`,
      `  62\n${this.color}`,
      `  6\n${this.lineType}`,
    ];
  }
}
