import { cn } from "@/lib/cn";

/**
 * Card primitive — three roles per DESIGN.md:
 *
 * - `default` — genuine secondary blocks (Pulse trend cards, expandable detail).
 * - `interactive` — clickable card-as-link in rare contexts (kept rare).
 * - `row` — hairline-rule list item, no rounded corners, no padded shell, no
 *   surface fill. Optional `rowAccent` draws a 1px left rule via `--row-accent-{tone}`.
 *
 * The `elevated` variant was removed in P3 as dead code. The `CardHeader` /
 * `CardTitle` / `CardDescription` subcomponents were removed for the same
 * reason: nothing consumed them. Card headings are composed inline with
 * `SectionHeader` or a display-italic heading.
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
