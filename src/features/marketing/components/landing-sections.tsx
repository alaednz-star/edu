import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CloudUpload,
  Gauge,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Server,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useI18n } from "@/hooks/use-i18n";
import { Reveal } from "./reveal";
import {
  AttendanceMock,
  GroupsMock,
  OverviewMock,
  ScheduleMock,
  StudentsMock,
  TeachersMock,
} from "./mockups";

/* --------------------------------- helpers -------------------------------- */

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  align?: "center" | "start";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl text-start"}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle ? (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------ core features ------------------------------ */

const coreFeatures = [
  {
    icon: GraduationCap,
    titleKey: "landing.features.students.title",
    bodyKey: "landing.features.students.body",
    pointKeys: [
      "landing.features.students.point1",
      "landing.features.students.point2",
      "landing.features.students.point3",
    ],
  },
  {
    icon: Users,
    titleKey: "landing.features.teachers.title",
    bodyKey: "landing.features.teachers.body",
    pointKeys: [
      "landing.features.teachers.point1",
      "landing.features.teachers.point2",
      "landing.features.teachers.point3",
    ],
  },
  {
    icon: UserCheck,
    titleKey: "landing.features.attendance.title",
    bodyKey: "landing.features.attendance.body",
    pointKeys: [
      "landing.features.attendance.point1",
      "landing.features.attendance.point2",
      "landing.features.attendance.point3",
    ],
  },
  {
    icon: CalendarClock,
    titleKey: "landing.features.groups.title",
    bodyKey: "landing.features.groups.body",
    pointKeys: [
      "landing.features.groups.point1",
      "landing.features.groups.point2",
      "landing.features.groups.point3",
    ],
  },
];

export function CoreFeaturesSection() {
  const { t } = useI18n();
  return (
    <section id="features" className="relative border-y border-border/60 bg-muted/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow={t("landing.features.eyebrow")}
            title={t("landing.features.title")}
            subtitle={t("landing.features.subtitle")}
          />
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {coreFeatures.map((f, i) => (
            <Reveal key={f.titleKey} delay={i * 80}>
              <div className="group h-full rounded-3xl border border-border/70 bg-card p-7 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-card">
                <span className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary transition-colors duration-300 group-hover:bg-gradient-brand group-hover:text-primary-foreground">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{t(f.titleKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(f.bodyKey)}</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {f.pointKeys.map((p) => (
                    <li
                      key={p}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      <CheckCircle2 className="size-3 text-primary" aria-hidden />
                      {t(p)}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- product tour ------------------------------ */

const tourTabs = [
  {
    key: "overview",
    labelKey: "landing.tour.tab.overview",
    icon: LayoutDashboard,
    Mock: OverviewMock,
  },
  {
    key: "students",
    labelKey: "landing.tour.tab.students",
    icon: GraduationCap,
    Mock: StudentsMock,
  },
  { key: "teachers", labelKey: "landing.tour.tab.teachers", icon: Users, Mock: TeachersMock },
  {
    key: "attendance",
    labelKey: "landing.tour.tab.attendance",
    icon: UserCheck,
    Mock: AttendanceMock,
  },
  { key: "groups", labelKey: "landing.tour.tab.groups", icon: LayoutGrid, Mock: GroupsMock },
  {
    key: "schedule",
    labelKey: "landing.tour.tab.schedule",
    icon: CalendarClock,
    Mock: ScheduleMock,
  },
] as const;

export function ProductTourSection() {
  const { t } = useI18n();
  const [active, setActive] = useState<(typeof tourTabs)[number]["key"]>("overview");
  const current = tourTabs.find((t) => t.key === active) ?? tourTabs[0];
  const Mock = current.Mock;

  return (
    <section id="produit" className="relative overflow-hidden">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow={t("landing.tour.eyebrow")}
            title={t("landing.tour.title")}
            subtitle={t("landing.tour.subtitle")}
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {tourTabs.map((tab) => {
              const isActive = tab.key === active;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  aria-pressed={isActive}
                  className={`focus-ring inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
                    isActive
                      ? "border-primary/25 bg-primary text-primary-foreground shadow-soft"
                      : "border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:border-primary/25 hover:text-foreground"
                  }`}
                >
                  <tab.icon className="size-4" aria-hidden />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <div className="relative mx-auto mt-12 max-w-5xl">
            <div
              aria-hidden
              className="hero-glow pointer-events-none absolute -inset-10 opacity-50 blur-2xl"
            />
            <div key={active} className="relative animate-rise [&>div]:shadow-elevated">
              <Mock />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------- how it works ------------------------------ */

const steps = [
  { titleKey: "landing.how.step1.title", bodyKey: "landing.how.step1.body" },
  { titleKey: "landing.how.step2.title", bodyKey: "landing.how.step2.body" },
  { titleKey: "landing.how.step3.title", bodyKey: "landing.how.step3.body" },
  { titleKey: "landing.how.step4.title", bodyKey: "landing.how.step4.body" },
];

export function HowItWorksSection() {
  const { t } = useI18n();
  return (
    <section className="relative border-y border-border/60 bg-muted/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow={t("landing.how.eyebrow")}
            title={t("landing.how.title")}
            subtitle={t("landing.how.subtitle")}
          />
        </Reveal>

        <div className="relative mt-14">
          <div
            aria-hidden
            className="absolute inset-x-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent lg:block"
          />
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {steps.map((step, i) => (
              <Reveal key={step.titleKey} delay={i * 100} as="li">
                <div className="relative">
                  <span className="relative z-10 grid size-12 place-items-center rounded-2xl bg-gradient-brand text-base font-semibold text-primary-foreground shadow-glow">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-base font-semibold">{t(step.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(step.bodyKey)}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- security -------------------------------- */

const securityItems = [
  {
    titleKey: "landing.security.item1.title",
    bodyKey: "landing.security.item1.body",
    icon: KeyRound,
  },
  { titleKey: "landing.security.item2.title", bodyKey: "landing.security.item2.body", icon: Lock },
  {
    titleKey: "landing.security.item3.title",
    bodyKey: "landing.security.item3.body",
    icon: CloudUpload,
  },
  {
    titleKey: "landing.security.item4.title",
    bodyKey: "landing.security.item4.body",
    icon: Server,
  },
  { titleKey: "landing.security.item5.title", bodyKey: "landing.security.item5.body", icon: Gauge },
];

export function SecuritySection() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden bg-foreground text-background">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.07]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 start-1/2 h-80 w-[42rem] -translate-x-1/2 bg-gradient-brand opacity-25 blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-background/20 bg-background/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]">
              <ShieldCheck className="size-3.5" aria-hidden />
              {t("landing.security.eyebrow")}
            </p>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("landing.security.title")}
            </h2>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {securityItems.map((item, i) => (
            <Reveal key={item.titleKey} delay={i * 80}>
              <div className="h-full rounded-3xl border border-background/15 bg-background/[0.06] p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:bg-background/[0.1]">
                <span className="grid size-10 place-items-center rounded-xl bg-background/10">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-base font-semibold">{t(item.titleKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-background/70">{t(item.bodyKey)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- FAQ ----------------------------------- */

const faqs = [
  { qKey: "landing.faq.q1", aKey: "landing.faq.a1" },
  { qKey: "landing.faq.q2", aKey: "landing.faq.a2" },
  { qKey: "landing.faq.q3", aKey: "landing.faq.a3" },
  { qKey: "landing.faq.q4", aKey: "landing.faq.a4" },
  { qKey: "landing.faq.q5", aKey: "landing.faq.a5" },
];

export function FaqSection() {
  const { t } = useI18n();
  return (
    <section id="faq" className="relative">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <SectionHeading eyebrow={t("landing.faq.eyebrow")} title={t("landing.faq.title")} />
        </Reveal>

        <Reveal delay={80}>
          <Accordion type="single" collapsible className="mt-10 space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={faq.qKey}
                value={`item-${i}`}
                className="rounded-2xl border border-border/70 bg-card px-5 shadow-soft transition-colors duration-200 hover:border-primary/25"
              >
                <AccordionTrigger className="text-start text-sm font-medium hover:no-underline">
                  {t(faq.qKey)}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {t(faq.aKey)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- final CTA ------------------------------- */

const ctaPointKeys = [
  "landing.cta.point1",
  "landing.cta.point2",
  "landing.cta.point3",
  "landing.cta.point4",
];

export function FinalCtaSection() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden border-t border-border/60 bg-muted/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-brand px-6 py-14 shadow-elevated sm:px-12 sm:py-16">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 start-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-primary-foreground/20 blur-3xl"
            />
            <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-primary-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                  {t("landing.cta.title")}
                </h2>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/85">
                  {t("landing.cta.subtitle")}
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    variant="secondary"
                    className="h-12 rounded-xl px-7 transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <Link to="/register">
                      {t("landing.cta.primary")}
                      <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-xl border-primary-foreground/40 bg-transparent px-7 text-primary-foreground transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  >
                    <a href="#produit">{t("landing.cta.secondary")}</a>
                  </Button>
                </div>
              </div>

              <ul className="grid gap-3">
                {ctaPointKeys.map((point) => (
                  <li
                    key={point}
                    className="flex items-center gap-3 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3 text-sm text-primary-foreground backdrop-blur-sm"
                  >
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                    {t(point)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
