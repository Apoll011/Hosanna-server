/**
 * Compact clock context for AI system prompts (Studio + MCP).
 * Avoids the model guessing "today" / "next Sunday".
 */

export function buildClockContext(
  now = new Date(),
  timeZone = "Europe/Lisbon",
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const yyyy = get("year");
  const mm = get("month");
  const dd = get("day");
  const weekday = get("weekday");
  const hour = get("hour");
  const minute = get("minute");
  const date = `${yyyy}-${mm}-${dd}`;

  // Next Sunday (if today is Sunday, next week's Sunday)
  const asUtc = new Date(`${date}T12:00:00Z`);
  const day = asUtc.getUTCDay(); // 0=Sun
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const nextSunday = new Date(asUtc);
  nextSunday.setUTCDate(asUtc.getUTCDate() + daysUntilSunday);
  const nextSundayIso = nextSunday.toISOString().slice(0, 10);

  return {
    timeZone,
    nowIso: now.toISOString(),
    date,
    weekday,
    timeLocal: `${hour}:${minute}`,
    nextSunday: nextSundayIso,
    note: `Today is ${weekday} ${date} (${timeZone}). Prefer explicit YYYY-MM-DD; "next Sunday" ≈ ${nextSundayIso}. Service element duration is seconds.`,
  };
}

/** One short block to append to system prompts. */
export function clockContextPromptBlock(
  now = new Date(),
  timeZone = "Europe/Lisbon",
): string {
  const c = buildClockContext(now, timeZone);
  return `

## Clock
- Today: **${c.weekday} ${c.date}** (${c.timeZone}), local time ~${c.timeLocal}
- UTC now: ${c.nowIso}
- "Next Sunday" from today ≈ **${c.nextSunday}**
- Service \`duration\` values are **seconds** (e.g. 210 ≈ 3.5 min). Agenda \`durationMinutes\` is minutes.
`;
}
