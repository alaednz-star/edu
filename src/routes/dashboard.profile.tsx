import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { ErrorState } from "@/components/common/error-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { RequireAuth } from "@/features/auth/require-auth";
import { useMyProfile, useUpdateMyProfile } from "@/features/school/profiles";
import { authService } from "@/services/auth";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { initialsOf } from "@/lib/format";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "Mon profil — Madrasti" },
      { name: "description", content: "Vos informations personnelles et préférences." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>
  ),
});

function ProfilePage() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const { notifySuccess, notifyError } = useActionFeedback();
  const { data, isLoading, error, refetch, isFetching } = useMyProfile(user?.id);
  const update = useUpdateMyProfile(user?.id);

  const [form, setForm] = useState({ fullName: "", phone: "", avatarUrl: "" });
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      fullName: data.fullName,
      phone: data.phone ?? "",
      avatarUrl: data.avatarUrl ?? "",
    });
  }, [data]);

  const submit = () => {
    if (update.isPending) return;
    if (!form.fullName.trim()) {
      toast.error(t("profile.nameRequired"));
      return;
    }
    if (form.avatarUrl.trim() && !/^https?:\/\//i.test(form.avatarUrl.trim())) {
      toast.error(t("profile.avatarInvalid"));
      return;
    }
    update.mutate(
      {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        avatarUrl: form.avatarUrl.trim() || null,
      },
      {
        onSuccess: () => {
          notifySuccess("profile.saved");
          void refresh();
        },
        onError: (e) => notifyError(e),
      },
    );
  };

  const requestPasswordReset = async () => {
    if (!user?.email || sendingReset) return;
    setSendingReset(true);
    try {
      await authService.requestPasswordReset(
        user.email,
        `${window.location.origin}/reset-password`,
      );
      notifySuccess("profile.resetSent");
    } catch (e) {
      notifyError(e);
    } finally {
      setSendingReset(false);
    }
  };

  if (error) {
    return (
      <>
        <PageHeader title={t("profile.title")} description={t("profile.description")} />
        <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isFetching} />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title={t("profile.title")} description={t("profile.description")} />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("profile.title")}
        description={t("profile.description")}
        actions={
          <Button className="rounded-xl" onClick={submit} disabled={update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {update.isPending ? t("ui.saving") : t("entity.common.save")}
          </Button>
        }
      />

      <SectionCard title={t("profile.identityTitle")} description={t("profile.identityDesc")}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar className="size-20 shrink-0">
            {form.avatarUrl ? <AvatarImage src={form.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-primary-soft text-lg font-semibold text-primary">
              {initialsOf(form.fullName || user?.fullName || "?")}
            </AvatarFallback>
          </Avatar>

          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-name">{t("profile.fullName")}</Label>
              <Input
                id="p-name"
                className="h-11 rounded-xl"
                value={form.fullName}
                onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-phone">{t("profile.phone")}</Label>
              <Input
                id="p-phone"
                className="h-11 rounded-xl"
                placeholder="0X XX XX XX XX"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="p-avatar">{t("profile.avatarUrl")}</Label>
              <Input
                id="p-avatar"
                className="h-11 rounded-xl"
                placeholder="https://…"
                value={form.avatarUrl}
                onChange={(e) => setForm((p) => ({ ...p, avatarUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">{t("profile.avatarHint")}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("profile.accountTitle")} description={t("profile.accountDesc")}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <dt className="text-xs text-muted-foreground">{t("profile.email")}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium">{user?.email || "—"}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <dt className="text-xs text-muted-foreground">{t("profile.role")}</dt>
            <dd className="mt-0.5 text-sm font-medium">{user ? t(`role.${user.role}`) : "—"}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title={t("profile.securityTitle")} description={t("profile.securityDesc")}>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={requestPasswordReset}
          disabled={sendingReset || !user?.email}
        >
          {sendingReset ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <KeyRound className="size-4" aria-hidden />
          )}
          {sendingReset ? t("profile.sending") : t("profile.changePassword")}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">{t("profile.changePasswordHint")}</p>
      </SectionCard>

      <SectionCard title={t("profile.preferencesTitle")} description={t("profile.preferencesDesc")}>
        <div className="flex items-center gap-3">
          <Label className="text-sm">{t("profile.language")}</Label>
          <LanguageSwitcher />
        </div>
      </SectionCard>
    </>
  );
}
