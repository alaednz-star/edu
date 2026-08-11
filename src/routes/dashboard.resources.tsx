import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useGroups } from "@/features/school/queries";
import { useSubjectLabel } from "@/features/school/subject-label";
import { subjectColor } from "@/features/school/session/subject-tint";
import { ChapterSection, type DragBinding } from "@/features/school/resources/chapter-section";
import { ResourceListView } from "@/features/school/resources/resource-list-view";
import {
  insertRelative,
  moveWithin,
  useDragReorder,
} from "@/features/school/resources/use-drag-reorder";
import {
  ChapterDialog,
  ResourceDialog,
  type ResourceFormValue,
} from "@/features/school/resources/resource-dialogs";
import { ResourcePreview } from "@/features/school/resources/resource-preview";
import {
  signResourceUrl,
  statsFor,
  uploadResourceFile,
  useCourseResources,
  useDeleteChapter,
  useDeleteResource,
  useReorderChapters,
  useReorderResources,
  useSaveChapter,
  useSaveResource,
  useSetResourceVisibility,
  resourceKeys,
} from "@/features/school/resources/queries";
import { formatBytes } from "@/features/school/resources/resource-icon";
import type { ChapterRow, ResourceRow } from "@/features/school/resources/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/resources")({
  head: () => ({
    meta: [
      { title: "Ressources pédagogiques — Madrasti" },
      {
        name: "description",
        content: "Partagez cours, exercices et corrigés avec vos élèves.",
      },
    ],
  }),
  component: () => (
    <RequireAuth roles={["admin", "teacher"]}>
      <ResourcesPage />
    </RequireAuth>
  ),
});

const ALL = "__all__";

/** One shared reference, so "no data yet" never looks like new data. */
const EMPTY_COURSES: never[] = [];

/**
 * Course resources, organised by chapter.
 *
 * The CHAPTER is the unit, not the file: a teacher thinks "Chapitre 3, les
 * suites", so this is a curriculum outline you can open, not a file manager.
 *
 * Subject colours come from `subjectColor`, the same helper the session calendar
 * uses, so a subject looks identical here and on Présences.
 */
function ResourcesPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const subjectLabel = useSubjectLabel();
  const { notifySuccess, notifyError } = useActionFeedback();
  const qc = useQueryClient();

  const [courseFilter, setCourseFilter] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"chapters" | "list">("chapters");
  const [hiddenOnly, setHiddenOnly] = useState(false);

  const [chapterDialog, setChapterDialog] = useState<{
    open: boolean;
    chapter?: ChapterRow | null;
  }>({ open: false });
  const [resourceDialog, setResourceDialog] = useState<{
    open: boolean;
    resource?: ResourceRow | null;
    chapterId?: string | undefined;
  }>({ open: false });
  const [preview, setPreview] = useState<ResourceRow | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const coursesQuery = useCourseResources(courseFilter === ALL ? null : courseFilter);
  const groupsQuery = useGroups();

  const saveChapter = useSaveChapter();
  const deleteChapter = useDeleteChapter();
  const reorderChapters = useReorderChapters();
  const reorderResources = useReorderResources();
  const saveResource = useSaveResource();
  const deleteResource = useDeleteResource();
  const setVisibility = useSetResourceVisibility();

  /** Groups the caller may add chapters to. RLS is the real gate; this is the picker. */
  const myGroups = useMemo(() => {
    const all = groupsQuery.data ?? [];
    const mine = user?.role === "teacher" ? all.filter((g) => g.teacherId === user.id) : all;
    return mine.map((g) => ({
      id: g.id,
      name: `${g.name} — ${subjectLabel(g.subjectKey, g.subjectName)}`,
    }));
  }, [groupsQuery.data, user?.role, user?.id, subjectLabel]);

  /**
   * Memoised, not `?? []` inline.
   *
   * A bare `?? []` builds a NEW array on every render while the query is
   * pending, so the `useMemo`s below see a changed dependency and recompute
   * every time -- the same defect that caused the attendance render loop.
   */
  const courses = useMemo(() => coursesQuery.data ?? EMPTY_COURSES, [coursesQuery.data]);

  /** Search + visibility filter, applied to chapters AND their resources. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses
      .map((c) => ({
        ...c,
        chapters: c.chapters
          .map((ch) => {
            const chapterHit = !q || ch.title.toLowerCase().includes(q);
            const resources = ch.resources.filter((r) => {
              if (hiddenOnly && r.visibility === "published") return false;
              if (!q) return true;
              // A chapter that matches keeps all its resources -- the teacher
              // searched for the chapter, not for a file inside it.
              return chapterHit || r.title.toLowerCase().includes(q);
            });
            return { ...ch, resources };
          })
          .filter((ch) => {
            if (!q && !hiddenOnly) return true;
            return ch.resources.length > 0 || (!!q && ch.title.toLowerCase().includes(q));
          }),
      }))
      .filter((c) => c.chapters.length > 0);
  }, [courses, query, hiddenOnly]);

  const stats = useMemo(() => statsFor(courses), [courses]);

  /* ------------------------------ handlers ------------------------------ */

  const submitChapter = (v: {
    id?: string;
    groupId: string;
    title: string;
    description: string;
  }) => {
    saveChapter.mutate(
      { ...v, description: v.description },
      {
        onSuccess: () => {
          notifySuccess("resources.chapter.saved");
          setChapterDialog({ open: false });
        },
        onError: notifyError,
      },
    );
  };

  const submitResource = async (v: ResourceFormValue) => {
    try {
      let storagePath: string | null | undefined = v.id ? undefined : null;
      let mimeType: string | null = null;
      let sizeBytes: number | null = null;

      if (v.kind === "file" && v.file) {
        const groupId = courses
          .flatMap((c) => c.chapters.map((ch) => ({ chapterId: ch.id, groupId: c.groupId })))
          .find((x) => x.chapterId === v.chapterId)?.groupId;
        if (!groupId) throw new Error(t("resources.dialog.chapter"));
        setUploadProgress(0);
        const up = await uploadResourceFile(groupId, v.file, setUploadProgress);
        storagePath = up.path;
        mimeType = up.mimeType;
        sizeBytes = up.size;
        setUploadProgress(null);
      }

      await saveResource.mutateAsync({
        ...(v.id ? { id: v.id } : {}),
        chapterId: v.chapterId,
        title: v.title,
        description: v.description,
        kind: v.kind,
        // On edit with no new file, keep the existing path.
        ...(v.kind === "file"
          ? {
              storagePath: storagePath ?? resourceDialog.resource?.storagePath ?? null,
              mimeType: mimeType ?? resourceDialog.resource?.mimeType ?? null,
              sizeBytes: sizeBytes ?? resourceDialog.resource?.sizeBytes ?? null,
            }
          : { url: v.url }),
        isImportant: v.isImportant,
        allowDownload: v.allowDownload,
        isPublished: v.isPublished,
        // A local `datetime-local` value is stored as an instant.
        publishedAt: v.publishAt ? new Date(v.publishAt).toISOString() : null,
      });
      notifySuccess("resources.resource.saved");
      setResourceDialog({ open: false });
    } catch (e) {
      setUploadProgress(null);
      notifyError(e);
    }
  };

  const removeChapter = (chapter: ChapterRow) => {
    if (
      !globalThis.confirm(
        t("resources.chapter.deleteConfirm", {
          title: chapter.title,
          count: chapter.resources.length,
        }),
      )
    )
      return;
    deleteChapter.mutate(chapter.id, {
      onSuccess: () => notifySuccess("resources.chapter.deleted"),
      onError: notifyError,
    });
  };

  const removeResource = (r: ResourceRow) => {
    if (!globalThis.confirm(t("resources.resource.deleteConfirm", { title: r.title }))) return;
    deleteResource.mutate(
      { id: r.id, storagePath: r.storagePath },
      {
        onSuccess: () => notifySuccess("resources.resource.deleted"),
        onError: notifyError,
      },
    );
  };

  /** Signed URL per click: the bucket is private, so a copied link expires. */
  const openResource = async (r: ResourceRow) => {
    if (r.kind === "link" && r.url) {
      globalThis.open(r.url, "_blank", "noopener,noreferrer");
      return;
    }
    setPreview(r);
  };

  const downloadResource = async (r: ResourceRow) => {
    try {
      if (r.kind === "link" && r.url) {
        globalThis.open(r.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (!r.storagePath) return;
      const url = await signResourceUrl(r.storagePath, { download: true });
      globalThis.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      notifyError(e);
    }
  };

  /** Cache key the optimistic patches target. */
  const cacheKey = resourceKeys.byGroup(courseFilter === ALL ? null : courseFilter);

  /**
   * Chapter drop: reorder within the owning course, optimistically.
   *
   * Cross-COURSE chapter moves are refused -- a chapter belongs to one group, and
   * reparenting it would silently move its resources to another class.
   */
  const onChapterDrop = ({
    activeId,
    overId,
    edge,
  }: {
    activeId: string;
    overId: string | null;
    edge: "before" | "after";
  }) => {
    if (!overId) return;
    const course = courses.find((c) => c.chapters.some((ch) => ch.id === activeId));
    if (!course || !course.chapters.some((ch) => ch.id === overId)) return;
    const ids = course.chapters.map((ch) => ch.id);
    const next = moveWithin(ids, activeId, overId, edge);
    if (next === ids) return;

    const previous = qc.getQueryData(cacheKey);
    qc.setQueryData(cacheKey, (old: typeof courses | undefined) =>
      (old ?? []).map((c) =>
        c.groupId === course.groupId
          ? {
              ...c,
              chapters: next
                .map((id) => c.chapters.find((ch) => ch.id === id))
                .filter((ch): ch is (typeof c.chapters)[number] => !!ch)
                .map((ch, i) => ({ ...ch, position: i })),
            }
          : c,
      ),
    );
    reorderChapters.mutate(
      next.map((id, i) => ({ id, position: i })),
      {
        onError: (e) => {
          qc.setQueryData(cacheKey, previous);
          notifyError(e);
        },
      },
    );
  };

  /**
   * Resource drop: reorder within a chapter, or move to another one.
   *
   * `overContainerId` carries the destination chapter, which is what makes a
   * cross-chapter move work when the target is an empty chapter body with no
   * sibling row to anchor against.
   */
  const onResourceDrop = ({
    activeId,
    overId,
    edge,
    overContainerId,
  }: {
    activeId: string;
    overId: string | null;
    edge: "before" | "after";
    overContainerId: string | null;
  }) => {
    const allChapters = courses.flatMap((c) => c.chapters);
    const from = allChapters.find((ch) => ch.resources.some((r) => r.id === activeId));
    if (!from) return;
    const to = allChapters.find((ch) => ch.id === (overContainerId ?? from.id));
    if (!to) return;
    const sameChapter = from.id === to.id;
    const currentIds = from.resources.map((r) => r.id);
    const targetIds = sameChapter
      ? moveWithin(currentIds, activeId, overId ?? "", edge)
      : insertRelative(
          to.resources.map((r) => r.id),
          activeId,
          overId,
          edge,
        );
    if (sameChapter && targetIds === currentIds) return;

    const moved = from.resources.find((r) => r.id === activeId);
    if (!moved) return;
    const previous = qc.getQueryData(cacheKey);
    qc.setQueryData(cacheKey, (old: typeof courses | undefined) =>
      (old ?? []).map((c) => ({
        ...c,
        chapters: c.chapters.map((ch) => {
          if (ch.id === to.id) {
            const pool = sameChapter
              ? ch.resources
              : [...ch.resources, { ...moved, chapterId: to.id }];
            return {
              ...ch,
              resources: targetIds
                .map((id) => pool.find((r) => r.id === id))
                .filter((r): r is (typeof pool)[number] => !!r)
                .map((r, i) => ({ ...r, position: i, chapterId: to.id })),
            };
          }
          if (!sameChapter && ch.id === from.id) {
            return { ...ch, resources: ch.resources.filter((r) => r.id !== activeId) };
          }
          return ch;
        }),
      })),
    );
    reorderResources.mutate(
      targetIds.map((id, i) => ({
        id,
        position: i,
        ...(id === activeId && !sameChapter ? { chapterId: to.id } : {}),
      })),
      {
        onError: (e) => {
          qc.setQueryData(cacheKey, previous);
          notifyError(e);
        },
      },
    );
  };

  const chapterDrag = useDragReorder(onChapterDrop);
  const resourceDrag = useDragReorder(onResourceDrop);

  /** One binding for every ChapterSection, so a drag can span chapters. */
  const dragBinding: DragBinding = {
    chapterProps: (id) => ({
      draggable: true,
      onDragStart: chapterDrag.handleDragStart(id),
      onDragOver: chapterDrag.handleDragOver(id, null),
      onDrop: chapterDrag.handleDrop,
      onDragEnd: chapterDrag.handleDragEnd,
    }),
    resourceProps: (id, chapterId) => ({
      draggable: true,
      onDragStart: resourceDrag.handleDragStart(id),
      onDragOver: resourceDrag.handleDragOver(id, chapterId),
      onDrop: resourceDrag.handleDrop,
      onDragEnd: resourceDrag.handleDragEnd,
    }),
    bodyProps: (chapterId) => ({
      onDragOver: resourceDrag.handleContainerDragOver(chapterId),
      onDrop: resourceDrag.handleDrop,
    }),
    isChapterDragging: chapterDrag.isDragging,
    isResourceDragging: resourceDrag.isDragging,
    chapterIndicator: chapterDrag.indicator,
    resourceIndicator: resourceDrag.indicator,
  };

  const moveChapter = (chapterId: string, direction: -1 | 1) => {
    const course = courses.find((c) => c.chapters.some((ch) => ch.id === chapterId));
    if (!course) return;
    const list = [...course.chapters];
    const i = list.findIndex((ch) => ch.id === chapterId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j] as ChapterRow, list[i] as ChapterRow];
    reorderChapters.mutate(
      list.map((ch, idx) => ({ id: ch.id, position: idx })),
      { onError: notifyError },
    );
  };

  /* -------------------------------- render -------------------------------- */

  const header = (
    <PageHeader
      title={t("resources.title")}
      description={t("resources.description")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={myGroups.length === 0}
            onClick={() => setChapterDialog({ open: true })}
          >
            <Plus className="size-4" aria-hidden />
            {t("resources.newChapter")}
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={stats.chapters === 0}
            onClick={() => setResourceDialog({ open: true })}
          >
            <Plus className="size-4" aria-hidden />
            {t("resources.addResource")}
          </Button>
        </div>
      }
    />
  );

  if (coursesQuery.isLoading) {
    return (
      <>
        {header}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  if (coursesQuery.error) {
    return (
      <>
        {header}
        <ErrorState
          error={coursesQuery.error}
          onRetry={() => void coursesQuery.refetch()}
          isRetrying={coursesQuery.isFetching}
        />
      </>
    );
  }

  return (
    <>
      {header}

      {/* Stats: the same "value above a quiet label" pattern as the attendance
          counters, so the two pages read as one product. */}
      {stats.chapters > 0 && (
        <dl className="surface-card flex flex-wrap items-stretch gap-x-5 gap-y-3 px-4 py-3">
          <Stat value={stats.chapters} label={t("resources.stat.chapters")} />
          <Stat value={stats.resources} label={t("resources.stat.resources")} />
          <Stat value={stats.published} label={t("resources.stat.published")} tone="success" />
          <Stat value={stats.hidden} label={t("resources.stat.hidden")} tone="muted" />
          <div className="border-s border-border ps-5">
            {/* Bidi-isolated: "35 MB" is direction-neutral and RTL reordered it
                to "MB 35", the same fault as the calendar's time ranges. */}
            <dd className="text-lg font-semibold tabular-nums">
              <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                {formatBytes(stats.storageBytes, locale) ?? "0 B"}
              </span>
            </dd>
            <dt className="text-[11px] text-muted-foreground">{t("resources.stat.storage")}</dt>
          </div>
        </dl>
      )}

      {/* Toolbar mirrors the attendance control bar: one bordered row. */}
      <div className="surface-card flex flex-wrap items-center gap-x-3 gap-y-2.5 px-3 py-2.5">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3"
            aria-hidden
          />
          <Input
            className="h-9 rounded-lg ps-9 text-sm"
            placeholder={t("resources.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="h-9 w-auto min-w-40 max-w-56 rounded-lg text-xs">
            <SelectValue placeholder={t("resources.allCourses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("resources.allCourses")}</SelectItem>
            {myGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant={hiddenOnly ? "default" : "outline"}
          size="sm"
          aria-pressed={hiddenOnly}
          className="h-9 rounded-lg text-xs"
          onClick={() => setHiddenOnly((v) => !v)}
        >
          {t("resources.onlyHidden")}
        </Button>

        <div className="flex rounded-lg bg-muted p-0.5">
          {(["chapters", "list"] as const).map((v) => (
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
              {t(v === "chapters" ? "resources.viewChapters" : "resources.viewList")}
            </button>
          ))}
        </div>
      </div>

      {myGroups.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={t("resources.empty.noGroups")}
          description={t("resources.empty.noGroupsDescription")}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={query || hiddenOnly ? Search : FolderOpen}
          title={query || hiddenOnly ? t("resources.empty.search") : t("resources.empty.title")}
          description={
            query || hiddenOnly
              ? t("resources.empty.searchDescription")
              : t("resources.empty.description")
          }
          action={
            !query && !hiddenOnly ? (
              <Button
                type="button"
                className="mt-1 rounded-xl"
                onClick={() => setChapterDialog({ open: true })}
              >
                <Plus className="size-4" aria-hidden />
                {t("resources.newChapter")}
              </Button>
            ) : undefined
          }
        />
      ) : view === "list" ? (
        <ResourceListView
          courses={filtered}
          canEdit
          onEdit={(resource) =>
            setResourceDialog({ open: true, resource, chapterId: resource.chapterId })
          }
          onDelete={removeResource}
          onToggleVisibility={(r) =>
            setVisibility.mutate(
              { id: r.id, isPublished: !r.isPublished },
              { onError: notifyError },
            )
          }
          onOpen={openResource}
          onDownload={downloadResource}
        />
      ) : (
        <div className="space-y-5">
          {filtered.map((course) => {
            const accent = subjectColor(course.subjectColor, course.subjectKey);
            return (
              <div key={course.groupId} className="space-y-2">
                {/* Course heading: only when several courses are on screen, so a
                    filtered single-course view is not needlessly nested. */}
                {filtered.length > 1 && (
                  <div className="flex items-center gap-2 px-1">
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ backgroundColor: accent }}
                      aria-hidden
                    />
                    <h2 className="text-sm font-semibold tracking-tight">{course.groupName}</h2>
                    <span className="text-xs text-muted-foreground">
                      {subjectLabel(course.subjectKey, course.subjectName)}
                    </span>
                  </div>
                )}
                <div className="space-y-2.5">
                  {course.chapters.map((ch) => (
                    <ChapterSection
                      key={ch.id}
                      chapter={ch}
                      accent={accent}
                      canEdit
                      // Open by default: a collapsed outline hides the very thing
                      // the teacher came for. "Liste" flattens instead.
                      defaultOpen
                      query={query}
                      onAddResource={(chapterId) => setResourceDialog({ open: true, chapterId })}
                      onEditChapter={(chapter) => setChapterDialog({ open: true, chapter })}
                      onDeleteChapter={removeChapter}
                      onEditResource={(resource) =>
                        setResourceDialog({ open: true, resource, chapterId: resource.chapterId })
                      }
                      onDeleteResource={removeResource}
                      onToggleVisibility={(r) =>
                        setVisibility.mutate(
                          { id: r.id, isPublished: !r.isPublished },
                          { onError: notifyError },
                        )
                      }
                      onOpenResource={openResource}
                      onDownloadResource={downloadResource}
                      onMove={moveChapter}
                      drag={dragBinding}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ChapterDialog
        open={chapterDialog.open}
        onOpenChange={(v) => setChapterDialog({ open: v })}
        chapter={chapterDialog.chapter}
        courses={myGroups}
        {...(courseFilter !== ALL ? { defaultGroupId: courseFilter } : {})}
        onSubmit={submitChapter}
        isPending={saveChapter.isPending}
      />

      <ResourceDialog
        open={resourceDialog.open}
        onOpenChange={(v) => setResourceDialog({ open: v })}
        resource={resourceDialog.resource}
        courses={courses}
        {...(resourceDialog.chapterId ? { defaultChapterId: resourceDialog.chapterId } : {})}
        onSubmit={submitResource}
        isPending={saveResource.isPending || uploadProgress !== null}
        uploadProgress={uploadProgress}
      />

      <ResourcePreview resource={preview} onClose={() => setPreview(null)} canDownload />
    </>
  );
}

function Stat({
  value,
  label,
  tone = "neutral",
}: {
  value: number;
  label: string;
  tone?: "neutral" | "success" | "muted";
}) {
  return (
    <div className="border-s border-border ps-5 first:border-s-0 first:ps-0">
      <dd
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "success" && value > 0 && "text-success",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </dd>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}
