import { useEffect, useMemo, useState } from "react";
import { useSubjectLabel } from "@/features/school/subject-label";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { useAttendance, useGroups, useSaveAttendance } from "@/features/school/queries";
import type { AttendanceStatus } from "@/features/school/types";
import { weekdayLabel } from "@/features/school/schedule";
import { todayIso } from "@/lib/format";
import { AlertTriangle, CalendarCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/attendance")({
  head: () => ({
    meta: [
      { title: "Présences — Madrasti" },
      { name: "description", content: "Marquez les présences de chaque séance en un clic." },
      { property: "og:title", content: "Présences — Madrasti" },
      { property: "og:description", content: "Marquez les présences de chaque séance." },
    ],
  }),
  component: () => (
    <RequireAuth roles={["admin", "teacher"]}>
      <AttendancePage />
    </RequireAuth>
  ),
});

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];
const LABEL_KEYS: Record<AttendanceStatus, string> = {
  present: "entity.attendance.statusPresent",
  absent: "entity.attendance.statusAbsent",
  late: "entity.attendance.statusLate",
  excused: "entity.attendance.statusExcused",
};

/** One shared reference, so "no roster yet" never looks like new data. */
const EMPTY_ROSTER: never[] = [];

function AttendancePage() {
  const { t } = useI18n();
  const subjectLabel = useSubjectLabel();
  const { notifySuccess, notifyError } = useActionFeedback();
  const { user } = useAuth();
  const {
    data: groups = [],
    isLoading: loadingGroups,
    error: groupsError,
    refetch: refetchGroups,
    isFetching: fetchingGroups,
  } = useGroups();
  const scoped = user?.role === "teacher" ? groups.filter((g) => g.teacherId === user.id) : groups;

  const [groupId, setGroupId] = useState<string | undefined>(undefined);
  // Local date, not `toISOString()`: that converts to UTC first, so anywhere
  // east of Greenwich after ~22:00 the register would open on tomorrow's date.
  const [date, setDate] = useState(todayIso);
  const {
    data,
    isLoading,
    error: rosterError,
    refetch: refetchRoster,
    isFetching: fetchingRoster,
  } = useAttendance(groupId, date);
  const save = useSaveAttendance();
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  // INFINITE LOOP FIX. `const { data: roster = [] }` built a NEW array on every
  // render whenever `data` was undefined, so the effect below saw a changed
  // dependency, called setMarks, re-rendered, and repeated -- React bailed out
  // with "Maximum update depth exceeded". Memoising keeps one stable reference.
  const roster = useMemo(() => data ?? EMPTY_ROSTER, [data]);

  // Seed the local marks from whatever is already saved.
  //
  // Keyed on group+date as well as the roster: switching group used to leave the
  // previous group's marks on screen, because a student enrolled in both groups
  // kept their entry in `marks`. The teacher then saved marks they never made.
  useEffect(() => {
    const next: Record<string, AttendanceStatus> = {};
    roster.forEach((r) => {
      if (r.status) next[r.studentId] = r.status;
    });
    setMarks(next);
  }, [roster, groupId, date]);

  /**
   * Whether the selected group actually meets on the selected date.
   *
   * The database enforces this (`validate_attendance_occurrence`), but finding
   * out only after marking a whole class is a poor trade. Checking the group's
   * own schedule up front lets the UI say so before any work is lost.
   */
  const selectedGroup = scoped.find((g) => g.id === groupId);
  const meetsOnDate = useMemo(() => {
    if (!selectedGroup || !date) return true;
    if (selectedGroup.schedules.length === 0) return true; // still being set up
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const inTerm =
      (!selectedGroup.startDate || date >= selectedGroup.startDate) &&
      (!selectedGroup.endDate || date <= selectedGroup.endDate);
    return inTerm && selectedGroup.schedules.some((s) => s.weekday === weekday);
  }, [selectedGroup, date]);

  /**
   * Marks that differ from what is stored.
   *
   * Sending only these means two people editing the same register merge instead
   * of colliding: each writes the rows they actually touched, rather than
   * stamping the whole roster and silently overwriting the other's work.
   */
  const changed = useMemo(() => {
    const saved = new Map(roster.map((r) => [r.studentId, r.status]));
    return Object.entries(marks).filter(
      ([studentId, status]) => saved.has(studentId) && saved.get(studentId) !== status,
    );
  }, [marks, roster]);

  /** Unsaved work exists -- used to warn before it would be discarded. */
  const isDirty = changed.length > 0;

  /**
   * Runs a change that would replace the roster, confirming first if marks are
   * unsaved. Switching group or date silently discarded a marked register
   * before; a teacher who had just marked 25 students lost all of it with no
   * indication it was ever at risk.
   */
  const guardedChange = (apply: () => void) => {
    if (isDirty && !window.confirm(t("entity.attendance.discardChanges"))) return;
    apply();
  };

  const submit = () => {
    if (!groupId || !user) return;
    // Refuse before the round trip: the database would reject this anyway, and
    // failing here keeps the teacher's marks on screen instead of losing them
    // to a generic error toast.
    if (!meetsOnDate) {
      toast.error(t("entity.attendance.notScheduled"));
      return;
    }
    const entries = changed.map(([studentId, status]) => ({ studentId, status }));
    if (entries.length === 0) {
      toast.error(t("entity.attendance.nothingChanged"));
      return;
    }
    save.mutate(
      { groupId, date, markedBy: user.id, entries },
      {
        onSuccess: () => notifySuccess("entity.attendance.saved"),
        onError: (e) => notifyError(e),
      },
    );
  };

  return (
    <>
      <PageHeader
        title={t("entity.attendance.title")}
        description={t("entity.attendance.description")}
        actions={
          <Button
            className="rounded-xl"
            onClick={submit}
            // Nothing changed means nothing to write. Disabling also removes the
            // "did my click register?" ambiguity after a successful save.
            disabled={!groupId || save.isPending || !meetsOnDate || !isDirty}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {save.isPending ? t("ui.saving") : t("entity.attendance.save")}
          </Button>
        }
      />

      <div className="surface-card grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("entity.attendance.group")}</Label>
          {loadingGroups ? (
            <Skeleton className="h-11 rounded-xl" />
          ) : (
            <Select value={groupId ?? ""} onValueChange={(v) => guardedChange(() => setGroupId(v))}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue placeholder={t("entity.attendance.chooseGroup")} />
              </SelectTrigger>
              <SelectContent>
                {scoped.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} — {subjectLabel(g.subjectKey, g.subjectName)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="att-date">{t("entity.attendance.sessionDate")}</Label>
          <Input
            id="att-date"
            type="date"
            className="h-11 rounded-xl"
            value={date}
            onChange={(e) => {
              const next = e.target.value;
              guardedChange(() => setDate(next));
            }}
          />
        </div>
      </div>

      {/* Say it before the teacher marks a class, not after the save fails. */}
      {groupId && !meetsOnDate && (
        <div role="alert" className="surface-alert flex items-start gap-3 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-medium">{t("entity.attendance.notScheduled")}</p>
            <p className="text-muted-foreground">
              {t("entity.attendance.notScheduledHint", {
                days: (selectedGroup?.schedules ?? [])
                  .map((s) => weekdayLabel(s.weekday, t))
                  .join(", "),
              })}
            </p>
          </div>
        </div>
      )}

      {groupsError ? (
        <ErrorState
          error={groupsError}
          onRetry={() => void refetchGroups()}
          isRetrying={fetchingGroups}
        />
      ) : rosterError ? (
        <ErrorState
          error={rosterError}
          onRetry={() => void refetchRoster()}
          isRetrying={fetchingRoster}
        />
      ) : !groupId ? (
        <EmptyState
          icon={CalendarCheck}
          title={t("entity.attendance.noGroupSelected")}
          description={t("entity.attendance.chooseGroupDescription")}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : roster.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={t("entity.attendance.noStudents")}
          description={t("entity.attendance.noStudentsDescription")}
        />
      ) : (
        <ul className="space-y-2">
          {roster.map((r) => (
            <li
              key={r.studentId}
              className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium">{r.fullName}</span>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={marks[r.studentId] === s ? "default" : "outline"}
                    className={cn("rounded-xl")}
                    onClick={() => setMarks((p) => ({ ...p, [r.studentId]: s }))}
                  >
                    {t(LABEL_KEYS[s])}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
