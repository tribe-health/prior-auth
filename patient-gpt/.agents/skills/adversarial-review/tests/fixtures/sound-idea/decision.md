# Build an AI meeting-notes assistant

## Decision

**Decide to run a two-week validation pilot** on a meeting-notes assistant
narrowed to one wedge: engineering standups at teams that already use **Linear**,
where the assistant writes action items directly into the tracker rather than
producing a document nobody reopens.

This decision commits to the pilot, **not** to building the product. The
build decision is deferred until the falsifiers below have been run; if they
fail, no integration code is written.

We are **not** competing on summary quality. Otter, Fireflies, Granola, Zoom AI
Companion, and Google/Microsoft's bundled versions all produce adequate
summaries; several are free with a seat the customer already pays for. Competing
on quality against a free bundled incumbent is competing on a dimension where
our advantage is small and their price is zero.

The wedge is the **write-back**: a summary is a document, an issue is work. The
bundled tools stop at the document because writing into a customer's tracker
requires per-tracker integration work they have not prioritised. That is a
narrow, defensible gap — and it is narrow enough that we may find it is narrow
because it is not valuable.

**Pilot scope (what this decision authorises):** two weeks, two engineers, no
code written into any tracker. Action items are filed by hand from existing
Zoom/Meet recordings the teams already keep.

**If the pilot passes**, the build we would then decide on is scoped at 8 weeks:
one tracker (Linear), one meeting type (standup), existing recordings only — no
meeting bot in v1. Skipping the bot removes the *join and in-room
recording-consent* surface. It does **not** remove the compliance surface:
ingesting transcripts and writing into a customer's tracker still needs OAuth
scopes, a data-retention answer, and a privacy review. One of the eight weeks is
budgeted for that.

## Assumptions

- Teams already run standups that produce action items, and those items are
  currently lost or hand-transcribed. **Untested** — we have anecdote, not data.
- Write-back into a tracker is worth paying for even when summarisation is free.
  **This is the load-bearing assumption.** If summary-only tools are good enough,
  the entire wedge disappears.
- Linear's API permits creating issues on a user's behalf at the volume a daily
  standup produces, without rate-limit or permission blockers.
- Transcript quality from existing recordings is sufficient for action-item
  extraction. Accents, cross-talk, and remote audio degrade this and we have not
  measured it.

## Falsifier

Run a two-week manual pilot across **10 teams** — 20 real standups total, a human
reading each transcript and filing the issues by hand — **before** writing any
integration code.

The 10 teams must match the stated wedge, or the pilot measures a different
product than the one proposed. Each must: run a recurring standup, already use
Linear as its tracker, and have at least 4 engineers. A team recruited outside
those criteria does not count toward either threshold below, however
enthusiastic it is.

**Kill the idea if either threshold is missed:**

1. **Noise:** fewer than 60% of filed issues survive one week without being
   closed as noise.
2. **Willingness to pay:** fewer than 6 of the 10 teams in the trial commit to
   $8/seat/month at the end of the two-week pilot — a signed order form or a
   card on file, not a verbal "we'd consider it". A team citing "our existing
   free tool's summary is enough" counts as a rejection.

Either result means the write-back is not the value we think it is, and no
amount of engineering fixes that.

**The manual pilot deliberately tests demand, not feasibility.** A human doing
the extraction proves people want the write-back; it proves nothing about
whether a model can do it. Those are separate risks and conflating them is how
a validated-demand product ships an extraction step that does not work.

**Feasibility falsifier, run in parallel on the same 20 transcripts:** the model
extracts action items, and a human who did not see the model's output extracts
them independently. **Kill or re-scope if the model's items agree with the
human's on fewer than 75% of standups**, scored as an item-level F1 against the
human set. Below that, the operator spends longer correcting than filing, and
the manual baseline is the better product.

**Secondary falsifier:** if the manual version takes a person under 5 minutes per
standup, the problem is too cheap to automate and there is no business here.

## What would change this

Evidence that a bundled incumbent is already shipping tracker write-back would
close the wedge; we check Linear's and Zoom's changelogs before starting.
