import { ImageResponse } from "next/og";

// A simple dumbbell mark on a dark tile, drawn with boxes so it renders
// without any image assets.
export function iconResponse(px: number, rounded = true) {
  const u = px / 32;
  const plate = (h: number) => ({ width: 3 * u, height: h * u, background: "#c5f04a", borderRadius: 1.2 * u });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0b0c",
          borderRadius: rounded ? 7 * u : 0,
          gap: 1 * u,
        }}
      >
        <div style={plate(10)} />
        <div style={plate(16)} />
        <div style={{ width: 8 * u, height: 3 * u, background: "#c5f04a", borderRadius: 1 * u }} />
        <div style={plate(16)} />
        <div style={plate(10)} />
      </div>
    ),
    { width: px, height: px },
  );
}
