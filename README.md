# Prior Authorization Workbench

A surgeon decides an operation is necessary. An insurer decides whether to pay
for it. Between those two decisions sits a document, and most of the work is
assembling the evidence it stands on.

Three surfaces, one architecture: **Axum web**, **Tauri desktop**, **Flutter
mobile**.

## Layout

```
crates/
  aso-host/            Application core. Names NO shell — no Axum, no Tauri,
                       no Flutter. This is what lets one core serve three
                       surfaces, and scripts/audit.sh enforces it.
  aso-server-axum/     Reusable router, verified session, feature routes.
  aso-web-server/      Thin binary: config, assets, adapters.
desktop/src-tauri/     Desktop shell. Commands mirror the HTTP routes 1:1.
web/                   React 19. Feature-based, kebab-case filenames.
mobile/                Flutter. Riverpod, same contracts as web.
assets/templates/design-tokens/tokens.toml
                       THE design source. Generates both themes.
scripts/               gen-design-tokens.sh · audit.sh
docs/                  Design system, schema, ADRs, plan. Drives development.
```

## Verified state

Everything below was executed, not assumed.

| Check | Command | Result |
|---|---|---|
| Rust workspace builds | `cargo build --workspace` | 4 crates compile |
| Invariant tests | `cargo test --workspace` | 5 passed |
| Server runs and enforces | started on `:8791`, exercised | admin refused, surgeon affirms |
| Flutter analyzes | `flutter analyze` | no issues |
| Flutter tests | `flutter test` | 7 passed |
| Architecture audit | `bash scripts/audit.sh` | 6 checks pass |
| Design tokens | `bash scripts/gen-design-tokens.sh .` | 22 roles × 2 themes, parity verified |

**Not yet verified:** no physical-device run, no production web build, no Tauri
window launched. Per the verification contract those surfaces are
**build-only** — real, but not yet "working". A generated project starts
unverified on purpose; that is an accurate statement until someone runs it on
hardware.

## Quick start

```bash
cargo test --workspace                    # invariants
cargo run -p aso-web-server               # API on :8787
bash scripts/audit.sh                     # boundaries
bash scripts/gen-design-tokens.sh .       # regenerate themes

cd mobile && flutter pub get && flutter test
```

### Web replica storage

`VITE_ASO_REPLICA_PERSISTENCE` decides where the local replica lives.

| Value | Effect |
|---|---|
| unset *(default)* | Memory-only. Nothing survives a reload. |
| `memory` | Memory-only, stated explicitly. |
| `persistent` | IndexedDB at `idb://<storage-key>`, namespaced per principal/practice/identity. |

**The default is memory on purpose.** A persisted replica is protected health
information at rest on a machine this application does not control, and ADR-009
permits it *"only where device policy permits; unmanaged/shared use is
memory-only."* A shared clinic workstation is the normal case.

An unrecognised value (`true`, `1`, `yes`, …) resolves to memory **and logs an
error** — ADR-009 forbids a silent fallback, so a deployment that meant to
persist and mistyped finds out rather than quietly running ephemeral.

### Where reads come from

`VITE_ASO_SHAPE_GATEWAY` is Gate's base URL — the only endpoint the browser
talks to for shape data. Unset means no sync: the replica opens and reads
whatever it already holds.

**Point this at Gate, never at Electric.** ADR-009 restricts direct Electric
access to an operator-loopback diagnostic and never a client path. The client
sends a shape id and an opaque cursor; rows, columns and practice scope are
derived server-side from verified identity, so a modified client cannot widen
its own grant. FRF's catalog allows no narrowing parameters, and
`catalog-conformance.test.ts` asserts that alongside column-for-column
agreement between the catalog and this replica's schema.

## The four rules this codebase will not bend

**1. Three evidence states, never two.** `met` / `gap` / `void`. A gap is a
chart that says no and must be argued; a void is a chart that is silent and must
be obtained. See [ADR-003](docs/architecture/adr-003-three-evidence-states.md).

**2. Clinical authority is scarce and checked three times.** An administrator
holds every configuration power and cannot affirm a gate or sign a letter. See
[ADR-002](docs/architecture/adr-002-clinical-authority.md).

**3. One token source.** `tokens.toml` generates `web/src/theme.css` and
`mobile/lib/core/theme/tokens.dart`. Never hand-edit an output — the next
generator run reverts it silently.

**4. No query cache.** The entity graph owns freshness. See
[ADR-001](docs/architecture/adr-001-no-query-cache.md).

## Where the design lives

`docs/design/` is the source of truth for what gets built:

- `prototype/` — 18 clickable screens plus the shared design system
- `schema/` — 60 tables, PostgreSQL 18 + pgvector, with executable checks
- `prototype/screens/how-this-works.html` — the theory
- `prototype/screens/architecture.html` — the runtime stack
- `prototype/screens/build-playbook.html` — the method

Read `docs/plan/build-order.md` before starting a feature. The ordering is not a
preference: phases 1 and 2 are irreversible.
