"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClock,
  faClockRotateLeft,
  faLink,
  faListOl,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";
import type { Automation, AutomationRun, AutomationWithToken, Stack } from "@/types";
import {
  reqDeleteAutomation,
  reqDisableAutomation,
  reqEnableAutomation,
  reqGetAutomation,
  reqGetAutomationRuns,
  reqRotateAutomationToken,
  reqRunAutomation,
} from "@/services/automations.service";
import { reqGetStacks } from "@/services/stacks.service";
import { PageLoader } from "@/components/ui/loading";
import { LoadError } from "@/components/ui/load-error";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-modal";
import { AutomationFormModal } from "@/components/automations/AutomationFormModal";
import { AutomationRunsTable } from "@/components/automations/AutomationRunsTable";
import { WebhookTokenModal } from "@/components/automations/WebhookTokenModal";
import { useUser } from "@/store/hooks";
import { canEdit, isAdmin, timeAgo } from "@/lib/utils";
import { describeAction, describeTrigger, toastOutcome, withoutToken } from "@/lib/automations";

const RUN_HISTORY_LIMIT = 100;
// Runs arrive without this page doing anything — a webhook from CI, a schedule
// slot — so the history is polled rather than loaded once.
const RUN_REFRESH_MS = 10000;

type Busy = "run" | "toggle" | "rotate" | "delete" | null;

export default function AutomationDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const router = useRouter();
  const user = useUser();
  const showConfirm = useConfirm();

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [revealedPath, setRevealedPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const loadRuns = useCallback(async () => {
    const res = await reqGetAutomationRuns(id, RUN_HISTORY_LIMIT);
    if (res.success) setRuns(res.data ?? []);
  }, [id]);

  const load = useCallback(async () => {
    const [automationRes, stacksRes] = await Promise.all([reqGetAutomation(id), reqGetStacks()]);
    if (automationRes.success) {
      setAutomation(automationRes.data);
      document.title = `Lattice - ${automationRes.data.name}`;
    } else {
      toast.error(automationRes.error_message || "Failed to load the automation");
    }
    if (stacksRes.success) setStacks(stacksRes.data ?? []);
    await loadRuns();
    setLoading(false);
  }, [id, loadRuns]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(loadRuns, RUN_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadRuns]);

  if (loading) return <PageLoader />;

  if (!automation) {
    return (
      <div className="py-6">
        <LoadError
          title="Automation not found"
          message="It may have been deleted, or lattice-api could not be reached."
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </div>
    );
  }

  const editable = canEdit(user);
  const admin = isAdmin(user);
  const stackNames = new Map(stacks.map((s) => [s.id, s.name]));
  const inProgress = runs.find((r) => r.status === "in_progress");
  const actor = automation.run_as;

  const runNow = async () => {
    setBusy("run");
    const res = await reqRunAutomation(automation.id);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error_message || "Failed to run the automation");
      return;
    }
    toastOutcome(res.data);
    await loadRuns();
  };

  const toggleEnabled = async () => {
    const next = !automation.enabled;
    setBusy("toggle");
    const res = next ? await reqEnableAutomation(automation.id) : await reqDisableAutomation(automation.id);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error_message || `Failed to ${next ? "enable" : "disable"} the automation`);
      return;
    }
    setAutomation((prev) => (prev ? { ...res.data, last_run: prev.last_run } : res.data));
    toast.success(next ? "Enabled — it now runs as you" : "Disabled");
  };

  const rotate = async () => {
    const ok = await showConfirm({
      title: "Rotate webhook token",
      message:
        "The current URL stops working immediately. Anything still calling it — CI included — gets 401 until it is given the new one.",
      confirmLabel: "Rotate",
      variant: "warning",
    });
    if (!ok) return;
    setBusy("rotate");
    const res = await reqRotateAutomationToken(automation.id);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error_message || "Failed to rotate the token");
      return;
    }
    if (res.data.webhook_path) setRevealedPath(res.data.webhook_path);
  };

  const remove = async () => {
    const ok = await showConfirm({
      title: "Delete automation",
      message: `Delete "${automation.name}"? It stops firing and its webhook URL stops working immediately. The audit log keeps the record of everything it did.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    const res = await reqDeleteAutomation(automation.id);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error_message || "Failed to delete the automation");
      return;
    }
    toast.success("Automation deleted");
    router.push("/automations");
  };

  const handleSaved = (saved: AutomationWithToken) => {
    setEditing(false);
    setAutomation((prev) => ({ ...withoutToken(saved), last_run: prev?.last_run }));
    toast.success("Automation saved");
    if (saved.webhook_path) setRevealedPath(saved.webhook_path);
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex-1 min-w-0">
          <Link href="/automations" className="text-xs text-muted hover:text-primary transition-colors">
            ← Automations
          </Link>
          <div className="page-title flex items-center gap-3">
            <span className="truncate">{automation.name}</span>
            <StatusBadge status={automation.enabled ? "enabled" : "disabled"} />
          </div>
          <div className="page-subtitle">{automation.description || describeTrigger(automation.trigger)}</div>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={runNow} loading={busy === "run"} disabled={busy !== null}>
              Run now
            </Button>
            <Button variant="secondary" onClick={toggleEnabled} loading={busy === "toggle"} disabled={busy !== null}>
              {automation.enabled ? "Disable" : "Enable"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={busy !== null}>
              Edit
            </Button>
            {admin && automation.trigger.type === "webhook" && (
              <Button variant="warning" onClick={rotate} loading={busy === "rotate"} disabled={busy !== null}>
                Rotate token
              </Button>
            )}
            <Button variant="destructive" onClick={remove} loading={busy === "delete"} disabled={busy !== null}>
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="py-6 space-y-6">
        {(!actor || !actor.active) && (
          <div
            role="alert"
            className="rounded-lg border border-red-600/30 bg-red-600/5 p-3 text-sm text-destructive-soft"
          >
            {actor
              ? `Runs as ${actor.email}, who is deactivated.`
              : `Runs as user #${automation.run_as_user_id}, who no longer exists.`}{" "}
            Every firing is refused before its first step until someone active enables it again — enabling makes
            them the run-as user.
          </div>
        )}
        {inProgress && (
          <div className="rounded-lg border border-[#eab308]/30 bg-[#eab308]/5 p-3 text-sm text-pending">
            Run #{inProgress.id} is in progress. A firing that arrives meanwhile is recorded as skipped — never
            queued.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel">
            <div className="panel-header">
              <FontAwesomeIcon
                icon={automation.trigger.type === "webhook" ? faLink : faClock}
                className="h-3.5 w-3.5 text-muted"
              />
              <span>Trigger</span>
            </div>
            <div className="p-4 space-y-2 text-sm">
              {automation.trigger.type === "webhook" ? (
                <>
                  <p className="mono text-xs text-primary break-all">
                    POST {process.env.NEXT_PUBLIC_LATTICE_API ?? ""}/api/automations/
                    <span className="text-muted">••••••••</span>
                  </p>
                  <p className="text-xs text-muted">
                    {automation.webhook_last_used_at
                      ? `Last called ${timeAgo(automation.webhook_last_used_at)}.`
                      : "Never called."}{" "}
                    The token was shown once, when it was created or last rotated; only its hash is stored.
                  </p>
                  <p className="text-xs text-muted">
                    <span className="mono">200</span> succeeded or disabled · <span className="mono">409</span>{" "}
                    skipped · <span className="mono">424</span> failed
                  </p>
                </>
              ) : (
                <>
                  <p className="mono text-primary">{automation.trigger.cron}</p>
                  <p className="text-xs text-muted">
                    Evaluated in UTC. Each slot fires once; a slot missed by more than two hours is recorded as
                    skipped rather than replayed.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <FontAwesomeIcon icon={faUserShield} className="h-3.5 w-3.5 text-muted" />
              <span>Runs as</span>
            </div>
            <div className="p-4 space-y-2 text-sm">
              {actor ? (
                <p className="text-primary">
                  {actor.name || actor.email}{" "}
                  <span className="text-muted">
                    · {actor.role}
                    {actor.active ? "" : " · deactivated"}
                  </span>
                </p>
              ) : (
                <p className="text-failed">User #{automation.run_as_user_id} no longer exists</p>
              )}
              <p className="text-xs text-muted">
                Every step is authorised against this user each time it runs — not only when it was saved.
                Deactivating or demoting them stops this automation. Editing its trigger or steps, or enabling it,
                makes you the run-as user.
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <FontAwesomeIcon icon={faListOl} className="h-3.5 w-3.5 text-muted" />
            <span>Steps</span>
            <span className="badge badge-neutral ml-2">{automation.actions.length}</span>
          </div>
          <ol className="divide-y divide-border-subtle">
            {automation.actions.map((action, index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="mono text-[10px] text-muted w-12 shrink-0">STEP {index + 1}</span>
                <span className="text-primary flex-1 min-w-0 truncate">{describeAction(action, stackNames)}</span>
                {action.continue_on_error && <span className="badge badge-neutral">continues on error</span>}
              </li>
            ))}
          </ol>
          <p className="px-4 py-2 text-[11px] text-muted border-t border-border-subtle">
            Steps run in order. A failed step stops the run unless it continues on error — and the run is marked
            failed either way. Each step has its own timeout, and the whole run has a 50-second budget.
          </p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <FontAwesomeIcon icon={faClockRotateLeft} className="h-3.5 w-3.5 text-muted" />
            <span>Run history</span>
            <span className="badge badge-neutral ml-2">{runs.length}</span>
          </div>
          <div className="overflow-x-auto">
            <AutomationRunsTable runs={runs} />
          </div>
        </div>
      </div>

      {editing && (
        <AutomationFormModal
          automation={automation}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      )}
      {revealedPath && (
        <WebhookTokenModal path={revealedPath} automationId={automation.id} onClose={() => setRevealedPath(null)} />
      )}
    </div>
  );
}
