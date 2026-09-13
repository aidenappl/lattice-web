"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface WebhookTokenModalProps {
  /** `/api/automations/<token>` — present only in the create/rotate response. */
  path: string;
  automationId: number;
  onClose: () => void;
}

/**
 * Shows an automation's webhook URL the one time it exists in the browser. Only
 * its hash is stored, so closing this is final — rotate to get a new one.
 */
export function WebhookTokenModal({ path, automationId, onClose }: WebhookTokenModalProps) {
  const url = `${process.env.NEXT_PUBLIC_LATTICE_API ?? ""}${path}`;
  const curl = `curl --fail-with-body -sS -X POST "${url}?commit=$GITHUB_SHA"`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      widthClass="max-w-xl"
      title="Webhook URL — copy it now"
      description="This URL is shown once and never again. Anyone holding it can fire this automation, so store it as a CI secret. If it leaks, rotate it from the automation's page."
      footer={
        <>
          <Link href={`/automations/${automationId}`} className="btn btn-secondary btn-sm">
            Open automation
          </Link>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="space-y-3">
        <CopyBlock label="Webhook URL" value={url} onCopy={copy} />
        <CopyBlock label="From CI" value={curl} onCopy={copy} />
        <div className="rounded-lg bg-surface-elevated p-3 text-[11px] text-secondary space-y-1">
          <p>
            <span className="mono text-primary">200</span> succeeded — or disabled: the body says which, and
            nothing runs while it is disabled
          </p>
          <p>
            <span className="mono text-primary">409</span> skipped — it was already running; recorded in the run
            history, not queued
          </p>
          <p>
            <span className="mono text-primary">424</span> failed — the message names the run and the step
          </p>
          <p className="text-muted pt-1">
            409 and 424 fail <span className="mono">curl --fail</span> without triggering{" "}
            <span className="mono">--retry</span>, so a failed redeploy turns CI red instead of being retried
            into a storm.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function CopyBlock({ label, value, onCopy }: { label: string; value: string; onCopy: (text: string) => void }) {
  return (
    <div>
      <p className="form-label mb-1">{label}</p>
      <div className="flex items-start gap-2 rounded-lg border border-[#22c55e]/30 bg-healthy/5 p-2.5">
        <code className="mono text-xs text-primary break-all select-all flex-1">{value}</code>
        <Button variant="secondary" size="sm" onClick={() => onCopy(value)}>
          <FontAwesomeIcon icon={faCopy} className="h-3 w-3 mr-1.5" />
          Copy
        </Button>
      </div>
    </div>
  );
}
