import { cn } from "@/lib/cn";

interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center px-1.5 rounded border border-border bg-foreground/5 font-mono text-[10px] text-foreground-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
