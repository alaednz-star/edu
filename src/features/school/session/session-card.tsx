/**
 * One session, as a clickable card.
 *
 * The GROUP is the headline, not the subject: parallel sessions in the same slot
 * usually share a subject and differ only by group, so leading with the subject
 * would make three cards look identical.
 *
 * Colours come from `subjects.color` in the database via `subjectTint`, and
 * statuses map onto the existing semantic tokens. No new palette.
 */

import { useSubjectLabel } from "../subject-label";
import { subjectTint } from "./subject-tint";
import { STATUS_CLASS, useStatusLabel } from "./status-label";
import type { SessionInstance } from "./types";
import { cn } from "@/lib/utils";

export function SessionCard({
  session,
  onOpen,
  compact = false,
}: {
  session: SessionInstance;
  onOpen: (s: SessionInstance) => void;
  /** Month view: one dense line instead of the four-line card. */
  compact?: boolean;
}) {
  const subjectLabel = useSubjectLabel();
  const statusLabel = useStatusLabel();
  const tint = subjectTint(session.subjectColor, session.subjectKey);
  const subject = subjectLabel(session.subjectKey, session.subjectName);

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onOpen(session)}
        title={`${session.startTime} ${session.groupName} — ${subject}`}
        className={cn(
          "focus-ring block w-full truncate rounded-md px-1.5 py-1 text-start text-[11px] leading-tight",
          session.status === "cancelled" && "opacity-55",
        )}
        style={{
          backgroundColor: tint.tint,
          // Logical property: becomes the right edge under RTL automatically.
          borderInlineStart: `2px solid ${tint.color}`,
        }}
      >
        <span className="font-medium tabular-nums">{session.startTime}</span>{" "}
        <span className="text-muted-foreground">{session.groupName}</span>
      </button>
    );
  }

  const meta = [session.teacherName, session.room].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      className={cn(
        "focus-ring block w-full rounded-xl p-2.5 text-start transition-shadow hover:shadow-card",
        session.status === "cancelled" && "opacity-55",
      )}
      style={{
        backgroundColor: tint.tint,
        border: `1px solid ${tint.border}`,
        borderInlineStart: `3px solid ${tint.color}`,
      }}
    >
      <p className="truncate text-[13px] font-semibold" style={{ color: tint.color }}>
        {session.groupName}
      </p>
      <p className="truncate text-xs font-medium text-secondary-foreground">{subject}</p>
      {meta && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p>}
      <p className={cn("mt-1 text-[11px] font-medium", STATUS_CLASS[session.status])}>
        {statusLabel(session)}
      </p>
    </button>
  );
}
