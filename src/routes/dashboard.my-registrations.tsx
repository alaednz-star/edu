import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAuth } from "@/features/auth/require-auth";
import { RegistrationCard } from "@/features/school/components/registration-card";
import { useMyRegistrationCards } from "@/features/school/my-registrations";
import type { RegistrationStatus } from "@/features/school/types";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/my-registrations")({
  head: () => ({
    meta: [
      { title: "Mes inscriptions — Madrasti" },
      { name: "description", content: "Suivez l'état de vos demandes d'inscription." },
    ],
  }),
  component: () => (
    <RequireAuth roles={["student"]}>
      <MyRegistrationsPage />
    </RequireAuth>
  ),
});

type Tab = "all" | RegistrationStatus;
const TABS: Tab[] = ["all", "pending", "approved", "rejected"];

const TAB_LABEL_KEYS: Record<Tab, string> = {
  all: "myReg.tabAll",
  pending: "myReg.tabPending",
  approved: "myReg.tabApproved",
  rejected: "myReg.tabRejected",
};

function MyRegistrationsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { items, isLoading, isFetching, error, refetch } = useMyRegistrationCards(user?.id);
  const [tab, setTab] = useState<Tab>("all");

  const counts = useMemo(
    () => ({
      all: items.length,
      pending: items.filter((i) => i.status === "pending").length,
      approved: items.filter((i) => i.status === "approved").length,
      rejected: items.filter((i) => i.status === "rejected").length,
    }),
    [items],
  );

  const visible = tab === "all" ? items : items.filter((i) => i.status === tab);

  const header = (
    <PageHeader
      title={t("myReg.title")}
      description={t("myReg.description", { count: String(items.length) })}
      actions={
        <Button asChild className="rounded-xl">
          <Link to="/dashboard/registration">
            <Search className="size-4" aria-hidden />
            {t("myReg.browse")}
          </Link>
        </Button>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState error={error} onRetry={refetch} isRetrying={isFetching} />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        {header}
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={ClipboardList}
          title={t("myReg.emptyTitle")}
          description={t("myReg.emptyBody")}
          action={
            <Button asChild className="mt-2 rounded-xl">
              <Link to="/dashboard/registration">{t("myReg.browse")}</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}

      <div
        role="tablist"
        aria-label={t("myReg.filterAria")}
        className="flex flex-wrap gap-1.5 rounded-xl bg-muted/60 p-1"
      >
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
              tab === value && "bg-card text-foreground shadow-sm",
            )}
          >
            {t(TAB_LABEL_KEYS[value])}
            <span className="ms-1.5 text-xs tabular-nums opacity-70">{counts[value]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t("myReg.noneInTabTitle")}
          description={t("myReg.noneInTabBody")}
          className="border-none shadow-none"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((item) => (
            <RegistrationCard
              key={item.id}
              item={item}
              actions={<CardActions status={item.status} />}
            />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * What the student can do next, by status.
 *
 * A pending request deliberately offers no action -- there is nothing useful to
 * click while the administration reviews it, and a dead button would be worse
 * than none.
 */
function CardActions({ status }: { status: RegistrationStatus }) {
  const { t } = useI18n();

  if (status === "approved") {
    return (
      <Button asChild variant="outline" className="w-full rounded-xl">
        <Link to="/dashboard/schedule">
          <CalendarDays className="size-4" aria-hidden />
          {t("myReg.openSchedule")}
        </Link>
      </Button>
    );
  }

  if (status === "rejected") {
    return (
      <Button asChild variant="outline" className="w-full rounded-xl">
        <Link to="/dashboard/registration">
          <Search className="size-4" aria-hidden />
          {t("myReg.registerAnother")}
        </Link>
      </Button>
    );
  }

  return <p className="text-center text-xs text-muted-foreground">{t("myReg.pendingHint")}</p>;
}
