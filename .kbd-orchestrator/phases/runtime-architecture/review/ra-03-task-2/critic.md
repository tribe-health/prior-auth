# RA-03 task 1.2 independent artifact review

## Initial verdict: FAIL

The isolated critic found three high-severity issues:

1. Exact replay was unreachable through `AppServices` because the service read
   the now-signed target before the database replay branch. This is assigned to
   RA-03 task 1.3. Documentation and evidence were corrected so task 1.2 does
   not claim service replay or lost-response reconciliation.
2. Updating `letter_claims.letter_id` checked only the destination. A claim
   could be moved away from an approved letter. The trigger now checks both the
   old and new letter, and a real PostgreSQL refusal test covers the move.
3. Annotation-only claims satisfied source completeness without the required
   document, page and date. Until claim origin is represented separately,
   signable claims now require a scoped document, page, effective date, content
   hash and valid page count. A real annotation-only refusal test covers this.

The critic also found that the earlier marker claimed atomic rollback without
an injected failure. The marker now states only the observed one-letter,
one-audit, one-result commit. Rollback injection remains RA-03 task 1.4.

## Remediation verdict: PASS

The same critic re-read the remediated artifact without editing it and reported
no remaining task 1.2 findings. It confirmed:

- approved/signed source immutability checks both `OLD.letter_id` and
  `NEW.letter_id`;
- annotation-only claims fail the document/page/date source predicate;
- the fresh and upgrade receipts pass eight real PostgreSQL markers and match
  the reviewed source hashes;
- ADR-002, ADR-009 and the runtime architecture leave signing replay/result
  lookup pending in task 1.3;
- the evidence marker no longer claims rollback-tested atomicity.

The critic ran no broad checks and made no edits.
