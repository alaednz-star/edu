/**
 * Course resources data layer.
 *
 * Follows the conventions already in `features/school/queries.ts`: a `schoolKeys`
 * style key registry rooted so one write invalidates every reader, `must()` for
 * error surfacing, and RLS left as the only authority on what comes back.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { currentAccessToken } from "@/integrations/supabase/access-token";
import { assertUploadAllowedFn, signResourceUrlFn } from "./storage.functions";
import type {
  ChapterRow,
  CourseResources,
  ResourceEventKind,
  ResourceKind,
  ResourceRow,
  ResourceStats,
  ResourceVisibility,
} from "./types";

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Private bucket. Files are only ever reached through a short-lived signed URL. */
export const RESOURCE_BUCKET = "course-resources";

/**
 * Every key under one root, so a single invalidation refreshes the teacher page,
 * the student page and the stats together. Same reasoning as `attendanceRoot` in
 * `queries.ts`, which documents three bugs caused by naming caches individually.
 */
export const resourceKeys = {
  root: ["resources"] as const,
  byGroup: (groupId: string | null) => ["resources", "group", groupId ?? "all"] as const,
  mine: (studentId: string) => ["resources", "student", studentId] as const,
};

/* ------------------------------ DERIVATION ------------------------------ */

/** `is_published` + `published_at` -> one of three states the UI can render. */
export function visibilityOf(isPublished: boolean, publishedAt: string | null): ResourceVisibility {
  if (!isPublished) return "hidden";
  if (publishedAt && new Date(publishedAt) > new Date()) return "scheduled";
  return "published";
}

export function statsFor(courses: CourseResources[]): ResourceStats {
  let chapters = 0,
    resources = 0,
    published = 0,
    scheduled = 0,
    hidden = 0,
    storageBytes = 0;
  for (const c of courses) {
    chapters += c.chapters.length;
    for (const ch of c.chapters) {
      for (const r of ch.resources) {
        resources += 1;
        if (r.visibility === "published") published += 1;
        else if (r.visibility === "scheduled") scheduled += 1;
        else hidden += 1;
        storageBytes += r.sizeBytes ?? 0;
      }
    }
  }
  return { chapters, resources, published, scheduled, hidden, storageBytes };
}

/* --------------------------- SHARED ROW MAPPING --------------------------- */

interface RawResource {
  id: string;
  chapter_id: string;
  group_id: string;
  title: string;
  description: string | null;
  kind: string;
  storage_path: string | null;
  url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  position: number;
  pinned: boolean;
  allow_download: boolean;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

function mapResource(r: RawResource): ResourceRow {
  return {
    id: r.id,
    chapterId: r.chapter_id,
    groupId: r.group_id,
    title: r.title,
    description: r.description,
    kind: r.kind as ResourceKind,
    storagePath: r.storage_path,
    url: r.url,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    position: r.position,
    pinned: r.pinned,
    allowDownload: r.allow_download,
    isPublished: r.is_published,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    visibility: visibilityOf(r.is_published, r.published_at),
  };
}

const RESOURCE_COLUMNS =
  "id, chapter_id, group_id, title, description, kind, storage_path, url, mime_type, size_bytes, position, pinned, allow_download, is_published, published_at, created_at";

/* ------------------------------ STAFF READ ------------------------------ */

/**
 * Chapters and resources for the groups the caller may manage.
 *
 * RLS decides which groups those are, so a teacher gets their own and an admin
 * gets everything -- this hook filters nothing. `groupId` narrows it further when
 * the user picks a course from the filter.
 */
export function useCourseResources(groupId?: string | null) {
  return useQuery({
    queryKey: resourceKeys.byGroup(groupId ?? null),
    queryFn: async (): Promise<CourseResources[]> => {
      let q = supabase
        .from("chapters")
        .select(
          `id, group_id, title, description, position, created_at,
           groups!inner(name, subjects(key, name, color), levels(name)),
           resources(${RESOURCE_COLUMNS})`,
        )
        .order("position", { ascending: true });
      if (groupId) q = q.eq("group_id", groupId);
      const rows = must(await q);

      // Counts are a second, narrow query: pulling every event row through the
      // join would grow with enrolment for a number the UI shows as "12 vues".
      const chapterIds = rows.map((r) => r.id);
      const openCounts = new Map<string, number>();
      if (chapterIds.length > 0) {
        const events = await supabase
          .from("resource_events")
          .select("resource_id, resources!inner(chapter_id)")
          // `open` was migrated to `view` in 20260811100000; nothing writes it now.
          .eq("kind", "view")
          .in("resources.chapter_id", chapterIds);
        for (const e of events.data ?? []) {
          openCounts.set(e.resource_id, (openCounts.get(e.resource_id) ?? 0) + 1);
        }
      }

      const byGroup = new Map<string, CourseResources>();
      for (const row of rows) {
        const g = row.groups;
        let course = byGroup.get(row.group_id);
        if (!course) {
          course = {
            groupId: row.group_id,
            groupName: g?.name ?? "—",
            subjectKey: g?.subjects?.key ?? null,
            subjectName: g?.subjects?.name ?? null,
            subjectColor: g?.subjects?.color ?? null,
            levelName: g?.levels?.name ?? null,
            chapters: [],
            resourceCount: 0,
          };
          byGroup.set(row.group_id, course);
        }
        const resources = (row.resources ?? [])
          .map((r) => mapResource(r as RawResource))
          .map((r) => ({ ...r, openCount: openCounts.get(r.id) ?? 0 }))
          .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
        course.chapters.push({
          id: row.id,
          groupId: row.group_id,
          title: row.title,
          description: row.description,
          position: row.position,
          createdAt: row.created_at,
          resources,
        });
        course.resourceCount += resources.length;
      }
      return [...byGroup.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
    },
  });
}

/* ----------------------------- STUDENT READ ----------------------------- */

/**
 * What the signed-in student may see: published, due resources in their approved
 * groups, grouped COURS -> CHAPITRE -> RESSOURCES.
 *
 * The visibility rule is enforced by RLS, not here. The client-side filter below
 * only removes chapters left empty by it, so the page does not render a chapter
 * with nothing in it.
 */
export function useMyResources(studentId: string | undefined) {
  return useQuery({
    queryKey: resourceKeys.mine(studentId ?? "anon"),
    enabled: !!studentId,
    queryFn: async (): Promise<CourseResources[]> => {
      const rows = must(
        await supabase
          .from("chapters")
          .select(
            `id, group_id, title, description, position, created_at,
             groups!inner(name, subjects(key, name, color), levels(name)),
             resources(${RESOURCE_COLUMNS})`,
          )
          .order("position", { ascending: true }),
      );

      // Which of them this student has already opened.
      const seen = new Set<string>();
      const events = await supabase
        .from("resource_events")
        .select("resource_id")
        .eq("student_id", studentId as string);
      for (const e of events.data ?? []) seen.add(e.resource_id);

      const byGroup = new Map<string, CourseResources>();
      for (const row of rows) {
        const resources = (row.resources ?? [])
          .map((r) => mapResource(r as RawResource))
          .map((r) => ({ ...r, openedByMe: seen.has(r.id) }))
          .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
        // RLS already dropped anything unpublished; an empty chapter is noise.
        if (resources.length === 0) continue;
        const g = row.groups;
        let course = byGroup.get(row.group_id);
        if (!course) {
          course = {
            groupId: row.group_id,
            groupName: g?.name ?? "—",
            subjectKey: g?.subjects?.key ?? null,
            subjectName: g?.subjects?.name ?? null,
            subjectColor: g?.subjects?.color ?? null,
            levelName: g?.levels?.name ?? null,
            chapters: [],
            resourceCount: 0,
          };
          byGroup.set(row.group_id, course);
        }
        course.chapters.push({
          id: row.id,
          groupId: row.group_id,
          title: row.title,
          description: row.description,
          position: row.position,
          createdAt: row.created_at,
          resources,
        });
        course.resourceCount += resources.length;
      }
      return [...byGroup.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
    },
  });
}

/* ------------------------------- MUTATIONS ------------------------------- */

export function useSaveChapter() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id?: string | undefined;
      groupId: string;
      title: string;
      description?: string | null | undefined;
      position?: number | undefined;
    }) => {
      const payload = {
        group_id: input.groupId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        ...(input.position !== undefined ? { position: input.position } : {}),
      };
      if (input.id) {
        must(await supabase.from("chapters").update(payload).eq("id", input.id).select());
      } else {
        must(
          await supabase
            .from("chapters")
            .insert({ ...payload, created_by: user?.id ?? null })
            .select(),
        );
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: resourceKeys.root }),
  });
}

export function useDeleteChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chapters").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: resourceKeys.root }),
  });
}

/** Persists a reordered chapter list. One round trip per moved row. */
export function useReorderChapters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; position: number }[]) => {
      for (const c of ordered) {
        must(
          await supabase.from("chapters").update({ position: c.position }).eq("id", c.id).select(),
        );
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: resourceKeys.root }),
  });
}

export interface ResourceInput {
  id?: string | undefined;
  chapterId: string;
  title: string;
  description?: string | null | undefined;
  kind: ResourceKind;
  storagePath?: string | null | undefined;
  url?: string | null | undefined;
  mimeType?: string | null | undefined;
  sizeBytes?: number | null | undefined;
  pinned?: boolean | undefined;
  allowDownload?: boolean | undefined;
  isPublished?: boolean | undefined;
  publishedAt?: string | null | undefined;
  position?: number | undefined;
}

export function useSaveResource() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: ResourceInput) => {
      const payload = {
        chapter_id: input.chapterId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        kind: input.kind,
        storage_path: input.kind === "file" ? (input.storagePath ?? null) : null,
        url: input.kind === "link" ? (input.url?.trim() ?? null) : null,
        mime_type: input.mimeType ?? null,
        size_bytes: input.sizeBytes ?? null,
        pinned: input.pinned ?? false,
        allow_download: input.allowDownload ?? true,
        is_published: input.isPublished ?? false,
        published_at: input.publishedAt ?? null,
        ...(input.position !== undefined ? { position: input.position } : {}),
        // `group_id` is NOT sent: a trigger derives it from the chapter, because a
        // client-supplied value here would be a permission bug.
        group_id: "00000000-0000-0000-0000-000000000000",
      };
      if (input.id) {
        must(await supabase.from("resources").update(payload).eq("id", input.id).select());
      } else {
        must(
          await supabase
            .from("resources")
            .insert({ ...payload, created_by: user?.id ?? null })
            .select(),
        );
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: resourceKeys.root }),
  });
}

export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (resource: { id: string; storagePath: string | null }) => {
      // The row first: if the object delete fails the user can retry, whereas an
      // orphaned row would keep advertising a file that is gone.
      const { error } = await supabase.from("resources").delete().eq("id", resource.id);
      if (error) throw new Error(error.message);
      if (resource.storagePath) {
        await supabase.storage.from(RESOURCE_BUCKET).remove([resource.storagePath]);
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: resourceKeys.root }),
  });
}

/** Publish / unpublish without opening the edit dialog. */
export function useSetResourceVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; isPublished: boolean }) => {
      must(
        await supabase
          .from("resources")
          .update({ is_published: input.isPublished })
          .eq("id", input.id)
          .select(),
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: resourceKeys.root }),
  });
}

export function useReorderResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      ordered: { id: string; position: number; chapterId?: string | undefined }[],
    ) => {
      for (const r of ordered) {
        must(
          await supabase
            .from("resources")
            .update({
              position: r.position,
              ...(r.chapterId ? { chapter_id: r.chapterId } : {}),
            })
            .eq("id", r.id)
            .select(),
        );
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: resourceKeys.root }),
  });
}

/* -------------------------------- STORAGE -------------------------------- */

/**
 * Uploads a file and returns its storage path.
 *
 * The path is `<group_id>/<uuid>/<filename>`, which is what the bucket policies
 * authorise on -- they read the leading folder rather than joining back to
 * `resources`, since the row does not exist yet at upload time.
 *
 * The per-file limit and the centre quota are decided on the server first. The
 * bucket enforces its own size limit and cannot be bypassed, but it knows nothing
 * about a 5 GB centre total -- so that half has to be asked somewhere the browser
 * cannot edit, and asking before the bytes go over the wire is also the only way
 * to fail fast on a 200 MB file.
 */
export async function uploadResourceFile(
  groupId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<{ path: string; mimeType: string; size: number }> {
  const accessToken = await currentAccessToken();
  if (!accessToken) throw new Error("Session expirée.");
  await assertUploadAllowedFn({ data: { accessToken, groupId, sizeBytes: file.size } });

  const id = globalThis.crypto.randomUUID();
  // Keep the original name (students recognise "TD3-suites.pdf") but strip
  // anything that would break a path or a Content-Disposition header.
  const safeName = file.name.replace(/[^\w.\-À-ɏ ]+/g, "_").slice(-120);
  const path = `${groupId}/${id}/${safeName}`;

  onProgress?.(0.05);
  const { error } = await supabase.storage.from(RESOURCE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  onProgress?.(1);

  return { path, mimeType: file.type || "application/octet-stream", size: file.size };
}

/**
 * A time-limited URL for a resource, issued by the server or not at all.
 *
 * Takes a resource ID rather than a storage path on purpose. Signing used to
 * happen here in the browser, which meant `allow_download` was enforced by hiding
 * a button: anyone who could read the row could ask Storage for an attachment URL,
 * because Storage cannot tell "preview this" from "save this" -- both need SELECT
 * on the same object. So the decision moved server-side, and the server needs the
 * row's identity to ask the database about it.
 *
 * `can_view_resource` / `can_download_resource` are the authority, evaluated as
 * the caller. Links are returned as-is; the bucket stays private, so a copied URL
 * still expires.
 */
export async function signResourceUrl(
  resourceId: string,
  intent: "view" | "download" = "view",
): Promise<string> {
  const accessToken = await currentAccessToken();
  if (!accessToken) throw new Error("Session expirée.");
  const { url } = await signResourceUrlFn({ data: { accessToken, resourceId, intent } });
  return url;
}

/* --------------------------------- EVENTS --------------------------------- */

/**
 * Records that a student viewed or downloaded a resource.
 *
 * APPEND-ONLY. This used to upsert on a unique (resource, student, kind), which
 * answered "has this student opened it?" but destroyed the history -- a second
 * view overwrote the first. `20260811100000` drops that constraint, so an upsert
 * here would now fail with 42P10 (no unique index matching ON CONFLICT) on every
 * single write; it has to be a plain insert.
 *
 * Failures are swallowed: progress tracking must never block a student from
 * reading their course material.
 */
export function useRecordResourceEvent() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { resourceId: string; kind?: ResourceEventKind | undefined }) => {
      if (!user?.id) return;
      await supabase.from("resource_events").insert({
        resource_id: input.resourceId,
        student_id: user.id,
        kind: input.kind ?? "view",
        occurred_at: new Date().toISOString(),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: resourceKeys.root }),
  });
}
