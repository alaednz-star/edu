/**
 * ONE group card, for every surface that shows a group.
 *
 * There used to be two: `GroupCard` defined inside the catalogue route, and
 * `RegistrationCard` in this directory for "Mes inscriptions" and the confirmation page.
 * They rendered the same object with the same intent and had already drifted in banner
 * height, avatar size and spacing. Two implementations of one design is how a product
 * stops looking like one product, so this is the only one now and both pages adapt their
 * data into it rather than drawing their own.
 *
 * It is PRESENTATIONAL. It takes a view model, a badge and an action area; it fetches
 * nothing, decides no state, and knows nothing about enrolment rules. `blockedBy`
 * precedence, withdrawal, approval and the one-per-subject rule all stay where they were.
 *
 * NO PRICING. Money is not part of the product yet, so there is no price badge, no
 * currency icon and no price row. `groups.price_dzd` is untouched -- the admin group
 * detail screen still shows it, and `MyRegistration.priceDzd` still feeds the recurrence
 * adapter in `student-portal.ts`.
 *
 * Vertical order, top to bottom, and the reason it is this order: the banner names the
 * subject by colour before a word is read; the teacher is who a student actually chooses;
 * the group name identifies it; the three blocks answer where/when/how much time; capacity
 * sizes the class; and the action area comes last because it is the consequence of
 * everything above it, not the headline.
 */

import type { ReactNode } from "react";
import { CalendarClock, DoorClosed, GraduationCap, Timer, Users } from "lucide-react";
import { PersonAvatar } from "@/features/profile/person-avatar";
import { weekdayLabel, weeklyHours } from "@/features/school/schedule";
import { subjectColor } from "@/features/school/session/subject-tint";
import type { ScheduleSlot } from "@/features/school/types";
import { useI18n } from "@/hooks/use-i18n";
import { formatDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Everything the card draws. Both pages map their own row into this. */
export interface GroupCardView {
  groupName: string;
  subjectName: string | null;
  subjectKey: string | null;
  subjectColor: string | null;
  /** Level, plus stream when the group is restricted to one. Already joined for display. */
  contextLabel: string | null;
  teacherName: string | null;
  teacherAvatarUrl: string | null;
  schedules: ScheduleSlot[];
  maxStudents: number;
  /**
   * The group is no longer visible to this student -- RLS hides groups outside their
   * level, and an old registration can outlive that. The card then has no subject and no
   * schedule to show, so it says so instead of inventing a colour and three em dashes.
   */
  unavailable?: boolean | undefined;
}

export function GroupCard({
  view,
  locale,
  badge,
  meta,
  actions,
  onOpenDetails,
}: {
  view: GroupCardView;
  locale: string;
  /** Sits inside the banner. One or two short chips, never a paragraph. */
  badge?: ReactNode | undefined;
  /** State-specific detail between the capacity line and the action area. */
  meta?: ReactNode | undefined;
  /** The state/action area. Anchored to the bottom so cards in a row align. */
  actions?: ReactNode | undefined;
  /** When given, the title becomes a button that opens the details sheet. */
  onOpenDetails?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const accent = subjectColor(view.subjectColor, view.subjectKey);
  const unavailable = view.unavailable === true;
  const room = view.schedules.find((s) => s.room)?.room ?? null;
  const hours = weeklyHours(view.schedules);
  const first = view.schedules[0];

  const identity = (
    <>
      <h3 className="truncate text-[17px] font-semibold leading-snug tracking-tight">
        {unavailable ? t("myReg.unavailableGroup") : view.groupName}
      </h3>
      {unavailable ? (
        <p className="truncate text-sm text-muted-foreground">{t("myReg.unavailableHint")}</p>
      ) : (
        <p className="truncate text-sm font-semibold" style={{ color: accent }}>
          {view.subjectName ?? "—"}
          {view.contextLabel ? (
            <span className="font-normal text-muted-foreground"> · {view.contextLabel}</span>
          ) : null}
        </p>
      )}
    </>
  );

  return (
    <article
      className={cn(
        "surface-card flex h-full flex-col overflow-hidden p-0",
        "transition-[transform,box-shadow,border-color] duration-150 ease-out",
        "hover:-translate-y-0.5 hover:border-border hover:shadow-[0_14px_32px_rgba(18,33,29,.12)]",
      )}
    >
      {/*
        BANNER. A visual header, not an empty block: 120px on desktop, one gradient built
        from the subject's own colour through color-mix so it stays consistent with
        Ressources and Mes cours instead of becoming a second palette.
      */}
      <div
        className="relative h-[104px] shrink-0 overflow-hidden sm:h-[120px]"
        style={{
          background: unavailable
            ? "linear-gradient(120deg, var(--color-muted) 0%, var(--color-muted) 100%)"
            : `linear-gradient(120deg, ${accent} 0%, color-mix(in oklch, ${accent} 78%, white) 55%, color-mix(in oklch, ${accent} 62%, white) 100%)`,
        }}
      >
        {/* Decoration, large enough to read as texture rather than as an icon. `start-3`
            is logical, so it moves to the right-hand side under RTL. */}
        <GraduationCap
          aria-hidden
          className={cn(
            "pointer-events-none absolute -bottom-7 size-[124px] start-3",
            unavailable ? "text-foreground/10" : "text-white/20",
          )}
        />
        {badge ? (
          <div className="absolute top-3 flex flex-wrap items-center justify-end gap-1.5 end-3">
            {badge}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5">
        {/*
          The teacher crosses the boundary. 72px with a card-coloured border and a soft
          shadow, pulled up by exactly half its height so it is centred on the seam.
        */}
        <div className="-mt-9 flex items-end gap-3">
          <PersonAvatar
            name={view.teacherName}
            url={view.teacherAvatarUrl}
            accent={unavailable ? undefined : accent}
            ring
            className="size-[72px] shrink-0 bg-card text-lg"
          />
          <div className="min-w-0 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("dash.registration.teacher")}
            </p>
            <p className="truncate text-sm font-semibold">
              {view.teacherName ?? t("dash.registration.noTeacher")}
            </p>
          </div>
        </div>

        <div className="mt-2.5 min-w-0">
          {onOpenDetails ? (
            <button
              type="button"
              onClick={onOpenDetails}
              // `min-h-11` = the 44px tap floor. Tightening the title's type dropped this
              // block's natural height to 43px at 375px wide, which the measured touch-target
              // check caught. It is a real control, so it gets a real target.
              className="focus-ring block min-h-11 w-full min-w-0 rounded-lg text-start"
            >
              {identity}
            </button>
          ) : (
            identity
          )}
        </div>

        {!unavailable && (
          <>
            {/* Three equal metadata columns: where, when, how much time. */}
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <Fact icon={DoorClosed} accent={accent} label={t("group.room")}>
                {room ?? "—"}
              </Fact>
              <Fact icon={CalendarClock} accent={accent} label={t("dash.registration.schedule")}>
                {first ? (
                  <>
                    {weekdayLabel(first.weekday, t).slice(0, 3)}{" "}
                    {/*
                      ONE isolate around the whole "14:00 +1" run, not one per part.

                      Both halves are direction-neutral, so two adjacent isolates let RTL
                      reorder them against each other -- it rendered "114:00+". Isolating the
                      pair keeps them together and in order as a single left-to-right run,
                      positioned as a unit inside the Arabic line.
                    */}
                    <span dir="ltr" style={{ unicodeBidi: "isolate" }} className="tabular-nums">
                      {first.startTime.slice(0, 5)}
                      {view.schedules.length > 1 ? (
                        <span className="font-medium text-muted-foreground">
                          {" "}
                          {t("dash.registration.moreSlots", {
                            count: view.schedules.length - 1,
                          })}
                        </span>
                      ) : null}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </Fact>
              <Fact icon={Timer} accent={accent} label={t("dash.registration.weekly")}>
                {hours > 0
                  ? t("dash.registration.hoursPerWeek", { hours: formatDecimal(hours, locale) })
                  : "—"}
              </Fact>
            </dl>

            {/*
              CAPACITY, and capacity only.

              A student's `registrations` read is scoped to their own rows, so occupancy
              resolves to 0/N for them -- measured for nobody. The class SIZE is the honest
              version of the same fact and still says whether this is a class of 8 or 30.
              No ratio, no bar, no remaining-seats claim.
            */}
            <p className="mt-2.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Users className="size-3.5 shrink-0" style={{ color: accent }} aria-hidden />
              {t("dash.registration.groupSize", { count: view.maxStudents })}
            </p>
          </>
        )}

        {meta ? <div className="mt-2.5">{meta}</div> : null}

        {/*
          The action area follows the content immediately -- NOT `mt-auto`.

          `mt-auto` was the obvious choice and it was wrong: `h-full` stretches every card
          to its grid row, so in any row whose other card is taller, `mt-auto` opened ~80px
          of void between the capacity line and the button. Equal-height boxes are still
          worth having, so the slack now lands as extra padding under the action band, where
          it reads as breathing room instead of as a hole in the middle of the card.
        */}
        {actions ? <footer className="pt-3.5">{actions}</footer> : null}
      </div>
    </article>
  );
}

/**
 * The state/action area, shared by both pages.
 *
 * Deliberately subordinate to the content above it: a tinted panel, not a headline. Both
 * the catalogue and "Mes inscriptions" compose their states from this, so "en attente"
 * looks the same on both surfaces while each page keeps its OWN state logic and its own
 * links -- the catalogue sends an approved student to Mes cours, the registrations list
 * sends them to the timetable. Only the content differs, never the treatment.
 */
export function StatePanel({
  tone,
  icon: Icon,
  title,
  hint,
  action,
}: {
  tone: "success" | "pending" | "rejected" | "blocked" | "neutral";
  icon?: typeof Users | undefined;
  title: string;
  hint?: string | undefined;
  action?: ReactNode | undefined;
}) {
  const TONES = {
    success: "border-success/25 bg-success/5 text-success",
    pending: "border-border bg-muted/60 text-foreground",
    rejected: "border-destructive/25 bg-destructive/5 text-destructive",
    blocked: "border-accent/25 bg-accent/5 text-accent",
    neutral: "border-border bg-muted/60 text-muted-foreground",
  } as const;
  const [border, bg, text] = TONES[tone].split(" ");

  return (
    <div className={cn("rounded-xl border p-3", border, bg)}>
      <p className={cn("flex items-center gap-1.5 text-sm font-semibold", text)}>
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
        <span className="min-w-0">{title}</span>
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}

/** One metadata column: compact tinted panel, small icon, small caps label, strong value. */
export function Fact({
  icon: Icon,
  accent,
  label,
  children,
  className,
}: {
  icon: typeof Users;
  accent: string;
  label: string;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-muted/60 px-2.5 py-1.5", className)}>
      <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3 shrink-0" style={{ color: accent }} aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 truncate text-xs font-semibold">{children}</dd>
    </div>
  );
}
