import { NextResponse } from "next/server";

import { getCommandPlayerIndex } from "@/lib/search/command-index";

export const dynamic = "force-static";

export async function GET(): Promise<NextResponse> {
  const items = await getCommandPlayerIndex();
  return NextResponse.json(items, {
    headers: {
      // Player rosters change infrequently. Long browser cache + SWR so the
      // palette stays snappy across navigations and reopens.
      "Cache-Control":
        "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
