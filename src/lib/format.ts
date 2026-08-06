/** Shared display formatters. Keep presentation-only logic here, not in components. */

/** "Amine Belkacem" -> "AB". Falls back to "?" for empty input. */
export function initialsOf(name: string): string {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}

/** Locale-aware date, e.g. 03/08/2026. Arabic uses Latin digits for scannability. */
export function formatDate(iso: string, locale: string): string {
  const tag = locale === "ar" ? "ar-DZ-u-nu-latn" : locale === "en" ? "en-GB" : "fr-FR";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(tag, { dateStyle: "short" }).format(date);
}

/** Amount in Algerian dinar, e.g. "3 000 DZD". */
export function formatDzd(amount: number, locale: string): string {
  const tag = locale === "ar" ? "ar-DZ-u-nu-latn" : locale === "en" ? "en-GB" : "fr-FR";
  return `${new Intl.NumberFormat(tag).format(amount)} DZD`;
}

/**
 * Today as a local `YYYY-MM-DD` calendar date.
 *
 * NOT `toISOString().slice(0, 10)`: that converts to UTC first, so anywhere east
 * of Greenwich after ~22:00 local it returns tomorrow. Attendance, schedules and
 * reports all key on calendar dates, where being a day out is a silent data bug.
 */
export function todayIso(): string {
  return toLocalIso(new Date());
}

/** A `Date` as a local `YYYY-MM-DD`, for the same reason as `todayIso`. */
export function toLocalIso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
