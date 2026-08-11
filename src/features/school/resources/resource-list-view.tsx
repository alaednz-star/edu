/**
 * "Liste" -- a dense, sortable table across every chapter.
 *
 * Genuinely different from "Chapitres", not a flattened copy of it. Chapitres
 * answers "what is in chapter 3?"; Liste answers "which file is biggest / oldest /
 * least consulted?", which needs one row per resource, comparable columns and
 * sorting. The chapter becomes a COLUMN here rather than the container.
 *
 * Built on the existing `Table` primitive and the same border/radius/shadow
 * tokens as the rest of the product, so it reads as a Madrasti table rather than
 * an enterprise data grid.
 *
 * RESPONSIVE: the table is for >=768px. Below that it becomes the same compact
 * rows the chapter view uses -- forcing eight columns onto a phone would either
 * overflow or shrink every cell past readability.
 */

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { subjectColor } from "@/features/school/session/subject-tint";
import { faceOf, formatBytes } from "./resource-icon";
import type { CourseResources, ResourceRow } from "./types";

type SortKey = "title" | "createdAt" | "sizeBytes" | "openCount";
type SortDir = "asc" | "desc";

const VISIBILITY_STYLE: Record<string, string> = {
  published: "text-success",
  scheduled: "text-accent",
  hidden: "text-muted-foreground",
};

/** One flattened row: the resource plus the context the table shows as columns. */
interface FlatRow {
  resource: ResourceRow;
  groupName: string;
  chapterTitle: string;
  accent: string;
}

export function ResourceListView({
  courses,
  canEdit,
  onEdit,
  onDelete,
  onToggleVisibility,
  onOpen,
  onDownload,
}: {
  courses: CourseResources[];
  canEdit: boolean;
  onEdit: (r: ResourceRow) => void;
  onDelete: (r: ResourceRow) => void;
  onToggleVisibility: (r: ResourceRow) => void;
  onOpen: (r: ResourceRow) => void;
  onDownload: (r: ResourceRow) => void;
}) {
  const { t, locale } = useI18n();
  // Newest first: "what did I add recently?" is the common reason to open this.
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const flat: FlatRow[] = [];
    for (const c of courses) {
      const accent = subjectColor(c.subjectColor, c.subjectKey);
      for (const ch of c.chapters) {
        for (const r of ch.resources) {
          flat.push({ resource: r, groupName: c.groupName, chapterTitle: ch.title, accent });
        }
      }
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return flat.sort((a, b) => {
      switch (sortKey) {
        case "sizeBytes":
          // Links have no size; keep them last in either direction rather than
          // letting 0 outrank a real file.
          return ((a.resource.sizeBytes ?? -1) - (b.resource.sizeBytes ?? -1)) * dir;
        case "openCount":
          return ((a.resource.openCount ?? 0) - (b.resource.openCount ?? 0)) * dir;
        case "title":
          return a.resource.title.localeCompare(b.resource.title) * dir;
        default:
          return a.resource.createdAt.localeCompare(b.resource.createdAt) * dir;
      }
    });
  }, [courses, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text reads naturally A→Z; numbers and dates are more useful biggest-first.
      setSortDir(key === "title" ? "asc" : "desc");
    }
  };

  const SortHead = ({
    label,
    keyName,
    className,
  }: {
    label: string;
    keyName: SortKey;
    className?: string;
  }) => {
    const active = sortKey === keyName;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(keyName)}
          aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
          className={cn(
            "focus-ring inline-flex items-center gap-1 rounded py-1 text-inherit transition-colors hover:text-foreground",
            active && "text-foreground",
          )}
        >
          {label}
          {active &&
            (sortDir === "asc" ? (
              <ArrowUp className="size-3" aria-hidden />
            ) : (
              <ArrowDown className="size-3" aria-hidden />
            ))}
        </button>
      </TableHead>
    );
  };

  if (rows.length === 0) return null;

  return (
    <>
      {/* ---------- >=768px: the dense table ---------- */}
      <div className="surface-card hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortHead label={t("resources.list.resource")} keyName="title" className="w-[34%]" />
              <TableHead className="hidden w-[14%] lg:table-cell">
                {t("resources.list.group")}
              </TableHead>
              <TableHead className="hidden w-[20%] xl:table-cell">
                {t("resources.list.chapter")}
              </TableHead>
              <SortHead
                label={t("resources.list.size")}
                keyName="sizeBytes"
                className="hidden whitespace-nowrap text-end lg:table-cell"
              />
              <SortHead
                label={t("resources.list.added")}
                keyName="createdAt"
                className="hidden whitespace-nowrap sm:table-cell"
              />
              {canEdit && (
                <SortHead
                  label={t("resources.list.views")}
                  keyName="openCount"
                  className="text-end"
                />
              )}
              <TableHead>{t("resources.list.visibility")}</TableHead>
              <TableHead className="w-1 text-end">
                <span className="sr-only">{t("resources.list.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ resource: r, groupName, chapterTitle, accent }) => {
              const face = faceOf(r.kind, r.mimeType);
              const Icon = face.icon;
              return (
                <TableRow key={r.id} className="group">
                  <TableCell className="max-w-0 align-middle">
                    <button
                      type="button"
                      onClick={() => onOpen(r)}
                      className="focus-ring flex w-full min-w-0 items-center gap-2.5 rounded-lg text-start"
                    >
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-lg"
                        style={{
                          backgroundColor: `color-mix(in oklch, ${accent} 12%, var(--color-card))`,
                          color: accent,
                        }}
                      >
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate text-[13px] font-medium">
                            {r.title}
                          </span>
                          {r.pinned && (
                            <Star
                              className="size-3 shrink-0 fill-accent text-accent"
                              aria-label={t("resources.resource.important")}
                            />
                          )}
                        </span>
                        {/* The columns hidden at this width fold into the subtitle,
                            so nothing is lost -- it moves. */}
                        <span className="block truncate text-[11px] text-muted-foreground lg:hidden">
                          {groupName} · {t(face.labelKey)}
                        </span>
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden max-w-0 truncate text-xs text-muted-foreground lg:table-cell">
                    {groupName}
                  </TableCell>
                  <TableCell className="hidden max-w-0 truncate text-xs text-muted-foreground xl:table-cell">
                    {chapterTitle}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-end text-xs tabular-nums text-muted-foreground lg:table-cell">
                    <Bytes bytes={r.sizeBytes} locale={locale} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground sm:table-cell">
                    {formatDate(r.createdAt, locale)}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-end text-xs tabular-nums text-muted-foreground">
                      {r.openCount ?? 0}
                    </TableCell>
                  )}
                  <TableCell>
                    <span
                      className={cn(
                        "whitespace-nowrap text-[11px] font-medium",
                        VISIBILITY_STYLE[r.visibility],
                      )}
                    >
                      {t(`resources.visibility.${r.visibility}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-end">
                    <RowActions
                      resource={r}
                      canEdit={canEdit}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onToggleVisibility={onToggleVisibility}
                      onDownload={onDownload}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ---------- <768px: compact cards, same information ---------- */}
      <ul className="surface-card divide-y divide-border md:hidden">
        {rows.map(({ resource: r, groupName, chapterTitle, accent }) => {
          const face = faceOf(r.kind, r.mimeType);
          const Icon = face.icon;
          return (
            <li key={r.id} className="flex items-center gap-3 p-3">
              <button
                type="button"
                onClick={() => onOpen(r)}
                className="focus-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-start"
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl"
                  style={{
                    backgroundColor: `color-mix(in oklch, ${accent} 12%, var(--color-card))`,
                    color: accent,
                  }}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere] line-clamp-2">
                      {r.title}
                    </span>
                    {r.pinned && (
                      <Star className="size-3 shrink-0 fill-accent text-accent" aria-hidden />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {groupName} · {chapterTitle}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                    <span className="tabular-nums text-muted-foreground">
                      {formatDate(r.createdAt, locale)}
                      {r.sizeBytes ? (
                        <>
                          {" · "}
                          <Bytes bytes={r.sizeBytes} locale={locale} />
                        </>
                      ) : null}
                    </span>
                    <span className={cn("font-medium", VISIBILITY_STYLE[r.visibility])}>
                      {t(`resources.visibility.${r.visibility}`)}
                    </span>
                  </span>
                </span>
              </button>
              <RowActions
                resource={r}
                canEdit={canEdit}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleVisibility={onToggleVisibility}
                onDownload={onDownload}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * A file size that always reads number-then-unit.
 *
 * "1,1 MB" is direction-NEUTRAL, so under `dir="rtl"` the browser reorders it to
 * "MB 1,1". Same failure the calendar had with time ranges. `dir="ltr"` plus
 * `unicode-bidi: isolate` pins the run without affecting the surrounding text.
 */
function Bytes({ bytes, locale }: { bytes: number | null; locale: string }) {
  const text = formatBytes(bytes, locale);
  if (!text) return <>—</>;
  return (
    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
      {text}
    </span>
  );
}

/** Actions, identical in both densities so behaviour never depends on width. */
function RowActions({
  resource: r,
  canEdit,
  onEdit,
  onDelete,
  onToggleVisibility,
  onDownload,
}: {
  resource: ResourceRow;
  canEdit: boolean;
  onEdit: (r: ResourceRow) => void;
  onDelete: (r: ResourceRow) => void;
  onToggleVisibility: (r: ResourceRow) => void;
  onDownload: (r: ResourceRow) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      {r.kind === "file" && r.allowDownload && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg"
          aria-label={t("resources.resource.download")}
          onClick={() => onDownload(r)}
        >
          <Download className="size-4" aria-hidden />
        </Button>
      )}
      {canEdit && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={
              r.isPublished ? t("resources.resource.unpublish") : t("resources.resource.publish")
            }
            onClick={() => onToggleVisibility(r)}
          >
            {r.isPublished ? (
              <Eye className="size-4" aria-hidden />
            ) : (
              <EyeOff className="size-4 text-muted-foreground" aria-hidden />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                aria-label={t("resources.resource.edit")}
              >
                <Ellipsis className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onEdit(r)}>
                <Pencil className="size-4" aria-hidden />
                {t("resources.resource.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(r)}
              >
                <Trash2 className="size-4" aria-hidden />
                {t("resources.resource.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
