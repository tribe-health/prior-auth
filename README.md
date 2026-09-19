# Prior Authorization Workbench

## Local web demo

Start the complete browser stack, including PostgreSQL bootstrap, checksum-verified
server migrations, Kratos migrations, the synthetic demo identity, API, Electric,
Flint Gate, Realtime Fabric, the document assembly service, Liter-LLM, and Vite:

```bash
docker compose up --build --wait
```

Open <http://127.0.0.1:5173/login> and sign in with:

- Email: `surgeon.demo@example.invalid`
- Password: `DemoOnly-2026!`

The stack creates `DEMO-CASE-001` with synthetic patient and payer data. Uploaded
documents are retained in the `demo_documents` volume. Re-running `up` preserves
the database and reapplies only pending migrations. For a clean demonstration:

```bash
docker compose down --volumes
docker compose up --build --wait
```

The included Qwen route is for the synthetic demo case only. Production patient-data
inference stays disabled until a separate US provider qualification passes.

### Run the customer demo

The walkthrough uses only `DEMO-CASE-001` and synthetic source text. Start from a
fresh demo when you need the complete sequence in one sitting:

```bash
docker compose down --volumes
docker compose up --build --wait
```

Create the two text files used during the demonstration:

```bash
cat > /tmp/aso-synthetic-clinical-note.txt <<'EOF'
Synthetic demonstration record. No real patient data.

The chart documents six weeks of supervised physical therapy with persistent
activity-limiting lumbar symptoms and no durable improvement.
EOF

cat > /tmp/aso-synthetic-denial.txt <<'EOF'
SYNTHETIC ADVERSE DETERMINATION
Case: DEMO-CASE-001
Outcome: Denied
Reason code: medical-necessity
Reason: The submitted record does not demonstrate the required conservative-treatment course.
This document contains synthetic demonstration data only.
EOF
```

Sign in, open **Cases**, and select `DEMO-CASE-001`. Wait for each uploaded
document to show **Ready** before continuing.

#### Use case 1: initial pre-authorization letter

1. Open **Intake checklist**. Upload `/tmp/aso-synthetic-clinical-note.txt`,
   choose **Physical therapy note**, enter a source date and the name
   `Synthetic physical therapy note`, then select **Upload document**.
2. Open **Evidence timeline**. For **Documented conservative treatment**, choose
   **Met**, select the uploaded note, enter page `1`, copy the exact sentence
   from the note into **Exact source quote**, add a short assessment rationale,
   and select **Save evidence revision**.
3. Open **Surgeon gate**. Complete **Affirm controlling policy**, **Affirm
   criterion section**, **Affirm surgical pathway**, and **Affirm operative
   plan**. The header must read `4 of 4 affirmed for this case.`
4. Open **Letter & QA** and select **Generate cited draft**. During generation,
   the draft remains provisional. Continue only after the interface shows that
   the generated artifacts were saved to the case.
5. Review the draft, claims manifest, source citations, and all seven QA
   findings. Select **Confirm source review**, **Approve current revision**, and
   **Sign letter** in order.
6. Open **Submission packet**, confirm the signed letter and attachment
   manifest, and select **Submit signed packet**. Follow **Track receipt and
   custody**, enter a synthetic payer reference and acknowledgement time, then
   select **Record acknowledgement**. The final state is **Acknowledged in
   full**.

#### Use case 2: response to a pre-authorization denial with evidence

1. Open **Denial response**. Upload `/tmp/aso-synthetic-denial.txt` with document
   type **Payer determination**, a source date, and the name
   `Synthetic adverse determination`.
2. In **Record adverse determination**, select that ready document. Enter the
   determination date, an appeal deadline, reason code `medical-necessity`, and
   the payer's stated reason from the document. Select **Record denial and open
   appeal**.
3. Select **Prepare a clinical appeal**. This path demonstrates the evidence and
   clinical-authority controls. **Correct and resubmit the request** is the
   alternate response path when the original request itself needs correction.
4. Follow **Open surgeon review** and complete all four affirmations again. The
   appeal requires an affirmation made after the payer determination.
5. Return to **Denial response**, select **Generate cited draft**, and wait for
   the appeal draft, claims, citations, and seven QA findings to be saved.
6. Complete **Confirm source review**, **Approve current revision**, **Sign
   letter**, **Submit signed packet**, and **Record acknowledgement**. The final
   state is **Acknowledged in full**.

After the synthetic clinical evidence and surgeon gate are prepared, the
automated evidence runner executes the initial-request, corrected-resubmission,
and clinical-appeal paths against the local stack:

```bash
python3 scripts/record-web-case-to-letter-demo.py
```

### Browser evidence videos

These recordings contain synthetic data. Each IPFS gateway response was
downloaded after pinning and matched byte-for-byte with the H.264 MP4 in the
[certification bundle](docs/certifications/web-case-to-letter/4cb7b636334a/report.html).

| Scenario | Public evidence video | SHA-256 |
|---|---|---|
| Initial pre-authorization request | [Play video](https://ipfs.prometheusags.ai/ipfs/bafybeibxjg5o6ome7ems7crivplfvvysygnp4ev2mk6nd22f4rbv5ysonu) | `11211b14c2670dead0f4aa16c0173ed3bd8d2743f96d5031899c5397c986264a` |
| Corrected resubmission | [Play video](https://ipfs.prometheusags.ai/ipfs/bafybeiguhvjyqe52zd5t3oztmmbh3hwvc3fc73mli22cvt3ab6fmkzmnvi) | `8b1f20756aa28b0199ff7d07a3fa9820e41ff71cf5d00a0b34771cc29de2c8f8` |
| Clinical appeal with fresh surgeon affirmation | [Play video](https://ipfs.prometheusags.ai/ipfs/bafybeidxazqsusse472k4v4t5bwvg5yipcrnr2orwnwvdvdyirgervkbpy) | `2e14c226c995fa43b172bf41ff05ebc73689eb22f677dd0cc7349352a421a535` |

Override the local-only credentials through `ASO_DEMO_EMAIL`,
`ASO_DEMO_PASSWORD`, `ASO_RUNTIME_DATABASE_PASSWORD`, and
`ASO_AUTHORITY_DATABASE_PASSWORD`, and `ASO_GATE_AUTHORITY_DATABASE_PASSWORD`
when needed.

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
| Web production build | `npm --prefix web run build` | Vite production bundle built |

The complete synthetic web scenario is browser-certified for the initial
request, corrected resubmission, and clinical appeal through payer
acknowledgement. The [certification manifest](docs/certifications/web-case-to-letter/4cb7b636334a/manifest.json)
binds the recordings and screenshots to implementation commit
`4cb7b636334aa0e3ff0e2a9d025e786c9c986786`.

**Not yet verified:** physical-device runs and the Tauri window launch remain
build-only and are outside this web certification.

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

### How a session starts

The browser asks the server who it is. `useStartupSession()` calls
`GET /api/session` once at mount, and the Kratos cookie the browser already
holds is the credential — the client never constructs one.

| Server answer | Startup state | What renders |
|---|---|---|
| `200` + a parseable session | `authenticated` | private startup; the application after `ready` |
| `401` / `403` | `none` | "Sign in to continue." |
| unreachable, or a `200` this client cannot parse | `unreachable` | public sign-in/recovery with the service-unavailable notice |

**A 401 is an answer, not a failure.** An unauthenticated first visit is the
normal case, so it resolves to "signed out" rather than an error. A transport
or payload failure resolves to the distinct `unreachable` state. Public sign-in
and recovery remain mounted in that state; the private database and shape
subscription stay closed until a later verified session begins ordered startup.

The payload is **parsed, not cast** (`session-parse.ts`). The server sends
`capabilities` as free strings; a value this client does not know is dropped
with a warning rather than passed into `can()`, where it would silently match
nothing and hide a power the session actually holds. A malformed payload yields
no session at all — a half-built one would still produce a usable-looking
replica storage key, which is the fail-closed property the composition order
exists to protect.

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
