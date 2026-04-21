"use client";

import { useState, useCallback, useRef } from "react";

export function ResizableSplit({
  left,
  right,
  leftMin = 300,
  rightMin = 200,
  defaultRightWidth = 360,
  storageKey,
  height,
  style,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftMin?: number;
  rightMin?: number;
  defaultRightWidth?: number;
  storageKey?: string;
  height: number;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rightWidth, setRightWidth] = useState(() => {
    if (storageKey && typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) return parseInt(saved, 10);
    }
    return defaultRightWidth;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const latestWidth = useRef(rightWidth);
  latestWidth.current = rightWidth;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = latestWidth.current;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return;
        const containerWidth = containerRef.current.offsetWidth;
        const delta = startX.current - ev.clientX;
        const newRight = Math.max(
          rightMin,
          Math.min(containerWidth - leftMin - 12, startWidth.current + delta),
        );
        setRightWidth(newRight);
        latestWidth.current = newRight;
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (storageKey) {
          localStorage.setItem(storageKey, String(latestWidth.current));
        }
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [leftMin, rightMin, storageKey],
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        height,
        gap: 0,
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: leftMin, overflow: "hidden" }}>
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        style={{
          width: 12,
          cursor: "col-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 3,
            height: 32,
            borderRadius: 2,
            background: "var(--border-strong)",
            opacity: 0.5,
          }}
        />
      </div>
      <div
        style={{
          width: rightWidth,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {right}
      </div>
    </div>
  );
}
