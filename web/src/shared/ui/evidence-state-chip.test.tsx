/**
 * The colour-independence test.
 *
 * ADR-003 says colour is reinforcement and never the signal. That claim is
 * only true if the states remain distinguishable with colour removed, so this
 * file removes it and checks.
 *
 * `audit.sh` check 6 protects the three-member union in the model; nothing
 * mechanical protects the rendering. This file is that guard.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EVIDENCE_STATES, evidenceLabel } from "@/shared/model/evidence-state";
import { EvidenceStateChip } from "./evidence-state-chip";
import { EvidenceCountsSummary } from "./evidence-counts";
import { CitationChip } from "./citation-chip";

afterEach(cleanup);

describe("every state is legible with colour disabled", () => {
  it("renders its canonical label as text", () => {
    for (const state of EVIDENCE_STATES) {
      cleanup();
      render(<EvidenceStateChip state={state} />);
      // textContent survives any stylesheet. If this passes, the state is
      // readable in greyscale, in a screen reader, and on a monochrome print.
      expect(screen.getByText(evidenceLabel[state])).toBeTruthy();
    }
  });

  it("distinguishes the three states by SHAPE, not only by colour", () => {
    const shapes = new Set<string>();

    for (const state of EVIDENCE_STATES) {
      cleanup();
      const { container } = render(<EvidenceStateChip state={state} />);
      const marker = container.querySelector("[aria-hidden='true']");
      expect(marker, `${state} must render a non-colour marker`).toBeTruthy();
      shapes.add(marker!.className);
    }

    // Three states, three distinct shape treatments. If a refactor collapses
    // two of them, colour becomes the only channel and this fails.
    expect(shapes.size).toBe(3);
  });

  it("gives the three states distinct labels", () => {
    const labels = new Set(EVIDENCE_STATES.map((s) => evidenceLabel[s]));
    expect(labels.size).toBe(3);
  });

  it("marks the state on the element for assistive and test tooling", () => {
    const { container } = render(<EvidenceStateChip state="void" />);
    expect(container.querySelector("[data-evidence-state='void']")).toBeTruthy();
  });
});

describe("counts show all three states, including zero", () => {
  it("renders a zero rather than omitting the state", () => {
    render(<EvidenceCountsSummary counts={{ met: 4, gap: 2, void: 0 }} />);

    // The absence of a number and a zero are different claims. Omitting the
    // void row when it is zero reads as "not checked", not "checked, none
    // found" — and that is the reading that lets a chart look complete.
    expect(screen.getByText(/0 not documented/i)).toBeTruthy();
    expect(screen.getByText(/4 met/i)).toBeTruthy();
    expect(screen.getByText(/2 not met/i)).toBeTruthy();
  });

  it("shows the required action only for states that have any", () => {
    render(<EvidenceCountsSummary counts={{ met: 0, gap: 3, void: 0 }} showAction />);
    expect(screen.getByText("Argue it")).toBeTruthy();
    expect(screen.queryByText("Obtain it")).toBeNull();
  });
});

describe("a citation is never silently empty", () => {
  it("renders the source when there is one", () => {
    render(<CitationChip source="Epic · MRI L4-L5 · 2026-03-14" />);
    expect(screen.getByText("Epic · MRI L4-L5 · 2026-03-14")).toBeTruthy();
  });

  it("renders a void treatment when there is none", () => {
    // An assertion with no citation must LOOK unsourced. Rendering nothing
    // makes it indistinguishable from a sourced claim the layout clipped.
    const { container } = render(<CitationChip source={null} />);
    const chip = container.querySelector("[data-evidence-state='void']");
    expect(chip).toBeTruthy();
    expect(within(chip as HTMLElement).getByText("Not documented")).toBeTruthy();
  });
});
