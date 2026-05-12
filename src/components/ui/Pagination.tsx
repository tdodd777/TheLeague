import Link from "next/link";

import { cn } from "@/lib/cn";

interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  totalPages: number;
  /** Build the href for a target page. */
  hrefFor: (page: number) => string;
  className?: string;
  /** Forward to next/link's `scroll` prop. Set false to preserve scroll position. */
  scroll?: boolean;
}

/**
 * Classic first / ±2 / last paginator with ellipses. Always shows page 1 and
 * the last page; never renders if there's only one page.
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  className,
  scroll = true,
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages: Array<number | "ellipsis-l" | "ellipsis-r"> = [];
  const window = 2;

  pages.push(1);
  if (page - window > 2) pages.push("ellipsis-l");
  for (
    let p = Math.max(2, page - window);
    p <= Math.min(totalPages - 1, page + window);
    p += 1
  ) {
    pages.push(p);
  }
  if (page + window < totalPages - 1) pages.push("ellipsis-r");
  if (totalPages > 1) pages.push(totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center gap-1 flex-wrap", className)}
    >
      <PageLink
        href={page > 1 ? hrefFor(page - 1) : null}
        label="←"
        aria="Previous page"
        scroll={scroll}
      />
      {pages.map((p, i) =>
        p === "ellipsis-l" || p === "ellipsis-r" ? (
          <span
            key={`${p}-${i}`}
            className="px-2 text-xs text-foreground-subtle"
            aria-hidden
          >
            …
          </span>
        ) : (
          <PageLink
            key={p}
            href={p === page ? null : hrefFor(p)}
            label={String(p)}
            aria={`Page ${p}`}
            current={p === page}
            scroll={scroll}
          />
        ),
      )}
      <PageLink
        href={page < totalPages ? hrefFor(page + 1) : null}
        label="→"
        aria="Next page"
        scroll={scroll}
      />
    </nav>
  );
}

function PageLink({
  href,
  label,
  aria,
  current = false,
  scroll = true,
}: {
  href: string | null;
  label: string;
  aria: string;
  current?: boolean;
  scroll?: boolean;
}) {
  const className = cn(
    "h-8 min-w-[2rem] px-2 inline-flex items-center justify-center rounded-md text-xs tabular border transition-colors",
    current
      ? "bg-foreground/[0.06] border-border-strong text-foreground font-medium"
      : href
        ? "border-border text-foreground-muted hover:text-foreground hover:border-border-strong"
        : "border-border/60 text-foreground-subtle/60 cursor-not-allowed",
  );
  if (!href) {
    return (
      <span className={className} aria-disabled aria-label={aria}>
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={className}
      aria-label={aria}
      aria-current={current ? "page" : undefined}
      scroll={scroll}
    >
      {label}
    </Link>
  );
}
