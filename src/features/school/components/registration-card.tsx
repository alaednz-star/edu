import type { ReactNode } from "react";
import { CalendarClock, DoorClosed, GraduationCap, Timer, Users, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { PersonAvatar } from "@/features/profile/person-avatar";
import { weekdayLabel } from "@/features/school/schedule";
import { subjectColor } from "@/features/school/session/subject-tint";
import type { MyRegistration } from "@/features/school/my-registrations";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate, formatDzd } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One registration, rendered identically wherever it appears.
 *
 * Deliberately the same shape as a catalogue card in `/dashboard/registration`: subject
 * banner, the teacher's face across its lower edge, then the facts. A student who browsed
 * a class and then came here to check on it should recognise the same object, not meet a
 * second design for the same thing.
 *
 * `actions` is a slot rather than baked-in buttons because what a student can do depends
 * on status, and that decision belongs to the page: an approved registration offers the
 * timetable, a rejected one offers browsing again, a pending one can be withdrawn.
 */
export function RegistrationCard({
  item,
  actions,
}: {
  item: MyRegistration;
  actions?: ReactNode | undefined;
}) {
  const { t, locale } = useI18n();
  const accent = subjectColor(item.subjectColor, item.subjectKey);
  const unavailable = item.groupUnavailable;

  // A registration whose group RLS no longer shows us has no subject and no schedule --
  // a coloured banner would be inventing information. Grey it out and say so.
  const banner = unavailable
    ? "linear-gradient(120deg, var(--color-muted) 0%, var(--color-muted) 100%)"
    : `linear-gradient(120deg, ${accent} 0%, color-mix(in oklch, ${accent} 78%, white) 55%, color-mix(in oklch, ${accent} 62%, white) 100%)`;

  return (
    <article className="surface-card flex flex-col overflow-hidden p-0">
      <div className="relative h-[92px] overflow-hidden" style={{ background: banner }}>
        <GraduationCap
          aria-hidden
          className={cn(
            "pointer-events-none absolute -bottom-6 size-[106px] start-3",
            unavailable ? "text-foreground/10" : "text-white/20",
          )}
        />
        <div className="absolute top-3 end-3">
          <StatusBadge status={item.status} />
        </div>
        {!unavailable && (
          <span
            dir="ltr"
            style={{ unicodeBidi: "isolate" }}
            className="absolute bottom-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-foreground end-3"
          >
            <Wallet className="size-3" aria-hidden />
            {formatDzd(item.priceDzd, locale)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="-mt-9 flex items-end gap-3">
          <PersonAvatar
            name={item.teacherName}
            url={item.teacherAvatarUrl}
            accent={unavailable ? undefined : accent}
            ring
            className="size-[74px] shrink-0 bg-card text-lg"
          />
          <div className="min-w-0 pb-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("dash.registration.teacher")}
            </p>
            <p className="truncate text-[14.5px] font-semibold">
              {item.teacherName ?? t("dash.registration.noTeacher")}
            </p>
          </div>
        </div>

        <h3 className="mt-3 truncate text-lg font-semibold tracking-tight">
          {unavailable ? t("myReg.unavailableGroup") : item.groupName}
        </h3>
        <p
          className="truncate text-sm font-semibold"
          style={unavailable ? undefined : { color: accent }}
        >
          {unavailable ? (
            <span className="font-normal text-muted-foreground">{t("myReg.unavailableHint")}</span>
          ) : (
            <>
              {item.subjectName ?? "—"}
              <span className="text-muted-foreground">
                {" · "}
                {item.levelName ?? "—"}
                {item.streamName ? ` · ${item.streamName}` : ""}
              </span>
            </>
          )}
        </p>

        {!unavailable && (
          <>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <Fact icon={DoorClosed} accent={accent} label={t("group.room")}>
                {item.room ?? "—"}
              </Fact>
              <Fact icon={CalendarClock} accent={accent} label={t("dash.registration.schedule")}>
                {item.schedules.length === 0
                  ? "—"
                  : `${weekdayLabel(item.schedules[0]!.weekday, t).slice(0, 3)} ${item.schedules[0]!.startTime.slice(0, 5)}`}
                {item.schedules.length > 1 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    {t("dash.registration.moreSlots", { count: item.schedules.length - 1 })}
                  </span>
                ) : null}
              </Fact>
              <Fact icon={Timer} accent={accent} label={t("dash.registration.weekly")}>
                {item.schedules.length > 0
                  ? t("dash.registration.slotCount", { count: item.schedules.length })
                  : "—"}
              </Fact>
            </dl>

            {item.schedules.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {item.schedules.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    <CalendarClock className="size-3 shrink-0" aria-hidden />
                    {weekdayLabel(s.weekday, t).slice(0, 3)}{" "}
                    <span dir="ltr" style={{ unicodeBidi: "isolate" }} className="tabular-nums">
                      {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {/* The decision, in order: when it was asked for, and what came back. */}
        <p className="mt-3 text-xs text-muted-foreground">
          {t("myReg.submittedOn", { date: formatDate(item.createdAt, locale) })}
          {item.decidedAt
            ? ` · ${t("myReg.decidedOn", { date: formatDate(item.decidedAt, locale) })}`
            : ""}
        </p>

        {item.rejectionReason && (
          <p className="mt-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-destructive">{t("myReg.reasonLabel")} </span>
            {item.rejectionReason}
          </p>
        )}

        {actions && <footer className="mt-4 pt-1">{actions}</footer>}
      </div>
    </article>
  );
}

function Fact({
  icon: Icon,
  accent,
  label,
  children,
}: {
  icon: typeof Users;
  accent: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/50 px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3 shrink-0" style={{ color: accent }} aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 truncate text-xs font-semibold">{children}</dd>
    </div>
  );
}
