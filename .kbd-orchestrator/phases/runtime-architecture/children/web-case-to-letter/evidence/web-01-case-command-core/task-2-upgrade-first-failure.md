# web-01 task 1.2 retained upgrade-probe failure

Date: 2026-09-16
Result: **Failed**, then corrected and rerun

The first populated-upgrade probe stopped while constructing its historical
fixture, before the web-01 migration ran. The fixture inserted legacy gate
affirmations through the current `gate_affirmations_authority` trigger without
a verified actor context. The trigger correctly refused the insert.

The fixture now disables only `gate_affirmations_authority` while constructing
historical rows, keeps the derived-summary trigger active, and restores the
authority trigger before running the actual server migrator. This models data
that predates the current authority trigger without weakening the migration or
the database boundary under test.

The corrected upgrade probe passed all 34 checks. Its machine-readable receipt
is `task-2-upgrade.json`.
