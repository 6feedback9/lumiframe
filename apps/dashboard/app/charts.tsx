"use client";

// Minimal, dependency-free trend charts (plain SVG) for the Overview
// page. Single series each (magnitude over time), so per dataviz's
// color-formula: one brand hue, no categorical palette needed. Thin
// marks, rounded bar/line ends, recessive gridlines, native-tooltip hover
// (a `<title>` per mark) — the lightweight version of the skill's
// interaction guidance appropriate for two small stat charts, not a full
// crosshair+HTML-tooltip build.

export interface TrendPoint {
  label: string;
  value: number;
}

const ACCENT = "#73b7ff"; // var(--sky) — same brand hue used for the progress bar / buttons elsewhere
const GRID = "rgba(173,201,255,0.12)";
const AXIS_TEXT = "#7686a3"; // var(--mist-dim)

const WIDTH = 600;
const HEIGHT = 200;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

function niceMax(max: number): number {
  if (max <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function GridLines({ max }: { max: number }) {
  const steps = 4;
  const lines = Array.from({ length: steps + 1 }, (_, i) => i);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  return (
    <g>
      {lines.map((i) => {
        const y = PAD_TOP + (plotHeight * i) / steps;
        const value = Math.round(max * (1 - i / steps));
        return (
          <g key={i}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={PAD_LEFT - 8} y={y + 3} fontSize={10} fill={AXIS_TEXT} textAnchor="end">
              {value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function BarTrendChart({ title, points }: { title: string; points: TrendPoint[] }) {
  const max = niceMax(Math.max(...points.map((p) => p.value), 1));
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = plotWidth / points.length;
  const barWidth = Math.min(28, slot * 0.5);

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
        {title}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={title}>
        <GridLines max={max} />
        {points.map((p, i) => {
          const x = PAD_LEFT + slot * i + slot / 2 - barWidth / 2;
          const h = max > 0 ? (p.value / max) * plotHeight : 0;
          const y = PAD_TOP + plotHeight - h;
          return (
            <g key={p.label}>
              <rect x={x} y={y} width={barWidth} height={Math.max(h, 1)} rx={4} fill={ACCENT}>
                <title>
                  {p.label}: {p.value}
                </title>
              </rect>
              <text x={x + barWidth / 2} y={HEIGHT - 8} fontSize={10} fill={AXIS_TEXT} textAnchor="middle">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LineTrendChart({ title, points }: { title: string; points: TrendPoint[] }) {
  const max = niceMax(Math.max(...points.map((p) => p.value), 1));
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: PAD_LEFT + step * i,
    y: PAD_TOP + plotHeight - (max > 0 ? (p.value / max) * plotHeight : 0),
    ...p,
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1]?.x ?? PAD_LEFT} ${PAD_TOP + plotHeight} L ${PAD_LEFT} ${PAD_TOP + plotHeight} Z`;

  // Show at most ~7 date labels so they don't collide on a 14-point axis.
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
        {title}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={title}>
        <defs>
          <linearGradient id="lumiframe-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <GridLines max={max} />
        <path d={areaPath} fill="url(#lumiframe-area-fill)" stroke="none" />
        <path d={linePath} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <g key={c.label}>
            <circle cx={c.x} cy={c.y} r={3} fill={ACCENT}>
              <title>
                {c.label}: {c.value}
              </title>
            </circle>
            {i % labelEvery === 0 && (
              <text x={c.x} y={HEIGHT - 8} fontSize={10} fill={AXIS_TEXT} textAnchor="middle">
                {c.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
