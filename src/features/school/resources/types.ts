/**
 * Course resources: chapters, resources, and per-student progress.
 *
 * Types only -- no React, no Supabase -- so this stays importable anywhere.
 */

export type ResourceKind = "file" | "link";

/**
 * What a resource is FOR, as opposed to what format it is in. Mirrors the
 * `resource_role` enum added in `20260811100000`; the database is the authority on
 * the set of values, this union is the compile-time echo of it.
 */
export type ResourceRole = "notes" | "exercises" | "solutions" | "video" | "homework" | "extra";

/**
 * Pedagogical reading order: notes before exercises before their solutions.
 * Identical to `resource_role_weight()` in the database, which exists so SQL can
 * sort the same way -- if one changes, both must.
 */
export const RESOURCE_ROLES: readonly ResourceRole[] = [
  "notes",
  "exercises",
  "solutions",
  "video",
  "homework",
  "extra",
] as const;

/** Position of a role in the pedagogical order. Unknown values sort last. */
export function roleWeight(role: ResourceRole | null | undefined): number {
  const i = role ? RESOURCE_ROLES.indexOf(role) : -1;
  return i === -1 ? RESOURCE_ROLES.length : i;
}
/** `open` was migrated to `view` in 20260811100000 and nothing writes it any more;
 *  the enum value survives in Postgres only because a value in use cannot be
 *  removed. Kept off this union so no new call site can reach for it. */
export type ResourceEventKind = "view" | "download";

/**
 * Derived visibility. Not a stored column: `is_published` and `published_at` are
 * two separate intentions ("hidden" vs "scheduled for Monday") and a teacher
 * toggling one must not lose the other.
 */
export type ResourceVisibility = "published" | "scheduled" | "hidden";

export interface ResourceRow {
  id: string;
  chapterId: string;
  groupId: string;
  title: string;
  description: string | null;
  kind: ResourceKind;
  /** Path in the private `course-resources` bucket. Null for links. */
  storagePath: string | null;
  /** External URL. Null for files. */
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  position: number;
  /** Pedagogical purpose. Drives the badge and the default within-chapter order. */
  role: ResourceRole;
  pinned: boolean;
  allowDownload: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  /** Derived, see `ResourceVisibility`. */
  visibility: ResourceVisibility;
  /** Distinct students who opened it. Staff view only. */
  openCount?: number | undefined;
  /** Whether the SIGNED-IN student has opened it. Student view only. */
  openedByMe?: boolean | undefined;
}

export interface ChapterRow {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  position: number;
  createdAt: string;
  resources: ResourceRow[];
}

/**
 * A chapter without its resources, for the pickers.
 *
 * The creation dialog needs the chapters of ONE group and nothing else; loading
 * every chapter in the school with its resources to fill a selector is what the
 * flat selector used to do.
 */
export interface ChapterOption {
  id: string;
  groupId: string;
  title: string;
  position: number;
}

/** A group with its chapters -- the COURS -> CHAPITRE -> RESSOURCES spine. */
export interface CourseResources {
  groupId: string;
  groupName: string;
  subjectKey: string | null;
  subjectName: string | null;
  subjectColor: string | null;
  levelName: string | null;
  /**
   * Resolved through `groups.teacher_id -> teachers -> profiles`, not stored on the
   * chapter. A group has exactly one teacher, so a copy here would only be able to
   * go stale.
   */
  teacherName: string | null;
  chapters: ChapterRow[];
  /** Resources whose chapter was deleted are impossible (cascade), so this is
   *  only the flat count across chapters -- handy for the header stats. */
  resourceCount: number;
}

/** Header figures. Derived, never stored. */
export interface ResourceStats {
  chapters: number;
  resources: number;
  published: number;
  scheduled: number;
  hidden: number;
  /** Total bytes of uploaded files, for the quota readout. */
  storageBytes: number;
}
