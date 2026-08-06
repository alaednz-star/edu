import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/features/auth/require-auth";
import { useDecideRegistration, useRegistrations } from "@/features/school/queries";
import type { RegistrationRow } from "@/features/school/types";
import { useI18n } from "@/hooks/use-i18n";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/registrations")({
  head: () => ({
    meta: [
      { title: "Inscriptions — Madrasti" },
      { name: "description", content: "Approuvez ou refusez les demandes d'inscription." },
      { property: "og:title", content: "Inscriptions — Madrasti" },
      { property: "og:description", content: "Approuvez ou refusez les demandes d'inscription." },
    ],
  }),
  component: () => (
    <RequireAuth roles={["admin"]}>
      <RegistrationsPage />
    </RequireAuth>
  ),
});

type Tab = "pending" | "approved" | "rejected" | "all";

const TAB_LABEL_KEYS: Record<Tab, string> = {
  pending: "entity.registrations.tabPending",
  approved: "entity.registrations.tabApproved",
  rejected: "entity.registrations.tabRejected",
  all: "entity.registrations.tabAll",
};

const TABS: Tab[] = ["pending", "approved", "rejected", "all"];

function RegistrationsPage() {
  const { t } = useI18n();
  const { notifySuccess, notifyError } = useActionFeedback();
  const { data = [], isLoading, error, refetch, isFetching } = useRegistrations();
  const decide = useDecideRegistration();
  const [tab, setTab] = useState<Tab>("pending");

  const act = async (id: string, status: "approved" | "rejected") => {
    if (decide.isPending) return;
    try {
      await decide.mutateAsync({ id, status });
      notifySuccess(
        status === "approved" ? "entity.registrations.approved" : "entity.registrations.rejected",
      );
    } catch (e) {
      notifyError(e);
    }
  };

  const bulkAct = async (
    rows: RegistrationRow[],
    status: "approved" | "rejected",
    clear: () => void,
  ) => {
    const targets = rows.filter((r) => r.status === "pending");
    if (targets.length === 0) {
      toast.error(t("entity.registrations.noPendingInSelection"));
      return;
    }

    // Await every decision before reporting. The previous version fired the
    // mutations and immediately claimed success, so a failed batch still showed
    // "N approved" while nothing had been saved.
    const results = await Promise.allSettled(
      targets.map((r) => decide.mutateAsync({ id: r.id, status })),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;

    if (succeeded > 0) {
      notifySuccess(
        status === "approved"
          ? "entity.registrations.bulkApproved"
          : "entity.registrations.bulkRejected",
        { count: succeeded },
      );
    }
    if (failed > 0) {
      const firstRejection = results.find((r) => r.status === "rejected");
      notifyError(
        firstRejection && firstRejection.status === "rejected"
          ? firstRejection.reason
          : new Error("bulk decision failed"),
      );
    }
    clear();
  };

  const counts = useMemo(
    () => ({
      pending: data.filter((r) => r.status === "pending").length,
      approved: data.filter((r) => r.status === "approved").length,
      rejected: data.filter((r) => r.status === "rejected").length,
      all: data.length,
    }),
    [data],
  );

  const rows = tab === "all" ? data : data.filter((r) => r.status === tab);

  const columns: Column<RegistrationRow>[] = [
    {
      key: "student",
      header: t("entity.registrations.columnStudent"),
      sortValue: (r) => r.studentName,
      cell: (r) => <span className="font-medium">{r.studentName}</span>,
    },
    {
      key: "group",
      header: t("entity.registrations.columnGroup"),
      sortValue: (r) => r.groupName,
      cell: (r) => r.groupName,
    },
    {
      key: "subject",
      header: t("entity.registrations.columnSubject"),
      cell: (r) => r.subjectName ?? "—",
    },
    {
      key: "level",
      header: t("entity.registrations.columnLevel"),
      cell: (r) => r.levelName ?? "—",
    },
    {
      key: "date",
      header: t("entity.registrations.columnRequestedAt"),
      sortValue: (r) => r.createdAt,
      cell: (r) => new Date(r.createdAt).toLocaleDateString("fr-FR"),
    },
    {
      key: "status",
      header: t("entity.registrations.columnStatus"),
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: t("entity.registrations.columnActions"),
      cell: (r) =>
        r.status === "pending" ? (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="rounded-xl"
              disabled={decide.isPending}
              onClick={() => void act(r.id, "approved")}
            >
              <Check className="size-3.5" aria-hidden /> {t("entity.registrations.approve")}
            </Button>
            <ConfirmDialog
              title={t("entity.registrations.rejectTitle")}
              description={t("entity.registrations.rejectDescription", { name: r.studentName })}
              confirmLabel={t("entity.registrations.reject")}
              onConfirm={() => act(r.id, "rejected")}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-destructive"
                  disabled={decide.isPending}
                >
                  <X className="size-3.5" aria-hidden /> {t("entity.registrations.reject")}
                </Button>
              }
            />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("entity.registrations.processed")}
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("entity.registrations.title")}
        description={t("entity.registrations.description", {
          pending: counts.pending,
          all: counts.all,
        })}
      />
      <DataTable
        rows={rows}
        columns={columns}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        rowKey={(r) => r.id}
        searchable={(r) => `${r.studentName} ${r.groupName} ${r.subjectName ?? ""}`}
        searchPlaceholder={t("entity.registrations.searchPlaceholder")}
        emptyTitle={t("entity.registrations.emptyTitle")}
        emptyDescription={t("entity.registrations.emptyDescription")}
        filters={
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/60 p-1">
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                  tab === value && "bg-card text-foreground shadow-sm",
                )}
              >
                {t(TAB_LABEL_KEYS[value])}
                <span className="ms-1.5 tabular-nums text-xs text-muted-foreground">
                  {counts[value]}
                </span>
              </button>
            ))}
          </div>
        }
        bulkActions={(selectedRows, clear) => (
          <>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={decide.isPending}
              onClick={() => void bulkAct(selectedRows, "approved", clear)}
            >
              <Check className="size-3.5" aria-hidden /> {t("entity.registrations.approve")}
            </Button>
            <ConfirmDialog
              title={t("entity.registrations.bulkRejectTitle")}
              description={t("entity.registrations.bulkRejectDescription", {
                count: selectedRows.filter((r) => r.status === "pending").length,
              })}
              confirmLabel={t("entity.registrations.reject")}
              onConfirm={() => bulkAct(selectedRows, "rejected", clear)}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-destructive"
                  disabled={decide.isPending}
                >
                  <X className="size-3.5" aria-hidden /> {t("entity.registrations.reject")}
                </Button>
              }
            />
          </>
        )}
      />
    </>
  );
}
