import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
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
import { useTeachers } from "@/features/school/queries";
import { useSessions } from "@/features/school/session/use-sessions";
import { AttendanceDrawer } from "@/features/school/session/attendance-drawer";
import { MonthView, WeekView } from "@/features/school/session/calendar-views";
import {
  fromIso,
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
 * The previous version of this page asked for a group and a date up front, then
 * answered a wrong guess with "Ce groupe n'a pas cours à cette date" -- it
 * required knowledge of the timetable in order to use the timetable. Sessions are
 * now the objects on screen and marking attendance is an action on one of them.
 *
 * All session data comes from the Session Spine (`useSessions`). This page never
 * expands recurrence, never counts registrations, and never fetches a roster --
 * the drawer does that for one session when it opens.
 */
function AttendanceCalendarPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const subjectLabel = useSubjectLabel();

  const today = useMemo(() => toIso(new Date()), []);
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<CalendarView>("week");
  const [toMarkOnly, setToMarkOnly] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState<string>(ALL);
  const [openSession, setOpenSession] = useState<SessionInstance | null>(null);

  const isAdmin = user?.role === "admin";
  const teachersQuery = useTeachers();

  const win = useMemo(() => windowFor(anchor, view), [anchor, view]);

  // The query object is rebuilt per render, but `useSessions` depends on its
  // FIELDS rather than its identity, so this does not defeat memoisation.
  const { sessions, counters, isLoading, isFetching, error, refetch } = useSessions(
    {
      from: win.from,
      to: win.to,
      // A teacher account is scoped to itself inside the hook and by RLS; the
      // selector is admin-only, so passing ALL here is safe for both roles.
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
    <>
      <PageHeader
        title={t("entity.session.title")}
        description={t("entity.session.description")}
        actions={
          <div className="flex items-stretch gap-4">
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
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl"
          aria-label={t("entity.session.previous")}
          onClick={() => setAnchor((a) => step(a, view, -1))}
        >
          {/* Chevrons are physical glyphs: swap them under RTL so "previous"
              always points at the start edge. */}
          <ChevronLeft className="size-4 rtl:hidden" aria-hidden />
          <ChevronRight className="hidden size-4 rtl:block" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl"
          aria-label={t("entity.session.next")}
          onClick={() => setAnchor((a) => step(a, view, 1))}
        >
          <ChevronRight className="size-4 rtl:hidden" aria-hidden />
          <ChevronLeft className="hidden size-4 rtl:block" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => setAnchor(today)}
        >
          {t("entity.session.today")}
        </Button>

        <p className="ms-1 text-base font-semibold tracking-tight">{periodLabel}</p>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={toMarkOnly ? "default" : "outline"}
            size="sm"
            aria-pressed={toMarkOnly}
            className="rounded-xl"
            onClick={() => setToMarkOnly((v) => !v)}
          >
            {t("entity.session.toMarkOnly")}
          </Button>

          {isAdmin && (
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="h-9 w-48 rounded-xl">
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

          <div className="flex rounded-xl bg-muted p-0.5">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "focus-ring rounded-[0.6rem] px-3 py-1.5 text-xs font-medium transition-colors",
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
        <Skeleton className="h-[32rem] rounded-2xl" />
      ) : (
        <>
          {sessions.length === 0 && (
            <p className="surface-panel px-5 py-4 text-sm text-muted-foreground">
              {toMarkOnly
                ? t("entity.session.emptyPeriodFiltered")
                : t("entity.session.emptyPeriod")}
            </p>
          )}

          {view === "week" ? (
            <WeekView anchor={anchor} sessions={sessions} today={today} onOpen={setOpenSession} />
          ) : (
            <MonthView anchor={anchor} sessions={sessions} today={today} onOpen={setOpenSession} />
          )}

          {legend.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
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
    </>
  );
}

/** "3 – 9 août 2026" for a week, "Août 2026" for a month. Locale-aware. */
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
    // Same month: print the month and year once.
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
    <div className="border-s border-border ps-4 first:border-s-0 first:ps-0">
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "accent" && "text-accent",
          tone === "danger" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
