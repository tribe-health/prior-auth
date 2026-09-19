# Web-05 adversarial review pass 2 response

The critical finding was reproduced before changing production code. The new populated revision-5 PGlite migration test failed with `column "case_number" of relation "cases" contains null values` (exit 1).

The revision-6 migration now performs a controlled local-replica generation cutover. It truncates the dependent synchronized graph and, when present, `_replica_checkpoints` in the same migration transaction before it adds the required case-summary columns. The client cannot infer the missing authoritative identifiers from the older local rows. Clearing both replica data and cursor causes the normal authorized cold refetch to restore the graph without publishing local source text or embeddings.

The corrected focused sync suite passed 18/18. Typecheck, lint, production build, and the Artifact Refiner gate also passed. Review the current-file overrides at the end of the packet; they supersede older copies in the cumulative pass-2 packet.
