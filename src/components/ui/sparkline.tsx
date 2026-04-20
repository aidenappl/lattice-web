"use client";

import { useMemo, useEffect, useState } from "react";

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  live?: boolean;
  className?: string;
  /** Fixed max value for scaling (e.g. 100 for percentages). If omitted, auto-scales to data max. */
  maxValue?: number;
};

export function Sparkline({
  data,
  width = 60,
  height = 22,
  color = "var(--healthy)",
  fill = true,
  live = false,
  className,
  maxValue,
}: SparklineProps) {
  const [liveData, setLiveData] = useState(data);

  useEffect(() => {
    if (!live) return;
    setLiveData(data);
    const id = setInterval(() => {
      setLiveData((prev) => {
        const next = [...prev.slice(1)];
        const last = prev[prev.length - 1] ?? 0.5;
        next.push(Math.max(0, Math.min(1, last + (Math.random() - 0.5) * 0.15)));
        return next;
      });
    }, 1200);
    return () => clearInterval(id);
  }, [live, data]);

  const d = useMemo(() => {
    const pts = live ? liveData : data;
    if (pts.length < 2) return "";
    const max = maxValue != null ? maxValue : Math.max(...pts, 0.01);
    const step = width / (pts.length - 1);
    return pts
      .map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * height * 0.9 - height * 0.05;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data, liveData, live, width, height, maxValue]);

  const fillD = useMemo(() => {
    if (!fill || !d) return "";
    return `${d} L${width},${height} L0,${height} Z`;
  }, [d, fill, width, height]);

  if (!d) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      {fill && fillD && (
        <path d={fillD} fill={color} opacity={0.12} />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type MeterProps = {
  value: number;
  width?: number;
  className?: string;
};

export function Meter({ value, width = 80, className }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const cls =
    clamped < 60 ? "ok" : clamped < 85 ? "warn" : "bad";

  return (
    <div className={`meter ${className ?? ""}`} style={{ width }}>
      <div
        className={`meter-fill ${cls}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Generate a seeded sparkline array for consistent demo data */
export function generateSparkData(
  n: number,
  seed: number,
  base: number,
  volatility: number,
): number[] {
  const out: number[] = [];
  let v = base;
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    v += (r - 0.5) * volatility;
    v = Math.max(0.02, Math.min(0.98, v));
    out.push(v);
  }
  return out;
}
