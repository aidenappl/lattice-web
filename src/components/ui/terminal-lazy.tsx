"use client";

import dynamic from "next/dynamic";
import { LoadingSpinner } from "./loading";

/**
 * The xterm terminal, loaded only when it's first shown. xterm and its addons
 * were bundled into every container and database detail page, though the
 * terminal only appears when someone opens the Terminal tab or SQL console.
 */
export const Terminal = dynamic(
  () => import("./terminal").then((m) => m.Terminal),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center">
        <LoadingSpinner size="sm" />
      </div>
    ),
  },
);
