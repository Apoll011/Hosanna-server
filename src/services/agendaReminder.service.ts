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
 * settings.general.timezone, default Europe/Lisbon).
 *
 * Responsibility labels are localized using the org's responsibilityCategories
 * from metadata, falling back to the built-in RESPONSIBILITIES tables.
 */

import { RESPONSIBILITIES } from "../locales/responsabilities.js";
import { DEFAULT_LOCALE, t, type TranslationKey } from "../lib/i18n.js";
import { prisma } from "../database/prisma.js";
import { sendFcmToToken } from "../lib/fcm.js";

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

export interface AgendaReminderResult {
  eventsChecked: number;
  notificationsSent: number;
  tokensPruned: number;
  errors: string[];
}

// ── Date helpers (org-timezone aware, no external deps) ────────────────────

/** Formats a Date into the calendar date string (YYYY-MM-DD) in a timezone. */
function toDateKeyInTz(date: Date, timeZone: string): string {
  // en-CA yields ISO-like YYYY-MM-DD formatting.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** The UTC timestamp at which the given org-local date key begins. */
function startOfOrgDay(dateKey: string, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(0));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  // Resolve the timezone's offset at an instant where the local wall clock
  // equals the target date at 00:00:00. Two-pass to absorb DST shifts.
  let guessUtc = Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    get("hour") % 24 === 0 ? 0 : get("hour") % 24 || 0,
    get("minute"),
    get("second"),
  );
  guessUtc -= (get("hour") % 24) * 3_600_000 + get("minute") * 60_000 + get("second") * 1000;

  const asTzKey = toDateKeyInTz(new Date(guessUtc), timeZone);
  if (asTzKey !== dateKey) {
    guessUtc += asTzKey < dateKey ? 86_400_000 : -86_400_000;
  }
  return guessUtc;
}

/** Date keys (YYYY-MM-DD) for "tomorrow" and "in 3 days" in the org timezone. */
function getTargetDateKeys(timeZone: string, now = new Date()): string[] {
  const todayKey = toDateKeyInTz(now, timeZone);
  const todayStart = startOfOrgDay(todayKey, timeZone);
  return [1, 3].map((days) =>
    toDateKeyInTz(new Date(todayStart + days * 86_400_000), timeZone),
  );
}

// ── Org metadata ────────────────────────────────────────────────────────────

function parseOrgMetadata(metadata: unknown): OrgMeta {
  if (!metadata) return {};
  try {
    const meta =
      typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    return (meta ?? {}) as OrgMeta;
  } catch {
    return {};
  }
}

function resolveCategoryLabel(
  meta: OrgMeta,
  categoryId: string,
): string | undefined {
  const categories = meta.settings?.agenda?.responsibilityCategories;
  return categories?.find((c) => c?.id === categoryId)?.label;
}

// ── Notification fan-out ────────────────────────────────────────────────────

/**
 * Sends the reminder for one event to one user (all their sessions that have
 * an fcm token and notify=true). Returns the number of sends attempted.
 */
async function notifyAssignee(
  userId: string,
  payload: { title: string; body: string; data: Record<string, string> },
  pruneInvalidTokens: boolean,
): Promise<{ sent: number; pruned: number }> {
  const sessions = await prisma.session.findMany({
    where: { userId, notify: true, fcm: { not: null } },
    select: { id: true, fcm: true },
  });

  let sent = 0;
  let pruned = 0;

  for (const session of sessions) {
    if (!session.fcm) continue;
    const result = await sendFcmToToken(session.fcm, payload);
    if (result.ok) {
      sent++;
    } else if (pruneInvalidTokens && result.invalidToken) {
      // Token is dead — clear it so we stop retrying future notifications.
      await prisma.session
        .update({ where: { id: session.id }, data: { fcm: null } })
        .catch(() => undefined);
      pruned++;
    }
  }

  return { sent, pruned };
}

// ── Main job ────────────────────────────────────────────────────────────────

export async function runAgendaReminders(): Promise<AgendaReminderResult> {
  const result: AgendaReminderResult = {
    eventsChecked: 0,
    notificationsSent: 0,
    tokensPruned: 0,
    errors: [],
  };

  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true, metadata: true },
  });

  for (const org of organizations) {
    try {
      const meta = parseOrgMetadata(org.metadata);
      const locale = meta.settings?.general?.locale ?? meta.locale ?? DEFAULT_LOCALE;
      const timezone = meta.settings?.general?.timezone ?? "Europe/Lisbon";
      const i18nLocale = resolveI18nLocale(locale);

      const targetKeys = getTargetDateKeys(timezone);
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

      for (const event of events) {
        result.eventsChecked++;

        const responsibilities =
          Array.isArray(event.responsibilities) &&
          event.responsibilities.length > 0
            ? (event.responsibilities as unknown as Responsibility[])
            : [];

        // Map memberId → labels of the responsibilities the member holds.
        const labelsByMemberId = new Map<string, string[]>();
        for (const resp of responsibilities) {
          if (!resp?.assignees) continue;
          const label =
            resolveCategoryLabel(meta, resp.categoryId) ??
            (RESPONSIBILITIES as unknown as Record<
              string,
              ResponsibilityCategory[]
            >)[resolveResponsibilityLocale(locale)]?.find(
              (c) => c.id === resp.categoryId,
            )?.label ??
            resp.categoryId;

          for (const assignee of resp.assignees) {
            if (!assignee?.memberId) continue; // manual (non-member) assignees
            const labels = labelsByMemberId.get(assignee.memberId) ?? [];
            if (!labels.includes(label)) labels.push(label);
            labelsByMemberId.set(assignee.memberId, labels);
          }
        }

        if (labelsByMemberId.size === 0) continue;

        // Better Auth member ids equal user ids in this deployment
        // (see the org payload example), so map directly to users.
        const users = await prisma.user.findMany({
          where: { id: { in: [...labelsByMemberId.keys()] } },
          select: { id: true },
        });
        const userIds = new Set(users.map((u) => u.id));

        for (const userId of userIds) {
          const labels = labelsByMemberId.get(userId) ?? [];
          const daysUntil =
            targetKeys[0] === event.date ? 1 : targetKeys[1] === event.date ? 3 : 0;
          const when =
            daysUntil <= 1
              ? tKey(i18nLocale, "notification.agenda_reminder_tomorrow")
              : tKey(i18nLocale, "notification.agenda_reminder_in_days", {
                  days: daysUntil,
                });

          const payload = {
            title: `${tKey(i18nLocale, "notification.agenda_reminder_title")} — ${event.title}`,
            body: `${when}: ${labels.join(", ")}`,
            data: {
              type: "agenda.reminder",
              eventId: event.id,
              orgId: org.id,
              eventDate: event.date,
              eventTime: event.time ?? "",
              daysUntil: String(daysUntil),
            },
          };

          const { sent, pruned } = await notifyAssignee(
            userId,
            payload,
            true,
          );
          result.notificationsSent += sent;
          result.tokensPruned += pruned;
        }
      }
    } catch (err) {
      const message = `[agenda-reminders] org ${org.id}: ${
        err instanceof Error ? err.message : String(err)
      }`;
      console.error(message);
      result.errors.push(message);
    }
  }

  return result;
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
function tKey(locale: string, key: string, vars?: Record<string, string | number>): string {
  return t(locale, key as TranslationKey, vars);
}
