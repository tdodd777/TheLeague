import { cn } from "@/lib/cn";

interface KickerProps {
  children: React.ReactNode;
  tone?: "accent" | "muted";
  className?: string;
  as?: "span" | "div" | "p";
}

export function Kicker({
  children,
  tone = "accent",
  className,
  as = "span",
}: KickerProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "kicker",
        tone === "muted" ? "kicker-muted" : "",
        className,
      )}
    >
      {children}
    </Component>
  );
}
