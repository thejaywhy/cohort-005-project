// Refund eligibility — the one rule both the course page (to show the offer)
// and the refund action (to accept it) apply. See GLOSSARY.md.

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundIneligibleReason =
  | "already-has-refund"
  | "claimed-team-seat"
  | "window-closed"
  | "watched-too-much"
  | "completed-too-much";

export type RefundEligibility =
  | { eligible: true; lastDayInWindow: string }
  | { eligible: false; reason: RefundIneligibleReason };

export interface RefundEligibilityInput {
  purchasedAt: Date;
  now: Date;
  /** A Purchase has at most one Refund, whatever its state. */
  hasRefund: boolean;
  isClaimedTeamSeat: boolean;
  secondsWatched: number;
  completedLessonCount: number;
  lessonCount: number;
}

// Compare whole calendar days, not hours — a purchase at 23:00 should still
// get its full fourteenth day.
export function toCalendarDay(when: Date): string {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAt: Date): string {
  const deadline = new Date(purchasedAt);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return toCalendarDay(deadline);
}

export function checkRefundEligibility(
  input: RefundEligibilityInput
): RefundEligibility {
  if (input.hasRefund) return { eligible: false, reason: "already-has-refund" };

  if (input.isClaimedTeamSeat) {
    return { eligible: false, reason: "claimed-team-seat" };
  }

  const today = toCalendarDay(input.now);
  const lastDayInWindow = lastDayOfRefundWindow(input.purchasedAt);
  if (today < toCalendarDay(input.purchasedAt) || today > lastDayInWindow) {
    return { eligible: false, reason: "window-closed" };
  }

  if (input.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "watched-too-much" };
  }

  if (
    input.lessonCount > 0 &&
    input.completedLessonCount / input.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "completed-too-much" };
  }

  return { eligible: true, lastDayInWindow };
}

/** The Refund amount is always exactly what the learner paid. */
export function getRefundAmount(purchase: { amountPaid: number }): number {
  return purchase.amountPaid;
}

export const refundIneligibleMessages: Record<RefundIneligibleReason, string> =
  {
    "already-has-refund": "You have already asked for a refund on this purchase.",
    "claimed-team-seat": "A claimed team seat cannot be refunded.",
    "window-closed": `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    "watched-too-much":
      "You have watched too much of this course to get a refund.",
    "completed-too-much":
      "You have completed too much of this course to get a refund.",
  };
