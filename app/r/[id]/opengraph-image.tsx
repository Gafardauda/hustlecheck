import { ImageResponse } from "next/og";
import { audience } from "@/lib/report";
import { scoreVerdict } from "@/lib/score";
import { loadReport } from "@/lib/store";

export const alt = "HustlePulse result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0E0B1F";
const PANEL = "#171230";
const LIME = "#C6FF3D";
const VIOLET = "#A78BFA";
const MUTED = "#A49CC7";

const row = { display: "flex" } as const;
const col = { display: "flex", flexDirection: "column" } as const;

/** Branded preview card shown when a /r/<id> link is shared. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const report = await loadReport((await params).id);

  const Logo = ({ fontSize }: { fontSize: number }) => (
    <div style={{ ...row, fontSize, fontWeight: 800, color: "#fff" }}>
      Hustle<span style={{ color: LIME }}>Pulse</span>
    </div>
  );

  if (!report) {
    return new ImageResponse(
      (
        <div style={{ ...col, width: "100%", height: "100%", background: INK, alignItems: "center", justifyContent: "center" }}>
          <Logo fontSize={72} />
          <div style={{ ...row, fontSize: 32, color: MUTED, marginTop: 16 }}>Check the pulse of your side hustle</div>
        </div>
      ),
      size,
    );
  }

  const verdict = scoreVerdict(report.pulseScore, report.input.city);
  const ring = verdict.tone === "weak" ? VIOLET : LIME;
  const idea = report.input.idea.length > 90 ? report.input.idea.slice(0, 88) + "…" : report.input.idea;
  const C = 2 * Math.PI * 120;

  return new ImageResponse(
    (
      <div style={{ ...col, width: "100%", height: "100%", background: INK, padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ ...row, justifyContent: "space-between", alignItems: "center" }}>
          <Logo fontSize={40} />
          <div style={{ ...row, fontSize: 24, color: MUTED }}>Powered by Qloo&apos;s taste graph</div>
        </div>

        <div style={{ ...row, alignItems: "center", gap: 56, flex: 1 }}>
          <div style={{ ...row, position: "relative", width: 280, height: 280 }}>
            <svg width="280" height="280" viewBox="0 0 280 280">
              <circle cx="140" cy="140" r="120" fill="none" stroke={PANEL} strokeWidth="22" />
              <circle
                cx="140"
                cy="140"
                r="120"
                fill="none"
                stroke={ring}
                strokeWidth="22"
                strokeLinecap="round"
                strokeDasharray={`${C}`}
                strokeDashoffset={`${C * (1 - report.pulseScore / 100)}`}
                transform="rotate(-90 140 140)"
              />
            </svg>
            <div style={{ ...col, position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
              <div style={{ ...row, fontSize: 120, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                {report.pulseScore}
              </div>
              <div style={{ ...row, fontSize: 24, color: MUTED }}>out of 100</div>
            </div>
          </div>

          <div style={{ ...col, flex: 1 }}>
            <div style={{ ...row, fontSize: 24, color: VIOLET, marginBottom: 12 }}>
              {report.input.city} · {audience(report.input.audience).long}
            </div>
            <div style={{ ...row, fontSize: 52, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{idea}</div>
            <div
              style={{
                ...row,
                alignSelf: "flex-start",
                marginTop: 28,
                background: verdict.tone === "weak" ? "transparent" : ring,
                color: verdict.tone === "weak" ? MUTED : INK,
                border: verdict.tone === "weak" ? `2px solid ${MUTED}` : "none",
                padding: "10px 24px",
                borderRadius: 999,
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              {verdict.label}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
