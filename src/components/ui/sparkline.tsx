"use client";

import { useMemo, useEffect, useState, useRef, useCallback } from "react";

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
  /** When true, fills the parent container and resizes with the window. */
  responsive?: boolean;
};

export function Sparkline({
  data,
  width: widthProp = 60,
  height: heightProp = 22,
  color = "var(--healthy)",
  fill = true,
  live = false,
  className,
  maxValue,
  responsive = false,
}: SparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [liveData, setLiveData] = useState(data);

  // Measure container when responsive
  const measure = useCallback(() => {
    if (!responsive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize((prev) => {
        if (prev && Math.abs(prev.w - rect.width) < 1 && Math.abs(prev.h - rect.height) < 1) return prev;
        return { w: Math.round(rect.width), h: Math.round(rect.height) };
      });
    }
  }, [responsive]);

  useEffect(() => {
    if (!responsive || !containerRef.current) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [responsive, measure]);

  const width = responsive && size ? size.w : widthProp;
  const height = responsive && size ? size.h : heightProp;

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

  if (responsive) {
    return (
      <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", minHeight: 0 }}>
        {d && size && (
          <svg
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
            style={{ display: "block" }}
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
        )}
      </div>
    );
  }

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
