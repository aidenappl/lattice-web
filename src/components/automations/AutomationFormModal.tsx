"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import type {
  Automation,
  AutomationAction,
  AutomationPayload,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationWithToken,
  Container,
  Stack,
} from "@/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { reqCreateAutomation, reqUpdateAutomation } from "@/services/automations.service";
import { reqGetAllContainers, reqGetStacks } from "@/services/stacks.service";
import { useUser } from "@/store/hooks";
import { isAdmin } from "@/lib/utils";
import {
  type ActionDraft,
  type HttpDraft,
  type RedeployDraft,
  CRON_PRESETS,
  canonicalJSON,
  fromDraft,
  newHttpDraft,
  newRedeployDraft,
  toDraft,
} from "@/lib/automations";

const HTTP_METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE", "HEAD"];

export interface AutomationFormModalProps {
  /**
   * The automation to edit, or undefined to create one. State is seeded once
   * from this, so mount the modal per open rather than toggling it.
   */
  automation?: Automation;
  onClose: () => void;
  onSaved: (saved: AutomationWithToken) => void;
}

export function AutomationFormModal({ automation, onClose, onSaved }: AutomationFormModalProps) {
  const user = useUser();
  const admin = isAdmin(user);

  // A webhook trigger and an http_request step both require the admin role, and
  // whoever redefines an automation becomes the identity it runs as — so a
  // non-admin cannot change the definition of one that has either. The API
  // refuses with 403 regardless; this only avoids offering it. Renaming is fine.
  const definitionLocked =
    !admin &&
    !!automation &&
    (automation.trigger.type === "webhook" || automation.actions.some((a) => a.type === "http_request"));

  const [name, setName] = useState(automation?.name ?? "");
  const [description, setDescription] = useState(automation?.description ?? "");
  const [enabled, setEnabled] = useState(true);
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>(
    automation?.trigger.type ?? (admin ? "webhook" : "schedule"),
  );
  const [cron, setCron] = useState(automation?.trigger.cron ?? "0 3 * * *");
  const [drafts, setDrafts] = useState<ActionDraft[]>(() =>
    automation ? automation.actions.map(toDraft) : [newRedeployDraft()],
  );
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [stacksRes, containersRes] = await Promise.all([reqGetStacks(), reqGetAllContainers()]);
      if (cancelled) return;
      if (stacksRes.success) setStacks(stacksRes.data ?? []);
      if (containersRes.success) setContainers(containersRes.data ?? []);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (key: string, patch: Partial<RedeployDraft> | Partial<HttpDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? ({ ...d, ...patch } as ActionDraft) : d)));

  const move = (index: number, delta: number) =>
    setDrafts((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const buildDefinition = (): { trigger: AutomationTrigger; actions: AutomationAction[] } | string => {
    const actions: AutomationAction[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const { action, error: draftError } = fromDraft(drafts[i]);
      if (!action) return `Step ${i + 1}: ${draftError}`;
      actions.push(action);
    }
    if (actions.length === 0) return "Add at least one step.";
    if (triggerType === "schedule" && !cron.trim()) return "A schedule needs a cron expression.";
    const trigger: AutomationTrigger =
      triggerType === "webhook" ? { type: "webhook" } : { type: "schedule", cron: cron.trim() };
    return { trigger, actions };
  };

  const handleSubmit = async () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const definition = buildDefinition();
    if (typeof definition === "string") {
      setError(definition);
      return;
    }

    setSaving(true);
    let res;
    if (automation) {
      const data: Partial<AutomationPayload> = { name: trimmed, description: description.trim() };
      const changed =
        canonicalJSON(definition) !== canonicalJSON({ trigger: automation.trigger, actions: automation.actions });
      if (changed && !definitionLocked) {
        data.trigger = definition.trigger;
        data.actions = definition.actions;
      }
      res = await reqUpdateAutomation(automation.id, data);
    } else {
      res = await reqCreateAutomation({
        name: trimmed,
        description: description.trim() || null,
        enabled,
        ...definition,
      });
    }
    setSaving(false);

    if (!res.success) {
      setError(res.error_message || "Failed to save the automation.");
      return;
    }
    onSaved(res.data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      widthClass="max-w-2xl"
      title={automation ? `Edit ${automation.name}` : "New automation"}
      description="Steps run in order and stop at the first failure unless a step is set to continue. The automation runs as whoever last saves or enables it, and can only ever do what that person can do at the time it runs."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {automation ? "Save changes" : "Create automation"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            id="automation-name"
            label="Name"
            value={name}
            maxLength={128}
            placeholder="Redeploy monitor-core (all zones)"
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            id="automation-description"
            label="Description"
            value={description}
            placeholder="Optional"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {definitionLocked && (
          <p className="rounded-lg border border-border-subtle bg-surface-elevated p-3 text-xs text-secondary">
            Only an admin can change what this automation does — its{" "}
            {automation?.trigger.type === "webhook" ? "webhook trigger" : "HTTP steps"} require the admin role.
            You can still rename it.
          </p>
        )}

        <fieldset disabled={definitionLocked} className="space-y-5 disabled:opacity-60">
          {/* Trigger */}
          <div>
            <p className="form-label">Trigger</p>
            <div className="flex gap-2 mt-1.5">
              <Button
                type="button"
                size="sm"
                variant={triggerType === "webhook" ? "primary" : "secondary"}
                onClick={() => setTriggerType("webhook")}
                disabled={!admin}
                title={admin ? undefined : "Webhook triggers require the admin role"}
              >
                Webhook
              </Button>
              <Button
                type="button"
                size="sm"
                variant={triggerType === "schedule" ? "primary" : "secondary"}
                onClick={() => setTriggerType("schedule")}
              >
                Schedule
              </Button>
            </div>
            {triggerType === "webhook" ? (
              <p className="text-xs text-muted mt-2 leading-relaxed">
                Fires on <code className="mono">POST /api/automations/&lt;token&gt;</code>. The URL is shown
                once, after saving. It is a bearer credential, like a deploy token — which is why a webhook
                trigger needs the admin role.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <Input
                  id="automation-cron"
                  aria-label="Cron expression"
                  className="mono"
                  value={cron}
                  placeholder="0 3 * * *"
                  onChange={(e) => setCron(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((preset) => (
                    <button
                      key={preset.cron}
                      type="button"
                      className="filter-chip"
                      onClick={() => setCron(preset.cron)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  5-field cron, evaluated in UTC. Each slot fires once. A slot missed by more than two hours
                  (the control plane was down) is recorded as skipped, not replayed.
                </p>
              </div>
            )}
          </div>

          {/* Steps */}
          <div>
            <p className="form-label">Steps</p>
            <div className="space-y-2 mt-1.5">
              {drafts.map((draft, index) => (
                <div key={draft.key} className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="mono text-[10px] text-muted">STEP {index + 1}</span>
                    <span className="text-xs font-medium text-primary">
                      {draft.type === "redeploy_container" ? "Redeploy container" : "HTTP request"}
                    </span>
                    <div className="flex-1" />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move step ${index + 1} up`}
                    >
                      <FontAwesomeIcon icon={faArrowUp} className="h-2.5 w-2.5" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => move(index, 1)}
                      disabled={index === drafts.length - 1}
                      aria-label={`Move step ${index + 1} down`}
                    >
                      <FontAwesomeIcon icon={faArrowDown} className="h-2.5 w-2.5" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => remove(draft.key)}
                      disabled={drafts.length === 1}
                      aria-label={`Remove step ${index + 1}`}
                    >
                      <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
                    </button>
                  </div>

                  {draft.type === "redeploy_container" ? (
                    <RedeployFields
                      draft={draft}
                      stacks={stacks}
                      containers={containers}
                      onChange={(patch) => update(draft.key, patch)}
                    />
                  ) : (
                    <HttpFields draft={draft} onChange={(patch) => update(draft.key, patch)} />
                  )}

                  <label className="mt-2 flex items-center gap-2 text-xs text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.continue_on_error}
                      onChange={(e) => update(draft.key, { continue_on_error: e.target.checked })}
                    />
                    Continue to the next step if this one fails (the run is still marked failed)
                  </label>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDrafts((prev) => [...prev, newRedeployDraft()])}
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3 mr-1.5" />
                Redeploy container
              </Button>
              {admin && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDrafts((prev) => [...prev, newHttpDraft()])}
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3 mr-1.5" />
                  HTTP request
                </Button>
              )}
            </div>
          </div>
        </fieldset>

        {!automation && (
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onChange={setEnabled} labelledBy="automation-enabled-label" />
            <span id="automation-enabled-label" className="text-sm text-secondary">
              Enabled — fires on its trigger as soon as it is saved
            </span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-600/30 bg-red-600/5 p-3 text-xs text-destructive-soft"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RedeployFields({
  draft,
  stacks,
  containers,
  onChange,
}: {
  draft: RedeployDraft;
  stacks: Stack[];
  containers: Container[];
  onChange: (patch: Partial<RedeployDraft>) => void;
}) {
  const inStack = containers.filter((c) => c.stack_id === draft.stack_id);
  const known = inStack.some((c) => c.name === draft.container_name);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select
        aria-label="Stack"
        className="form-select"
        value={draft.stack_id ?? ""}
        onChange={(e) =>
          onChange({ stack_id: e.target.value ? Number(e.target.value) : null, container_name: "" })
        }
      >
        <option value="">Select a stack…</option>
        {stacks.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Container"
        className="form-select"
        value={draft.container_name}
        disabled={!draft.stack_id}
        onChange={(e) => onChange({ container_name: e.target.value })}
      >
        <option value="">Select a container…</option>
        {inStack.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
        {draft.container_name && !known && (
          <option value={draft.container_name}>{draft.container_name} (not in this stack)</option>
        )}
      </select>
    </div>
  );
}

function HttpFields({ draft, onChange }: { draft: HttpDraft; onChange: (patch: Partial<HttpDraft>) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          aria-label="Method"
          className="form-select !w-28"
          value={draft.method}
          onChange={(e) => onChange({ method: e.target.value })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="flex-1">
          <Input
            aria-label="URL"
            value={draft.url}
            placeholder="https://hooks.example.com/…"
            onChange={(e) => onChange({ url: e.target.value })}
          />
        </div>
      </div>
      <textarea
        aria-label="Headers"
        className="form-textarea mono text-xs"
        rows={2}
        placeholder={"Header-Name: value\nAnother-Header: value"}
        value={draft.headers}
        onChange={(e) => onChange({ headers: e.target.value })}
      />
      <textarea
        aria-label="Body"
        className="form-textarea mono text-xs"
        rows={3}
        placeholder='{"text": "monitor-core redeployed"}'
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Timeout</span>
        <div className="w-20">
          <Input
            aria-label="Timeout in seconds"
            value={draft.timeout_seconds}
            placeholder="10"
            onChange={(e) => onChange({ timeout_seconds: e.target.value })}
          />
        </div>
        <span className="text-xs text-muted">seconds, max 30. HTTPS to a public host only; succeeds on 2xx.</span>
      </div>
      <p className="text-[11px] text-pending">
        Header values and the body are stored in plaintext and shown to admins. Don&apos;t put long-lived
        credentials here.
      </p>
    </div>
  );
}
