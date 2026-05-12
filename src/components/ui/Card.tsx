import { cn } from "@/lib/cn";

/**
 * Card primitive — three roles per ARCHITECTURE.md §7:
 *
 * - `default` — genuine secondary blocks (Pulse trend cards, expandable detail).
 * - `interactive` — clickable card-as-link in rare contexts (kept rare).
 * - `row` — hairline-rule list item, no rounded corners, no padded shell, no
 *   surface fill. Optional `rowAccent` draws a 1px left rule via `--row-accent-{tone}`.
 */

type CardVariant = "default" | "interactive" | "row";
type CardPadding = "none" | "sm" | "md" | "lg" | "row";

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: "div" | "section" | "article" | "li";
  /** Only meaningful when variant="row". Draws a 1px left-rule using semantic tone. */
  rowAccent?: "positive" | "negative" | null;
}

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6 sm:p-8",
  row: "py-3 px-3 sm:px-4",
};

const VARIANT: Record<CardVariant, string> = {
  default: "rounded-xl border border-border bg-surface",
  interactive: "rounded-xl border border-border bg-surface card-interactive",
  row: "border-b border-rule last:border-b-0",
};

const ROW_ACCENT: Record<NonNullable<CardProps["rowAccent"]>, string> = {
  positive: "shadow-[inset_1px_0_0_var(--row-accent-positive)]",
  negative: "shadow-[inset_1px_0_0_var(--row-accent-negative)]",
};

export function Card({
  variant = "default",
  padding,
  as = "div",
  className,
  rowAccent,
  children,
  ...rest
}: CardProps) {
  const Component = as;
  const resolvedPadding = padding ?? (variant === "row" ? "row" : "md");
  const accent = rowAccent && variant === "row" ? ROW_ACCENT[rowAccent] : "";
  return (
    <Component
      className={cn(
        VARIANT[variant],
        PADDING[resolvedPadding],
        accent,
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 mb-4", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-base font-medium tracking-tight text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </h2>
  );
}

export function CardDescription({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-foreground-muted", className)} {...rest}>
      {children}
    </p>
  );
}
