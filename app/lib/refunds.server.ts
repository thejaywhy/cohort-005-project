import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  videoWatchEvents,
  LessonProgressStatus,
} from "~/db/schema";
import {
  checkRefundEligibility,
  getRefundAmount,
  type RefundEligibility,
} from "./refunds";

type Purchase = typeof purchases.$inferSelect;

export interface RefundOffer {
  purchase: Purchase;
  amount: number;
  eligibility: RefundEligibility;
}

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function hasRefund(purchaseId: number): boolean {
  const refund = db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.purchaseId, purchaseId))
    .get();
  return refund !== undefined;
}

// A seat that came out of a team licence, and has been claimed, belongs to the
// team — the learner cannot hand it back on their own.
function isClaimedTeamSeat(purchaseId: number): boolean {
  const seat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt)))
    .get();
  return seat !== undefined;
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

// Watched time is the furthest point reached in each lesson, summed.
function getSecondsWatched(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;

  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

/**
 * The learner's Refund offer for a course, or null if they have not bought it.
 */
export function getRefundOffer(
  userId: number,
  courseId: number
): RefundOffer | null {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) return null;

  const lessonIds = getLessonIdsForCourse(courseId);

  const eligibility = checkRefundEligibility({
    purchasedAt: new Date(purchase.createdAt),
    now: new Date(),
    hasRefund: hasRefund(purchase.id),
    isClaimedTeamSeat: isClaimedTeamSeat(purchase.id),
    secondsWatched: getSecondsWatched(userId, lessonIds),
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    lessonCount: lessonIds.length,
  });

  return { purchase, amount: getRefundAmount(purchase), eligibility };
}
