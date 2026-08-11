/**
 * Create/edit dialogs for chapters and resources.
 *
 * Uses the existing `Dialog` primitive and the same field patterns as the admin
 * forms, so this reads as the same application rather than a bolted-on module.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { formatBytes } from "./resource-icon";
import type { ChapterRow, CourseResources, ResourceKind, ResourceRow } from "./types";

/** Mirrors the bucket's `file_size_limit` and `MAX_FILE_BYTES` in
 *  `storage.server.ts`. Checked here only to fail fast with a readable message --
 *  the bucket and the server function are what actually enforce it. */
const MAX_BYTES = 250 * 1024 * 1024;

/* ------------------------------- CHAPTER ------------------------------- */

export function ChapterDialog({
  open,
  onOpenChange,
  chapter,
  courses,
  defaultGroupId,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Present when editing. */
  chapter?: ChapterRow | null | undefined;
  courses: { id: string; name: string }[];
  defaultGroupId?: string | undefined;
  onSubmit: (v: { id?: string; groupId: string; title: string; description: string }) => void;
  isPending: boolean;
}) {
  const { t } = useI18n();
  const [groupId, setGroupId] = useState(defaultGroupId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset per opening: a dialog reused across two chapters must not keep the
  // previous one's text.
  useEffect(() => {
    if (!open) return;
    setGroupId(chapter?.groupId ?? defaultGroupId ?? courses[0]?.id ?? "");
    setTitle(chapter?.title ?? "");
    setDescription(chapter?.description ?? "");
    setError(null);
  }, [open, chapter, defaultGroupId, courses]);

  const submit = () => {
    if (!title.trim()) return setError(t("resources.dialog.titleRequired"));
    if (!groupId) return setError(t("resources.dialog.chooseCourse"));
    onSubmit({ ...(chapter ? { id: chapter.id } : {}), groupId, title, description });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {chapter
              ? t("resources.dialog.editChapterTitle")
              : t("resources.dialog.newChapterTitle")}
          </DialogTitle>
          <DialogDescription>{t("resources.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!chapter && (
            <div className="space-y-2">
              <Label>{t("resources.dialog.course")}</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger className="h-11 w-full rounded-xl">
                  <SelectValue placeholder={t("resources.dialog.chooseCourse")} />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="chapter-title">{t("resources.dialog.chapterName")}</Label>
            <Input
              id="chapter-title"
              className="h-11 rounded-xl"
              value={title}
              maxLength={160}
              placeholder={t("resources.dialog.chapterNamePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chapter-desc">{t("resources.dialog.chapterDescription")}</Label>
            <Textarea
              id="chapter-desc"
              className="min-h-20 rounded-xl"
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            {t("resources.dialog.cancel")}
          </Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("resources.dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- RESOURCE ------------------------------- */

export interface ResourceFormValue {
  id?: string | undefined;
  chapterId: string;
  title: string;
  description: string;
  kind: ResourceKind;
  url: string;
  file: File | null;
  pinned: boolean;
  allowDownload: boolean;
  isPublished: boolean;
  /** `datetime-local` string, or "" for immediate. */
  publishAt: string;
}

export function ResourceDialog({
  open,
  onOpenChange,
  resource,
  courses,
  defaultChapterId,
  onSubmit,
  isPending,
  uploadProgress,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resource?: ResourceRow | null | undefined;
  courses: CourseResources[];
  defaultChapterId?: string | undefined;
  onSubmit: (v: ResourceFormValue) => void;
  isPending: boolean;
  /** 0..1 while a file is uploading, null otherwise. */
  uploadProgress: number | null;
}) {
  const { t, locale } = useI18n();
  const [chapterId, setChapterId] = useState(defaultChapterId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ResourceKind>("file");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pinned, setPinned] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [isPublished, setPublished] = useState(true);
  const [publishAt, setPublishAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const chapterOptions = useMemo(
    () =>
      courses.flatMap((c) =>
        c.chapters.map((ch) => ({ id: ch.id, label: `${c.groupName} · ${ch.title}` })),
      ),
    [courses],
  );

  useEffect(() => {
    if (!open) return;
    setChapterId(resource?.chapterId ?? defaultChapterId ?? chapterOptions[0]?.id ?? "");
    setTitle(resource?.title ?? "");
    setDescription(resource?.description ?? "");
    setKind(resource?.kind ?? "file");
    setUrl(resource?.url ?? "");
    setFile(null);
    setPinned(resource?.pinned ?? false);
    setAllowDownload(resource?.allowDownload ?? true);
    setPublished(resource?.isPublished ?? true);
    // `datetime-local` wants `YYYY-MM-DDTHH:mm` with no zone.
    setPublishAt(resource?.publishedAt ? resource.publishedAt.slice(0, 16) : "");
    setError(null);
  }, [open, resource, defaultChapterId, chapterOptions]);

  const submit = () => {
    if (!title.trim()) return setError(t("resources.dialog.titleRequired"));
    if (!chapterId) return setError(t("resources.dialog.chapter"));
    if (kind === "link") {
      // https only: a mixed-content http link would be blocked in the preview and
      // silently fail for the student.
      if (!/^https:\/\/.+/i.test(url.trim())) return setError(t("resources.dialog.urlInvalid"));
    } else if (!resource?.storagePath && !file) {
      return setError(t("resources.dialog.fileRequired"));
    }
    if (file && file.size > MAX_BYTES) return setError(t("resources.dialog.fileTooLarge"));

    onSubmit({
      ...(resource ? { id: resource.id } : {}),
      chapterId,
      title,
      description,
      kind,
      url,
      file,
      pinned,
      allowDownload,
      isPublished,
      publishAt,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {resource
              ? t("resources.dialog.editResourceTitle")
              : t("resources.dialog.newResourceTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("resources.dialog.chapter")}</Label>
            <Select value={chapterId} onValueChange={setChapterId}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chapterOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="res-title">{t("resources.dialog.resourceTitle")}</Label>
            <Input
              id="res-title"
              className="h-11 rounded-xl"
              value={title}
              maxLength={200}
              placeholder={t("resources.dialog.resourceTitlePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* File vs link: a segmented control matching the calendar's, so the
              same interaction means the same thing across the product. */}
          <div className="flex rounded-xl bg-muted p-0.5">
            {(["file", "link"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "focus-ring flex-1 rounded-[0.6rem] px-3 py-1.5 text-xs font-medium transition-colors",
                  kind === k
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(k === "file" ? "resources.dialog.sourceFile" : "resources.dialog.sourceLink")}
              </button>
            ))}
          </div>

          {kind === "file" ? (
            <div className="space-y-2">
              <Label htmlFor="res-file" className="sr-only">
                {t("resources.dialog.chooseFile")}
              </Label>
              <label
                htmlFor="res-file"
                className="focus-within:ring-ring flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-4 transition-colors hover:bg-muted/50"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Upload className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {file
                      ? file.name
                      : resource?.storagePath
                        ? t("resources.dialog.replaceFile")
                        : t("resources.dialog.chooseFile")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {file
                      ? formatBytes(file.size, locale)
                      : formatBytes(MAX_BYTES, locale) + " max"}
                  </span>
                </span>
                {file && <Paperclip className="size-4 shrink-0 text-primary" aria-hidden />}
              </label>
              <input
                id="res-file"
                type="file"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  // Prefill the title from the filename: most of the time it is
                  // already what the teacher would have typed.
                  if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
                }}
              />
              {uploadProgress !== null && (
                <div className="space-y-1">
                  <Progress value={Math.round(uploadProgress * 100)} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">{t("resources.dialog.uploading")}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="res-url">{t("resources.dialog.linkUrl")}</Label>
              <Input
                id="res-url"
                type="url"
                inputMode="url"
                dir="ltr"
                className="h-11 rounded-xl"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="res-desc">{t("resources.dialog.chapterDescription")}</Label>
            <Textarea
              id="res-desc"
              className="min-h-16 rounded-xl"
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border p-3">
            <ToggleRow
              id="res-important"
              label={t("resources.dialog.markImportant")}
              checked={pinned}
              onChange={setPinned}
            />
            {kind === "file" && (
              <ToggleRow
                id="res-download"
                label={t("resources.dialog.allowDownload")}
                checked={allowDownload}
                onChange={setAllowDownload}
              />
            )}
            <ToggleRow
              id="res-published"
              label={t("resources.dialog.publishNow")}
              checked={isPublished}
              onChange={setPublished}
            />
            {isPublished && (
              <div className="space-y-1.5">
                <Label htmlFor="res-when" className="text-xs text-muted-foreground">
                  {t("resources.dialog.scheduleFor")}
                </Label>
                <Input
                  id="res-when"
                  type="datetime-local"
                  className="h-10 rounded-xl"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                />
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            {t("resources.dialog.cancel")}
          </Button>
          <Button type="button" className="rounded-xl" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("resources.dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
