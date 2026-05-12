import { cn } from "@/lib/cn";

type PillTone =
  | "neutral"
  | "positive"
  | "negative"
  | "accent"
  | "secondary"
  | "warning";

interface PillProps {
  children: React.ReactNode;
  tone?: PillTone;
  size?: "sm" | "md";
  className?: string;
}

const TONE: Record<PillTone, string> = {
  neutral: "bg-foreground/[0.04] text-foreground-muted ring-1 ring-inset ring-border",
  positive: "bg-positive/10 text-positive ring-1 ring-inset ring-positive/30",
  negative: "bg-negative/10 text-negative ring-1 ring-inset ring-negative/30",
  accent: "bg-accent-soft text-accent ring-1 ring-inset ring-accent/30",
  secondary: "bg-accent-secondary-soft text-accent-secondary ring-1 ring-inset ring-accent-secondary/30",
  warning: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/30",
};

const SIZE: Record<NonNullable<PillProps["size"]>, string> = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
};

export function Pill({
  children,
  tone = "neutral",
  size = "md",
  className,
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium tabular leading-tight uppercase tracking-wide",
        TONE[tone],
        SIZE[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
