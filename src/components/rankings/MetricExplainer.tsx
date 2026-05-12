import { BookOpen } from "lucide-react";

import { Kicker } from "@/components/ui";

interface MetricExplainerProps {
  title: string;
  summary: string;
  bullets: ReadonlyArray<{ term: string; def: string }>;
}

export function MetricExplainer({ title, summary, bullets }: MetricExplainerProps) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen size={14} strokeWidth={1.75} className="text-foreground-subtle" />
        <Kicker tone="muted">How to read {title}</Kicker>
      </div>
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
  );
}
