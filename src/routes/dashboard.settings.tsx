import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { ErrorState } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/features/auth/require-auth";
import { useCenterSettings, useSaveSettings } from "@/features/school/queries";
import { useI18n } from "@/hooks/use-i18n";
import { useActionFeedback } from "@/hooks/use-action-feedback";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Paramètres — Madrasti" },
      { name: "description", content: "Nom du centre, logo, langue et année scolaire." },
      { property: "og:title", content: "Paramètres — Madrasti" },
      { property: "og:description", content: "Nom du centre, logo, langue et année scolaire." },
    ],
  }),
  component: () => (
    <RequireAuth roles={["admin"]}>
      <SettingsPage />
    </RequireAuth>
  ),
});

function SettingsPage() {
  const { t } = useI18n();
  const { notifySuccess, notifyError } = useActionFeedback();
  const { data, isLoading, error, refetch, isFetching } = useCenterSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState({
    schoolName: "",
    academicYear: "",
    defaultLanguage: "fr",
    phone: "",
    address: "",
    logoUrl: "",
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      schoolName: data.school_name,
      academicYear: data.academic_year,
      defaultLanguage: data.default_language,
      phone: data.phone ?? "",
      address: data.address ?? "",
      logoUrl: data.logo_url ?? "",
    });
  }, [data]);

  const submit = () => {
    if (save.isPending) return;
    if (!form.schoolName.trim()) {
      toast.error(t("dash.settings.schoolNameRequired"));
      return;
    }
    if (form.logoUrl.trim() && !/^https?:\/\//i.test(form.logoUrl.trim())) {
      toast.error(t("dash.settings.logoUrlInvalid"));
      return;
    }
    save.mutate(
      {
        schoolName: form.schoolName.trim(),
        academicYear: form.academicYear.trim(),
        defaultLanguage: form.defaultLanguage,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
      },
      {
        onSuccess: () => notifySuccess("dash.settings.saved"),
        onError: (e) => notifyError(e),
      },
    );
  };

  const field = (key: keyof typeof form, label: string, hint?: string, placeholder?: string) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        className="h-11 rounded-xl"
        placeholder={placeholder ?? ""}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  if (error) {
    return (
      <>
        <PageHeader title={t("dash.settings.title")} description={t("dash.settings.description")} />
        <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isFetching} />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title={t("dash.settings.title")} description={t("dash.settings.description")} />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("dash.settings.title")}
        description={t("dash.settings.description")}
        actions={
          <Button className="rounded-xl" onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {save.isPending ? t("dash.settings.saving") : t("dash.settings.save")}
          </Button>
        }
      />

      <SectionCard
        title={t("dash.settings.identityTitle")}
        description={t("dash.settings.identityDesc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "schoolName",
            t("dash.settings.schoolName"),
            t("dash.settings.schoolNameHint"),
            "Madrasti",
          )}
          {field(
            "academicYear",
            t("dash.settings.academicYear"),
            t("dash.settings.academicYearHint"),
            "2025/2026",
          )}
          <div className="sm:col-span-2">
            {field(
              "logoUrl",
              t("dash.settings.logoUrl"),
              t("dash.settings.logoUrlHint"),
              "https://…",
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("dash.settings.contactTitle")}
        description={t("dash.settings.contactDesc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field("phone", t("dash.settings.phone"), undefined, "0X XX XX XX XX")}
          {field("address", t("dash.settings.address"), undefined, "Rue, ville, wilaya")}
        </div>
      </SectionCard>

      <SectionCard
        title={t("dash.settings.preferencesTitle")}
        description={t("dash.settings.preferencesDesc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="defaultLanguage">{t("dash.settings.defaultLanguage")}</Label>
            <Select
              value={form.defaultLanguage}
              onValueChange={(value) => setForm((p) => ({ ...p, defaultLanguage: value }))}
            >
              <SelectTrigger id="defaultLanguage" className="h-11 rounded-xl">
                <SelectValue placeholder={t("dash.settings.chooseLanguage")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">{t("dash.settings.langFr")}</SelectItem>
                <SelectItem value="ar">{t("dash.settings.langAr")}</SelectItem>
                <SelectItem value="en">{t("dash.settings.langEn")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("dash.settings.rtlHint")}</p>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
