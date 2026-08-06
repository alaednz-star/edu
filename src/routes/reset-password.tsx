import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthLayout } from "@/layouts/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services/auth";
import { useI18n } from "@/hooks/use-i18n";
import { useActionFeedback } from "@/hooks/use-action-feedback";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — Madrasti" },
      { name: "description", content: "Définissez un nouveau mot de passe pour votre compte." },
      { property: "og:title", content: "Nouveau mot de passe — Madrasti" },
      { property: "og:description", content: "Définissez un nouveau mot de passe Madrasti." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const { notifyError } = useActionFeedback();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordsMismatch"));
      return;
    }
    setLoading(true);
    try {
      await authService.updatePassword(password);
      toast.success(t("auth.passwordUpdated"));
      await navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      notifyError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.resetTitle")}
      subtitle={t("auth.resetSubtitle")}
      footer={
        <Link to="/login" className="focus-ring rounded font-medium text-primary">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.newPassword")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="h-11 rounded-xl"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="h-11 rounded-xl"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
          {t("auth.update")}
        </Button>
      </form>
    </AuthLayout>
  );
}
