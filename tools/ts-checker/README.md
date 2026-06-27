# ts-checker

Static type-checker for React/TypeScript repos using ts-morph.

## Usage

```
node check.js <directory-path>
```

Outputs JSON to stdout:

```json
{ "passed": true, "diagnostics": [] }
```

Each diagnostic: `{ file, line, code, message }`. All diagnostics are emitted unfiltered — noise filtering (environment codes 2307, 2304, 2503, 7026, 2874) happens in the Python `TsVerifier`.

## Dependencies

Reuses `../ts-extractor/node_modules` — no separate `npm install` required.

- `ts-morph` via `../ts-extractor/node_modules/ts-morph`
- TypeScript compiler via `../ts-extractor/node_modules/@ts-morph/common/dist/typescript.js`

## Notes

- Read-only: does not write files or execute code.
- Uses `getPreEmitDiagnostics()` with strict mode, JSX enabled.
- Skips `node_modules` and `.d.ts` files.
