import { cn } from "@/lib/cn";

import { Kicker } from "./Kicker";

interface SectionHeaderProps {
  kicker: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "md" | "lg";
  className?: string;
}

const TITLE_SIZE: Record<NonNullable<SectionHeaderProps["size"]>, string> = {
  md: "text-2xl sm:text-3xl",
  lg: "text-4xl sm:text-6xl",
};

export function SectionHeader({
  kicker,
  title,
  description,
  actions,
  size = "md",
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6",
        className,
      )}
    >
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <Kicker>{kicker}</Kicker>
        <h1
          className={cn(
            "font-display tracking-tight leading-[1.05] text-foreground",
            TITLE_SIZE[size],
          )}
        >
          {title}
        </h1>
        {description !== undefined ? (
          <p className="text-[15px] text-foreground-muted max-w-2xl mt-1 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {actions !== undefined ? (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
