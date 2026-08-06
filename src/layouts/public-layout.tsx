import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Linkedin, Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Brand } from "@/components/common/brand";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { useI18n } from "@/hooks/use-i18n";

const publicLinks = [
  { labelKey: "nav.features", to: "/" },
  { labelKey: "nav.pricing", to: "/" },
  { labelKey: "nav.about", to: "/" },
] as const;

const socials = [
  { label: "Facebook", href: "https://facebook.com", icon: Facebook },
  { label: "Instagram", href: "https://instagram.com", icon: Instagram },
  { label: "LinkedIn", href: "https://linkedin.com", icon: Linkedin },
];

type FooterLink = {
  labelKey: string;
  label?: string;
  to?: "/" | "/login" | "/register";
  href?: string;
};

const footerColumns: { titleKey: string; links: FooterLink[] }[] = [
  {
    titleKey: "footer.column.product",
    links: [
      { labelKey: "footer.link.modules", href: "#features" },
      { labelKey: "footer.link.productPreview", href: "#produit" },
      { labelKey: "footer.link.createAccount", to: "/register" },
      { labelKey: "footer.link.login", to: "/login" },
    ],
  },
  {
    titleKey: "footer.column.features",
    links: [
      { labelKey: "footer.link.studentManagement", href: "#features" },
      { labelKey: "footer.link.teachersGroups", href: "#modules" },
      { labelKey: "footer.link.attendance", href: "#modules" },
      { labelKey: "footer.link.registrations", href: "#produit" },
    ],
  },
  {
    titleKey: "footer.column.support",
    links: [
      { labelKey: "footer.link.faq", href: "#faq" },
      { labelKey: "footer.link.startGuide", href: "#faq" },
      { labelKey: "footer.link.emailSupport", href: "mailto:support@madrasti.dz" },
    ],
  },
  {
    titleKey: "footer.column.legal",
    links: [
      { labelKey: "footer.link.privacyPolicy", href: "#" },
      { labelKey: "footer.link.terms", href: "#" },
      { labelKey: "footer.link.dataProtection", href: "#" },
    ],
  },
  {
    titleKey: "footer.column.contact",
    links: [
      { labelKey: "", label: "contact@madrasti.dz", href: "mailto:contact@madrasti.dz" },
      { labelKey: "", label: "support@madrasti.dz", href: "mailto:support@madrasti.dz" },
      { labelKey: "footer.location", href: "#" },
    ],
  },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header
        className={`sticky top-0 z-40 border-b transition-all duration-300 ${
          scrolled
            ? "border-border/70 bg-background/70 shadow-soft backdrop-blur-xl"
            : "border-transparent bg-background/40 backdrop-blur-sm"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="focus-ring rounded-xl">
            <Brand />
          </Link>

          <nav aria-label="Primary" className="ms-6 hidden items-center gap-1 lg:flex">
            {publicLinks.map((link) => (
              <Link
                key={link.labelKey}
                to={link.to}
                className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">{t("nav.login")}</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl">
              <Link to="/register">{t("nav.register")}</Link>
            </Button>

            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label={t("action.toggleSidebar")}
                >
                  <Menu className="size-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="sr-only">{t("brand.name")}</SheetTitle>
                <nav className="mt-10 flex flex-col gap-1">
                  {publicLinks.map((link) => (
                    <Link
                      key={link.labelKey}
                      to={link.to}
                      className="focus-ring rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {t(link.labelKey)}
                    </Link>
                  ))}
                  <Link
                    to="/login"
                    className="focus-ring rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted"
                  >
                    {t("nav.login")}
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.3fr_2fr]">
            <div className="max-w-xs">
              <Brand size="sm" />
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {t("brand.tagline")} {t("footer.tagline")}
              </p>
              <div className="mt-5 flex items-center gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="focus-ring grid size-9 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    <s.icon className="size-4" aria-hidden />
                  </a>
                ))}
              </div>
            </div>

            <div className="grid gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
              {footerColumns.map((column) => (
                <div key={column.titleKey}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                    {t(column.titleKey)}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {column.links.map((link) => {
                      const text = link.labelKey ? t(link.labelKey) : (link.label ?? "");
                      return (
                        <li key={link.labelKey || link.label}>
                          {link.to ? (
                            <Link
                              to={link.to}
                              className="focus-ring rounded text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {text}
                            </Link>
                          ) : (
                            <a
                              href={link.href ?? "#"}
                              className="focus-ring rounded text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {text}
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} {t("brand.name")} — {t("footer.location")}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{t("action.changeLanguage")}</span>
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
