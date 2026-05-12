export { Card, CardHeader, CardTitle, CardDescription } from "./Card";
export { StatTile } from "./StatTile";
export { ManagerAvatar } from "./ManagerAvatar";
export { ScoreCell } from "./ScoreCell";
export { DataTable } from "./DataTable";
export type { DataTableColumn } from "./DataTable";
export { Sparkline } from "./Sparkline";
export { Kicker } from "./Kicker";
export { Pill } from "./Pill";
export { Kbd } from "./Kbd";
export { SectionHeader } from "./SectionHeader";
export { EmptyState } from "./EmptyState";
export { Skeleton } from "./Skeleton";
export { ScatterPlot } from "./ScatterPlot";
export type { ScatterPoint } from "./ScatterPlot";
export { StackedBar } from "./StackedBar";
export type { StackedBarSegment } from "./StackedBar";
export { PlayerImage } from "./PlayerImage";
export { AwardsPodium } from "./AwardsPodium";
export type { PodiumStep } from "./AwardsPodium";
export { BracketView } from "./BracketView";
export { Pagination } from "./Pagination";
export { ExpandableRow } from "./ExpandableRow";
// NOTE: MatchupReceipt and ManagerSeasonReceipts are server-only (they read
// from disk via @/lib/data). They must not be re-exported through this
// barrel — client components import @/components/ui for things like Card,
// and webpack would walk the barrel and pull node:fs into the client bundle.
// Import them directly from their files instead.
