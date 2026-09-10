import type { MetadataRoute } from "next";

import { LEAGUE_DESCRIPTION, LEAGUE_NAME, LEAGUE_YEAR } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${LEAGUE_NAME} · ${LEAGUE_YEAR}`,
    short_name: LEAGUE_NAME,
    description: LEAGUE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icon/small", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/icon/large", sizes: "512x512", type: "image/png" },
    ],
  };
}
