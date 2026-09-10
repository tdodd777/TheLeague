import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 100,
          fontWeight: 700,
          letterSpacing: -4,
          fontFamily: "Georgia, serif",
        }}
      >
        TL
      </div>
    ),
    size,
  );
}
