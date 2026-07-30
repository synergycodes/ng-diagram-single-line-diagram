// Symbol metadata for the SLD symbol pipeline.
// Each entry maps a QElectroTech .elmt source file to our SymbolDef.
//
// Scope: HIGH VOLTAGE substation single-line diagrams (110+ kV transmission).
// We curate the IEC 60617 set down to the symbols actually used on a typical HV
// substation SLD — switchgear, transformers, instrument transformers, compensation,
// and the bare minimum of sources/loads. Power semiconductors and logic-level
// transistors are deliberately out of scope.
//
// Sizing:
//   `displaySize` and `body` are auto-derived by `build-symbols.mjs` from the
//   natural .elmt geometry + the hyperparameters at the top of that file
//   (STROKE_WIDTH, LEAD_LENGTH, BODY_BASE_UNIT, BODY_MIN_CROSS_DIM, BODY_SCALE,
//   BODY_ASPECT_MAX). Add a new symbol by dropping its .elmt into
//   `src/tools/qet-source/` and a stub here — no manual dimensions needed.
//
// Categories: switchgear | transformers | measurement | protection | sources-loads | compensation
// (mirror the Symbol library sections in the side panel).
//
// `terminalKinds` (optional): per-terminal kind override map keyed by terminal
// id (auto-generated as `terminal-<side>` / `terminal-<side>-<N>` for repeats).
// Defaults to `'power'`; set `'control'` for IEC 60617 signalling terminals.

/** @type {Array<import('./symbols.types.js').SymbolConfig>} */
export const SYMBOLS = [
  // -- Switchgear ----------------------------------------------------------

  {
    id: 'breaker',
    sourceFile: 'breaker.elmt',
    label: 'Circuit breaker',
    category: 'switchgear',
    voltageTier: 'hv',
    defaultData: { tag: 'Q', ratedVoltage: 245, ratedCurrent: 3150 },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedVoltage', label: 'Rated voltage', type: 'number', unit: 'kV' },
      { key: 'ratedCurrent', label: 'Rated current', type: 'number', unit: 'A' },
      { key: 'breakingCapacity', label: 'Breaking cap.', type: 'number', unit: 'kA' },
      {
        key: 'interruptingMedium',
        label: 'Medium',
        type: 'select',
        options: ['SF6', 'vacuum', 'oil', 'air'],
      },
    ],
  },
  {
    id: 'disconnector',
    sourceFile: 'disconnector.elmt',
    label: 'Disconnector',
    category: 'switchgear',
    voltageTier: 'hv',
    defaultData: { tag: 'QS', ratedVoltage: 245, ratedCurrent: 3150 },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedVoltage', label: 'Rated voltage', type: 'number', unit: 'kV' },
      { key: 'ratedCurrent', label: 'Rated current', type: 'number', unit: 'A' },
      { key: 'motorised', label: 'Motorised', type: 'select', options: ['yes', 'no'] },
    ],
  },
  {
    id: 'earthing-switch',
    sourceFile: 'earthing-switch.elmt',
    label: 'Earthing switch',
    category: 'switchgear',
    voltageTier: 'hv',
    defaultData: { tag: 'QE', ratedVoltage: 245 },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedVoltage', label: 'Rated voltage', type: 'number', unit: 'kV' },
      { key: 'shortCircuitMaking', label: 'Making cap.', type: 'number', unit: 'kA' },
    ],
  },
  {
    id: 'surge-arrester',
    sourceFile: 'surge-arrester.elmt',
    label: 'Surge arrester',
    category: 'switchgear',
    voltageTier: 'hv',
    defaultData: { tag: 'FV', ratedVoltage: 198 },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedVoltage', label: 'Rated voltage', type: 'number', unit: 'kV' },
      { key: 'dischargeCurrent', label: 'Nom. discharge', type: 'number', unit: 'kA' },
      {
        key: 'energyClass',
        label: 'Energy class',
        type: 'select',
        options: ['1', '2', '3', '4', '5'],
      },
    ],
  },

  // -- Transformers --------------------------------------------------------

  {
    id: 'transformer',
    sourceFile: 'transformer.elmt',
    label: 'Two-winding transformer',
    category: 'transformers',
    voltageTier: 'hv',
    defaultData: {
      tag: 'T',
      ratedPower: 250,
      primaryVoltage: 220,
      secondaryVoltage: 110,
      vectorGroup: 'YNyn0',
    },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedPower', label: 'Rated power', type: 'number', unit: 'MVA' },
      { key: 'primaryVoltage', label: 'Primary', type: 'number', unit: 'kV' },
      { key: 'secondaryVoltage', label: 'Secondary', type: 'number', unit: 'kV' },
      { key: 'vectorGroup', label: 'Vector group', type: 'text' },
      {
        key: 'cooling',
        label: 'Cooling',
        type: 'select',
        options: ['ONAN', 'ONAF', 'OFAF', 'ODAF'],
      },
    ],
  },
  {
    id: 'transformer-3w',
    sourceFile: 'transformer-3w.elmt',
    label: 'Three-winding transformer',
    category: 'transformers',
    voltageTier: 'hv',
    defaultData: {
      tag: 'T',
      ratedPower: 450,
      primaryVoltage: 400,
      secondaryVoltage: 220,
      tertiaryVoltage: 30,
      vectorGroup: 'YNautod11',
    },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedPower', label: 'Rated power', type: 'number', unit: 'MVA' },
      { key: 'primaryVoltage', label: 'Primary (HV)', type: 'number', unit: 'kV' },
      { key: 'secondaryVoltage', label: 'Secondary (MV)', type: 'number', unit: 'kV' },
      { key: 'tertiaryVoltage', label: 'Tertiary (LV)', type: 'number', unit: 'kV' },
      { key: 'vectorGroup', label: 'Vector group', type: 'text' },
    ],
  },

  // -- Measurement (instrument transformers) -------------------------------

  {
    id: 'ct',
    sourceFile: 'ct.elmt',
    label: 'Current transformer',
    category: 'measurement',
    voltageTier: 'hv',
    defaultData: { tag: 'TI', ratio: '1000/5', accuracyClass: '0.2S' },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratio', label: 'Ratio', type: 'text' },
      {
        key: 'accuracyClass',
        label: 'Accuracy',
        type: 'select',
        options: ['0.1', '0.2', '0.2S', '0.5', '0.5S', '1', '5P', '10P', 'TPX', 'TPY', 'TPZ'],
      },
      { key: 'burden', label: 'Burden', type: 'number', unit: 'VA' },
      { key: 'cores', label: 'Cores', type: 'number' },
    ],
  },
  {
    id: 'vt',
    sourceFile: 'vt.elmt',
    label: 'Voltage transformer (inductive)',
    category: 'measurement',
    voltageTier: 'hv',
    defaultData: { tag: 'TV', ratio: '110000:√3 / 100:√3', accuracyClass: '0.2' },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratio', label: 'Ratio', type: 'text' },
      {
        key: 'accuracyClass',
        label: 'Accuracy',
        type: 'select',
        options: ['0.1', '0.2', '0.5', '1', '3', '3P', '6P'],
      },
      { key: 'burden', label: 'Burden', type: 'number', unit: 'VA' },
    ],
  },
  {
    id: 'cvt',
    sourceFile: 'cvt.elmt',
    label: 'Capacitor voltage transformer',
    category: 'measurement',
    voltageTier: 'hv',
    defaultData: { tag: 'TV', ratio: '220000:√3 / 100:√3', accuracyClass: '0.5' },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratio', label: 'Ratio', type: 'text' },
      {
        key: 'accuracyClass',
        label: 'Accuracy',
        type: 'select',
        options: ['0.1', '0.2', '0.5', '1', '3', '3P', '6P'],
      },
      { key: 'burden', label: 'Burden', type: 'number', unit: 'VA' },
      { key: 'totalCapacitance', label: 'C1+C2', type: 'number', unit: 'nF' },
    ],
  },

  // -- Protection ----------------------------------------------------------

  {
    id: 'protection-relay',
    sourceFile: 'protection-relay.elmt',
    label: 'Protection relay',
    category: 'protection',
    voltageTier: 'hv',
    glyphLabel: 'I>',
    // Top terminal carries the CT secondary (power-side measurement); bottom
    // pair are the trip-output contacts to a breaker coil (control-side).
    terminalKinds: {
      'terminal-bottom': 'control',
      'terminal-bottom-2': 'control',
    },
    defaultData: { tag: 'F', functionCode: '50/51' },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'functionCode', label: 'ANSI function', type: 'text' },
      { key: 'pickupCurrent', label: 'Pickup', type: 'number', unit: 'A' },
      { key: 'timeDial', label: 'Time dial', type: 'number' },
    ],
  },

  // -- Sources & loads -----------------------------------------------------

  {
    id: 'generator',
    sourceFile: 'motor.elmt',
    label: 'Generator',
    category: 'sources-loads',
    voltageTier: 'hv',
    portOverrides: [
      { x: -30, y: -60, orientation: 'n' },
      { x: -30, y: 0, orientation: 's' },
    ],
    glyphLabel: 'G',
    defaultData: { tag: 'G', ratedPower: 300, ratedVoltage: 21, powerFactor: 0.85 },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedPower', label: 'Rated power', type: 'number', unit: 'MVA' },
      { key: 'ratedVoltage', label: 'Rated voltage', type: 'number', unit: 'kV' },
      { key: 'powerFactor', label: 'Power factor', type: 'number' },
      {
        key: 'machineType',
        label: 'Type',
        type: 'select',
        options: ['synchronous', 'asynchronous'],
      },
    ],
  },
  {
    id: 'motor',
    sourceFile: 'motor.elmt',
    label: 'Motor',
    category: 'sources-loads',
    voltageTier: 'mv',
    // Auxiliary motor for power-plant boards. Voltage typically MV (6/10 kV) but
    // exists in HV plant SLDs as a station-service load.
    portOverrides: [
      { x: -30, y: -60, orientation: 'n' },
      { x: -30, y: 0, orientation: 's' },
    ],
    glyphLabel: 'M',
    defaultData: { tag: 'M', ratedPower: 1500, ratedVoltage: 6000 },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedPower', label: 'Rated power', type: 'number', unit: 'kW' },
      { key: 'ratedVoltage', label: 'Rated voltage', type: 'number', unit: 'V' },
      { key: 'speedRpm', label: 'Speed', type: 'number', unit: 'rpm' },
    ],
  },
  {
    id: 'ground',
    sourceFile: 'ground.elmt',
    label: 'Ground',
    category: 'sources-loads',
    voltageTier: 'lv',
    defaultData: { tag: 'PE' },
    propertySchema: [{ key: 'tag', label: 'Tag', type: 'text' }],
  },

  // -- Compensation --------------------------------------------------------

  {
    id: 'shunt-reactor',
    sourceFile: 'shunt-reactor.elmt',
    label: 'Shunt reactor',
    category: 'compensation',
    voltageTier: 'hv',
    defaultData: { tag: 'LR', ratedPower: 100, ratedVoltage: 420 },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'ratedPower', label: 'Rated power', type: 'number', unit: 'MVAr' },
      { key: 'ratedVoltage', label: 'Rated voltage', type: 'number', unit: 'kV' },
      { key: 'cooling', label: 'Cooling', type: 'select', options: ['ONAN', 'ONAF', 'dry'] },
    ],
  },
  {
    id: 'shunt-capacitor',
    sourceFile: 'shunt-capacitor.elmt',
    label: 'Shunt capacitor bank',
    category: 'compensation',
    voltageTier: 'hv',
    defaultData: { tag: 'CB', reactivePower: 50, ratedVoltage: 36 },
    propertySchema: [
      { key: 'tag', label: 'Tag', type: 'text' },
      { key: 'reactivePower', label: 'Reactive power', type: 'number', unit: 'MVAr' },
      { key: 'ratedVoltage', label: 'Rated voltage', type: 'number', unit: 'kV' },
      {
        key: 'configuration',
        label: 'Connection',
        type: 'select',
        options: ['Y-grounded', 'Y-ungrounded', 'double-Y', 'delta'],
      },
    ],
  },
];
