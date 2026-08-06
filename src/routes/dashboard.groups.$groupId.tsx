import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  Percent,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAuth } from "@/features/auth/require-auth";
import { useGroupDetail } from "@/features/school/group-detail";
import { weekdayLabel } from "@/features/school/schedule";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatDzd } from "@/lib/format";

export const Route = createFileRoute("/dashboard/groups/$groupId")({
  head: () => ({ meta: [{ title: "Détail du groupe — Madrasti" }] }),
  component: () => (
    <RequireAuth roles={["admin", "teacher"]}>
      <GroupDetailPage />
    </RequireAuth>
  ),
});

function GroupDetailPage() {
  const { t, locale } = useI18n();
  const { hasRole } = useAuth();
  const { groupId } = useParams({ from: "/dashboard/groups/$groupId" });

  // One shared derivation: the detail page, My Groups and the workspace must
  // never disagree about a group's numbers.
  const detail = useGroupDetail(groupId);
  const { group, enrolled, pending, occupancy } = detail;

  if (detail.error) {
    return (
      <>
        <BackLink />
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
          isRetrying={detail.isFetching}
        />
      </>
    );
  }

  if (detail.isLoading) {
    return (
      <>
        <BackLink />
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  if (!group) {
    return (
      <>
        <BackLink />
        <EmptyState
          icon={GraduationCap}
          title={t("group.notFoundTitle")}
          description={t("group.notFoundBody")}
        />
      </>
    );
  }

  const room = group.schedules.find((s) => s.room)?.room ?? null;

  return (
    <>
      <BackLink />

      <PageHeader
        title={group.name}
        description={t("group.detailDescription", {
          subject: group.subjectName ?? "—",
          level: group.levelName ?? "—",
        })}
        actions={
          <Button asChild className="rounded-xl">
            <Link to="/dashboard/attendance">
              <CalendarCheck className="size-4" aria-hidden />
              {t("group.markAttendance")}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("group.enrolled")}
          value={`${enrolled.length}/${group.maxStudents}`}
          icon={Users}
        />
        <StatCard
          label={t("group.occupancy")}
          value={`${occupancy}%`}
          icon={Percent}
          tone={occupancy >= 100 ? "accent" : "success"}
        />
        <StatCard
          label={t("group.pendingRequests")}
          value={String(pending.length)}
          icon={ClipboardList}
          tone="accent"
        />
        <StatCard
          label={t("group.sessionsPerWeek")}
          value={String(group.schedules.length)}
          icon={CalendarClock}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t("group.infoTitle")} description={t("group.infoDesc")}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label={t("group.subject")} value={group.subjectName ?? "—"} />
            <Field
              label={t("group.teacher")}
              value={group.teacherName ?? t("entity.common.notAssigned")}
            />
            <Field label={t("group.level")} value={group.levelName ?? "—"} />
            <Field label={t("group.room")} value={room ?? t("dash.section.noRoom")} />
            <Field label={t("group.capacity")} value={String(group.maxStudents)} />
            <Field label={t("group.price")} value={formatDzd(group.priceDzd, locale)} />
            <div className="rounded-xl bg-muted/60 px-4 py-3">
              <dt className="text-xs text-muted-foreground">{t("group.status")}</dt>
              <dd className="mt-1">
                <StatusBadge status={group.status} />
              </dd>
            </div>
          </dl>
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{t("group.occupancy")}</span>
              <span className="tabular-nums">
                {enrolled.length}/{group.maxStudents}
              </span>
            </div>
            <Progress value={Math.min(occupancy, 100)} className="h-2" />
          </div>
        </SectionCard>

        <SectionCard title={t("group.scheduleTitle")} description={t("group.scheduleDesc")}>
          {group.schedules.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={t("group.noScheduleTitle")}
              description={t("group.noScheduleBody")}
              className="border-none shadow-none"
            />
          ) : (
            <ul className="divide-y divide-border">
              {group.schedules.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="font-medium">{weekdayLabel(s.weekday, t)}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.room ?? t("dash.section.noRoom")}
                  </span>
                  <span className="shrink-0 rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
                    {s.startTime} – {s.endTime}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={t("group.studentsTitle")}
        description={t("group.studentsDesc", { count: String(enrolled.length) })}
      >
        {enrolled.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("group.noStudentTitle")}
            description={t("group.noStudentBody")}
            className="border-none shadow-none"
          />
        ) : (
          <ul className="divide-y divide-border">
            {enrolled.map((r) => {
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    {hasRole("admin") || hasRole("teacher") ? (
                      <Link
                        to="/dashboard/students/$studentId"
                        params={{ studentId: r.studentId }}
                        className="focus-ring truncate rounded text-sm font-medium hover:text-primary"
                      >
                        {r.studentName}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-medium">{r.studentName}</span>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {r.levelName ?? group.levelName ?? "—"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(r.createdAt, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {pending.length > 0 && (
        <SectionCard title={t("group.requestsTitle")} description={t("group.requestsDesc")}>
          <ul className="divide-y divide-border">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 truncate font-medium">{r.studentName}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={r.status} />
                  {hasRole("admin") && (
                    <Button asChild size="sm" variant="outline" className="rounded-lg">
                      <Link to="/dashboard/registrations">{t("group.review")}</Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  );
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit rounded-xl">
      <Link to="/dashboard/groups">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("group.backToList")}
      </Link>
    </Button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
