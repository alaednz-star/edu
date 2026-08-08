import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/features/auth/require-auth";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTeachers } from "@/features/school/queries";
import { useSessions } from "@/features/school/session/use-sessions";
import { AttendanceDrawer } from "@/features/school/session/attendance-drawer";
import { AgendaView, MonthView, WeekView } from "@/features/school/session/calendar-views";
import {
  fromIso,
  startOfWeek,
  step,
  toIso,
  windowFor,
  type CalendarView,
} from "@/features/school/session/calendar-range";
import type { SessionInstance } from "@/features/school/session/types";
import { useSubjectLabel } from "@/features/school/subject-label";
import { subjectColor } from "@/features/school/session/subject-tint";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/attendance")({
  head: () => ({
    meta: [
      { title: "Présences — Madrasti" },
      { name: "description", content: "Le calendrier des séances : pointez en un clic." },
      { property: "og:title", content: "Présences — Madrasti" },
      { property: "og:description", content: "Le calendrier des séances." },
    ],
  }),
  component: () => (
    <RequireAuth roles={["admin", "teacher"]}>
      <AttendanceCalendarPage />
    </RequireAuth>
  ),
});

const ALL = "__all__";

/**
 * The schedule IS the picker.
 *
 * All session data comes from the Session Spine (`useSessions`). This page never
 * expands recurrence, never counts registrations, and never fetches a roster --
 * the drawer does that for one session when it opens.
 */
function AttendanceCalendarPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const subjectLabel = useSubjectLabel();
  const isMobile = useIsMobile();

  const today = useMemo(() => toIso(new Date()), []);
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<CalendarView>("week");
  const [toMarkOnly, setToMarkOnly] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState<string>(ALL);
  const [openSession, setOpenSession] = useState<SessionInstance | null>(null);
  /** Agenda's focused day. Only used on narrow screens. */
  const [agendaDay, setAgendaDay] = useState(today);

  const isAdmin = user?.role === "admin";
  const teachersQuery = useTeachers();

  // Narrow screens get a single-day agenda instead of a seven-column week: at
  // ~390px each column would be ~50px, which cannot hold a group name.
  const useAgenda = isMobile && view === "week";

  const win = useMemo(() => windowFor(anchor, view), [anchor, view]);

  // Keep the agenda's day inside the visible week when the week changes, so
  // stepping forward lands on a day that is actually on screen.
  useEffect(() => {
    if (!useAgenda) return;
    const weekStart = startOfWeek(anchor);
    if (agendaDay < weekStart || agendaDay > win.to) setAgendaDay(weekStart);
  }, [anchor, useAgenda, agendaDay, win.to]);

  const { sessions, counters, isLoading, isFetching, error, refetch } = useSessions(
    {
      from: win.from,
      to: win.to,
      teacherId: isAdmin && teacherFilter !== ALL ? teacherFilter : null,
      toMarkOnly,
    },
    today,
  );

  /** Subjects actually present in the period, for the legend. */
  const legend = useMemo(() => {
    const seen = new Map<string, { label: string; color: string }>();
    for (const s of sessions) {
      const id = s.subjectId ?? s.subjectKey ?? "none";
      if (seen.has(id)) continue;
      seen.set(id, {
        label: subjectLabel(s.subjectKey, s.subjectName),
        color: subjectColor(s.subjectColor, s.subjectKey),
      });
    }
    return [...seen.values()];
  }, [sessions, subjectLabel]);

  const periodLabel = usePeriodLabel(anchor, view, win);

  return (
    <div className="space-y-4">
      {/* Header: title dominant, counters right-aligned and semantic. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("entity.session.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("entity.session.description")}</p>
        </div>
        <dl className="flex shrink-0 items-stretch gap-4 sm:gap-5">
          <Counter value={counters.total} label={t("entity.session.counter.total")} />
          <Counter
            value={counters.toMark}
            label={t("entity.session.counter.toMark")}
            tone="accent"
          />
          <Counter
            value={counters.overdue}
            label={t("entity.session.counter.overdue")}
            tone="danger"
          />
        </dl>
      </header>

      {/* One coherent control bar rather than floating pills. */}
      <div className="surface-card flex flex-wrap items-center gap-x-3 gap-y-2.5 px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={t("entity.session.previous")}
            onClick={() => setAnchor((a) => step(a, view, -1))}
          >
            {/* Chevrons are physical glyphs, so they swap under RTL to keep
                "previous" pointing at the start edge. */}
            <ChevronLeft className="size-4 rtl:hidden" aria-hidden />
            <ChevronRight className="hidden size-4 rtl:block" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={t("entity.session.next")}
            onClick={() => setAnchor((a) => step(a, view, 1))}
          >
            <ChevronRight className="size-4 rtl:hidden" aria-hidden />
            <ChevronLeft className="hidden size-4 rtl:block" aria-hidden />
          </Button>
        </div>

        <p
          data-testid="period-label"
          className="min-w-0 truncate text-[15px] font-semibold capitalize tracking-tight sm:text-base"
        >
          {periodLabel}
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg text-xs"
          onClick={() => {
            setAnchor(today);
            setAgendaDay(today);
          }}
        >
          {t("entity.session.today")}
        </Button>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={toMarkOnly ? "default" : "outline"}
            size="sm"
            aria-pressed={toMarkOnly}
            className="h-8 rounded-lg text-xs"
            onClick={() => setToMarkOnly((v) => !v)}
          >
            {t("entity.session.toMarkOnly")}
          </Button>

          {isAdmin && (
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="h-8 w-auto min-w-36 max-w-52 rounded-lg text-xs">
                <SelectValue placeholder={t("entity.session.teacherFilter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("entity.session.allTeachers")}</SelectItem>
                {(teachersQuery.data ?? []).map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Segmented control: inset track, active pill lifted. */}
          <div className="flex rounded-lg bg-muted p-0.5">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "focus-ring rounded-[0.35rem] px-2.5 py-1 text-xs font-medium transition-colors",
                  view === v
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(v === "week" ? "entity.session.viewWeek" : "entity.session.viewMonth")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} isRetrying={isFetching} />
      ) : isLoading ? (
        <Skeleton className="h-112 rounded-2xl" />
      ) : (
        <>
          {sessions.length === 0 && (
            <p className="surface-panel px-4 py-3 text-sm text-muted-foreground">
              {toMarkOnly
                ? t("entity.session.emptyPeriodFiltered")
                : t("entity.session.emptyPeriod")}
            </p>
          )}

          {useAgenda ? (
            <AgendaView
              anchor={anchor}
              selected={agendaDay}
              onSelect={setAgendaDay}
              sessions={sessions}
              today={today}
              onOpen={setOpenSession}
            />
          ) : view === "week" ? (
            <WeekView anchor={anchor} sessions={sessions} today={today} onOpen={setOpenSession} />
          ) : (
            <MonthView anchor={anchor} sessions={sessions} today={today} onOpen={setOpenSession} />
          )}

          {legend.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
              {legend.map((s) => (
                <span
                  key={s.label}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className="size-2.5 rounded-[3px]"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <AttendanceDrawer session={openSession} window={win} onClose={() => setOpenSession(null)} />
    </div>
  );
}

/** "3 – 9 août 2026" for a week, "août 2026" for a month. Locale-aware. */
function usePeriodLabel(anchor: string, view: CalendarView, win: { from: string; to: string }) {
  const { locale } = useI18n();
  return useMemo(() => {
    const tag = locale === "ar" ? "ar-DZ-u-nu-latn" : locale === "en" ? "en-GB" : "fr-FR";
    if (view === "month") {
      return new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(
        fromIso(anchor),
      );
    }
    const start = fromIso(win.from);
    const end = fromIso(win.to);
    const dayFmt = new Intl.DateTimeFormat(tag, { day: "numeric" });
    const fullFmt = new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return start.getMonth() === end.getMonth()
      ? `${dayFmt.format(start)} – ${fullFmt.format(end)}`
      : `${new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(start)} – ${fullFmt.format(end)}`;
  }, [anchor, view, win.from, win.to, locale]);
}

function Counter({
  value,
  label,
  tone = "neutral",
}: {
  value: number;
  label: string;
  tone?: "neutral" | "accent" | "danger";
}) {
  return (
    <div className="border-s border-border ps-4 first:border-s-0 first:ps-0 sm:ps-5">
      <dd
        data-testid="counter-value"
        className={cn(
          "text-xl font-semibold tabular-nums leading-tight sm:text-2xl",
          tone === "accent" && value > 0 && "text-accent",
          tone === "danger" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </dd>
      <dt className="text-[11px] text-muted-foreground sm:text-xs">{label}</dt>
    </div>
  );
}
