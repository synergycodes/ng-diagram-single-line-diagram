# NOTICE

This project combines original source code with third-party artwork under
different licenses.

## Project code — MIT

All application source code, tooling, and configuration in this repository is
Copyright (c) 2026 Synergia Pro Sp. z o.o. and released under the [MIT License](LICENSE).

## Electrical symbol artwork — CC-BY 3.0

The IEC 60617 symbol artwork shipped in this project — the generated SVG bodies
under `src/assets/symbols/` and the generated registry
`src/app/sld/symbols/symbol-registry.generated.ts` — is **derived from the
QElectroTech elements library**.

- **Original work:** QElectroTech elements collection — <https://qelectrotech.org/>
- **Author:** The QElectroTech team and contributors
- **License:** Creative Commons Attribution 3.0 (CC-BY 3.0) —
  <https://creativecommons.org/licenses/by/3.0/>

**Modifications:** `src/tools/build-symbols.mjs` converts a curated subset of
QElectroTech `.elmt` sources into this project's node model — splitting each
element into a fixed body plus dynamic terminal leads, re-scaling to an 8 px
grid, and serializing to SVG + a TypeScript registry. The artwork is otherwise
unchanged in form.

### Derived symbols

Every symbol below is derived from QElectroTech artwork:

| Category      | Symbols                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| Switchgear    | Circuit breaker, Disconnector, Earthing switch, Surge arrester             |
| Transformers  | Two-winding transformer, Three-winding transformer                         |
| Measurement   | Current transformer, Voltage transformer (inductive), Capacitor voltage transformer |
| Protection    | Protection relay                                                           |
| Sources/loads | Generator, Motor, Ground                                                   |
| Compensation  | Shunt reactor, Shunt capacitor bank                                        |

All other content — the diagram engine integration, components, geometry, and
features — is project-original and covered by the MIT License above.
