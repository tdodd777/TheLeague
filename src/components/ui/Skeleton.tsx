import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
}

/**
 * Hairline-aesthetic skeleton placeholder. No rounded shimmer block —
 * a 1px hairline-ruled stripe with a subtle pulse, matching the row
 * primitive used everywhere else (per ARCHITECTURE.md §7).
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      className={cn(
        "inline-block animate-pulse border-y border-rule",
        className,
      )}
      aria-hidden
    />
  );
}
