import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

interface BrandProps {
  className?: string | undefined;
  showWordmark?: boolean | undefined;
  size?: "sm" | "md" | undefined;
}

export function Brand({ className, showWordmark = true, size = "md" }: BrandProps) {
  const { t } = useI18n();

  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-xl bg-gradient-brand text-primary-foreground shadow-soft",
          size === "sm" ? "size-8" : "size-9",
        )}
      >
        <GraduationCap className={size === "sm" ? "size-4" : "size-5"} />
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[0.95rem] font-semibold tracking-tight">{t("brand.name")}</span>
          <span className="mt-1 text-[0.68rem] text-muted-foreground">SMS</span>
        </span>
      )}
    </span>
  );
}
