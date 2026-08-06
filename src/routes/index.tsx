import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Languages, PlayCircle, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { PublicLayout } from "@/layouts/public-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/use-i18n";
import { HeroShowcase } from "@/features/marketing/components/hero-showcase";
import {
  CoreFeaturesSection,
  FaqSection,
  FinalCtaSection,
  HowItWorksSection,
  ProductTourSection,
  SecuritySection,
} from "@/features/marketing/components/landing-sections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Madrasti — Gestion premium pour centres de soutien" },
      {
        name: "description",
        content:
          "Plateforme bilingue (arabe/français) de gestion pour centres de soutien scolaire en Algérie : élèves, enseignants, groupes, inscriptions et présences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Madrasti — Gestion premium pour centres de soutien" },
      {
        property: "og:description",
        content:
          "Élèves, enseignants, groupes, inscriptions et présences réunis dans une seule plateforme pensée pour l'Algérie.",
      },
    ],
  }),
  component: LandingPage,
});

const heroSignals = [
  { icon: ShieldCheck, labelKey: "landing.hero.signal.roles" },
  { icon: Languages, labelKey: "landing.hero.signal.bilingual" },
  { icon: Smartphone, labelKey: "landing.hero.signal.devices" },
];

function LandingPage() {
  const { t } = useI18n();

  return (
    <PublicLayout>
      {/* ---------------------------------- Hero --------------------------------- */}
      <section className="relative overflow-hidden pb-14 sm:pb-20">
        <div
          aria-hidden
          className="grid-backdrop pointer-events-none absolute inset-0 opacity-60"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-48 h-[560px] bg-gradient-brand opacity-[0.08] blur-3xl"
        />

        <div className="relative mx-auto w-full max-w-4xl px-4 pt-14 text-center sm:px-6 sm:pt-20 lg:px-8">
          <div className="animate-rise">
            <Badge
              variant="secondary"
              className="rounded-full border-border bg-primary-soft px-3 py-1 text-primary"
            >
              <Sparkles className="me-1.5 size-3.5" aria-hidden />
              {t("brand.tagline")}
            </Badge>
          </div>

          <h1
            className="animate-rise mx-auto mt-6 max-w-3xl text-[2.4rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.75rem]"
            style={{ animationDelay: "60ms" }}
          >
            {t("landing.hero.titlePart1")}
            <span className="text-gradient-brand">{t("landing.hero.titleHighlight")}</span>
            {t("landing.hero.titlePart2")}
          </h1>

          <p
            className="animate-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            {t("landing.hero.subtitle")}
          </p>

          <div
            className="animate-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: "180ms" }}
          >
            <Button
              asChild
              size="lg"
              className="h-12 w-full rounded-xl px-8 text-base shadow-glow transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 sm:w-auto"
            >
              <Link to="/register">
                {t("action.getStarted")}
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 w-full rounded-xl border-border px-7 text-base transition-colors hover:border-primary/30 hover:bg-primary-soft/50 sm:w-auto"
            >
              <a href="#produit">
                <PlayCircle className="size-4" aria-hidden />
                {t("landing.hero.demoCta")}
              </a>
            </Button>
          </div>

          <div
            className="animate-rise mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
            style={{ animationDelay: "220ms" }}
          >
            {heroSignals.map((signal) => (
              <span key={signal.labelKey} className="inline-flex items-center gap-1.5">
                <signal.icon className="size-3.5 text-primary" aria-hidden />
                {t(signal.labelKey)}
              </span>
            ))}
          </div>
        </div>

        <div
          className="animate-rise relative mx-auto mt-14 w-full max-w-7xl px-8 sm:mt-16 sm:px-12 lg:px-20"
          style={{ animationDelay: "300ms" }}
        >
          <HeroShowcase />
          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("landing.hero.previewCaption")}
          </p>
        </div>
      </section>

      <CoreFeaturesSection />
      <ProductTourSection />
      <HowItWorksSection />
      <SecuritySection />
      <FaqSection />
      <FinalCtaSection />
    </PublicLayout>
  );
}
