import { type DxfDocument } from './dxf-document';
import { formatCoord } from './dxf-format';
import { DxfLayer } from './dxf-layer';
import { type DxfHeaderPair } from './dxf-types';

/**
 * Serializes a DxfDocument into a valid DXF ASCII string.
 * Produces AutoCAD 2013 (AC1027) compatible output.
 *
 * AutoCAD parses DXF strictly according to the declared $ACADVER. For R2000+
 * (AC1015 and later) the file must carry a full structural skeleton — the
 * VPORT / LTYPE / LAYER / STYLE / VIEW / UCS / APPID / DIMSTYLE / BLOCK_RECORD
 * tables, `*Model_Space` / `*Paper_Space` block definitions, and an OBJECTS
 * section with the named-object dictionary tree (layouts, plot-style
 * placeholder). Online viewers tolerate files without it; AutoCAD rejects them
 * ("Invalid or incomplete DXF input -- drawing discarded"). The skeleton
 * written here mirrors the output of dxflib/QCAD, a shape AutoCAD is known to
 * accept.
 */

/**
 * Fixed handles for the structural skeleton. Values follow the dxflib/QCAD
 * layout. Dynamic records (layers, text styles, entities) are allocated from
 * DYNAMIC_HANDLE_START upward, so the two ranges can never collide; $HANDSEED
 * is written one past the last dynamic handle.
 */
const HANDLE = {
  TABLE_BLOCK_RECORD: '1',
  TABLE_LAYER: '2',
  TABLE_STYLE: '3',
  TABLE_LTYPE: '5',
  TABLE_VIEW: '6',
  TABLE_UCS: '7',
  TABLE_VPORT: '8',
  TABLE_APPID: '9',
  TABLE_DIMSTYLE: 'A',
  DICT_ROOT: 'C',
  DICT_ACAD_GROUP: 'D',
  DICT_PLOT_STYLE_NAME: 'E',
  PLOT_STYLE_PLACEHOLDER: 'F',
  APPID_ACAD: '12',
  LTYPE_BY_BLOCK: '14',
  LTYPE_BY_LAYER: '15',
  LTYPE_CONTINUOUS: '16',
  DICT_LAYOUT: '1A',
  BLOCK_RECORD_PAPER_SPACE: '1B',
  BLOCK_PAPER_SPACE: '1C',
  ENDBLK_PAPER_SPACE: '1D',
  LAYOUT_PAPER: '1E',
  BLOCK_RECORD_MODEL_SPACE: '1F',
  BLOCK_MODEL_SPACE: '20',
  ENDBLK_MODEL_SPACE: '21',
  LAYOUT_MODEL: '22',
  DIMSTYLE_STANDARD: '27',
  VPORT_ACTIVE: '31',
} as const;

const DYNAMIC_HANDLE_START = 0x100;

export class DxfWriter {
  serialize(doc: DxfDocument): string {
    let handle = DYNAMIC_HANDLE_START;
    const nextHandle = () => handle++;

    // The body is built first so the final handle count is known when the
    // header ($HANDSEED) is written.
    const body: string[] = [];
    this.writeClasses(body);
    this.writeTables(body, doc, nextHandle);
    this.writeBlocks(body);
    this.writeEntities(body, doc, nextHandle);
    this.writeObjects(body);

    const parts: string[] = [];
    this.writeHeader(parts, doc, handle);
    parts.push(...body);
    this.writeEof(parts);
    return parts.join('\n');
  }

  private writeHeader(parts: string[], doc: DxfDocument, handleSeed: number): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nHEADER');

    for (const [name, pairs] of doc.getHeaderVars()) {
      parts.push(`  9\n${name}`);
      for (const pair of pairs) {
        parts.push(`  ${pair.code}\n${pair.value}`);
      }
    }

    parts.push('  9\n$HANDSEED');
    parts.push(`  5\n${handleSeed.toString(16).toUpperCase()}`);

    parts.push('  0\nENDSEC');
  }

  private writeClasses(parts: string[]): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nCLASSES');
    parts.push('  0\nENDSEC');
  }

  private writeTables(parts: string[], doc: DxfDocument, nextHandle: () => number): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nTABLES');

    this.writeVportTable(parts, doc);
    this.writeLineTypeTable(parts);
    this.writeLayerTable(parts, doc, nextHandle);
    const dimTextStyleHandle = this.writeStyleTable(parts, doc, nextHandle);
    this.writeEmptyTable(parts, 'VIEW', HANDLE.TABLE_VIEW);
    this.writeEmptyTable(parts, 'UCS', HANDLE.TABLE_UCS);
    this.writeAppIdTable(parts);
    this.writeDimStyleTable(parts, dimTextStyleHandle);
    this.writeBlockRecordTable(parts);

    parts.push('  0\nENDSEC');
  }

  private writeVportTable(parts: string[], doc: DxfDocument): void {
    // Initial view centered on the drawing extents, so AutoCAD opens the file
    // already showing the schematic instead of an empty origin view.
    const extents = this.readExtents(doc);
    const centerX = extents ? (extents.minX + extents.maxX) / 2 : 0;
    const centerY = extents ? (extents.minY + extents.maxY) / 2 : 0;
    const width = extents ? extents.maxX - extents.minX : 0;
    const height = extents && extents.maxY - extents.minY > 0 ? extents.maxY - extents.minY : 297;
    const aspect = width > 0 ? width / height : 1.5;

    parts.push('  0\nTABLE');
    parts.push('  2\nVPORT');
    parts.push(`  5\n${HANDLE.TABLE_VPORT}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push('  70\n1');

    parts.push('  0\nVPORT');
    parts.push(`  5\n${HANDLE.VPORT_ACTIVE}`);
    parts.push('  100\nAcDbSymbolTableRecord');
    parts.push('  100\nAcDbViewportTableRecord');
    parts.push('  2\n*Active');
    parts.push('  70\n0');
    parts.push('  10\n0.0');
    parts.push('  20\n0.0');
    parts.push('  11\n1.0');
    parts.push('  21\n1.0');
    parts.push(`  12\n${formatCoord(centerX)}`);
    parts.push(`  22\n${formatCoord(centerY)}`);
    parts.push('  13\n0.0');
    parts.push('  23\n0.0');
    parts.push('  14\n10.0');
    parts.push('  24\n10.0');
    parts.push('  15\n10.0');
    parts.push('  25\n10.0');
    parts.push('  16\n0.0');
    parts.push('  26\n0.0');
    parts.push('  36\n1.0');
    parts.push('  17\n0.0');
    parts.push('  27\n0.0');
    parts.push('  37\n0.0');
    parts.push(`  40\n${formatCoord(height * 1.1)}`);
    parts.push(`  41\n${formatCoord(aspect)}`);
    parts.push('  42\n50.0');
    parts.push('  43\n0.0');
    parts.push('  44\n0.0');
    parts.push('  50\n0.0');
    parts.push('  51\n0.0');
    parts.push('  71\n0');
    parts.push('  72\n100');
    parts.push('  73\n1');
    parts.push('  74\n3');
    parts.push('  75\n0');
    parts.push('  76\n1');
    parts.push('  77\n0');
    parts.push('  78\n0');

    parts.push('  0\nENDTAB');
  }

  private readExtents(
    doc: DxfDocument,
  ): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
    const num = (pairs: readonly DxfHeaderPair[] | undefined, code: number): number | undefined => {
      const value = Number(pairs?.find((pair) => pair.code === code)?.value);
      return Number.isFinite(value) ? value : undefined;
    };
    const min = doc.getHeaderVars().get('$EXTMIN');
    const max = doc.getHeaderVars().get('$EXTMAX');
    const minX = num(min, 10);
    const minY = num(min, 20);
    const maxX = num(max, 10);
    const maxY = num(max, 20);
    if (minX === undefined || minY === undefined || maxX === undefined || maxY === undefined) {
      return undefined;
    }
    return { minX, minY, maxX, maxY };
  }

  private writeLineTypeTable(parts: string[]): void {
    parts.push('  0\nTABLE');
    parts.push('  2\nLTYPE');
    parts.push(`  5\n${HANDLE.TABLE_LTYPE}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push('  70\n3');

    // ByBlock and ByLayer are mandatory linetype records in R2000+ files.
    const records: readonly [handle: string, name: string, description: string][] = [
      [HANDLE.LTYPE_BY_BLOCK, 'ByBlock', ''],
      [HANDLE.LTYPE_BY_LAYER, 'ByLayer', ''],
      [HANDLE.LTYPE_CONTINUOUS, 'Continuous', 'Solid line'],
    ];
    for (const [handle, name, description] of records) {
      parts.push('  0\nLTYPE');
      parts.push(`  5\n${handle}`);
      parts.push('  100\nAcDbSymbolTableRecord');
      parts.push('  100\nAcDbLinetypeTableRecord');
      parts.push(`  2\n${name}`);
      parts.push('  70\n0');
      parts.push(`  3\n${description}`);
      parts.push('  72\n65');
      parts.push('  73\n0');
      parts.push('  40\n0.0');
    }

    parts.push('  0\nENDTAB');
  }

  private writeLayerTable(parts: string[], doc: DxfDocument, nextHandle: () => number): void {
    // Layer "0" is mandatory in every DXF file; prepend it unless the
    // document already defines one.
    const docLayers = doc.getLayers();
    const layers = docLayers.some((layer) => layer.name === '0')
      ? docLayers
      : [new DxfLayer('0', 7), ...docLayers];

    parts.push('  0\nTABLE');
    parts.push('  2\nLAYER');
    parts.push(`  5\n${HANDLE.TABLE_LAYER}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push(`  70\n${layers.length}`);

    for (const layer of layers) {
      parts.push(...layer.serialize(nextHandle()));
      // R2000+ layer record trailer: default lineweight and a hard pointer to
      // the plot-style placeholder object written in the OBJECTS section.
      parts.push('  370\n-3');
      parts.push(`  390\n${HANDLE.PLOT_STYLE_PLACEHOLDER}`);
    }

    parts.push('  0\nENDTAB');
  }

  private writeStyleTable(
    parts: string[],
    doc: DxfDocument,
    nextHandle: () => number,
  ): string | undefined {
    const styles = doc.getTextStyles();

    parts.push('  0\nTABLE');
    parts.push('  2\nSTYLE');
    parts.push(`  5\n${HANDLE.TABLE_STYLE}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push(`  70\n${styles.length}`);

    // The returned handle becomes DIMTXSTY (group 340) on the DIMSTYLE
    // "Standard" record: the style named Standard, first style as fallback.
    let standardHandle: string | undefined;
    let firstHandle: string | undefined;
    for (const style of styles) {
      const handle = nextHandle();
      const hex = handle.toString(16).toUpperCase();
      firstHandle ??= hex;
      if (standardHandle === undefined && style.name.toUpperCase() === 'STANDARD') {
        standardHandle = hex;
      }
      parts.push(...style.serialize(handle));
    }

    parts.push('  0\nENDTAB');
    return standardHandle ?? firstHandle;
  }

  private writeEmptyTable(parts: string[], name: string, handle: string): void {
    parts.push('  0\nTABLE');
    parts.push(`  2\n${name}`);
    parts.push(`  5\n${handle}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push('  70\n0');
    parts.push('  0\nENDTAB');
  }

  private writeAppIdTable(parts: string[]): void {
    // Every appid referenced by XDATA (group 1001) must be registered here.
    parts.push('  0\nTABLE');
    parts.push('  2\nAPPID');
    parts.push(`  5\n${HANDLE.TABLE_APPID}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push('  70\n1');

    parts.push('  0\nAPPID');
    parts.push(`  5\n${HANDLE.APPID_ACAD}`);
    parts.push('  100\nAcDbSymbolTableRecord');
    parts.push('  100\nAcDbRegAppTableRecord');
    parts.push('  2\nACAD');
    parts.push('  70\n0');

    parts.push('  0\nENDTAB');
  }

  private writeDimStyleTable(parts: string[], textStyleHandle: string | undefined): void {
    parts.push('  0\nTABLE');
    parts.push('  2\nDIMSTYLE');
    parts.push(`  5\n${HANDLE.TABLE_DIMSTYLE}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push('  70\n1');
    parts.push('  100\nAcDbDimStyleTable');
    parts.push('  71\n1');

    parts.push('  0\nDIMSTYLE');
    // DIMSTYLE records carry their handle in group 105, not 5.
    parts.push(`  105\n${HANDLE.DIMSTYLE_STANDARD}`);
    parts.push('  100\nAcDbSymbolTableRecord');
    parts.push('  100\nAcDbDimStyleTableRecord');
    parts.push('  2\nStandard');
    parts.push('  70\n0');
    if (textStyleHandle !== undefined) {
      parts.push(`  340\n${textStyleHandle}`);
    }

    parts.push('  0\nENDTAB');
  }

  private writeBlockRecordTable(parts: string[]): void {
    parts.push('  0\nTABLE');
    parts.push('  2\nBLOCK_RECORD');
    parts.push(`  5\n${HANDLE.TABLE_BLOCK_RECORD}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push('  70\n2');

    const records: readonly [handle: string, name: string, layoutHandle: string][] = [
      [HANDLE.BLOCK_RECORD_MODEL_SPACE, '*Model_Space', HANDLE.LAYOUT_MODEL],
      [HANDLE.BLOCK_RECORD_PAPER_SPACE, '*Paper_Space', HANDLE.LAYOUT_PAPER],
    ];
    for (const [handle, name, layoutHandle] of records) {
      parts.push('  0\nBLOCK_RECORD');
      parts.push(`  5\n${handle}`);
      parts.push('  100\nAcDbSymbolTableRecord');
      parts.push('  100\nAcDbBlockTableRecord');
      parts.push(`  2\n${name}`);
      parts.push(`  340\n${layoutHandle}`);
    }

    parts.push('  0\nENDTAB');
  }

  private writeBlocks(parts: string[]): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nBLOCKS');

    this.writeBlockDefinition(
      parts,
      '*Model_Space',
      HANDLE.BLOCK_MODEL_SPACE,
      HANDLE.ENDBLK_MODEL_SPACE,
      HANDLE.BLOCK_RECORD_MODEL_SPACE,
      false,
    );
    this.writeBlockDefinition(
      parts,
      '*Paper_Space',
      HANDLE.BLOCK_PAPER_SPACE,
      HANDLE.ENDBLK_PAPER_SPACE,
      HANDLE.BLOCK_RECORD_PAPER_SPACE,
      true,
    );

    parts.push('  0\nENDSEC');
  }

  private writeBlockDefinition(
    parts: string[],
    name: string,
    blockHandle: string,
    endblkHandle: string,
    ownerHandle: string,
    paperSpace: boolean,
  ): void {
    parts.push('  0\nBLOCK');
    parts.push(`  5\n${blockHandle}`);
    parts.push(`  330\n${ownerHandle}`);
    parts.push('  100\nAcDbEntity');
    parts.push('  8\n0');
    if (paperSpace) {
      parts.push('  67\n1');
    }
    parts.push('  100\nAcDbBlockBegin');
    parts.push(`  2\n${name}`);
    parts.push('  70\n0');
    parts.push('  10\n0.0');
    parts.push('  20\n0.0');
    parts.push('  30\n0.0');
    parts.push(`  3\n${name}`);
    parts.push('  1\n');

    parts.push('  0\nENDBLK');
    parts.push(`  5\n${endblkHandle}`);
    parts.push(`  330\n${ownerHandle}`);
    parts.push('  100\nAcDbEntity');
    parts.push('  8\n0');
    if (paperSpace) {
      parts.push('  67\n1');
    }
    parts.push('  100\nAcDbBlockEnd');
  }

  private writeEntities(parts: string[], doc: DxfDocument, nextHandle: () => number): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nENTITIES');

    for (const entity of doc.getEntities()) {
      parts.push(...entity.serialize(nextHandle()));
    }

    parts.push('  0\nENDSEC');
  }

  private writeObjects(parts: string[]): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nOBJECTS');

    // Root named-object dictionary — mandatory since R13.
    parts.push('  0\nDICTIONARY');
    parts.push(`  5\n${HANDLE.DICT_ROOT}`);
    parts.push('  330\n0');
    parts.push('  100\nAcDbDictionary');
    parts.push('  280\n0');
    parts.push('  281\n1');
    parts.push('  3\nACAD_GROUP');
    parts.push(`  350\n${HANDLE.DICT_ACAD_GROUP}`);
    parts.push('  3\nACAD_LAYOUT');
    parts.push(`  350\n${HANDLE.DICT_LAYOUT}`);
    parts.push('  3\nACAD_PLOTSTYLENAME');
    parts.push(`  350\n${HANDLE.DICT_PLOT_STYLE_NAME}`);

    parts.push('  0\nDICTIONARY');
    parts.push(`  5\n${HANDLE.DICT_ACAD_GROUP}`);
    parts.push(`  330\n${HANDLE.DICT_ROOT}`);
    parts.push('  100\nAcDbDictionary');
    parts.push('  280\n0');
    parts.push('  281\n1');

    // Plot-style-name dictionary with the "Normal" placeholder referenced by
    // every layer record (group 390).
    parts.push('  0\nACDBDICTIONARYWDFLT');
    parts.push(`  5\n${HANDLE.DICT_PLOT_STYLE_NAME}`);
    parts.push(`  330\n${HANDLE.DICT_ROOT}`);
    parts.push('  100\nAcDbDictionary');
    parts.push('  281\n1');
    parts.push('  3\nNormal');
    parts.push(`  350\n${HANDLE.PLOT_STYLE_PLACEHOLDER}`);
    parts.push('  100\nAcDbDictionaryWithDefault');
    parts.push(`  340\n${HANDLE.PLOT_STYLE_PLACEHOLDER}`);

    parts.push('  0\nACDBPLACEHOLDER');
    parts.push(`  5\n${HANDLE.PLOT_STYLE_PLACEHOLDER}`);
    parts.push(`  330\n${HANDLE.DICT_PLOT_STYLE_NAME}`);

    parts.push('  0\nDICTIONARY');
    parts.push(`  5\n${HANDLE.DICT_LAYOUT}`);
    parts.push(`  330\n${HANDLE.DICT_ROOT}`);
    parts.push('  100\nAcDbDictionary');
    parts.push('  280\n0');
    parts.push('  281\n1');
    parts.push('  3\nLayout1');
    parts.push(`  350\n${HANDLE.LAYOUT_PAPER}`);
    parts.push('  3\nModel');
    parts.push(`  350\n${HANDLE.LAYOUT_MODEL}`);

    this.writeLayout(parts, {
      handle: HANDLE.LAYOUT_PAPER,
      name: 'Layout1',
      tabOrder: 1,
      plotFlags: 688,
      blockRecordHandle: HANDLE.BLOCK_RECORD_PAPER_SPACE,
      limMaxX: 420,
      limMaxY: 297,
    });
    this.writeLayout(parts, {
      handle: HANDLE.LAYOUT_MODEL,
      name: 'Model',
      tabOrder: 0,
      plotFlags: 1712,
      blockRecordHandle: HANDLE.BLOCK_RECORD_MODEL_SPACE,
      limMaxX: 12,
      limMaxY: 9,
    });

    parts.push('  0\nENDSEC');
  }

  private writeLayout(
    parts: string[],
    layout: {
      handle: string;
      name: string;
      tabOrder: number;
      plotFlags: number;
      blockRecordHandle: string;
      limMaxX: number;
      limMaxY: number;
    },
  ): void {
    parts.push('  0\nLAYOUT');
    parts.push(`  5\n${layout.handle}`);
    parts.push(`  330\n${HANDLE.DICT_LAYOUT}`);
    parts.push('  100\nAcDbPlotSettings');
    parts.push('  1\n');
    parts.push('  2\nnone_device');
    parts.push('  4\n');
    parts.push('  6\n');
    for (const code of [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 140, 141]) {
      parts.push(`  ${code}\n0.0`);
    }
    parts.push('  142\n1.0');
    parts.push('  143\n1.0');
    parts.push(`  70\n${layout.plotFlags}`);
    parts.push('  72\n0');
    parts.push('  73\n0');
    parts.push('  74\n0');
    parts.push('  7\n');
    parts.push('  75\n0');
    parts.push('  147\n1.0');
    parts.push('  148\n0.0');
    parts.push('  149\n0.0');
    parts.push('  100\nAcDbLayout');
    parts.push(`  1\n${layout.name}`);
    parts.push('  70\n1');
    parts.push(`  71\n${layout.tabOrder}`);
    parts.push('  10\n0.0');
    parts.push('  20\n0.0');
    parts.push(`  11\n${formatCoord(layout.limMaxX)}`);
    parts.push(`  21\n${formatCoord(layout.limMaxY)}`);
    parts.push('  12\n0.0');
    parts.push('  22\n0.0');
    parts.push('  32\n0.0');
    parts.push('  14\n0.0');
    parts.push('  24\n0.0');
    parts.push('  34\n0.0');
    parts.push('  15\n0.0');
    parts.push('  25\n0.0');
    parts.push('  35\n0.0');
    parts.push('  146\n0.0');
    parts.push('  13\n0.0');
    parts.push('  23\n0.0');
    parts.push('  33\n0.0');
    parts.push('  16\n1.0');
    parts.push('  26\n0.0');
    parts.push('  36\n0.0');
    parts.push('  17\n0.0');
    parts.push('  27\n1.0');
    parts.push('  37\n0.0');
    parts.push('  76\n0');
    parts.push(`  330\n${layout.blockRecordHandle}`);
  }

  private writeEof(parts: string[]): void {
    parts.push('  0\nEOF');
  }
}
