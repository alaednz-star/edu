/**
 * Week and month grids for the session calendar.
 *
 * Both scroll horizontally inside their own container rather than letting the
 * page body scroll, and both use `repeat(7, minmax(0, 1fr))` with `min-width: 0`
 * cells so a long group name cannot blow a column out.
 *
 * Weekday and month names come from `Intl` with the active locale -- not a
 * hand-written array -- so Arabic and English are correct without a second
 * translation table.
 */

import { useI18n } from "@/hooks/use-i18n";
import { groupByDate, groupByTimeSlot } from "./status";
import { SessionCard } from "./session-card";
import { fromIso, isSameMonth, monthGrid, weekDays } from "./calendar-range";
import type { SessionInstance } from "./types";
import { cn } from "@/lib/utils";

/** Intl locale tag. Arabic uses Latin digits so dates stay scannable, matching `lib/format.ts`. */
function tag(locale: string): string {
  return locale === "ar" ? "ar-DZ-u-nu-latn" : locale === "en" ? "en-GB" : "fr-FR";
}

/** Up to 3 chips per month cell, then a "+N" summary. */
const MONTH_CHIP_LIMIT = 3;

export function WeekView({
  anchor,
  sessions,
  today,
  onOpen,
}: {
  anchor: string;
  sessions: SessionInstance[];
  today: string;
  onOpen: (s: SessionInstance) => void;
}) {
  const { locale, t } = useI18n();
  const days = weekDays(anchor);
  const byDate = groupByDate(sessions);
  const dayFmt = new Intl.DateTimeFormat(tag(locale), { weekday: "short" });

  return (
    <div className="surface-card overflow-x-auto">
      <div className="min-w-[62rem]">
        {/* Header strip */}
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}
        >
          {days.map((d) => {
            const isToday = d === today;
            const count = byDate.get(d)?.length ?? 0;
            return (
              <div
                key={d}
                className={cn(
                  "flex items-center justify-between gap-2 border-e border-border px-3 py-2.5 last:border-e-0",
                  isToday && "bg-primary-soft",
                )}
              >
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide",
                      isToday ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {dayFmt.format(fromIso(d))}
                  </p>
                  <p
                    className={cn(
                      "text-base font-semibold tabular-nums",
                      isToday &&
                        "grid size-6 place-items-center rounded-full bg-primary text-primary-foreground",
                    )}
                  >
                    {Number(d.slice(8, 10))}
                  </p>
                </div>
                {count > 0 && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}>
          {days.map((d) => {
            const dayS = byDate.get(d) ?? [];
            const slots = groupByTimeSlot(dayS);
            return (
              <div
                key={d}
                className={cn(
                  "min-h-[24rem] space-y-3 border-e border-border p-2 last:border-e-0",
                  d === today && "bg-primary-soft/30",
                )}
              >
                {slots.size === 0 ? (
                  <p className="pt-6 text-center text-sm text-muted-foreground/60">—</p>
                ) : (
                  [...slots.entries()].map(([slot, list]) => (
                    <div key={slot}>
                      <div className="mb-1 flex items-baseline gap-1.5">
                        <p className="text-[11px] font-bold tabular-nums">
                          {slot.replace("-", " – ")}
                        </p>
                        {list.length > 1 && (
                          <p className="text-[10px] text-muted-foreground">
                            {t("entity.session.parallelCount", { count: list.length })}
                          </p>
                        )}
                      </div>
                      {/* A start-edge rule groups the parallel cards without
                          merging them. Logical, so it flips under RTL. */}
                      <div
                        className={cn(
                          "space-y-1.5",
                          list.length > 1 && "border-s-2 border-border ps-1.5",
                        )}
                      >
                        {list.map((s) => (
                          <SessionCard key={s.key} session={s} onOpen={onOpen} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MonthView({
  anchor,
  sessions,
  today,
  onOpen,
}: {
  anchor: string;
  sessions: SessionInstance[];
  today: string;
  onOpen: (s: SessionInstance) => void;
}) {
  const { locale, t } = useI18n();
  const cells = monthGrid(anchor);
  const byDate = groupByDate(sessions);
  const dayFmt = new Intl.DateTimeFormat(tag(locale), { weekday: "short" });

  // Header labels are derived from the FIRST ROW of the same grid, so they can
  // never drift out of alignment with the body columns.
  const headers = cells.slice(0, 7);

  return (
    <div className="surface-card overflow-x-auto">
      <div className="min-w-[62rem]">
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}
        >
          {headers.map((d) => (
            <div
              key={d}
              className="min-w-0 border-e border-border px-2 py-2 text-center last:border-e-0"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {dayFmt.format(fromIso(d))}
              </p>
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}>
          {cells.map((d) => {
            const dayS = byDate.get(d) ?? [];
            const outside = !isSameMonth(d, anchor);
            const isToday = d === today;
            const shown = dayS.slice(0, MONTH_CHIP_LIMIT);
            const extra = dayS.length - shown.length;
            // A slot with more than one session differentiates by GROUP, which
            // the chip already leads with, so nothing extra is needed here.
            return (
              <div
                key={d}
                className={cn(
                  "min-w-0 space-y-1 border-b border-e border-border p-1.5 last:border-e-0",
                  "min-h-[7rem]",
                  isToday && "bg-primary-soft/40",
                )}
              >
                <p
                  className={cn(
                    "text-[11px] font-semibold tabular-nums",
                    outside ? "text-muted-foreground/45" : "text-foreground",
                    isToday &&
                      "grid size-5 place-items-center rounded-full bg-primary text-primary-foreground",
                  )}
                >
                  {Number(d.slice(8, 10))}
                </p>
                {shown.map((s) => (
                  <SessionCard key={s.key} session={s} onOpen={onOpen} compact />
                ))}
                {extra > 0 && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    {t(
                      extra === 1
                        ? "entity.session.moreSessions"
                        : "entity.session.moreSessionsPlural",
                      { count: extra },
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
