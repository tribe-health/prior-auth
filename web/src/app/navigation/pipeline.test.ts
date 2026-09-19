/**
 * The gating test.
 *
 * ADR-005 states this rule is **not** enforced by `scripts/audit.sh` — the
 * audit checks structural boundaries and this is behavioural. So this file is
 * the only thing standing between the rule and a refactor that quietly
 * reintroduces a flag.
 */
import { describe, expect, it } from "vitest";

import { CASE_PIPELINE, GLOBAL_NAV, isStepReachable } from "./pipeline";
import { CLINICAL_CAPABILITIES, can, type VerifiedSession } from "@/shared/model/session";

const surgeon: VerifiedSession = {
  identityId: "11111111-1111-1111-1111-111111111111",
  sessionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  userId: "22222222-2222-2222-2222-222222222222",
  practiceId: "33333333-3333-3333-3333-333333333333",
  displayName: "Dr. Rivera",
  capabilities: ["affirm_gate", "sign_letter", "letter_approve", "annotate", "submit", "view_audit"],
  principal: "user",
  expiresAt: "2099-01-01T00:00:00Z",
  authorizationRevision: "test:1",
};

const coordinator: VerifiedSession = {
  ...surgeon,
  displayName: "Prior-auth coordinator",
  capabilities: ["submit", "view_audit"],
};

const administrator: VerifiedSession = {
  ...surgeon,
  displayName: "Practice administrator",
  capabilities: ["configure", "view_audit"],
};

/** An AI assistant acting for the surgeon. ADR-002: a different principal. */
const agentForSurgeon: VerifiedSession = { ...surgeon, principal: "agent" };

describe("the pipeline matches the prototype contract", () => {
  it("has eleven steps, numbered 01 through 11", () => {
    expect(CASE_PIPELINE).toHaveLength(11);
    expect(CASE_PIPELINE.map((s) => s.index)).toEqual([
      "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11",
    ]);
  });

  it("gates exactly steps 07 through 10 — the four marked gated in shell.js", () => {
    const gated = CASE_PIPELINE.filter((s) => s.requires === "affirm_gate").map((s) => s.index);
    expect(gated).toEqual(["07", "08", "09", "10"]);
  });
});

describe("steps 07-10 are unreachable until the gate is affirmed", () => {
  it("locks every gated step when the gate is not affirmed", () => {
    for (const step of CASE_PIPELINE.filter((s) => s.requires === "affirm_gate")) {
      const result = isStepReachable(step, { gateStatus: 'not-affirmed' });
      expect(result.kind, `step ${step.index} should be locked`).toBe("awaiting-gate");
    }
  });

  it("leaves steps 01-06 reachable regardless", () => {
    for (const step of CASE_PIPELINE.filter((s) => s.requires === null)) {
      expect(isStepReachable(step, { gateStatus: 'not-affirmed' }).kind).toBe("reachable");
    }
  });

  it("opens 07-10 once the gate is affirmed", () => {
    for (const step of CASE_PIPELINE) {
      expect(isStepReachable(step, { gateStatus: 'affirmed' }).kind).toBe("reachable");
    }
  });

  it("states a reason a human can read", () => {
    const locked = isStepReachable(CASE_PIPELINE[6], { gateStatus: 'not-affirmed' });
    expect(locked.kind).toBe("awaiting-gate");
    if (locked.kind === "awaiting-gate") {
      // Brand voice: specific about consequence, no hedging.
      expect(locked.message).toMatch(/surgeon affirmation/i);
      expect(locked.message).toMatch(/06/);
    }
  });

  it("gates on CASE state, not on who is looking", () => {
    // A coordinator with no clinical capability still reaches the letter screen
    // on an affirmed case — they do the drafting. Conflating "can affirm" with
    // "may view" would hide the screen from the person who needs it.
    const letter = CASE_PIPELINE.find((s) => s.index === "07")!;
    expect(isStepReachable(letter, { gateStatus: 'affirmed' }).kind).toBe("reachable");
    expect(can(coordinator, "affirm_gate")).toBe(false);
  });
});

describe("global navigation shows no door that cannot be opened", () => {
  it("hides Admin from a session without `configure`", () => {
    const visible = (s: VerifiedSession) =>
      GLOBAL_NAV.filter((i) => !i.requires || can(s, i.requires)).map((i) => i.id);

    expect(visible(administrator)).toContain("admin");
    expect(visible(surgeon)).not.toContain("admin");
    expect(visible(coordinator)).not.toContain("admin");
  });

  it("shows Cases and Settings to everyone", () => {
    for (const s of [surgeon, coordinator, administrator]) {
      const visible = GLOBAL_NAV.filter((i) => !i.requires || can(s, i.requires)).map((i) => i.id);
      expect(visible).toEqual(expect.arrayContaining(["cases", "settings"]));
    }
  });
});

describe("an agent is a different principal (ADR-002)", () => {
  it("holds no clinical capability even with an identical capability list", () => {
    for (const capability of CLINICAL_CAPABILITIES) {
      expect(can(surgeon, capability), `surgeon should hold ${capability}`).toBe(true);
      expect(
        can(agentForSurgeon, capability),
        `agent must NOT hold ${capability} — authority is re-granted per action or it does not exist`,
      ).toBe(false);
    }
  });

  it("retains non-clinical capabilities", () => {
    // The rule is about medical acts, not a blanket downgrade.
    expect(can(agentForSurgeon, "submit")).toBe(true);
    expect(can(agentForSurgeon, "view_audit")).toBe(true);
  });

  it("grants nothing to a null session", () => {
    expect(can(null, "view_audit")).toBe(false);
    expect(can(null, "affirm_gate")).toBe(false);
  });
});

describe("a blocked step explains itself to assistive technology", () => {
  it("carries a reason sentence, not just a state", () => {
    // This asserts the MESSAGE only. It does NOT verify that app-shell renders
    // it into an sr-only element — no test in this suite mounts AppShell, so
    // that wiring is checked in a browser and recorded in
    // review/a2-screen-reader.md, not here. Claiming otherwise in a test
    // comment would be a verification claim the test does not support.
    for (const step of CASE_PIPELINE.filter((s) => s.requires === "affirm_gate")) {
      const blocked = isStepReachable(step, { gateStatus: 'not-affirmed' });
      expect(blocked.kind).toBe("awaiting-gate");
      if (blocked.kind === "awaiting-gate") {
        // A reason a coordinator can act on names WHAT is missing and WHERE.
        expect(blocked.message).toMatch(/surgeon affirmation/i);
        expect(blocked.message).toMatch(/06/);
        expect(blocked.message.length).toBeGreaterThan(20);
      }
    }
  });
});
