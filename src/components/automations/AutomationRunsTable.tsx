"use client";

import { Fragment, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import type { AutomationRun } from "@/types";
import { StatusBadge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { describeRunOutcome, formatRunDuration } from "@/lib/automations";

/**
 * An automation's run history: one row per firing — including the ones that
 * were skipped, and why — expandable to the result of every step.
 */
export function AutomationRunsTable({ runs }: { runs: AutomationRun[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th className="w-6" aria-label="Expand" />
          <th>Run</th>
          <th>Started</th>
          <th className="hidden sm:table-cell">Trigger</th>
          <th>Status</th>
          <th className="hidden md:table-cell">Outcome</th>
          <th className="hidden md:table-cell">Duration</th>
        </tr>
      </thead>
      <tbody>
        {runs.length === 0 ? (
          <tr>
            <td colSpan={7} className="text-center text-sm text-muted !py-12">
              No runs yet. Every firing appears here — including the ones that were skipped, and why.
            </td>
          </tr>
        ) : (
          runs.map((run) => {
            const open = expanded === run.id;
            const outcome = describeRunOutcome(run);
            return (
              <Fragment key={run.id}>
                <tr
                  className="cursor-pointer"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : run.id)}
                >
                  <td>
                    <FontAwesomeIcon
                      icon={open ? faChevronDown : faChevronRight}
                      className="h-2.5 w-2.5 text-muted"
                    />
                  </td>
                  <td className="mono text-primary">#{run.id}</td>
                  <td className="text-muted whitespace-nowrap">{formatDate(run.started_at)}</td>
                  <td className="text-secondary hidden sm:table-cell max-w-xs truncate" title={run.trigger_detail ?? undefined}>
                    <span className="font-medium">{run.trigger_source}</span>
                    {run.trigger_detail && <span className="text-muted"> · {run.trigger_detail}</span>}
                  </td>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td
                    className={cn(
                      "hidden md:table-cell max-w-sm truncate",
                      run.status === "failed" ? "text-failed" : "text-muted",
                    )}
                    title={outcome}
                  >
                    {outcome}
                  </td>
                  <td className="text-muted hidden md:table-cell whitespace-nowrap">{formatRunDuration(run)}</td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={7} className="!bg-surface-elevated">
                      <RunSteps run={run} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function RunSteps({ run }: { run: AutomationRun }) {
  return (
    <div className="space-y-2 py-1">
      {run.error && <p className="text-xs text-failed">{run.error}</p>}
      {run.skip_reason && <p className="text-xs text-secondary">Skipped: {run.skip_reason}</p>}
      <ol className="space-y-1.5">
        {run.steps.map((step) => (
          <li key={step.step} className="flex flex-wrap items-start gap-x-3 gap-y-0.5 text-xs">
            <span className="mono text-muted w-12 shrink-0">step {step.step}</span>
            <span className="w-24 shrink-0">
              <StatusBadge status={step.status} />
            </span>
            <span className="text-secondary flex-1 min-w-0 break-words">
              {step.summary}
              {step.error && step.error !== step.summary && (
                <span className="block text-failed">{step.error}</span>
              )}
            </span>
            <span className="mono text-muted">
              {step.status === "succeeded" || step.status === "failed" ? `${step.duration_ms} ms` : ""}
              {step.continue_on_error && " · continues on error"}
            </span>
          </li>
        ))}
      </ol>
      {run.finished_at && <p className="text-[10px] text-muted">Finished {formatDate(run.finished_at)}</p>}
    </div>
  );
}
