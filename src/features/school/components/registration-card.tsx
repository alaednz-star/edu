/**
 * One registration, drawn by the shared `GroupCard`.
 *
 * This file used to be a second, parallel implementation of the catalogue card. It is now
 * an ADAPTER: it maps `MyRegistration` onto `GroupCardView` and supplies the two things
 * that legitimately differ on this surface -- the status badge, and the decision timeline
 * with its rejection note. Everything visual lives in `group-card.tsx`, so the catalogue
 * and "Mes inscriptions" cannot drift apart again.
 *
 * `actions` stays a slot rather than baked-in buttons because what a student can do depends
 * on status, and that decision belongs to the page: an approved registration offers the
 * timetable, a rejected one offers browsing again, a pending one can be withdrawn.
 */

import type { ReactNode } from "react";
import { StatusBadge } from "@/components/common/status-badge";
import { GroupCard, type GroupCardView } from "@/features/school/components/group-card";
import { weekdayLabel } from "@/features/school/schedule";
import type { MyRegistration } from "@/features/school/my-registrations";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate } from "@/lib/format";

/** `MyRegistration` -> what the shared card needs. No pricing: money is not in the product. */
function viewOfRegistration(item: MyRegistration): GroupCardView {
  return {
    groupName: item.groupName,
    subjectName: item.subjectName,
    subjectKey: item.subjectKey,
    subjectColor: item.subjectColor,
    contextLabel: [item.levelName, item.streamName].filter(Boolean).join(" · ") || null,
    teacherName: item.teacherName,
    teacherAvatarUrl: item.teacherAvatarUrl,
    schedules: item.schedules,
    maxStudents: item.maxStudents,
    unavailable: item.groupUnavailable,
  };
}

export function RegistrationCard({
  item,
  actions,
}: {
  item: MyRegistration;
  actions?: ReactNode | undefined;
}) {
  const { t, locale } = useI18n();

  return (
    <GroupCard
      view={viewOfRegistration(item)}
      locale={locale}
      badge={<StatusBadge status={item.status} />}
      meta={
        <div className="space-y-2">
          {/* Every slot, once the card has established which day is next. */}
          {item.schedules.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {item.schedules.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {weekdayLabel(s.weekday, t).slice(0, 3)}{" "}
                  {/* A time range is direction-neutral; isolate it so RTL keeps the order. */}
                  <span dir="ltr" style={{ unicodeBidi: "isolate" }} className="tabular-nums">
                    {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Asked for, then answered. */}
          <p className="text-[11px] text-muted-foreground">
            {t("myReg.submittedOn", { date: formatDate(item.createdAt, locale) })}
            {item.decidedAt
              ? ` · ${t("myReg.decidedOn", { date: formatDate(item.decidedAt, locale) })}`
              : ""}
          </p>

          {item.rejectionReason && (
            <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-destructive">{t("myReg.reasonLabel")} </span>
              {item.rejectionReason}
            </p>
          )}
        </div>
      }
      actions={actions}
    />
  );
}
