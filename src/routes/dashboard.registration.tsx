import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  DoorClosed,
  GraduationCap,
  Loader2,
  Search,
  Timer,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/features/auth/require-auth";
import { PersonAvatar } from "@/features/profile/person-avatar";
import {
  useCancelRegistration,
  useCreateRegistration,
  useSubjects,
} from "@/features/school/queries";
import { subjectColor } from "@/features/school/session/subject-tint";
import { useEligibleGroups, type EligibleGroup } from "@/features/school/eligible-groups";
import { useStreamOptions } from "@/features/school/streams";
import { weekdayLabel } from "@/features/school/schedule";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { formatDate, formatDecimal, formatDzd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/registration")({
  head: () => ({
    meta: [
      { title: "S'inscrire à un groupe — Madrasti" },
      {
        name: "description",
        content: "Les groupes disponibles pour votre année scolaire.",
      },
    ],
  }),
  component: () => (
    // The dashboard shell gate already redirects un-onboarded students to the
    // wizard, so by the time this renders the academic profile is complete.
    <RequireAuth roles={["student"]}>
      <RegistrationPage />
    </RequireAuth>
  ),
});

const ALL = "all";
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function RegistrationPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { notifySuccess, notifyError } = useActionFeedback();
  const navigate = useNavigate();

  const { items, identity, isLoading, isFetching, error, refetch } = useEligibleGroups(user?.id);
  const { data: subjects = [] } = useSubjects();
  const { nameOf: streamNameOf } = useStreamOptions();
  const create = useCreateRegistration();
  const cancel = useCancelRegistration();

  // One sheet and two dialogs for the whole page rather than three per card: with 20
  // groups on screen that is 60 mounted Radix portals waiting for a click.
  const [details, setDetails] = useState<EligibleGroup | null>(null);
  const [confirming, setConfirming] = useState<EligibleGroup | null>(null);
  const [withdrawing, setWithdrawing] = useState<EligibleGroup | null>(null);

  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState(ALL);
  const [dayFilter, setDayFilter] = useState(ALL);
  const [teacherFilter, setTeacherFilter] = useState(ALL);

  // Filter options are derived from what the student can actually see, so a
  // dropdown never offers a value that yields zero results.
  const teacherOptions = useMemo(() => {
    const names = new Set<string>();
    for (const { group } of items) if (group.teacherName) names.add(group.teacherName);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const subjectOptions = useMemo(() => {
    const ids = new Set(items.map((i) => i.group.subjectId).filter(Boolean));
    return subjects.filter((s) => ids.has(s.id));
  }, [items, subjects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(({ group }) => {
      if (subjectFilter !== ALL && group.subjectId !== subjectFilter) return false;
      if (teacherFilter !== ALL && group.teacherName !== teacherFilter) return false;
      if (dayFilter !== ALL && !group.schedules.some((s) => String(s.weekday) === dayFilter)) {
        return false;
      }
      if (!q) return true;
      return [
        group.name,
        group.subjectName ?? "",
        group.teacherName ?? "",
        group.schedules.map((s) => s.room ?? "").join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, query, subjectFilter, teacherFilter, dayFilter]);

  const resetFilters = () => {
    setQuery("");
    setSubjectFilter(ALL);
    setDayFilter(ALL);
    setTeacherFilter(ALL);
  };

  const enroll = (groupId: string) => {
    if (!user || create.isPending) return;
    create.mutate(
      { studentId: user.id, groupId },
      {
        onSuccess: (registrationId) => {
          setConfirming(null);
          setDetails(null);
          // A toast alone is too thin an acknowledgement for the moment a
          // student commits to a class -- send them to a real confirmation.
          if (registrationId) {
            void navigate({
              to: "/dashboard/registration/success/$registrationId",
              params: { registrationId },
            });
            return;
          }
          notifySuccess("dash.registration.sent");
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  /**
   * Withdraws a request that has not been decided yet.
   *
   * A DELETE, not a status change: `registration_status` has no `cancelled` value, and
   * the row's own delete policy already allows `student_id = auth.uid()`. Removing it
   * also frees the (student, group) pair, so the student can apply again later --
   * which a tombstone row would block.
   */
  const withdraw = async (item: EligibleGroup) => {
    if (!user || !item.registrationId) return;
    try {
      await cancel.mutateAsync({ id: item.registrationId, studentId: user.id });
      setWithdrawing(null);
      setDetails(null);
      notifySuccess("dash.registration.withdrawn");
    } catch (e) {
      notifyError(e);
    }
  };

  // The count is the honest headline: how many classes are actually open to this
  // student right now, not how many rows the table holds.
  const openCount = useMemo(() => items.filter((i) => i.blockedBy === null).length, [items]);

  const header = (
    <PageHeader
      title={t("dash.registration.title")}
      description={
        isLoading
          ? t("dash.registration.description")
          : openCount > 0
            ? t("dash.registration.openCount", { count: openCount })
            : t("dash.registration.noneOpen")
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState error={error} onRetry={refetch} isRetrying={isFetching} />
      </>
    );
  }

  return (
    <>
      {header}

      {/* Read-only. Level and stream come from onboarding and are deliberately
          not selectable here -- the student cannot browse another year. */}
      <div className="surface-card flex flex-wrap items-center gap-2 p-4 text-sm">
        <GraduationCap className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-medium">{t("dash.registration.yourLevel")}</span>
        {isLoading ? (
          <Skeleton className="h-5 w-40 rounded-md" />
        ) : (
          <>
            <span className="text-muted-foreground">{identity?.levelName ?? "—"}</span>
            {streamNameOf(identity?.streamId) && (
              <Badge variant="secondary" className="rounded-lg">
                {streamNameOf(identity?.streamId)}
              </Badge>
            )}
          </>
        )}
      </div>

      <div className="surface-card space-y-4 p-4 sm:p-5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dash.registration.searchPlaceholder")}
            aria-label={t("dash.registration.searchPlaceholder")}
            className="h-11 rounded-xl ltr:pl-9 rtl:pr-9"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <FilterSelect
            id="reg-subject"
            label={t("dash.registration.subject")}
            value={subjectFilter}
            onChange={setSubjectFilter}
            allLabel={t("dash.registration.allSubjects")}
            options={subjectOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
          <FilterSelect
            id="reg-day"
            label={t("dash.registration.day")}
            value={dayFilter}
            onChange={setDayFilter}
            allLabel={t("dash.registration.allDays")}
            options={WEEKDAYS.map((d) => ({ value: String(d), label: weekdayLabel(d, t) }))}
          />
          <FilterSelect
            id="reg-teacher"
            label={t("dash.registration.teacher")}
            value={teacherFilter}
            onChange={setTeacherFilter}
            allLabel={t("dash.registration.allTeachers")}
            options={teacherOptions.map((n) => ({ value: n, label: n }))}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        // Nothing at all for this level -- the centre has not opened classes yet.
        <EmptyState
          icon={BookOpen}
          title={t("dash.registration.noGroupTitle")}
          description={t("dash.registration.noGroupBody", {
            level: identity?.levelName ?? "",
          })}
        />
      ) : visible.length === 0 ? (
        // Groups exist, but the current search or filters hide them all.
        <EmptyState
          icon={Search}
          title={t("dash.registration.noMatchTitle")}
          description={t("dash.registration.noMatchBody")}
          action={
            <Button variant="outline" className="mt-2 rounded-xl" onClick={resetFilters}>
              {t("dash.registration.clearFilters")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((item) => (
            <GroupCard
              key={item.group.id}
              item={item}
              streamLabel={streamNameOf(item.group.streamId)}
              locale={locale}
              // Enrolling is a commitment of money and time, so it goes through a
              // confirmation rather than firing on the first click.
              onEnroll={() => setConfirming(item)}
              onCancel={() => setWithdrawing(item)}
              onOpenDetails={() => setDetails(item)}
              isEnrolling={create.isPending && confirming?.group.id === item.group.id}
            />
          ))}
        </div>
      )}

      <GroupDetailsSheet
        item={details}
        streamLabel={details ? streamNameOf(details.group.streamId) : null}
        locale={locale}
        onClose={() => setDetails(null)}
        onEnroll={() => details && setConfirming(details)}
        onCancel={() => details && setWithdrawing(details)}
        isEnrolling={create.isPending}
      />

      <ConfirmEnrollDialog
        item={confirming}
        locale={locale}
        isEnrolling={create.isPending}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && enroll(confirming.group.id)}
      />

      <WithdrawDialog
        item={withdrawing}
        isPending={cancel.isPending}
        onClose={() => setWithdrawing(null)}
        onConfirm={() => withdrawing && void withdraw(withdrawing)}
      />
    </>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        {/* 44px, not 40: this is a primary control on a phone. */}
        <SelectTrigger id={id} className="h-11 rounded-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Capacity as a decision rather than a number.
 *
 * "20 places" tells a student nothing; "plus que 2 places" tells them to act. The amber
 * band also opens at 75% occupancy, because a group that is three-quarters full is the
 * one worth hurrying for even when the absolute count still looks comfortable.
 */
function capacityOf(seatsLeft: number, enrolled: number, capacity: number) {
  const occupancy = capacity > 0 ? enrolled / capacity : 0;
  if (seatsLeft <= 0) return { tone: "full" as const, key: "dash.registration.capacityFull" };
  if (seatsLeft <= 3) return { tone: "low" as const, key: "dash.registration.capacityLow" };
  if (occupancy >= 0.75) return { tone: "low" as const, key: "dash.registration.capacityLeft" };
  return { tone: "open" as const, key: "dash.registration.capacityLeft" };
}

const CAPACITY_COLOR = {
  open: "var(--color-success)",
  low: "var(--color-accent)",
  full: "var(--color-destructive)",
} as const;

/** Total weekly hours across every slot, which is what "2h / semaine" means. */
function weeklyHours(schedules: { startTime: string; endTime: string }[]): number {
  const minutes = schedules.reduce((sum, sl) => {
    const [sh = 0, sm = 0] = sl.startTime.split(":").map(Number);
    const [eh = 0, em = 0] = sl.endTime.split(":").map(Number);
    return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
  }, 0);
  return Math.round((minutes / 60) * 10) / 10;
}

function GroupCard({
  item,
  streamLabel,
  locale,
  onEnroll,
  onCancel,
  onOpenDetails,
  isEnrolling,
}: {
  item: EligibleGroup;
  streamLabel: string | null;
  locale: string;
  onEnroll: () => void;
  onCancel: () => void;
  onOpenDetails: () => void;
  isEnrolling: boolean;
}) {
  const { t } = useI18n();
  const { group, seatsLeft, seatsKnown, blockedBy } = item;
  const accent = subjectColor(group.subjectColor, group.subjectKey);

  const occupancy =
    group.maxStudents > 0 ? Math.round((group.enrolled / group.maxStudents) * 100) : 0;
  const room = group.schedules.find((s) => s.room)?.room ?? null;
  const capacity = capacityOf(seatsLeft, group.enrolled, group.maxStudents);
  const hours = weeklyHours(group.schedules);

  return (
    <article className="group/card surface-card overflow-hidden p-0 transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-border hover:shadow-[0_14px_32px_rgba(18,33,29,.12)]">
      {/* SUBJECT BANNER. One gradient per card, built from the subject's own colour via
          color-mix so it stays consistent with Ressources, Présences and Mes cours
          rather than becoming a second palette. */}
      <div
        className="relative h-[92px] overflow-hidden"
        style={{
          background: `linear-gradient(120deg, ${accent} 0%, color-mix(in oklch, ${accent} 78%, white) 55%, color-mix(in oklch, ${accent} 62%, white) 100%)`,
        }}
      >
        {/* Decorative, and large enough to read as texture rather than an icon. */}
        <GraduationCap
          aria-hidden
          className="pointer-events-none absolute -bottom-6 size-[106px] text-white/20 start-3"
        />
        <div className="absolute top-3 flex items-center gap-1.5 end-3">
          <StateBadge blockedBy={blockedBy} />
        </div>
        {/* Bidi-isolated: "3 000 DZD" must not reorder inside an Arabic page. */}
        <span
          dir="ltr"
          style={{ unicodeBidi: "isolate" }}
          className="absolute bottom-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-foreground end-3"
        >
          <Wallet className="size-3" aria-hidden />
          {formatDzd(group.priceDzd, locale)}
        </span>
      </div>

      <div className="px-5 pb-5">
        {/* The teacher sits ACROSS the boundary: the photo is the thing a student
            recognises, so it gets the most visually privileged position on the card. */}
        <div className="-mt-9 flex items-end gap-3">
          <PersonAvatar
            name={group.teacherName}
            url={group.teacherAvatarUrl}
            accent={accent}
            ring
            className="size-[74px] shrink-0 bg-card text-lg"
          />
          <div className="min-w-0 pb-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("dash.registration.teacher")}
            </p>
            <p className="truncate text-[14.5px] font-semibold">
              {group.teacherName ?? t("dash.registration.noTeacher")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenDetails}
          className="focus-ring mt-3 block w-full rounded-lg text-start"
        >
          <h3 className="truncate text-lg font-semibold tracking-tight">{group.name}</h3>
          <p className="truncate text-sm font-semibold" style={{ color: accent }}>
            {group.subjectName ?? "—"}
            {streamLabel ? <span className="text-muted-foreground"> · {streamLabel}</span> : null}
          </p>
        </button>

        <dl className="mt-3 grid grid-cols-3 gap-2">
          <Fact icon={DoorClosed} accent={accent} label={t("group.room")}>
            {room ?? t("dash.section.noRoom")}
          </Fact>
          <Fact icon={CalendarClock} accent={accent} label={t("dash.registration.schedule")}>
            {group.schedules.length === 0
              ? "—"
              : `${weekdayLabel(group.schedules[0]!.weekday, t).slice(0, 3)} ${group.schedules[0]!.startTime.slice(0, 5)}–${group.schedules[0]!.endTime.slice(0, 5)}`}
            {group.schedules.length > 1 ? (
              <span className="text-muted-foreground">
                {" "}
                {t("dash.registration.moreSlots", { count: group.schedules.length - 1 })}
              </span>
            ) : null}
          </Fact>
          <Fact icon={Timer} accent={accent} label={t("dash.registration.weekly")}>
            {hours > 0
              ? t("dash.registration.hoursPerWeek", { hours: formatDecimal(hours, locale) })
              : "—"}
          </Fact>
        </dl>

        {/*
          Seats, only when they are actually knowable.

          A student's `registrations` read is restricted to their own rows, so the
          occupancy this card would draw is always 0/N -- measured for nobody. Showing
          the group's SIZE instead is the honest version of the same fact, and it still
          tells a parent whether this is a class of 8 or of 30.
        */}
        {seatsKnown ? (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-sm font-semibold"
                style={{ color: CAPACITY_COLOR[capacity.tone] }}
              >
                {t(capacity.key, { count: seatsLeft })}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t("dash.registration.enrolledCount", {
                  enrolled: String(group.enrolled),
                  capacity: String(group.maxStudents),
                })}
              </span>
            </div>
            <Progress
              value={Math.min(occupancy, 100)}
              className="h-[7px]"
              aria-label={t("dash.registration.placesLeft")}
            />
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-4 shrink-0" style={{ color: accent }} aria-hidden />
            {t("dash.registration.groupSize", { count: group.maxStudents })}
          </p>
        )}

        <footer className="mt-4">
          <CardAction
            blockedBy={blockedBy}
            rejectionReason={item.rejectionReason}
            isEnrolling={isEnrolling}
            onEnroll={onEnroll}
            onCancel={onCancel}
          />
        </footer>
      </div>
    </article>
  );
}

/** The state badge on the banner. Reuses the shared vocabulary, not a private one. */
function StateBadge({ blockedBy }: { blockedBy: EligibleGroup["blockedBy"] }) {
  const { t } = useI18n();
  if (blockedBy === null) {
    return (
      <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-success">
        {t("dash.registration.stateOpen")}
      </span>
    );
  }
  // Deliberately not `state.*`: those are full sentences for the action band. A badge
  // this size needs one or two words.
  const key =
    blockedBy === "full"
      ? "dash.registration.full"
      : blockedBy === "takenSubject"
        ? "dash.registration.stateTaken"
        : `dash.registration.badge.${blockedBy}`;
  return (
    <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-foreground">
      {t(key)}
    </span>
  );
}

/**
 * The action band.
 *
 * Every state gets one, and each says what can be done rather than only what is true.
 * `full` deliberately offers NOTHING: the spec asked for a waiting list, and there is no
 * waitlist table, status or policy in this schema -- a button that pretends to join one
 * would be a lie. Reported as unavailable instead of invented.
 */
function CardAction({
  blockedBy,
  rejectionReason,
  isEnrolling,
  onEnroll,
  onCancel,
}: {
  blockedBy: EligibleGroup["blockedBy"];
  rejectionReason: string | null;
  isEnrolling: boolean;
  onEnroll: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  if (blockedBy === null) {
    return (
      <Button className="h-[46px] w-full rounded-xl" onClick={onEnroll} disabled={isEnrolling}>
        {isEnrolling && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {t("dash.registration.requestEnroll")}
      </Button>
    );
  }

  if (blockedBy === "pending") {
    return (
      <div className="rounded-xl border border-border bg-muted/50 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock3 className="size-4 shrink-0 text-accent" aria-hidden />
          {t("dash.registration.state.pending")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("dash.registration.pendingHint")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-11 w-full rounded-xl"
          onClick={onCancel}
        >
          {t("dash.registration.cancelRequest")}
        </Button>
      </div>
    );
  }

  if (blockedBy === "approved") {
    return (
      <div className="rounded-xl border border-success/25 bg-success/5 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {t("dash.registration.state.approved")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("dash.registration.approvedHint")}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-2 h-11 w-full rounded-xl">
          <Link to="/dashboard/my-classes">{t("dash.registration.viewCourse")}</Link>
        </Button>
      </div>
    );
  }

  if (blockedBy === "rejected") {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
          <XCircle className="size-4 shrink-0" aria-hidden />
          {t("dash.registration.state.rejected")}
        </p>
        {/* Shown only when the administration actually wrote one. */}
        {rejectionReason ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{rejectionReason}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-11 w-full rounded-xl"
          onClick={onEnroll}
          disabled={isEnrolling}
        >
          {t("dash.registration.requestAgain")}
        </Button>
      </div>
    );
  }

  if (blockedBy === "takenSubject") {
    // The REAL rule: one active enrolment per subject and level, enforced by
    // `enforce_one_group_per_subject`. Not a schedule clash -- that rule does not exist.
    return (
      <div className="rounded-xl border border-accent/25 bg-accent/5 p-3">
        <p className="text-sm font-semibold text-accent">{t("dash.registration.stateTaken")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("dash.registration.alreadyInSubject")}
        </p>
      </div>
    );
  }

  // Full.
  return (
    <div className="flex h-[46px] items-center justify-center rounded-xl bg-destructive/10 text-sm font-semibold text-destructive">
      {t("dash.registration.capacityFull")}
    </div>
  );
}

/**
 * Everything about one group, on demand.
 *
 * The card answers "should I want this?"; the sheet answers "what exactly am I signing
 * up for?" -- every slot rather than the first, the period the group runs for, the
 * price, and the same action band so the decision can be made without going back.
 */
function GroupDetailsSheet({
  item,
  streamLabel,
  locale,
  onClose,
  onEnroll,
  onCancel,
  isEnrolling,
}: {
  /** Null closes the sheet. */
  item: EligibleGroup | null;
  streamLabel: string | null;
  locale: string;
  onClose: () => void;
  onEnroll: () => void;
  onCancel: () => void;
  isEnrolling: boolean;
}) {
  const { t } = useI18n();
  const group = item?.group;
  const accent = subjectColor(group?.subjectColor, group?.subjectKey);

  return (
    <Sheet open={item !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {item && group && (
          <>
            <SheetHeader className="gap-0 space-y-0 p-0">
              <div
                className="relative h-[108px]"
                style={{
                  background: `linear-gradient(120deg, ${accent} 0%, color-mix(in oklch, ${accent} 78%, white) 55%, color-mix(in oklch, ${accent} 62%, white) 100%)`,
                }}
              >
                <GraduationCap
                  aria-hidden
                  className="pointer-events-none absolute -bottom-7 size-[124px] text-white/20 start-4"
                />
              </div>
              <div className="px-5 pb-4">
                <div className="-mt-10 flex items-end gap-3">
                  <PersonAvatar
                    name={group.teacherName}
                    url={group.teacherAvatarUrl}
                    accent={accent}
                    ring
                    className="size-20 shrink-0 bg-card text-xl"
                  />
                  <div className="min-w-0 pb-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("dash.registration.teacher")}
                    </p>
                    <p className="truncate text-sm font-semibold">
                      {group.teacherName ?? t("dash.registration.noTeacher")}
                    </p>
                  </div>
                </div>
                <SheetTitle className="mt-3 text-start text-lg leading-tight">
                  {group.name}
                </SheetTitle>
                <SheetDescription className="text-start text-sm font-semibold" asChild>
                  <p style={{ color: accent }}>
                    {group.subjectName ?? "—"}
                    <span className="text-muted-foreground">
                      {" · "}
                      {group.levelName ?? "—"}
                      {streamLabel ? ` · ${streamLabel}` : ""}
                    </span>
                  </p>
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-border p-5">
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("dash.registration.schedule")}
                </h4>
                {group.schedules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("dash.registration.noSchedule")}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {group.schedules.map((sl) => (
                      <li
                        key={sl.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2 font-medium">
                          <CalendarClock
                            className="size-4 shrink-0"
                            style={{ color: accent }}
                            aria-hidden
                          />
                          <span className="truncate">{weekdayLabel(sl.weekday, t)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {/* A time range is direction-neutral; isolate it so RTL keeps
                              "08:00-09:30" in that order. */}
                          <span
                            dir="ltr"
                            style={{ unicodeBidi: "isolate" }}
                            className="tabular-nums"
                          >
                            {sl.startTime.slice(0, 5)}–{sl.endTime.slice(0, 5)}
                          </span>
                          <span className="text-xs text-muted-foreground">{sl.room ?? "—"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <dl className="grid grid-cols-2 gap-2">
                <Fact icon={Wallet} accent={accent} label={t("dash.registration.price")}>
                  <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                    {formatDzd(group.priceDzd, locale)}
                  </span>
                </Fact>
                <Fact icon={Timer} accent={accent} label={t("dash.registration.weekly")}>
                  {weeklyHours(group.schedules) > 0
                    ? t("dash.registration.hoursPerWeek", {
                        hours: formatDecimal(weeklyHours(group.schedules), locale),
                      })
                    : "—"}
                </Fact>
                {group.startDate ? (
                  <Fact
                    icon={CalendarClock}
                    accent={accent}
                    label={t("dash.registration.period")}
                    className="col-span-2"
                  >
                    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                      {formatDate(group.startDate, locale)}
                      {group.endDate ? ` → ${formatDate(group.endDate, locale)}` : ""}
                    </span>
                  </Fact>
                ) : null}
              </dl>

              {/* Same reason as the card: occupancy only when the caller can read it. */}
              {item.seatsKnown ? (
                <section className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("dash.registration.placesLeft")}
                    </h4>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {t("dash.registration.enrolledCount", {
                        enrolled: String(group.enrolled),
                        capacity: String(group.maxStudents),
                      })}
                    </span>
                  </div>
                  <Progress
                    value={
                      group.maxStudents > 0
                        ? Math.min(Math.round((group.enrolled / group.maxStudents) * 100), 100)
                        : 0
                    }
                    className="h-[7px]"
                    aria-label={t("dash.registration.placesLeft")}
                  />
                </section>
              ) : (
                <Fact icon={Users} accent={accent} label={t("dash.registration.capacityLabel")}>
                  {t("dash.registration.groupSize", { count: group.maxStudents })}
                </Fact>
              )}
            </div>

            <SheetFooter className="border-t border-border p-5">
              <CardAction
                blockedBy={item.blockedBy}
                rejectionReason={item.rejectionReason}
                isEnrolling={isEnrolling}
                onEnroll={onEnroll}
                onCancel={onCancel}
              />
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The last step before a request is sent.
 *
 * It restates what is being requested -- group, teacher, when, how much -- because the
 * card is a browsing surface, and a student clicking through a grid of them should not be
 * able to enrol in the wrong class by aiming badly. It also says plainly that the seat is
 * not booked yet: the administration decides.
 */
function ConfirmEnrollDialog({
  item,
  locale,
  isEnrolling,
  onClose,
  onConfirm,
}: {
  item: EligibleGroup | null;
  locale: string;
  isEnrolling: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const group = item?.group;
  const accent = subjectColor(group?.subjectColor, group?.subjectKey);

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(v) => {
        // Not dismissible mid-request: the row is already being created.
        if (isEnrolling) return;
        if (!v) onClose();
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-md">
        {item && group && (
          <>
            <DialogHeader>
              <DialogTitle className="text-start">
                {t("dash.registration.confirmTitle")}
              </DialogTitle>
              <DialogDescription className="text-start">
                {t("dash.registration.confirmBody")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <PersonAvatar
                name={group.teacherName}
                url={group.teacherAvatarUrl}
                accent={accent}
                className="size-12 shrink-0"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{group.name}</p>
                <p className="truncate text-xs font-semibold" style={{ color: accent }}>
                  {group.subjectName ?? "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {group.teacherName ?? t("dash.registration.noTeacher")}
                </p>
              </div>
            </div>

            <dl className="space-y-1.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">{t("dash.registration.schedule")}</dt>
                <dd className="text-end font-medium">
                  {group.schedules.length === 0
                    ? "—"
                    : group.schedules.map((sl) => (
                        <span key={sl.id} className="block">
                          {weekdayLabel(sl.weekday, t)}{" "}
                          <span
                            dir="ltr"
                            style={{ unicodeBidi: "isolate" }}
                            className="tabular-nums"
                          >
                            {sl.startTime.slice(0, 5)}–{sl.endTime.slice(0, 5)}
                          </span>
                        </span>
                      ))}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("dash.registration.price")}</dt>
                <dd className="font-semibold" dir="ltr" style={{ unicodeBidi: "isolate" }}>
                  {formatDzd(group.priceDzd, locale)}
                </dd>
              </div>
            </dl>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={onClose}
                disabled={isEnrolling}
              >
                {t("ui.cancel")}
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl"
                onClick={onConfirm}
                disabled={isEnrolling}
              >
                {isEnrolling && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("dash.registration.confirmSend")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Withdrawing a pending request. Destructive, so it is confirmed and says what is lost. */
function WithdrawDialog({
  item,
  isPending,
  onClose,
  onConfirm,
}: {
  item: EligibleGroup | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <AlertDialog
      open={item !== null}
      onOpenChange={(v) => {
        if (isPending) return;
        if (!v) onClose();
      }}
    >
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-start">
            {t("dash.registration.withdrawTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-start">
            {t("dash.registration.withdrawBody", { group: item?.group.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11 rounded-xl" disabled={isPending}>
            {t("ui.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              // Radix closes on click; keep it open so the pending state is visible and a
              // second click cannot fire a second DELETE.
              e.preventDefault();
              onConfirm();
            }}
            disabled={isPending}
          >
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("dash.registration.withdrawConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Fact({
  icon: Icon,
  accent,
  label,
  children,
  className,
}: {
  icon: typeof Users;
  accent: string;
  label: string;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-muted/50 px-2.5 py-2", className)}>
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3 shrink-0" style={{ color: accent }} aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 truncate text-xs font-semibold">{children}</dd>
    </div>
  );
}
