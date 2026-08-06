import type { ReactNode } from "react";
import { CalendarClock, DoorClosed, GraduationCap, Tag, UserSquare2 } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { weekdayLabel } from "@/features/school/schedule";
import type { MyRegistration } from "@/features/school/my-registrations";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate } from "@/lib/format";

/**
 * One registration, rendered identically wherever it appears.
 *
 * `actions` is a slot rather than baked-in buttons because what a student can
 * do depends on status, and that decision belongs to the page: an approved
 * registration offers the timetable, a rejected one offers browsing again, a
 * pending one offers nothing.
 */
export function RegistrationCard({
  item,
  actions,
}: {
  item: MyRegistration;
  actions?: ReactNode | undefined;
}) {
  const { t, locale } = useI18n();

  return (
    <article className="surface-card flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">
            {item.groupUnavailable ? t("myReg.unavailableGroup") : item.groupName}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.groupUnavailable ? t("myReg.unavailableHint") : (item.subjectName ?? "—")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={item.status} />
          <span
            className="size-9 rounded-xl"
            style={{ backgroundColor: item.subjectColor ?? "#0F766E" }}
            aria-hidden
          />
        </div>
      </header>

      <dl className="grid gap-2.5 text-xs sm:grid-cols-2">
        <Meta icon={UserSquare2} label={t("dash.registration.teacher")}>
          {item.teacherName ?? t("dash.registration.noTeacher")}
        </Meta>
        <Meta icon={GraduationCap} label={t("dash.registration.level")}>
          {item.levelName ?? "—"}
          {item.streamName ? ` · ${item.streamName}` : ""}
        </Meta>
        <Meta icon={DoorClosed} label={t("group.room")}>
          {item.room ?? t("dash.section.noRoom")}
        </Meta>
      </dl>

      {item.schedules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.schedules.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            >
              <CalendarClock className="size-3" aria-hidden />
              {weekdayLabel(s.weekday, t).slice(0, 3)} {s.startTime.slice(0, 5)}–
              {s.endTime.slice(0, 5)}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t("myReg.submittedOn", { date: formatDate(item.createdAt, locale) })}
      </p>

      {actions && <footer className="mt-auto">{actions}</footer>}
    </article>
  );
}

function Meta({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Tag;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="truncate font-medium">{children}</dd>
      </div>
    </div>
  );
}
