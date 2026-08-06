import type { ReactNode } from "react";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  Filter,
  GraduationCap,
  LayoutGrid,
  MoreHorizontal,
  Search,
  Users,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

/* --------------------------- shared window chrome -------------------------- */

export function AppWindow({
  path,
  children,
  className = "",
}: {
  path: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`overflow-hidden rounded-2xl border border-border/80 bg-card/85 shadow-card backdrop-blur-xl ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-3.5 py-2.5">
        <span className="size-2 rounded-full bg-destructive/55" />
        <span className="size-2 rounded-full bg-accent/65" />
        <span className="size-2 rounded-full bg-success/55" />
        <div className="ms-2 flex flex-1 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-2 py-0.5">
          <Search className="size-2.5 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground">{path}</span>
        </div>
        <Bell className="size-3 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "success" | "accent" | "primary" | "muted";
  children: ReactNode;
}) {
  const tones = {
    success: "bg-success-soft text-success",
    accent: "bg-accent-soft text-accent-foreground",
    primary: "bg-primary-soft text-primary",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Avatar({ name, tone = "primary" }: { name: string; tone?: "primary" | "accent" }) {
  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${
        tone === "accent" ? "bg-accent-soft text-accent-foreground" : "bg-primary-soft text-primary"
      }`}
    >
      {name.replace(/\D/g, "").slice(-2) || name.charAt(0)}
    </span>
  );
}

/* --------------------------------- students -------------------------------- */

const studentRows = [
  {
    n: 1,
    levelKey: "landing.mock.level.3asSciences",
    groupKey: "landing.mock.group.a",
    stateKey: "landing.mock.state.active",
  },
  {
    n: 2,
    levelKey: "landing.mock.level.2asMaths",
    groupKey: "landing.mock.group.c",
    stateKey: "landing.mock.state.active",
  },
  {
    n: 3,
    levelKey: "landing.mock.level.4am",
    groupKey: "landing.mock.group.b",
    stateKey: "landing.mock.state.pending",
  },
  {
    n: 4,
    levelKey: "landing.mock.level.1asTroncCommun",
    groupKey: "landing.mock.group.d",
    stateKey: "landing.mock.state.active",
  },
  {
    n: 5,
    levelKey: "landing.mock.level.3asGestion",
    groupKey: "landing.mock.group.a",
    stateKey: "landing.mock.state.active",
  },
];

export function StudentsMock() {
  const { t } = useI18n();
  return (
    <AppWindow path="madrasti.app/dashboard/students">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-2 py-1.5">
            <Search className="size-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {t("landing.mock.searchStudent")}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1.5 text-[10px] text-muted-foreground">
            <Filter className="size-3" /> {t("landing.mock.filterLevel")}
          </span>
          <span className="rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-medium text-primary-foreground">
            {t("landing.mock.add")}
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border/70">
          <div className="grid grid-cols-[1.6fr_1.3fr_0.9fr_0.8fr] gap-2 border-b border-border/70 bg-muted/40 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{t("landing.mock.column.student")}</span>
            <span>{t("landing.mock.column.level")}</span>
            <span>{t("landing.mock.column.group")}</span>
            <span>{t("landing.mock.column.status")}</span>
          </div>
          {studentRows.map((r) => {
            const name = t("landing.mock.studentN", { n: String(r.n).padStart(2, "0") });
            const isActive = r.stateKey === "landing.mock.state.active";
            return (
              <div
                key={r.n}
                className="grid grid-cols-[1.6fr_1.3fr_0.9fr_0.8fr] items-center gap-2 border-b border-border/50 px-3 py-2 text-[10px] last:border-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={name} />
                  <span className="truncate font-medium">{name}</span>
                </span>
                <span className="truncate text-muted-foreground">{t(r.levelKey)}</span>
                <span className="truncate text-muted-foreground">{t(r.groupKey)}</span>
                <span>
                  <Pill tone={isActive ? "success" : "accent"}>{t(r.stateKey)}</Pill>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------- attendance -------------------------------- */

const attendanceRows = [
  { n: 1, stateKey: "landing.mock.state.present" },
  { n: 2, stateKey: "landing.mock.state.late" },
  { n: 3, stateKey: "landing.mock.state.present" },
  { n: 4, stateKey: "landing.mock.state.absent" },
];

const weekBars = [72, 88, 64, 95, 81, 58, 90];
const weekDayKeys = [
  "landing.mock.day.sun",
  "landing.mock.day.mon",
  "landing.mock.day.tue",
  "landing.mock.day.wed",
  "landing.mock.day.thu",
  "landing.mock.day.fri",
  "landing.mock.day.sat",
];

export function AttendanceMock({ animate = true }: { animate?: boolean }) {
  const { t } = useI18n();
  return (
    <AppWindow path="madrasti.app/dashboard/attendance">
      <div className="grid gap-3 p-4 sm:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border border-border/70 bg-background/60 p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-medium">{t("landing.mock.weeklyAttendance")}</p>
            <p className="text-[11px] font-semibold text-primary">95%</p>
          </div>
          <div className="mt-3 flex h-24 items-stretch gap-1.5">
            {weekBars.map((v, i) => (
              <div key={weekDayKeys[i]} className="flex h-full flex-1 flex-col items-center gap-1">
                <div className="flex min-h-0 w-full flex-1 items-end rounded-md bg-muted/60">
                  <div
                    className={`w-full rounded-md bg-gradient-brand ${animate ? "origin-bottom animate-grow" : ""}`}
                    style={{ height: `${v}%`, animationDelay: `${i * 80}ms` }}
                  />
                </div>
                <span className="text-[8px] text-muted-foreground">{t(weekDayKeys[i] ?? "")}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/60 p-3">
          <p className="text-[11px] font-medium">{t("landing.mock.session.maths3as")}</p>
          <ul className="mt-2.5 space-y-2">
            {attendanceRows.map((r) => {
              const name = t("landing.mock.studentN", { n: String(r.n).padStart(2, "0") });
              const isPresent = r.stateKey === "landing.mock.state.present";
              const isLate = r.stateKey === "landing.mock.state.late";
              return (
                <li key={r.n} className="flex items-center gap-2">
                  <Avatar name={name} />
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium">{name}</span>
                  <Pill tone={isPresent ? "success" : isLate ? "accent" : "muted"}>
                    {isPresent ? <CheckCircle2 className="size-2.5" /> : null}
                    {t(r.stateKey)}
                  </Pill>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </AppWindow>
  );
}

/* ---------------------------------- groups --------------------------------- */

const groups = [
  {
    nameKey: "landing.mock.group.maths3asA",
    teacherN: 1,
    filled: 18,
    cap: 20,
    slotKey: "landing.mock.slot.sun14",
  },
  {
    nameKey: "landing.mock.group.physique2asC",
    teacherN: 2,
    filled: 12,
    cap: 20,
    slotKey: "landing.mock.slot.mon16",
  },
  {
    nameKey: "landing.mock.group.anglais1asB",
    teacherN: 3,
    filled: 20,
    cap: 20,
    slotKey: "landing.mock.slot.wed18",
  },
];

export function GroupsMock() {
  const { t } = useI18n();
  return (
    <AppWindow path="madrasti.app/dashboard/groups">
      <div className="space-y-2.5 p-4">
        {groups.map((g) => {
          const pct = Math.round((g.filled / g.cap) * 100);
          const teacher = t("landing.mock.teacherN", { n: String(g.teacherN) });
          return (
            <div
              key={g.nameKey}
              className="rounded-xl border border-border/70 bg-background/60 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <LayoutGrid className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium">{t(g.nameKey)}</p>
                  <p className="truncate text-[9px] text-muted-foreground">
                    {teacher} · {t(g.slotKey)}
                  </p>
                </div>
                <Pill tone={pct >= 100 ? "accent" : "primary"}>
                  {g.filled}/{g.cap}
                </Pill>
                <MoreHorizontal className="size-3 text-muted-foreground" />
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-brand"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AppWindow>
  );
}

/* ------------------------------ registrations ------------------------------ */

const pending = [
  { n: 6, levelKey: "landing.mock.level.3asSciences", groupKey: "landing.mock.group.mathsA" },
  { n: 7, levelKey: "landing.mock.level.1as", groupKey: "landing.mock.group.physiqueD" },
  { n: 8, levelKey: "landing.mock.level.3asGestion", groupKey: "landing.mock.group.anglaisB" },
];

export function RegistrationsMock() {
  const { t } = useI18n();
  return (
    <AppWindow path="madrasti.app/dashboard/registrations">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium">{t("landing.mock.pendingTitle")}</p>
          <Pill tone="accent">{t("landing.mock.pendingBadge")}</Pill>
        </div>
        <ul className="mt-3 space-y-2">
          {pending.map((p) => {
            const name = t("landing.mock.studentN", { n: String(p.n).padStart(2, "0") });
            return (
              <li
                key={p.n}
                className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/60 p-2.5"
              >
                <Avatar name={name} tone="accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium">{name}</p>
                  <p className="truncate text-[9px] text-muted-foreground">
                    {t(p.levelKey)} · {t(p.groupKey)}
                  </p>
                </div>
                <span className="rounded-lg bg-primary px-2 py-1 text-[9px] font-medium text-primary-foreground">
                  {t("landing.mock.approve")}
                </span>
                <span className="rounded-lg border border-border px-2 py-1 text-[9px] text-muted-foreground">
                  {t("landing.mock.decline")}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </AppWindow>
  );
}

/* --------------------------------- schedule -------------------------------- */

const scheduleSlots = [
  { day: 0, start: 0, span: 2, labelKey: "landing.mock.slot.maths3as", tone: "primary" },
  { day: 1, start: 1, span: 2, labelKey: "landing.mock.slot.physique2as", tone: "accent" },
  { day: 2, start: 0, span: 1, labelKey: "landing.mock.slot.anglais1as", tone: "success" },
  { day: 3, start: 2, span: 2, labelKey: "landing.mock.slot.maths4am", tone: "primary" },
  { day: 4, start: 1, span: 1, labelKey: "landing.mock.slot.svt2as", tone: "success" },
];

const toneClass = {
  primary: "bg-primary-soft text-primary border-primary/20",
  accent: "bg-accent-soft text-accent-foreground border-accent/25",
  success: "bg-success-soft text-success border-success/20",
} as const;

const scheduleDayKeys = [
  "landing.mock.day.sun",
  "landing.mock.day.mon",
  "landing.mock.day.tue",
  "landing.mock.day.wed",
  "landing.mock.day.thu",
];

export function ScheduleMock() {
  const { t } = useI18n();
  return (
    <AppWindow path="madrasti.app/dashboard/schedule">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-3.5 text-primary" />
          <p className="text-[11px] font-medium">{t("landing.mock.weekOf")}</p>
          <span className="ms-auto text-[9px] text-muted-foreground">
            {t("landing.mock.weeklyView")}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {scheduleDayKeys.map((d) => (
            <span key={d} className="text-center text-[9px] font-medium text-muted-foreground">
              {t(d)}
            </span>
          ))}
        </div>
        <div className="relative mt-1.5">
          <div className="absolute inset-0 grid grid-cols-5 grid-rows-4 gap-1.5">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="rounded-md border border-dashed border-border/70" />
            ))}
          </div>
          <div
            className="relative grid grid-cols-5 gap-1.5"
            style={{ gridTemplateRows: "repeat(4, 2rem)" }}
          >
            {scheduleSlots.map((s) => (
              <div
                key={s.labelKey}
                className={`flex items-center justify-center rounded-md border px-1 text-center text-[8.5px] font-medium leading-tight ${
                  toneClass[s.tone as keyof typeof toneClass]
                }`}
                style={{
                  gridColumn: s.day + 1,
                  gridRow: `${s.start + 1} / span ${s.span}`,
                }}
              >
                {t(s.labelKey)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/* --------------------------------- teachers -------------------------------- */

const teachers = [
  { n: 1, subjectKey: "landing.mock.subject.maths", groups: 4, students: 78 },
  { n: 2, subjectKey: "landing.mock.subject.physique", groups: 3, students: 54 },
  { n: 3, subjectKey: "landing.mock.subject.anglais", groups: 2, students: 41 },
];

export function TeachersMock() {
  const { t } = useI18n();
  return (
    <AppWindow path="madrasti.app/dashboard/teachers">
      <div className="space-y-2.5 p-4">
        {teachers.map((tch) => {
          const name = t("landing.mock.teacherN", { n: String(tch.n) });
          return (
            <div
              key={tch.n}
              className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/60 p-3"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-brand text-[10px] font-semibold text-primary-foreground">
                {name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium">{name}</p>
                <p className="truncate text-[9px] text-muted-foreground">{t(tch.subjectKey)}</p>
              </div>
              <Pill tone="primary">
                <LayoutGrid className="size-2.5" />
                {t("landing.mock.groupsCount", { n: String(tch.groups) })}
              </Pill>
              <Pill tone="muted">
                <Users className="size-2.5" />
                {tch.students}
              </Pill>
            </div>
          );
        })}
      </div>
    </AppWindow>
  );
}

/* ------------------------------ overview (hero) ---------------------------- */

const overviewStats = [
  { labelKey: "landing.mock.stat.students", value: "512", delta: "+18", icon: GraduationCap },
  { labelKey: "landing.mock.stat.teachers", value: "41", delta: "+3", icon: Users },
  { labelKey: "landing.mock.stat.groups", value: "25", delta: "+2", icon: LayoutGrid },
];

const todayClasses = [
  { time: "14:00", subjectKey: "landing.mock.subject.maths", groupKey: "landing.mock.group.3asA" },
  {
    time: "16:00",
    subjectKey: "landing.mock.subject.physique",
    groupKey: "landing.mock.group.2asC",
  },
  {
    time: "18:00",
    subjectKey: "landing.mock.subject.anglais",
    groupKey: "landing.mock.group.1asB",
  },
];

const recentRegistrations = [
  { n: 6, levelKey: "landing.mock.level.3asSciences", stateKey: "landing.mock.state.pending" },
  { n: 7, levelKey: "landing.mock.level.2asMaths", stateKey: "landing.mock.state.approved" },
  { n: 8, levelKey: "landing.mock.level.4am", stateKey: "landing.mock.state.approved" },
];

export function OverviewMock() {
  const { t } = useI18n();
  return (
    <AppWindow path="madrasti.app/dashboard" className="shadow-elevated">
      <div className="grid gap-3.5 p-4 sm:grid-cols-[1fr_1.35fr] sm:p-5">
        <div className="space-y-3">
          {overviewStats.map((s) => (
            <div
              key={s.labelKey}
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <s.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t(s.labelKey)}
                </p>
                <p className="text-lg font-semibold leading-tight">{s.value}</p>
              </div>
              <span className="ms-auto rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">
                {s.delta}
              </span>
            </div>
          ))}

          <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 text-primary" />
              <p className="text-xs font-medium">{t("landing.mock.todayClasses")}</p>
            </div>
            <ul className="mt-2.5 space-y-2.5">
              {todayClasses.map((c) => (
                <li key={c.time} className="flex items-center gap-2.5">
                  <span className="shrink-0 rounded-lg bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-primary">
                    {c.time}
                  </span>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-[11px] font-medium">{t(c.subjectKey)}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{t(c.groupKey)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-3.5">
          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium">{t("landing.mock.weeklyAttendance")}</p>
              <p className="text-xs font-semibold text-primary">95%</p>
            </div>
            <div className="mt-4 flex h-32 items-stretch gap-2">
              {weekBars.map((v, i) => (
                <div
                  key={weekDayKeys[i]}
                  className="flex h-full flex-1 flex-col items-center gap-1.5"
                >
                  <div className="flex min-h-0 w-full flex-1 items-end rounded-md bg-muted/60">
                    <div
                      className="w-full origin-bottom animate-grow rounded-md bg-gradient-brand"
                      style={{ height: `${v}%`, animationDelay: `${300 + i * 90}ms` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {t(weekDayKeys[i] ?? "")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
            <div className="flex items-center gap-2">
              <Users className="size-3.5 text-primary" />
              <p className="text-xs font-medium">{t("landing.mock.recentRegistrations")}</p>
            </div>
            <ul className="mt-3 space-y-2.5">
              {recentRegistrations.map((r) => {
                const name = t("landing.mock.studentN", { n: String(r.n).padStart(2, "0") });
                const isApproved = r.stateKey === "landing.mock.state.approved";
                return (
                  <li key={r.n} className="flex items-center gap-2.5">
                    <Avatar name={name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium">{name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{t(r.levelKey)}</p>
                    </div>
                    <Pill tone={isApproved ? "success" : "accent"}>
                      {isApproved ? <CheckCircle2 className="size-2.5" /> : null}
                      {t(r.stateKey)}
                    </Pill>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------- mobile phone ------------------------------ */

const phoneRows = [
  { n: 1, stateKey: "landing.mock.state.present" },
  { n: 2, stateKey: "landing.mock.state.present" },
  { n: 3, stateKey: "landing.mock.state.late" },
  { n: 4, stateKey: "landing.mock.state.absent" },
  { n: 5, stateKey: "landing.mock.state.present" },
];

export function PhoneMock() {
  const { t } = useI18n();
  return (
    <div
      aria-hidden
      className="mx-auto w-[220px] rounded-[2rem] border border-border/80 bg-card p-2 shadow-elevated"
    >
      <div className="overflow-hidden rounded-[1.6rem] border border-border/60 bg-background">
        <div className="flex items-center justify-between bg-muted/40 px-4 py-2 text-[9px] text-muted-foreground">
          <span>14:00</span>
          <span className="h-1.5 w-10 rounded-full bg-border" />
          <span>●●●</span>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-semibold">{t("landing.mock.callTitle")}</p>
          <p className="text-[9px] text-muted-foreground">{t("landing.mock.callSubtitle")}</p>
          <ul className="mt-3 space-y-1.5">
            {phoneRows.map((r) => {
              const name = t("landing.mock.studentN", { n: String(r.n).padStart(2, "0") });
              const isPresent = r.stateKey === "landing.mock.state.present";
              const isLate = r.stateKey === "landing.mock.state.late";
              return (
                <li
                  key={r.n}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium">{name}</span>
                  <Pill tone={isPresent ? "success" : isLate ? "accent" : "muted"}>
                    {t(r.stateKey)}
                  </Pill>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 rounded-lg bg-primary py-1.5 text-center text-[10px] font-medium text-primary-foreground">
            {t("landing.mock.saveCall")}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TabletMock() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-md rounded-[1.5rem] border border-border/80 bg-card p-2 shadow-elevated"
    >
      <div className="overflow-hidden rounded-[1.1rem] border border-border/60">
        <GroupsMock />
      </div>
    </div>
  );
}
