import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAuth } from "@/features/auth/require-auth";
import { RegistrationCard } from "@/features/school/components/registration-card";
import { useStudentPortal } from "@/features/school/student-portal";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/dashboard/my-classes")({
  head: () => ({
    meta: [
      { title: "Mes cours — Madrasti" },
      { name: "description", content: "Les cours auxquels vous êtes inscrit." },
    ],
  }),
  component: () => (
    <RequireAuth roles={["student"]}>
      <MyClassesPage />
    </RequireAuth>
  ),
});

/** Answers exactly one question: which classes am I actually enrolled in? */
function MyClassesPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { enrolled, nextByGroup, isLoading, isFetching, error, refetch } = useStudentPortal(
    user?.id,
  );

  const header = (
    <PageHeader
      title={t("myClasses.title")}
      description={t("myClasses.description", { count: String(enrolled.length) })}
      actions={
        <Button asChild variant="outline" className="rounded-xl">
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
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  if (enrolled.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={GraduationCap}
          title={t("myClasses.emptyTitle")}
          description={t("myClasses.emptyBody")}
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
      <div className="grid gap-4 lg:grid-cols-2">
        {enrolled.map((item) => {
          const next = nextByGroup.get(item.groupId);
          return (
            <RegistrationCard
              key={item.id}
              item={item}
              actions={
                <p className="text-center text-xs text-muted-foreground">
                  {next
                    ? t("myClasses.nextLesson", {
                        date: formatDate(next.date, locale),
                        start: next.slot.startTime.slice(0, 5),
                        end: next.slot.endTime.slice(0, 5),
                      })
                    : t("myClasses.noNextLesson")}
                </p>
              }
            />
          );
        })}
      </div>
    </>
  );
}
