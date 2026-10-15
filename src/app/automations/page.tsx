"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPlay,
  faToggleOn,
  faToggleOff,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import type { Automation, AutomationWithToken } from "@/types";
import {
  reqDisableAutomation,
  reqEnableAutomation,
  reqGetAutomations,
  reqRunAutomation,
  reqDeleteAutomation,
} from "@/services/automations.service";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { useConfirm } from "@/components/ui/confirm-modal";
import { useSelection } from "@/hooks/useSelection";
import { useBulkAction } from "@/hooks/useBulkAction";
import { PageLoader } from "@/components/ui/loading";
import { LoadError } from "@/components/ui/load-error";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AutomationFormModal } from "@/components/automations/AutomationFormModal";
import { WebhookTokenModal } from "@/components/automations/WebhookTokenModal";
import { useUser } from "@/store/hooks";
import { canEdit, timeAgo } from "@/lib/utils";
import { describeRunOutcome, describeTrigger, toastOutcome, withoutToken } from "@/lib/automations";

export default function AutomationsPage() {
  const user = useUser();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ id: number; path: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const showConfirm = useConfirm();

  useEffect(() => {
    document.title = "Lattice - Automations";
  }, []);

  const load = useCallback(async () => {
    const res = await reqGetAutomations();
    if (res.success) {
      setAutomations(res.data ?? []);
      setLoadError(false);
    } else {
      setLoadError(true);
      toast.error(res.error_message || "Failed to load automations");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (a: Automation, next: boolean) => {
    setBusyId(a.id);
    const res = next ? await reqEnableAutomation(a.id) : await reqDisableAutomation(a.id);
    setBusyId(null);
    if (!res.success) {
      // e.g. 403 "you cannot enable this automation: webhook triggers require the admin role"
      toast.error(res.error_message || `Failed to ${next ? "enable" : "disable"} the automation`);
      return;
    }
    setAutomations((prev) => prev.map((x) => (x.id === a.id ? { ...res.data, last_run: x.last_run } : x)));
    toast.success(next ? "Enabled — it now runs as you" : "Disabled");
  };

  const run = async (a: Automation) => {
    setBusyId(a.id);
    const res = await reqRunAutomation(a.id);
    setBusyId(null);
    if (!res.success) {
      toast.error(res.error_message || "Failed to run the automation");
      return;
    }
    toastOutcome(res.data);
    load();
  };

  const handleSaved = (saved: AutomationWithToken) => {
    setCreating(false);
    toast.success("Automation created");
    if (saved.webhook_path) setRevealed({ id: saved.id, path: saved.webhook_path });
    setAutomations((prev) => [withoutToken(saved), ...prev]);
  };

  const handleEdited = (saved: AutomationWithToken) => {
    setEditingAutomation(null);
    toast.success("Automation saved");
    setAutomations((prev) =>
      prev.map((x) => (x.id === saved.id ? { ...withoutToken(saved), last_run: x.last_run } : x)),
    );
  };

  const remove = async (a: Automation) => {
    const ok = await showConfirm({
      title: `Delete "${a.name}"?`,
      message:
        a.trigger.type === "webhook"
          ? "Its webhook URL stops working immediately; callers get 404. Run history is deleted with it."
          : "Its schedule stops and its run history is deleted with it.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteAutomation(a.id);
    if (res.success) {
      toast.success(`Deleted ${a.name}`);
      setAutomations((prev) => prev.filter((x) => x.id !== a.id));
    } else {
      toast.error(res.error_message || "Failed to delete the automation");
    }
  };

  const visibleIds = useMemo(() => automations.map((a) => a.id), [automations]);
  const selection = useSelection(visibleIds);
  const bulk = useBulkAction();
  const selected = useMemo(
    () => automations.filter((a) => selection.isSelected(a.id)),
    [automations, selection],
  );

  if (loading) return <PageLoader />;

  const editable = canEdit(user);

  return (
    <div>
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Automations</div>
          <div className="page-subtitle">
            A trigger — a webhook or a schedule — and an ordered list of steps. Every firing is recorded,
            including the ones that did not run.
          </div>
        </div>
        {editable && (
          <Button onClick={() => setCreating(true)}>
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3 mr-1.5" />
            New automation
          </Button>
        )}
      </div>

      {editable && (
        <BulkActionBar
          count={selection.count}
          noun="automation"
          onClear={selection.clear}
          busy={bulk.running}
          actions={[
            {
              label: "Enable",
              icon: faToggleOn,
              onClick: () =>
                bulk
                  .run({
                    items: selected.filter((a) => !a.enabled),
                    verb: "Enable",
                    verbPast: "Enabled",
                    noun: "automation",
                    name: (a) => a.name,
                    action: (a) => reqEnableAutomation(a.id),
                    confirm: {
                      message:
                        "Enabling makes you the identity each automation runs as.",
                    },
                  })
                  .then((r) => r && load()),
            },
            {
              label: "Disable",
              icon: faToggleOff,
              onClick: () =>
                bulk
                  .run({
                    items: selected.filter((a) => a.enabled),
                    verb: "Disable",
                    verbPast: "Disabled",
                    noun: "automation",
                    name: (a) => a.name,
                    action: (a) => reqDisableAutomation(a.id),
                  })
                  .then((r) => r && load()),
            },
            {
              label: "Run now",
              icon: faPlay,
              onClick: () =>
                bulk
                  .run({
                    items: selected,
                    verb: "Run",
                    verbPast: "Ran",
                    noun: "automation",
                    name: (a) => a.name,
                    action: (a) => reqRunAutomation(a.id),
                    concurrency: 1,
                    confirm: {
                      message: "They run one after another, each with up to a 50 s budget.",
                    },
                  })
                  .then((r) => r && load()),
            },
            {
              label: "Delete",
              icon: faTrash,
              variant: "danger",
              onClick: () =>
                bulk
                  .run({
                    items: selected,
                    verb: "Delete",
                    verbPast: "Deleted",
                    noun: "automation",
                    name: (a) => a.name,
                    action: (a) => reqDeleteAutomation(a.id),
                    confirm: {
                      message:
                        "Webhook URLs stop working immediately and run history is deleted.",
                      variant: "danger",
                    },
                  })
                  .then((r) => {
                    if (r) {
                      selection.clear();
                      load();
                    }
                  }),
            },
          ]}
        />
      )}

      <div className="py-6">
        {loadError && automations.length === 0 ? (
          <LoadError
            title="Failed to load automations"
            message="Could not reach lattice-api to load automations."
            onRetry={() => {
              setLoading(true);
              load();
            }}
          />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {editable && (
                    <th className="select-col">
                      <Checkbox
                        label="Select all automations"
                        checked={selection.allSelected}
                        indeterminate={selection.someSelected}
                        onChange={selection.toggleAll}
                        disabled={selection.empty}
                      />
                    </th>
                  )}
                  <th>Name</th>
                  <th>Trigger</th>
                  <th className="hidden sm:table-cell">Steps</th>
                  <th className="hidden md:table-cell">Runs as</th>
                  <th>Last run</th>
                  <th>Enabled</th>
                  {editable && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {automations.length === 0 ? (
                  <tr>
                    <td colSpan={editable ? 8 : 6} className="text-center text-sm text-muted !py-12">
                      No automations yet. One webhook can redeploy containers in any number of stacks — which a
                      stack-bound deploy token cannot.
                    </td>
                  </tr>
                ) : (
                  automations.map((a) => (
                    <tr key={a.id} className={selection.isSelected(a.id) ? "is-selected" : ""}>
                      {editable && (
                        <td className="select-col">
                          <Checkbox
                            label={`Select ${a.name}`}
                            checked={selection.isSelected(a.id)}
                            onChange={(_, e) => selection.toggle(a.id, { shiftKey: e.shiftKey })}
                          />
                        </td>
                      )}
                      <td>
                        <Link
                          href={`/automations/${a.id}`}
                          className="font-medium text-primary hover:text-info transition-colors"
                        >
                          {a.name}
                        </Link>
                        {a.description && (
                          <div className="text-xs text-muted truncate max-w-xs">{a.description}</div>
                        )}
                      </td>
                      <td className="text-secondary">
                        <span className={a.trigger.type === "schedule" ? "mono text-xs" : undefined}>
                          {describeTrigger(a.trigger)}
                        </span>
                      </td>
                      <td className="text-secondary hidden sm:table-cell">{a.actions.length}</td>
                      <td className="hidden md:table-cell">
                        <RunAsCell automation={a} />
                      </td>
                      <td>
                        {a.last_run ? (
                          <div className="flex flex-col gap-0.5" title={describeRunOutcome(a.last_run)}>
                            <StatusBadge status={a.last_run.status} />
                            <span className="text-[11px] text-muted">{timeAgo(a.last_run.started_at)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">Never</span>
                        )}
                      </td>
                      <td>
                        <Switch
                          checked={a.enabled}
                          onChange={(next) => toggle(a, next)}
                          disabled={!editable || busyId === a.id}
                          label={`${a.enabled ? "Disable" : "Enable"} ${a.name}`}
                        />
                      </td>
                      {editable && (
                        <td className="text-right whitespace-nowrap space-x-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => run(a)}
                            loading={busyId === a.id}
                            disabled={busyId !== null}
                          >
                            Run now
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingAutomation(a)}
                            aria-label={`Edit ${a.name}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => remove(a)}
                            aria-label={`Delete ${a.name}`}
                          >
                            Delete
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <AutomationFormModal onClose={() => setCreating(false)} onSaved={handleSaved} />}
      {editingAutomation && (
        <AutomationFormModal
          automation={editingAutomation}
          onClose={() => setEditingAutomation(null)}
          onSaved={handleEdited}
        />
      )}
      {revealed && (
        <WebhookTokenModal path={revealed.path} automationId={revealed.id} onClose={() => setRevealed(null)} />
      )}
    </div>
  );
}

function RunAsCell({ automation }: { automation: Automation }) {
  const actor = automation.run_as;
  if (!actor) {
    return <span className="text-xs text-failed">User #{automation.run_as_user_id} (no longer exists)</span>;
  }
  return (
    <span
      className={actor.active ? "text-sm text-secondary" : "text-sm text-failed"}
      title={
        actor.active
          ? `Role: ${actor.role}`
          : "Deactivated — every firing is refused until someone active enables it"
      }
    >
      {actor.name || actor.email}
      {!actor.active && " (deactivated)"}
    </span>
  );
}
