"use client";

import { useMemo, useEffect, useState, useRef, useCallback } from "react";

function formatTooltipTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  /** ISO timestamps aligned to data points — enables hover tooltip. */
  timestamps?: string[];
  /** Custom value formatter for tooltip (e.g. v => `${v.toFixed(1)}%`). */
  formatValue?: (v: number) => string;
  /** Called when hovering a data point; null on mouse leave. */
  onHover?: (info: { index: number; value: number; timestamp: string | null } | null) => void;
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
  timestamps,
  formatValue,
  onHover,
}: SparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [liveData, setLiveData] = useState(data);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const hasTooltip = (timestamps != null && timestamps.length > 0 && !live) || onHover != null;

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

  const pts = live ? liveData : data;
  const max = maxValue != null ? maxValue : Math.max(...pts, 0.01);
  const step = pts.length > 1 ? width / (pts.length - 1) : 0;

  const d = useMemo(() => {
    if (pts.length < 2) return "";
    return pts
      .map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * height * 0.9 - height * 0.05;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [pts, step, max, height]);

  const fillD = useMemo(() => {
    if (!fill || !d) return "";
    return `${d} L${width},${height} L0,${height} Z`;
  }, [d, fill, width, height]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!hasTooltip || pts.length < 2) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.round(x / step);
      const clamped = Math.min(Math.max(idx, 0), pts.length - 1);
      setHoverIndex(clamped);
      setTooltipPos({ x: e.clientX, y: rect.top });
      onHover?.({
        index: clamped,
        value: pts[clamped],
        timestamp: timestamps?.[clamped] ?? null,
      });
    },
    [hasTooltip, pts.length, step, onHover, timestamps],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
    setTooltipPos(null);
    onHover?.(null);
  }, [onHover]);

  // Compute hovered point's Y position in SVG coordinates
  const hoverPoint = useMemo(() => {
    if (hoverIndex == null || pts.length < 2) return null;
    const v = pts[hoverIndex];
    const x = hoverIndex * step;
    const y = height - (v / max) * height * 0.9 - height * 0.05;
    return { x, y, value: v };
  }, [hoverIndex, pts, step, height, max]);

  const tooltipContent = useMemo(() => {
    if (hoverIndex == null || !hasTooltip) return null;
    const v = pts[hoverIndex];
    const label = formatValue ? formatValue(v) : v.toFixed(1);
    const ts = timestamps?.[hoverIndex];
    const time = ts ? formatTooltipTime(ts) : null;
    return { label, time };
  }, [hoverIndex, hasTooltip, pts, formatValue, timestamps]);

  const svgContent = (w: number, h: number) => (
    <>
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
      {hoverPoint && (
        <>
          <line
            x1={hoverPoint.x}
            y1={0}
            x2={hoverPoint.x}
            y2={h}
            stroke="var(--text-muted)"
            strokeWidth={0.5}
            strokeDasharray="2,2"
            opacity={0.6}
          />
          <circle
            cx={hoverPoint.x}
            cy={hoverPoint.y}
            r={3}
            fill={color}
            stroke="var(--background)"
            strokeWidth={1.5}
          />
        </>
      )}
    </>
  );

  const tooltip = tooltipContent && tooltipPos ? (
    <div
      style={{
        position: "fixed",
        left: tooltipPos.x,
        top: tooltipPos.y - 8,
        transform: "translate(-50%, -100%)",
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 11,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: 200,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
        {tooltipContent.label}
      </div>
      {tooltipContent.time && (
        <div style={{ color: "var(--text-muted)", fontSize: 10 }}>
          {tooltipContent.time}
        </div>
      )}
    </div>
  ) : null;

  if (responsive) {
    return (
      <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", minHeight: 0, position: "relative" }}>
        {d && size && (
          <svg
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
            style={{ display: "block", cursor: hasTooltip ? "crosshair" : undefined }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {svgContent(size.w, size.h)}
          </svg>
        )}
        {tooltip}
      </div>
    );
  }

  if (!d) return null;

  return (
    <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }} className={className}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", cursor: hasTooltip ? "crosshair" : undefined }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {svgContent(width, height)}
      </svg>
      {tooltip}
    </div>
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
