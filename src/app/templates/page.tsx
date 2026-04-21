"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Template } from "@/types";
import {
  reqGetTemplates,
  reqDeleteTemplate,
} from "@/services/templates.service";
import { reqImportStackExport } from "@/services/stacks.service";
import type { StackImportPayload } from "@/types";
import { useConfirm } from "@/components/ui/confirm-modal";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const showConfirm = useConfirm();

  useEffect(() => {
    document.title = "Lattice - Templates";
  }, []);

  const load = async () => {
    const res = await reqGetTemplates();
    if (res.success) setTemplates(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (t: Template) => {
    const ok = await showConfirm({
      title: "Delete template",
      message: `Are you sure you want to delete "${t.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await reqDeleteTemplate(t.id);
    if (res.success) {
      toast.success("Template deleted");
      await load();
    } else {
      toast.error("Failed to delete template");
    }
  };

  const handleCreateFromTemplate = async (t: Template) => {
    try {
      const config = JSON.parse(t.config) as StackImportPayload;
      const res = await reqImportStackExport(config);
      if (res.success) {
        toast.success(`Stack created from template "${t.name}"`);
      } else {
        toast.error("Failed to create stack from template");
      }
    } catch {
      toast.error("Invalid template configuration");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Templates</div>
          <div className="page-subtitle">
            Reusable stack configurations for quick deployment
          </div>
        </div>
        <Link href="/stacks/new" className="btn btn-primary">
          New Stack from Template
        </Link>
      </div>

      <div className="p-6">
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-sm text-muted !py-12">
                    No templates yet. Save a stack as a template from any stack detail page.
                  </td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium text-primary">{t.name}</td>
                    <td className="text-secondary">{t.description || "—"}</td>
                    <td className="text-muted">{formatDate(t.inserted_at)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCreateFromTemplate(t)}
                        >
                          Use Template
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(t)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
