import { ImageResponse } from "next/og";

export const contentType = "image/png";

export function generateImageMetadata() {
  return [
    { id: "small", contentType: "image/png", size: { width: 192, height: 192 } },
    { id: "large", contentType: "image/png", size: { width: 512, height: 512 } },
  ];
}

export default function Icon({ id }: { id: string }) {
  const dim = id === "large" ? 512 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          color: "#f5b54a",
          fontSize: dim * 0.58,
          fontWeight: 700,
          letterSpacing: -dim * 0.02,
          fontFamily: "Georgia, serif",
        }}
      >
        TL
      </div>
    ),
    { width: dim, height: dim },
  );
}
