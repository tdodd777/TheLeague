import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface px-6 py-12 flex flex-col items-center text-center gap-3",
        className,
      )}
    >
      {icon ? (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground/[0.04] text-foreground-subtle">
          {icon}
        </span>
      ) : null}
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {description ? (
        <p className="text-sm text-foreground-muted max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
