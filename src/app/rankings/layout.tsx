import { RankingTabs } from "./RankingTabs";

export default function RankingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative">
      <RankingTabs />
      {children}
    </main>
  );
}
