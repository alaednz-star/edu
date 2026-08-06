import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarClock,
  DoorClosed,
  GraduationCap,
  Loader2,
  Search,
  UserSquare2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/features/auth/require-auth";
import { useCreateRegistration, useSubjects } from "@/features/school/queries";
import { useEligibleGroups, type EligibleGroup } from "@/features/school/eligible-groups";
import { useStreamOptions } from "@/features/school/streams";
import { weekdayLabel } from "@/features/school/schedule";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useActionFeedback } from "@/hooks/use-action-feedback";
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

  const header = (
    <PageHeader
      title={t("dash.registration.title")}
      description={t("dash.registration.description")}
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
              onEnroll={() => enroll(item.group.id)}
              isEnrolling={create.isPending}
            />
          ))}
        </div>
      )}
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
        <SelectTrigger id={id} className="h-10 rounded-xl">
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

function GroupCard({
  item,
  streamLabel,
  locale,
  onEnroll,
  isEnrolling,
}: {
  item: EligibleGroup;
  streamLabel: string | null;
  locale: string;
  onEnroll: () => void;
  isEnrolling: boolean;
}) {
  const { t } = useI18n();
  const { group, seatsLeft, blockedBy } = item;

  const occupancy =
    group.maxStudents > 0 ? Math.round((group.enrolled / group.maxStudents) * 100) : 0;
  const room = group.schedules.find((s) => s.room)?.room ?? null;

  return (
    <article className="surface-card flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{group.name}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {group.subjectName ?? "—"}
          </p>
        </div>
        <span
          className="size-9 shrink-0 rounded-xl"
          style={{ backgroundColor: group.subjectColor ?? "#0F766E" }}
          aria-hidden
        />
      </header>

      <dl className="grid gap-2.5 text-xs sm:grid-cols-2">
        <Meta icon={UserSquare2} label={t("dash.registration.teacher")}>
          {group.teacherName ?? t("dash.registration.noTeacher")}
        </Meta>
        <Meta icon={GraduationCap} label={t("dash.registration.level")}>
          {group.levelName ?? "—"}
          {streamLabel ? ` · ${streamLabel}` : ""}
        </Meta>
        <Meta icon={DoorClosed} label={t("group.room")}>
          {room ?? t("dash.section.noRoom")}
        </Meta>
      </dl>

      {group.schedules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {group.schedules.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            >
              <CalendarClock className="size-3" aria-hidden />
              {weekdayLabel(s.weekday, t).slice(0, 3)} {s.startTime.slice(0, 5)}–
              {s.endTime.slice(0, 5)}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t("dash.registration.placesLeft")}</span>
          <span
            className={cn(
              "font-medium tabular-nums",
              seatsLeft === 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {seatsLeft}/{group.maxStudents}
          </span>
        </div>
        <Progress value={Math.min(occupancy, 100)} className="h-2" />
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("dash.registration.enrolledCount", {
            enrolled: String(group.enrolled),
            capacity: String(group.maxStudents),
          })}
        </p>
      </div>

      <footer className="mt-auto">
        {blockedBy === null ? (
          <Button className="h-11 w-full rounded-xl" onClick={onEnroll} disabled={isEnrolling}>
            {isEnrolling && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("dash.registration.requestEnroll")}
          </Button>
        ) : blockedBy === "full" ? (
          <div className="flex h-11 items-center justify-center rounded-xl bg-destructive/10 text-sm font-medium text-destructive">
            {t("dash.registration.full")}
          </div>
        ) : blockedBy === "takenSubject" ? (
          // One active enrolment per subject and level. Say why the button is
          // gone, rather than letting the student apply into a rejected write.
          <div className="flex h-11 items-center justify-center rounded-xl bg-accent-soft px-3 text-center text-sm text-accent">
            {t("dash.registration.alreadyInSubject")}
          </div>
        ) : (
          <div className="flex h-11 items-center justify-center gap-2 rounded-xl bg-muted text-sm">
            <StatusBadge status={blockedBy} />
            <span className="text-muted-foreground">
              {t(`dash.registration.state.${blockedBy}`)}
            </span>
          </div>
        )}
      </footer>
    </article>
  );
}

function Meta({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Users;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="truncate font-medium">{children}</dd>
      </div>
    </div>
  );
}
