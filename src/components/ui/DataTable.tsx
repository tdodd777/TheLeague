import { cn } from "@/lib/cn";

/**
 * DataTable — terminal-precise tabular data, hairline-rule treatment.
 *
 * Phone-first contract: the DataTable is the *desktop* expression of tabular
 * data. On phones, the canonical view is a card-stack pattern owned by the
 * consumer (e.g. `StandingsMobileCard` in `src/app/standings/page.tsx`).
 * Wrap DataTable with `hidden lg:block` and render the card stack as the
 * default. Do NOT treat the card stack as a `sm:hidden` fallback.
 */

export interface DataTableColumn<Row> {
  key: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Hide on screens narrower than this Tailwind breakpoint. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
  headerClassName?: string;
  width?: string;
}

interface DataTableProps<Row> {
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  rowKey: (row: Row, index: number) => string | number;
  className?: string;
  caption?: string;
  /** Show subtle row hover (default true). */
  hoverable?: boolean;
  /**
   * Optional 1px left-rule on rows. Returning "positive" or "negative" draws
   * the rule using `--row-accent-{tone}`; `null` leaves the row plain.
   * Use sparingly — reserved for semantic state (playoff cutoff, demotion).
   */
  rowAccent?: (row: Row) => "positive" | "negative" | null;
}

const HIDE_CLASS: Record<NonNullable<DataTableColumn<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

const ALIGN: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  className,
  caption,
  hoverable = true,
  rowAccent,
}: DataTableProps<Row>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm border-y border-rule">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-rule">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "px-3 sm:px-4 h-9 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle",
                  col.align ? ALIGN[col.align] : "text-left",
                  col.hideBelow ? HIDE_CLASS[col.hideBelow] : "",
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const accent = rowAccent ? rowAccent(row) : null;
            const accentClass =
              accent === "positive"
                ? "shadow-[inset_1px_0_0_var(--row-accent-positive)]"
                : accent === "negative"
                  ? "shadow-[inset_1px_0_0_var(--row-accent-negative)]"
                  : "";
            return (
              <tr
                key={rowKey(row, i)}
                className={cn(
                  "border-b border-rule last:border-b-0",
                  hoverable ? "hover:bg-row-hover" : "",
                  accentClass,
                )}
                style={{ transitionDuration: "var(--motion-quick)" }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 sm:px-4 py-3 align-middle",
                      col.align ? ALIGN[col.align] : "text-left",
                      col.hideBelow ? HIDE_CLASS[col.hideBelow] : "",
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
