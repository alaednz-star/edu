import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

const tones: Record<string, string> = {
  active: "bg-success-soft text-success",
  inactive: "bg-muted text-muted-foreground",
  // Lifecycle states read at a glance: suspended is a warning (recoverable),
  // archived is neutral (deliberate, terminal) -- never red, since neither is
  // an error.
  suspended: "bg-accent-soft text-accent",
  archived: "bg-muted text-muted-foreground",
  pending: "bg-accent-soft text-accent",
  approved: "bg-success-soft text-success",
  rejected: "bg-destructive/10 text-destructive",
  present: "bg-success-soft text-success",
  absent: "bg-destructive/10 text-destructive",
  late: "bg-accent-soft text-accent",
  excused: "bg-primary-soft text-primary",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useI18n();
  const labelKey = `ui.status.${status}`;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        tones[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {t(labelKey) === labelKey ? status : t(labelKey)}
    </span>
  );
}
