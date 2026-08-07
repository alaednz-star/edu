import { useMemo, useState } from "react";
import { useSubjectLabel } from "@/features/school/subject-label";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/features/auth/require-auth";
import {
  useDeleteGroup,
  useGroups,
  useLevels,
  useSaveGroup,
  useSubjects,
  useTeachers,
  type GroupInput,
} from "@/features/school/queries";
import { weekdayLabel } from "@/features/school/schedule";
import { todayIso } from "@/lib/format";
import { type EntityStatus, type GroupRow } from "@/features/school/types";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/hooks/use-auth";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { streamName, useStreamOptions } from "@/features/school/streams";

export const Route = createFileRoute("/dashboard/groups")({
  head: () => ({
    meta: [
      { title: "Groupes — Madrasti" },
      { name: "description", content: "Groupes, capacités et emplois du temps hebdomadaires." },
      { property: "og:title", content: "Groupes — Madrasti" },
      { property: "og:description", content: "Groupes, capacités et emplois du temps." },
    ],
  }),
  // Admin only. This is the CRUD console -- create, edit, assign teachers, set
  // capacity and prices. A teacher's view of their own groups is
  // /dashboard/my-groups, which is operational rather than administrative.
  // Allowing teachers here previously gave the module two group lists.
  component: () => (
    <RequireAuth roles={["admin"]}>
      <GroupsPage />
    </RequireAuth>
  ),
});

function occupancyTone(ratio: number) {
  if (ratio >= 100) return "text-destructive";
  if (ratio >= 80) return "text-accent";
  return "text-success";
}

const UNASSIGNED = "none";

function emptyDraft(): GroupInput {
  return {
    name: "",
    subjectId: null,
    teacherId: null,
    levelId: null,
    streamId: null,
    // New groups start today; the admin narrows it if needed.
    startDate: todayIso(),
    endDate: null,
    maxStudents: 20,
    priceDzd: 0,
    status: "active",
    schedules: [],
  };
}

function toDraft(group: GroupRow): GroupInput {
  return {
    id: group.id,
    name: group.name,
    subjectId: group.subjectId,
    teacherId: group.teacherId,
    levelId: group.levelId,
    streamId: group.streamId,
    startDate: group.startDate,
    endDate: group.endDate,
    maxStudents: group.maxStudents,
    priceDzd: group.priceDzd,
    status: group.status,
    schedules: group.schedules.map((s) => ({
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
    })),
  };
}

function GroupsPage() {
  const { t, locale } = useI18n();
  const subjectLabel = useSubjectLabel();
  const { notifySuccess, notifyError } = useActionFeedback();
  const { hasRole } = useAuth();
  // Redundant with the route guard above (admin only), kept as defence in
  // depth: `groups` is admin-write-only at the database level, so if the guard
  // is ever loosened the controls still will not offer writes RLS would reject.
  const canManage = hasRole("admin");
  const { data = [], isLoading, error, refetch, isFetching } = useGroups();
  const { data: subjects = [] } = useSubjects();
  const { data: levels = [] } = useLevels();
  const { data: teachers = [] } = useTeachers();
  const { levelHasStreams, forLevel, nameOf: streamNameOf } = useStreamOptions();
  const save = useSaveGroup();
  const remove = useDeleteGroup();
  const [draft, setDraft] = useState<GroupInput | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = useMemo(
    () =>
      data.filter(
        (g) =>
          (subjectFilter === "all" || g.subjectId === subjectFilter) &&
          (levelFilter === "all" || g.levelId === levelFilter) &&
          (statusFilter === "all" || g.status === statusFilter),
      ),
    [data, subjectFilter, levelFilter, statusFilter],
  );

  // Only teachers qualified for the chosen subject. Mirrors the database
  // trigger `validate_teacher_qualification`, so the form cannot offer a
  // choice the server will refuse.
  const qualifiedTeachers = useMemo(
    () =>
      draft?.subjectId
        ? teachers.filter((tc) => tc.subjectIds.includes(draft.subjectId as string))
        : [],
    [teachers, draft?.subjectId],
  );

  const patch = (values: Partial<GroupInput>) => setDraft((p) => (p ? { ...p, ...values } : p));

  const submit = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error(t("form.groups.nameRequired"));
      return;
    }
    // The database enforces this too; catching it here avoids a failed round
    // trip and points the admin at the field that needs attention.
    if (levelHasStreams(draft.levelId) && !draft.streamId) {
      toast.error(t("form.groups.streamRequired"));
      return;
    }
    if (!draft.startDate) {
      toast.error(t("form.groups.startDateRequired"));
      return;
    }
    if (draft.endDate && draft.endDate < draft.startDate) {
      toast.error(t("form.groups.endBeforeStart"));
      return;
    }
    // One session per group per calendar day. The select already disables taken
    // days and the database refuses the write; this catches a draft that became
    // invalid another way (e.g. two slots edited to the same day in sequence).
    const days = draft.schedules.map((s) => s.weekday);
    if (new Set(days).size !== days.length) {
      toast.error(t("form.groups.oneSessionPerDay"));
      return;
    }
    try {
      await save.mutateAsync({ ...draft, name: draft.name.trim() });
      notifySuccess("form.groups.saved");
      setDraft(null);
    } catch (e) {
      notifyError(e);
    }
  };

  const columns: Column<GroupRow>[] = [
    {
      key: "name",
      header: t("entity.groups.columnGroup"),
      sortValue: (g) => g.name,
      cell: (g) => (
        <div className="flex items-center gap-3">
          <span
            className="size-8 shrink-0 rounded-lg"
            style={{ backgroundColor: g.subjectColor ?? "#0F766E" }}
            aria-hidden
          />
          <div className="min-w-0">
            <Link
              to="/dashboard/groups/$groupId"
              params={{ groupId: g.id }}
              className="focus-ring block truncate rounded font-medium hover:text-primary"
            >
              {g.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {subjectLabel(g.subjectKey, g.subjectName)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "teacher",
      header: t("entity.groups.columnTeacher"),
      sortValue: (g) => g.teacherName ?? "",
      cell: (g) =>
        g.teacherName ?? (
          <span className="text-muted-foreground">{t("entity.common.notAssigned")}</span>
        ),
    },
    {
      key: "level",
      header: t("entity.groups.columnLevel"),
      sortValue: (g) => g.levelName ?? "",
      cell: (g) => g.levelName ?? "—",
    },
    {
      key: "stream",
      header: t("form.groups.stream"),
      sortValue: (g) => streamNameOf(g.streamId) ?? "",
      cell: (g) => streamNameOf(g.streamId) ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "capacity",
      header: t("entity.groups.columnOccupancy"),
      sortValue: (g) => (g.maxStudents > 0 ? g.enrolled / g.maxStudents : 0),
      className: "min-w-40",
      cell: (g) => {
        const ratio = g.maxStudents > 0 ? (g.enrolled / g.maxStudents) * 100 : 0;
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={occupancyTone(ratio)}>{Math.round(ratio)}%</span>
              <span className="tabular-nums text-muted-foreground">
                {g.enrolled}/{g.maxStudents}
              </span>
            </div>
            <Progress value={Math.min(ratio, 100)} className="h-1.5" />
          </div>
        );
      },
    },
    {
      key: "schedule",
      header: t("entity.groups.columnSchedule"),
      cell: (g) =>
        g.schedules.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("entity.groups.noSchedule")}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {g.schedules.map((s) => (
              <span
                key={s.id}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {weekdayLabel(s.weekday, t).slice(0, 3)} {s.startTime.slice(0, 5)}
              </span>
            ))}
          </div>
        ),
    },
    {
      key: "room",
      header: t("entity.groups.columnRoom"),
      cell: (g) => g.schedules.find((s) => s.room)?.room ?? "—",
    },
    {
      key: "status",
      header: t("entity.groups.columnStatus"),
      cell: (g) => <StatusBadge status={g.status} />,
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            className: "w-24 text-end",
            cell: (g: GroupRow) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-lg"
                  aria-label={t("form.groups.editAria", { name: g.name })}
                  onClick={() => setDraft(toDraft(g))}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <ConfirmDialog
                  title={t("entity.groups.deleteTitle")}
                  description={t("entity.groups.deleteDescription")}
                  confirmLabel={t("entity.groups.deleteConfirm")}
                  onConfirm={async () => {
                    try {
                      await remove.mutateAsync(g.id);
                      notifySuccess("entity.groups.deleted");
                    } catch (e) {
                      notifyError(e);
                    }
                  }}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-lg text-destructive"
                      aria-label={t("entity.groups.deleteAria", { name: g.name })}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  }
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={t("entity.groups.title")}
        description={t("entity.groups.description", { count: data.length })}
        actions={
          canManage ? (
            <Button className="rounded-xl" onClick={() => setDraft(emptyDraft())}>
              <Plus className="size-4" aria-hidden /> {t("entity.groups.new")}
            </Button>
          ) : undefined
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        rowKey={(g) => g.id}
        searchable={(g) =>
          `${g.name} ${subjectLabel(g.subjectKey, g.subjectName)} ${g.teacherName ?? ""} ${g.levelName ?? ""}`
        }
        searchPlaceholder={t("entity.groups.searchPlaceholder")}
        filters={
          <>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger
                className="h-9 w-44 rounded-xl"
                aria-label={t("entity.groups.filterSubjectAria")}
              >
                <SelectValue placeholder={t("entity.subjects.title")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("entity.groups.allSubjects")}</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger
                className="h-9 w-44 rounded-xl"
                aria-label={t("entity.groups.filterLevelAria")}
              >
                <SelectValue placeholder={t("entity.students.level")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("entity.groups.allLevels")}</SelectItem>
                {levels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                className="h-9 w-40 rounded-xl"
                aria-label={t("entity.groups.filterStatusAria")}
              >
                <SelectValue placeholder={t("entity.students.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("entity.groups.allStatuses")}</SelectItem>
                <SelectItem value="active">{t("entity.groups.statusActive")}</SelectItem>
                <SelectItem value="inactive">{t("entity.groups.statusInactive")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        emptyState={
          <EmptyState
            icon={GraduationCap}
            title={t("entity.groups.emptyTitle")}
            description={t("entity.groups.emptyDescription")}
            className="border-none shadow-none"
            action={
              canManage ? (
                <Button className="mt-2 rounded-xl" onClick={() => setDraft(emptyDraft())}>
                  <Plus className="size-4" aria-hidden /> {t("entity.groups.new")}
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? t("form.groups.editTitle") : t("form.groups.newTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">{t("form.groups.name")}</Label>
              <Input
                id="group-name"
                className="h-11 rounded-xl"
                value={draft?.name ?? ""}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="group-subject">{t("form.groups.subject")}</Label>
                <Select
                  value={draft?.subjectId ?? UNASSIGNED}
                  onValueChange={(v) => {
                    const nextSubject = v === UNASSIGNED ? null : v;
                    // Drop the teacher if they are not qualified for the new
                    // subject -- the database would reject the save anyway.
                    const keepTeacher =
                      draft?.teacherId &&
                      nextSubject &&
                      teachers.some(
                        (tc) => tc.id === draft.teacherId && tc.subjectIds.includes(nextSubject),
                      );
                    patch({
                      subjectId: nextSubject,
                      ...(keepTeacher ? {} : { teacherId: null }),
                    });
                  }}
                >
                  <SelectTrigger id="group-subject" className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>{t("form.common.unassigned")}</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="group-teacher">{t("form.groups.teacher")}</Label>
                <Select
                  value={draft?.teacherId ?? UNASSIGNED}
                  onValueChange={(v) => patch({ teacherId: v === UNASSIGNED ? null : v })}
                  disabled={!draft?.subjectId}
                >
                  <SelectTrigger id="group-teacher" className="h-11 rounded-xl">
                    <SelectValue
                      placeholder={
                        draft?.subjectId
                          ? t("form.common.unassigned")
                          : t("form.groups.pickSubjectFirst")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>{t("form.common.unassigned")}</SelectItem>
                    {qualifiedTeachers.map((tc) => (
                      <SelectItem key={tc.id} value={tc.id}>
                        {tc.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {!draft?.subjectId
                    ? t("form.groups.pickSubjectFirst")
                    : qualifiedTeachers.length === 0
                      ? t("form.groups.noQualifiedTeacher")
                      : t("form.groups.qualifiedOnly")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="group-level">{t("form.groups.level")}</Label>
                <Select
                  value={draft?.levelId ?? UNASSIGNED}
                  onValueChange={(v) =>
                    // Clear the stream too: it belongs to the previous level and
                    // would be rejected by the database guard.
                    patch({ levelId: v === UNASSIGNED ? null : v, streamId: null })
                  }
                >
                  <SelectTrigger id="group-level" className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>{t("form.common.unassigned")}</SelectItem>
                    {levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rendered only when the chosen level actually offers streams.
                  `levelHasStreams` is the Task 2A helper -- the single source of
                  truth for that question; no stream logic is restated here. */}
              {levelHasStreams(draft?.levelId) && (
                <div className="space-y-2">
                  <Label htmlFor="group-stream">{t("form.groups.stream")}</Label>
                  <Select
                    value={draft?.streamId ?? ""}
                    onValueChange={(v) => patch({ streamId: v })}
                  >
                    <SelectTrigger id="group-stream" className="h-11 rounded-xl">
                      <SelectValue placeholder={t("form.groups.streamPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {forLevel(draft?.levelId).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {streamName(s, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("form.groups.streamHint")}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="group-status">{t("form.groups.status")}</Label>
                <Select
                  value={draft?.status ?? "active"}
                  onValueChange={(v) => patch({ status: v as EntityStatus })}
                >
                  <SelectTrigger id="group-status" className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("form.common.statusActive")}</SelectItem>
                    <SelectItem value="inactive">{t("form.common.statusInactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="group-max">{t("form.groups.maxStudents")}</Label>
                <Input
                  id="group-max"
                  type="number"
                  min={1}
                  className="h-11 rounded-xl"
                  value={draft?.maxStudents ?? 20}
                  onChange={(e) => patch({ maxStudents: Number(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="group-price">{t("form.groups.price")}</Label>
                <Input
                  id="group-price"
                  type="number"
                  min={0}
                  step={100}
                  className="h-11 rounded-xl"
                  value={draft?.priceDzd ?? 0}
                  onChange={(e) => patch({ priceDzd: Number(e.target.value) || 0 })}
                />
              </div>

              {/* Term window. The weekly slots below repeat between these two
                  dates -- occurrences are derived from the pair, never stored. */}
              <div className="space-y-2">
                <Label htmlFor="group-start-date">{t("form.groups.startDate")}</Label>
                <Input
                  id="group-start-date"
                  type="date"
                  className="h-11 rounded-xl"
                  value={draft?.startDate ?? ""}
                  onChange={(e) => patch({ startDate: e.target.value || null })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="group-end-date">
                  {t("form.groups.endDate")}{" "}
                  <span className="font-normal text-muted-foreground">
                    {t("onboarding.optional")}
                  </span>
                </Label>
                <Input
                  id="group-end-date"
                  type="date"
                  className="h-11 rounded-xl"
                  min={draft?.startDate ?? undefined}
                  value={draft?.endDate ?? ""}
                  onChange={(e) => patch({ endDate: e.target.value || null })}
                />
                <p className="text-xs text-muted-foreground">{t("form.groups.datesHint")}</p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("form.groups.schedule")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  // Every weekday taken means no valid slot can be added: one
                  // group meets at most once a day.
                  disabled={(draft?.schedules.length ?? 0) >= 7}
                  onClick={() => {
                    const used = new Set((draft?.schedules ?? []).map((s) => s.weekday));
                    const free = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d));
                    if (free === undefined) return;
                    patch({
                      schedules: [
                        ...(draft?.schedules ?? []),
                        { weekday: free, startTime: "16:00", endTime: "17:30", room: null },
                      ],
                    });
                  }}
                >
                  <Plus className="size-3.5" aria-hidden /> {t("form.groups.addSlot")}
                </Button>
              </div>

              {(draft?.schedules.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">{t("form.groups.noSlot")}</p>
              ) : (
                <ul className="space-y-2">
                  {draft?.schedules.map((slot, index) => (
                    <li
                      key={index}
                      className="grid gap-2 rounded-lg bg-muted/50 p-2 sm:grid-cols-[1fr_auto_auto_1fr_auto] sm:items-center"
                    >
                      <Select
                        value={String(slot.weekday)}
                        onValueChange={(v) =>
                          patch({
                            schedules: draft.schedules.map((s, i) =>
                              i === index ? { ...s, weekday: Number(v) } : s,
                            ),
                          })
                        }
                      >
                        <SelectTrigger
                          className="h-9 rounded-lg"
                          aria-label={t("form.groups.schedule")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* A group meets at most once a day, so a weekday
                              already used by another slot is not selectable.
                              The database enforces this too; disabling here
                              means the admin never composes an invalid
                              timetable and then loses the save. */}
                          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                            <SelectItem
                              key={d}
                              value={String(d)}
                              disabled={draft.schedules.some(
                                (s, i) => i !== index && s.weekday === d,
                              )}
                            >
                              {weekdayLabel(d, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="time"
                        className="h-9 rounded-lg"
                        aria-label={t("form.groups.start")}
                        value={slot.startTime}
                        onChange={(e) =>
                          patch({
                            schedules: draft.schedules.map((s, i) =>
                              i === index ? { ...s, startTime: e.target.value } : s,
                            ),
                          })
                        }
                      />
                      <Input
                        type="time"
                        className="h-9 rounded-lg"
                        aria-label={t("form.groups.end")}
                        value={slot.endTime}
                        onChange={(e) =>
                          patch({
                            schedules: draft.schedules.map((s, i) =>
                              i === index ? { ...s, endTime: e.target.value } : s,
                            ),
                          })
                        }
                      />
                      <Input
                        className="h-9 rounded-lg"
                        placeholder={t("form.groups.room")}
                        aria-label={t("form.groups.room")}
                        value={slot.room ?? ""}
                        onChange={(e) =>
                          patch({
                            schedules: draft.schedules.map((s, i) =>
                              i === index ? { ...s, room: e.target.value || null } : s,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-lg text-destructive"
                        aria-label={t("form.groups.removeSlot")}
                        onClick={() =>
                          patch({ schedules: draft.schedules.filter((_, i) => i !== index) })
                        }
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setDraft(null)}>
              {t("entity.common.cancel")}
            </Button>
            <Button className="rounded-xl" onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {save.isPending ? t("ui.saving") : t("entity.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
