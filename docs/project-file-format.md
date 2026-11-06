# CircuitStudio project files

The `.circuitstudio` extension contains UTF-8 JSON with `format: "circuitstudio-project"`,
`version: 1`, an ISO `exportedAt` timestamp, and a `document` object. The MIME type is
`application/json`. No archive library or opaque CRDT history is needed for this version.

## Persisted content

| Section | Content |
| --- | --- |
| `parts` | Component IDs, types, exact floating-point physical and schematic positions, rotations, stacking properties, labels, values, and layer order |
| `wires` | IDs, terminal references and fallback coordinates, every route bend, colors, schematic-only flag |
| `logic` | All design sheets and custom IC definitions, packaging/pin order, nested nodes, positions, properties and connections |
| `code` | Every stored source program, including orphaned programs retained by the editor |
| `meta` | Name, wiring legend, comments with their original attribution, assembly confirmations/signatures, purchases, prices, currency and other project metadata |

Object IDs inside the document are retained so comments, wire references and assembly signatures
remain valid. The imported project receives a new room and fresh Yjs identities. Nested maps
and source text are reconstructed as editable shared types. Unknown metadata is preserved;
unsupported sections, component types and versions are rejected rather than silently omitted.

The export does not contain deleted CRDT records, undo history, cloud credentials, member
permissions, version history stored outside the document, live collaborator presence, compiled
firmware, signal recordings, or an in-progress simulation. User-specific viewport, open panels,
selection and other browser preferences are not project geometry and are not exported. A new
copy starts simulation from its initial conditions; it may need compilation when run.

## Import behavior

Import is available from the home screen and the editor's File menu. A native picker is followed
by a validation/summary dialog. Confirming creates a new project, never replaces or merges into
the open project. In cloud mode the authenticated API creates a private project with its state
already present. Local mode awaits a durable IndexedDB write before navigating. An import
failure keeps the current project and the dialog intact so the user can retry.

Files are capped at 10 MiB, with separate depth, total-value, collection and source-size limits.
The cloud's base64 state is capped at 4,000,000 characters to fit its request boundary. Invalid
references, non-finite geometry, invalid rotations, unsupported parts and dangerous object keys
are rejected before any existing document is mutated. Code is stored, never executed on import.

## Compatibility

Version 1 is the first public schema. A future incompatible change requires a new version and an
explicit migration into the current content model before shared types are constructed. Newer
versions must not be guessed at. Adding external project assets should use a future package
version with a manifest and bounded resources, while retaining an explicit migration path.

## Validation

Round-trip tests compare raw shared values and rendered snapshots, with fractional coordinates,
schematic placement, wire bends, custom ICs and nested design sheets, Unicode source, metadata,
comments, and assembly progress. Separate tests check malformed files, unsupported versions,
unsafe keys, independent edits, durable local import, cloud request contents and the server's
bounded Yjs import boundary.
