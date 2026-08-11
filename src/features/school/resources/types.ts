/**
 * Course resources: chapters, resources, and per-student progress.
 *
 * Types only -- no React, no Supabase -- so this stays importable anywhere.
 */

export type ResourceKind = "file" | "link";
export type ResourceEventKind = "open" | "download";

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
  isImportant: boolean;
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

/** A group with its chapters -- the COURS -> CHAPITRE -> RESSOURCES spine. */
export interface CourseResources {
  groupId: string;
  groupName: string;
  subjectKey: string | null;
  subjectName: string | null;
  subjectColor: string | null;
  levelName: string | null;
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
