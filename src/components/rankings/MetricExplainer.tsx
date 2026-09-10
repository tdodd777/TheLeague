import { BookOpen, ChevronDown } from "lucide-react";

import { Kicker } from "@/components/ui";

interface MetricExplainerProps {
  title: string;
  summary: string;
  bullets: ReadonlyArray<{ term: string; def: string }>;
}

/**
 * Methodology note for a rankings view. Collapsed by default: on a phone the
 * open version filled the first two screens before a single ranking showed.
 * Native <details>, so it works without JavaScript and remembers nothing.
 */
export function MetricExplainer({ title, summary, bullets }: MetricExplainerProps) {
  return (
    <details className="group rounded-xl border border-border bg-surface px-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2.5 [&::-webkit-details-marker]:hidden">
        <BookOpen size={14} strokeWidth={1.75} className="text-foreground-subtle" />
        <Kicker tone="muted">How to read {title}</Kicker>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className="ml-auto text-foreground-subtle transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="pb-3.5">
        <p className="text-sm text-foreground-muted leading-relaxed">{summary}</p>
        {bullets.length > 0 ? (
          <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
            {bullets.map((b) => (
              <li key={b.term} className="flex flex-col gap-0.5">
                <span className="text-foreground font-medium">{b.term}</span>
                <span className="text-foreground-muted">{b.def}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
