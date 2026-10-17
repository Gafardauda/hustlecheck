import { ImageResponse } from "next/og";

export const alt = "HustlePulse — Check the pulse of your side hustle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0E0B1F";
const LIME = "#C6FF3D";
const VIOLET = "#A78BFA";
const MUTED = "#A49CC7";

/** Social preview for the home page. */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: INK,
          padding: 80,
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#fff", marginBottom: 32 }}>
          Hustle<span style={{ color: LIME }}>Pulse</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", fontSize: 76, fontWeight: 800, color: "#fff", lineHeight: 1.05 }}>
          Will your side hustle <span style={{ color: LIME, marginLeft: 18 }}>actually pop?</span>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: MUTED, marginTop: 28, maxWidth: 900 }}>
          A PulseScore, the neighbourhoods that want it, and who to collab with — from real taste data.
        </div>
        <div style={{ display: "flex", fontSize: 26, color: VIOLET, marginTop: 40 }}>
          Powered by Qloo&apos;s taste graph
        </div>
      </div>
    ),
    size,
  );
}
