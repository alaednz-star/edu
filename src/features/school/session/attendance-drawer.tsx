/**
 * Attendance drawer -- marks one session's register.
 *
 * Opens from a calendar card. Loads the roster only when open, so the calendar
 * itself never pays for student rows.
 *
 * UNSAVED-CHANGES GUARD
 *
 * Audit finding P1-2: navigating away silently discarded a marked register. A
 * drawer has MORE exits than the old page did -- the close button, Escape, the
 * scrim, and switching to another session -- so every one of them routes through
 * `attemptClose`. Radix fires `onOpenChange(false)` for Escape and scrim clicks
 * alike, which is the single choke point the guard needs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { useSubjectLabel } from "../subject-label";
import type { AttendanceStatus } from "../types";
import { useSaveSessionAttendance, useSessionRoster } from "./use-session-attendance";
import { subjectTint } from "./subject-tint";
import type { SessionInstance } from "./types";
import { formatDate, initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

/** Status → the existing semantic tokens. No new colours enter the system. */
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-success-soft text-success border-success/30",
  absent: "bg-destructive/10 text-destructive border-destructive/30",
  late: "bg-accent-soft text-accent border-accent/30",
  excused: "bg-muted text-muted-foreground border-border",
};

interface Props {
  session: SessionInstance | null;
  /** The calendar's active window, so the summary cache patch targets it. */
  window: { from: string; to: string };
  onClose: () => void;
}

export function AttendanceDrawer({ session, window: win, onClose }: Props) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const subjectLabel = useSubjectLabel();
  const { notifySuccess, notifyError } = useActionFeedback();

  const rosterQuery = useSessionRoster(session?.groupId ?? null, session?.date ?? null);
  const save = useSaveSessionAttendance();

  /**
   * ONE stable reference when there is no data yet.
   *
   * `const { data: roster = [] }` would build a NEW array on every render while
   * `data` is undefined, so the effect below would see a changed dependency,
   * call setMarks, re-render, and repeat -- the "Maximum update depth exceeded"
   * loop that `dashboard.attendance.tsx` documents. Memoising keeps one identity.
   */
  const roster = useMemo(() => rosterQuery.data ?? EMPTY_ROSTER, [rosterQuery.data]);

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  /**
   * Seed local marks from what is saved.
   *
   * Keyed on the session as well as the roster: switching sessions used to leave
   * the previous group's marks on screen, because a student enrolled in both
   * kept their entry. The teacher then saved marks they never made.
   */
  useEffect(() => {
    const next: Record<string, AttendanceStatus> = {};
    for (const r of roster) if (r.status) next[r.studentId] = r.status;
    setMarks(next);
  }, [roster, session?.key]);

  /** Only staff may write. RLS is the real boundary; this hides a dead control. */
  const canEdit = user?.role === "admin" || user?.role === "teacher";

  /** Entries that differ from storage -- the diff the mutation sends. */
  const changed = useMemo(() => {
    const saved = new Map(roster.map((r) => [r.studentId, r.status]));
    return Object.entries(marks).filter(
      ([id, status]) => saved.has(id) && saved.get(id) !== status,
    );
  }, [marks, roster]);

  const isDirty = changed.length > 0;
  const markedCount = Object.keys(marks).length;
  const missing = roster.length - markedCount;

  /** Every exit funnels through here, so none of them can discard silently. */
  const attemptClose = useCallback(() => {
    if (isDirty && !globalThis.confirm(t("entity.session.drawer.discard"))) return;
    onClose();
  }, [isDirty, onClose, t]);

  const markAll = () => {
    const next: Record<string, AttendanceStatus> = {};
    for (const r of roster) next[r.studentId] = "present";
    setMarks(next);
  };

  const reset = () => setMarks({});

  const toggle = (studentId: string, status: AttendanceStatus) => {
    setMarks((prev) => {
      const next = { ...prev };
      // Clicking the active status again clears it, so a mis-click is undoable
      // without reaching for Réinitialiser and losing the whole register.
      if (next[studentId] === status) delete next[studentId];
      else next[studentId] = status;
      return next;
    });
  };

  const submit = () => {
    if (!session || !user) return;
    if (changed.length === 0) {
      notifyError(new Error(t("entity.session.drawer.noChanges")));
      return;
    }
    save.mutate(
      {
        groupId: session.groupId,
        date: session.date,
        markedBy: user.id,
        entries: changed.map(([studentId, status]) => ({ studentId, status })),
        window: win,
        enrolled: session.enrolled,
        finalMarks: marks,
      },
      {
        onSuccess: () => {
          notifySuccess("entity.session.drawer.saved");
          onClose();
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  const open = session !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Radix routes Escape AND scrim clicks through here.
        if (!next) attemptClose();
      }}
    >
      {/* `side="right"` is the LOGICAL intent "where the drawer lives"; SheetContent
          flips it under RTL itself, so Arabic gets a start-edge drawer with no
          extra work here. Its built-in close button dispatches Radix's
          onOpenChange, which lands on `attemptClose` above -- so the X, Escape
          and the scrim all share one guard. */}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[30rem]"
      >
        {session && (
          <>
            <DrawerHeader session={session} locale={locale} subjectLabel={subjectLabel} />

            {session.enrolled === 0 ? (
              <ZeroEnrollment t={t} />
            ) : (
              <>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={markAll}
                    >
                      {t("entity.session.drawer.allPresent")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-xl"
                      onClick={reset}
                    >
                      {t("entity.session.drawer.reset")}
                    </Button>
                    <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                      {t("entity.session.drawer.markedCount", {
                        marked: markedCount,
                        enrolled: roster.length,
                      })}
                    </span>
                  </div>
                )}

                <p className="border-b border-border px-5 py-2 text-[11px] text-muted-foreground">
                  {t("entity.session.drawer.legend")}
                </p>

                {!canEdit && (
                  <p role="status" className="surface-alert mx-5 mt-4 px-4 py-3 text-sm">
                    {t("entity.session.drawer.readOnly")}
                  </p>
                )}

                <div className="flex-1 space-y-2 p-5">
                  {rosterQuery.isLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 rounded-xl" />
                      ))
                    : roster.map((r) => (
                        <div
                          key={r.studentId}
                          className="flex items-center gap-3 rounded-xl border border-border/70 p-2.5"
                        >
                          <Avatar className="size-9 shrink-0">
                            {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt="" />}
                            <AvatarFallback className="text-xs">
                              {initialsOf(r.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {r.fullName}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            {STATUSES.map((s) => {
                              const active = marks[r.studentId] === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={!canEdit}
                                  aria-pressed={active}
                                  aria-label={t(`entity.attendance.status${cap(s)}`)}
                                  onClick={() => toggle(r.studentId, s)}
                                  className={cn(
                                    "focus-ring size-8 rounded-lg border text-xs font-semibold transition-colors",
                                    active
                                      ? STATUS_STYLE[s]
                                      : "border-border text-muted-foreground hover:bg-muted",
                                    !canEdit && "cursor-not-allowed opacity-60",
                                  )}
                                >
                                  {t(`entity.session.code.${s}`)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                </div>

                {canEdit && (
                  <footer className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-card px-5 py-4">
                    <span className={cn("text-xs", missing > 0 ? "text-accent" : "text-success")}>
                      {missing > 0
                        ? t("entity.session.drawer.missing", { count: missing })
                        : t("entity.session.drawer.ready")}
                    </span>
                    <Button
                      type="button"
                      className="ms-auto rounded-xl"
                      onClick={submit}
                      disabled={!isDirty || save.isPending}
                    >
                      {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                      {save.isPending
                        ? t("entity.session.drawer.saving")
                        : t("entity.session.drawer.save")}
                    </Button>
                  </footer>
                )}
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Shared empty reference -- see the note on `roster` above. */
const EMPTY_ROSTER: never[] = [];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function DrawerHeader({
  session,
  locale,
  subjectLabel,
}: {
  session: SessionInstance;
  locale: string;
  subjectLabel: (k: string | null | undefined, n?: string | null) => string;
}) {
  const tint = subjectTint(session.subjectColor, session.subjectKey);
  // The time range is kept OUT of this joined string and rendered as its own
  // bidi-isolated element below: "14:00 – 16:00" is direction-neutral, so under
  // RTL the browser reorders it to "16:00 – 14:00" and states the wrong times.
  const meta = [formatDate(session.date, locale), session.teacherName, session.room].filter(
    Boolean,
  );

  return (
    <header className="border-b border-border px-5 py-4" style={{ backgroundColor: tint.tint }}>
      <div className="flex items-start justify-between gap-3 pe-8">
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: tint.color }}
          >
            {subjectLabel(session.subjectKey, session.subjectName)}
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">
            {session.groupName}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <span dir="ltr" style={{ unicodeBidi: "isolate" }} className="tabular-nums">
              {session.startTime} – {session.endTime}
            </span>
            {meta.length > 0 && ` · ${meta.join(" · ")}`}
          </p>
        </div>
      </div>
    </header>
  );
}

/** A group nobody is enrolled in: point at Inscriptions rather than an empty list. */
function ZeroEnrollment({ t }: { t: (k: string) => string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
        <UserPlus className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{t("entity.session.drawer.noStudents")}</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        {t("entity.session.drawer.noStudentsHint")}
      </p>
      <Button asChild variant="outline" size="sm" className="mt-1 rounded-xl">
        <Link to="/dashboard/registrations">{t("entity.session.drawer.goToRegistrations")}</Link>
      </Button>
    </div>
  );
}
