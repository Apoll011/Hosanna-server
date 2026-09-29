/**
 * Agenda reminder job
 *
 * Runs once per day (Vercel cron). For every organization it finds agenda
 * events happening tomorrow ("in 1 day") or in 3 days ("in 3 days"), then
 * sends a push notification (FCM) to every session of every assigned member
 * that has `notify` enabled and an `fcm` token registered.
 *
 * Event dates are stored as plain strings (e.g. "2026-09-27") and interpreted
 * in the organization's configured timezone (org metadata →
 * settings.general.timezone, default Europe/Lisbon). Date math is done on
 * calendar keys (never on epoch milliseconds), so DST transitions can't shift
 * "tomorrow" onto the wrong day.
 *
 * Assignees are stored as Better Auth *member* ids. They are resolved to
 * Better Auth *user* ids through the `member` table (accepting either the
 * member id or the user id), scoped to the organization so a stale assignee
 * from another tenant can never be notified.
 *
 * Responsibility labels are localized using the org's responsibilityCategories
 * from metadata, falling back to the built-in RESPONSIBILITIES tables.
 *
 * The job is idempotent: a row in `agenda_reminder_dispatches` is written for
 * every (event, user, lead-time) that had at least one successful push, so a
 * retry or a manual run cannot notify the same person twice.
 */

import { prisma } from "../database/prisma.js";
import { sendFcmToToken } from "../lib/fcm.js";
import { DEFAULT_LOCALE, t, type TranslationKey } from "../lib/i18n.js";
import { RESPONSIBILITIES } from "../locales/responsabilities.js";

// ── Constants ───────────────────────────────────────────────────────────────

/** Lead times (in days) a reminder is sent for. Order matters: index 0 → 1 day. */
const REMINDER_OFFSETS_DAYS = [1, 3] as const;

const DEFAULT_TIMEZONE = "Europe/Lisbon";

/** Max number of reminder payloads pushed to FCM at the same time. */
const FCM_CONCURRENCY = 10;

// ── Types ───────────────────────────────────────────────────────────────────

interface Assignee {
  id: string;
  name: string;
  /** Better Auth member id — present for real members, absent for manual ones. */
  memberId?: string;
  avatarUrl?: string;
}

interface Responsibility {
  id: string;
  categoryId: string;
  assignees: Assignee[];
}

interface ResponsibilityCategory {
  id: string;
  label: string;
}

interface OrgMeta {
  locale?: string;
  shortName?: string;
  settings?: {
    general?: { locale?: string; timezone?: string };
    agenda?: { responsibilityCategories?: ResponsibilityCategory[] };
  };
}

/** One (event, user) notification to deliver. */
interface PendingReminder {
  orgId: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  daysUntil: number;
  locale: string;
  userId: string;
  labels: string[];
}

interface FcmPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface AgendaReminderResult {
  eventsChecked: number;
  notificationsSent: number;
  tokensPruned: number;
  /** Reminders skipped because they were already delivered in a previous run. */
  duplicatesSkipped: number;
  errors: string[];
}

// ── Date helpers (org-timezone aware, calendar-key math) ────────────────────

/** Cache of Intl formatters keyed by timezone — constructing them is expensive. */
const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>();

function dateKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateKeyFormatters.get(timeZone);
  if (!formatter) {
    // en-CA yields ISO-like YYYY-MM-DD formatting.
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateKeyFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Formats an instant into the calendar date (YYYY-MM-DD) in a timezone. */
function toDateKeyInTz(date: Date, timeZone: string): string {
  return dateKeyFormatter(timeZone).format(date);
}

/** Adds whole calendar days to a YYYY-MM-DD key, immune to DST shifts. */
function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/** Date keys (YYYY-MM-DD) for the reminder offsets in the org timezone. */
function getTargetDateKeys(timeZone: string, now: Date): string[] {
  const todayKey = toDateKeyInTz(now, timeZone);
  return REMINDER_OFFSETS_DAYS.map((days) => addDaysToDateKey(todayKey, days));
}

// ── Org metadata ────────────────────────────────────────────────────────────

function parseOrgMetadata(metadata: unknown): OrgMeta {
  if (!metadata) return {};
  try {
    const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    return (meta ?? {}) as OrgMeta;
  } catch {
    return {};
  }
}

/**
 * Builds a `categoryId → label` map once per org: the org's own configured
 * categories take precedence over the built-in locale tables.
 */
function buildCategoryLabels(
  meta: OrgMeta,
  locale: string,
): Map<string, string> {
  const labels = new Map<string, string>();

  const builtIn = (
    RESPONSIBILITIES as unknown as Record<
      string,
      readonly ResponsibilityCategory[]
    >
  )[resolveResponsibilityLocale(locale)];
  for (const category of builtIn ?? []) {
    labels.set(category.id, category.label);
  }

  for (const category of meta.settings?.agenda?.responsibilityCategories ??
    []) {
    if (category?.id && category.label) labels.set(category.id, category.label);
  }

  return labels;
}

// ── Assignee resolution ─────────────────────────────────────────────────────

/**
 * Maps assignee ids (Better Auth member ids) to Better Auth user ids.
 *
 * Accepts a raw id that is either a `member.id` or a `member.userId`, and only
 * resolves members that actually belong to `orgId`. Returns an empty map when
 * there is nothing to resolve.
 */
async function resolveMemberUserIds(
  orgId: string,
  candidateIds: Set<string>,
): Promise<Map<string, string>> {
  const ids = [...candidateIds];
  if (ids.length === 0) return new Map();

  const members = await prisma.member.findMany({
    where: {
      organizationId: orgId,
      OR: [{ id: { in: ids } }, { userId: { in: ids } }],
    },
    select: { id: true, userId: true },
  });

  const memberToUser = new Map<string, string>();
  for (const member of members) {
    memberToUser.set(member.id, member.userId);
    // Some clients store the user id directly in `memberId`.
    memberToUser.set(member.userId, member.userId);
  }
  return memberToUser;
}

// ── Concurrency ─────────────────────────────────────────────────────────────

/** Runs `fn` over `items` with at most `limit` promises in flight. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await fn(item);
      }
    },
  );
  await Promise.all(workers);
}

// ── Main job ────────────────────────────────────────────────────────────────

export async function runAgendaReminders(
  now: Date = new Date(),
): Promise<AgendaReminderResult> {
  const result: AgendaReminderResult = {
    eventsChecked: 0,
    notificationsSent: 0,
    tokensPruned: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  const organizations = await prisma.organization.findMany({
    select: { id: true, metadata: true },
  });

  // ── Phase 1: collect every reminder to deliver (DB I/O per org, no sends) ──
  const reminders: PendingReminder[] = [];

  for (const org of organizations) {
    try {
      const meta = parseOrgMetadata(org.metadata);
      const locale =
        meta.settings?.general?.locale ?? meta.locale ?? DEFAULT_LOCALE;
      const timezone = meta.settings?.general?.timezone ?? DEFAULT_TIMEZONE;
      const i18nLocale = resolveI18nLocale(locale);
      const categoryLabels = buildCategoryLabels(meta, locale);

      const targetKeys = getTargetDateKeys(timezone, now);
      const events = await prisma.agendaEvent.findMany({
        where: {
          orgId: org.id,
          deleted: false,
          date: { in: targetKeys },
        },
        select: {
          id: true,
          title: true,
          date: true,
          time: true,
          responsibilities: true,
        },
      });
      if (events.length === 0) continue;

      // Group assignees by member id per event, then resolve the union of all
      // member ids in a single query per org (avoids one user lookup per event).
      const eventsWithAssignees: Array<{
        event: (typeof events)[number];
        labelsByMemberId: Map<string, string[]>;
      }> = [];
      const candidateMemberIds = new Set<string>();

      for (const event of events) {
        const responsibilities = Array.isArray(event.responsibilities)
          ? (event.responsibilities as unknown as Responsibility[])
          : [];

        const labelsByMemberId = new Map<string, string[]>();
        for (const responsibility of responsibilities) {
          if (!Array.isArray(responsibility?.assignees)) continue;

          const label =
            categoryLabels.get(responsibility.categoryId) ??
            responsibility.categoryId;

          for (const assignee of responsibility.assignees) {
            if (!assignee?.memberId) continue; // manual (non-member) assignees
            candidateMemberIds.add(assignee.memberId);
            const labels = labelsByMemberId.get(assignee.memberId);
            if (labels) {
              if (!labels.includes(label)) labels.push(label);
            } else {
              labelsByMemberId.set(assignee.memberId, [label]);
            }
          }
        }

        if (labelsByMemberId.size > 0) {
          eventsWithAssignees.push({ event, labelsByMemberId });
        }
      }

      if (eventsWithAssignees.length === 0) continue;

      const memberToUser = await resolveMemberUserIds(
        org.id,
        candidateMemberIds,
      );

      for (const { event, labelsByMemberId } of eventsWithAssignees) {
        result.eventsChecked++;

        const daysUntil =
          event.date === targetKeys[0]
            ? REMINDER_OFFSETS_DAYS[0]
            : REMINDER_OFFSETS_DAYS[1];

        for (const [memberId, labels] of labelsByMemberId) {
          const userId = memberToUser.get(memberId);
          if (!userId) continue; // assignee is not (or no longer) a member

          reminders.push({
            orgId: org.id,
            eventId: event.id,
            eventTitle: event.title,
            eventDate: event.date,
            eventTime: event.time ?? "",
            daysUntil,
            locale: i18nLocale,
            userId,
            labels,
          });
        }
      }
    } catch (err) {
      recordError(result, `org ${org.id}`, err);
    }
  }

  if (reminders.length === 0) return result;

  // ── Phase 2: drop already-delivered reminders, then fan out ───────────────
  const alreadySent = await prisma.agendaReminderDispatch.findMany({
    where: {
      OR: reminders.map((r) => ({
        eventId: r.eventId,
        userId: r.userId,
        daysUntil: r.daysUntil,
      })),
    },
    select: { eventId: true, userId: true, daysUntil: true },
  });
  const sentKeys = new Set(alreadySent.map(dispatchKey));

  const pending = reminders.filter((r) => !sentKeys.has(dispatchKey(r)));
  result.duplicatesSkipped = reminders.length - pending.length;
  if (pending.length === 0) return result;

  // One session query for every recipient (instead of one per user).
  const sessions = await prisma.session.findMany({
    where: {
      userId: { in: [...new Set(pending.map((r) => r.userId))] },
      notify: true,
      fcm: { not: null },
    },
    select: { id: true, userId: true, fcm: true },
  });
  const sessionsByUser = groupSessionsByUser(sessions);

  const dispatched: Array<{
    eventId: string;
    userId: string;
    daysUntil: number;
  }> = [];

  await mapWithConcurrency(pending, FCM_CONCURRENCY, async (reminder) => {
    try {
      const payload = buildPayload(reminder);
      const recipientSessions = sessionsByUser.get(reminder.userId) ?? [];
      if (recipientSessions.length === 0) return;

      let sent = 0;
      const deadSessionIds: string[] = [];

      await Promise.all(
        recipientSessions.map(async (session) => {
          const outcome = await sendFcmToToken(session.fcm!, payload);
          if (outcome.ok) {
            sent++;
          } else if (outcome.invalidToken) {
            deadSessionIds.push(session.id);
          }
        }),
      );

      if (deadSessionIds.length > 0) {
        // Tokens are dead — clear them so we stop retrying future notifications.
        await prisma.session
          .updateMany({
            where: { id: { in: deadSessionIds } },
            data: { fcm: null },
          })
          .catch(() => undefined);
        result.tokensPruned += deadSessionIds.length;
      }

      result.notificationsSent += sent;
      if (sent > 0) {
        // Only ledger reminders we actually delivered something for, so a run
        // where every token was dead can be retried on the next invocation.
        dispatched.push({
          eventId: reminder.eventId,
          userId: reminder.userId,
          daysUntil: reminder.daysUntil,
        });
      }
    } catch (err) {
      recordError(result, `event ${reminder.eventId}`, err);
    }
  });

  if (dispatched.length > 0) {
    try {
      await prisma.agendaReminderDispatch.createMany({
        data: dispatched,
        skipDuplicates: true,
      });
    } catch (err) {
      recordError(result, "persist dispatch ledger", err);
    }
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function dispatchKey(d: {
  eventId: string;
  userId: string;
  daysUntil: number;
}): string {
  return `${d.eventId}\u0000${d.userId}\u0000${d.daysUntil}`;
}

function groupSessionsByUser(
  sessions: Array<{ id: string; userId: string; fcm: string | null }>,
): Map<string, Array<{ id: string; fcm: string | null }>> {
  const byUser = new Map<string, Array<{ id: string; fcm: string | null }>>();
  for (const session of sessions) {
    const list = byUser.get(session.userId);
    if (list) list.push(session);
    else byUser.set(session.userId, [session]);
  }
  return byUser;
}

function buildPayload(reminder: PendingReminder): FcmPayload {
  const when =
    reminder.daysUntil <= 1
      ? tKey(reminder.locale, "notification.agenda_reminder_tomorrow")
      : tKey(reminder.locale, "notification.agenda_reminder_in_days", {
          days: reminder.daysUntil,
        });

  return {
    title: `${tKey(reminder.locale, "notification.agenda_reminder_title")} — ${reminder.eventTitle}`,
    body: `${when}: ${reminder.labels.join(", ")}`,
    data: {
      type: "agenda.reminder",
      eventId: reminder.eventId,
      orgId: reminder.orgId,
      eventDate: reminder.eventDate,
      eventTime: reminder.eventTime,
      daysUntil: String(reminder.daysUntil),
    },
  };
}

function recordError(
  result: AgendaReminderResult,
  scope: string,
  err: unknown,
): void {
  const message = `[agenda-reminders] ${scope}: ${
    err instanceof Error ? err.message : String(err)
  }`;
  console.error(message);
  result.errors.push(message);
}

// ── Locale helpers ──────────────────────────────────────────────────────────

/** Maps an org locale tag to one of the registry keys known to lib/i18n. */
function resolveI18nLocale(locale: string): string {
  if (locale.startsWith("en")) return "en-US";
  if (locale.startsWith("es")) return "es-ES";
  return "pt-PT";
}

/** Normalizes a locale tag to a RESPONSIBILITIES table key ("pt-PT"|"en"|"es"). */
function resolveResponsibilityLocale(locale: string): string {
  if (locale.startsWith("en")) return "en";
  if (locale.startsWith("es")) return "es";
  return "pt-PT";
}

/** t() with a relaxed key type so callers stay readable. */
function tKey(
  locale: string,
  key: string,
  vars?: Record<string, string | number>,
): string {
  return t(locale, key as TranslationKey, vars);
}
