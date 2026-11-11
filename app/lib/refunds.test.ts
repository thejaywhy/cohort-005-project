import { describe, it, expect } from "vitest";
import {
  checkRefundEligibility,
  getRefundAmount,
  REFUND_WATCH_LIMIT_SECONDS,
  type RefundEligibilityInput,
} from "./refunds";

const purchasedAt = new Date(2026, 10, 1, 23, 0);

function eligibility(overrides: Partial<RefundEligibilityInput> = {}) {
  return checkRefundEligibility({
    purchasedAt,
    now: new Date(2026, 10, 3, 12, 0),
    hasRefund: false,
    isClaimedTeamSeat: false,
    secondsWatched: 0,
    completedLessonCount: 0,
    lessonCount: 10,
    ...overrides,
  });
}

describe("checkRefundEligibility", () => {
  it("is eligible for a fresh purchase", () => {
    expect(eligibility()).toEqual({
      eligible: true,
      lastDayInWindow: "2026-11-15",
    });
  });

  it("allows the whole fourteenth calendar day", () => {
    expect(eligibility({ now: new Date(2026, 10, 15, 23, 59) }).eligible).toBe(
      true
    );
  });

  it("closes the window the day after", () => {
    expect(eligibility({ now: new Date(2026, 10, 16, 0, 1) })).toEqual({
      eligible: false,
      reason: "window-closed",
    });
  });

  it("refuses a second Refund, even after a Decline", () => {
    expect(eligibility({ hasRefund: true })).toEqual({
      eligible: false,
      reason: "already-has-refund",
    });
  });

  it("refuses a claimed team seat", () => {
    expect(eligibility({ isClaimedTeamSeat: true })).toEqual({
      eligible: false,
      reason: "claimed-team-seat",
    });
  });

  it("refuses once two hours have been watched", () => {
    expect(
      eligibility({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS })
    ).toEqual({ eligible: false, reason: "watched-too-much" });
  });

  it("refuses once half the lessons are completed", () => {
    expect(eligibility({ completedLessonCount: 5 })).toEqual({
      eligible: false,
      reason: "completed-too-much",
    });
    expect(eligibility({ completedLessonCount: 4 }).eligible).toBe(true);
  });

  it("does not divide by zero for a course with no lessons", () => {
    expect(eligibility({ lessonCount: 0 }).eligible).toBe(true);
  });
});

describe("getRefundAmount", () => {
  it("is what the learner paid, not the list price", () => {
    expect(getRefundAmount({ amountPaid: 3950 })).toBe(3950);
  });
});
