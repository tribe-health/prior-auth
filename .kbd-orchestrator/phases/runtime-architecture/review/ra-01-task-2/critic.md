# Independent source review — RA-01 task 1.2

Date: 2026-09-06. Scope: task 1.2 source artifacts only. Reviewer:
`session_implementation_critic`, isolated native agent; no generation history.

One P2 finding: the first runtime-role validation checked ASO schema ownership
but permitted a login owning ASO relations or holding direct/effective write
privileges. Such credentials violate the required restricted session-reader
boundary even when this operation starts a read-only transaction.

Disposition: resolved. ROLE_CHECK now validates both session_user and the
reader role, elevated flags, effective relation/function/schema ownership,
schema/database creation and table/column write privileges. The independent
source recheck confirmed this finding resolved and reported no other concrete
defect in its reviewed scope.

Execution evidence is separate from that source opinion. The actual mounted
application now refuses a runtime login after a column write grant or ASO table
ownership change (503), and serves the same authorized session again after the
grant/ownership is restored (200). All 34 mounted checks passed; see
[mounted-session.json](../../evidence/ra-01-verified-session/mounted-session.json).

The uncomfortable limit: source review and a one-identity direct application
probe cannot certify two-identity pool isolation or the mounted Gate hop.
This is not the full-change artifact-refiner and distinct-model adversarial
review gate. Those remain task 3.1 before change completion/archive.
