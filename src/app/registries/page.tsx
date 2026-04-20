"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Registry } from "@/types";
import {
  reqGetRegistries,
  reqCreateRegistry,
  reqUpdateRegistry,
  reqDeleteRegistry,
  reqTestRegistry,
  reqTestRegistryInline,
  reqListRegistryRepos,
  reqListRegistryTags,
} from "@/services/registries.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, canEdit } from "@/lib/utils";
import { useUser } from "@/store/hooks";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Alert } from "@/components/ui/alert";

export default function RegistriesPage() {
  const user = useUser();
  const [registries, setRegistries] = useState<Registry[]>([]);
  const showConfirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"dockerhub" | "ghcr" | "custom">("custom");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [testError, setTestError] = useState("");

  // Browse state
  const [browseId, setBrowseId] = useState<number | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editType, setEditType] = useState<"dockerhub" | "ghcr" | "custom">(
    "custom",
  );
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = async () => {
    const res = await reqGetRegistries();
    if (res.success) setRegistries(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Lattice - Registries";
  }, []);

  useEffect(() => {
    load();
  }, []);

  const handleTestInline = async () => {
    if (!url.trim()) return;
    setTestStatus("testing");
    setTestError("");
    const res = await reqTestRegistryInline({ url, username, password });
    if (res.success) {
      setTestStatus("success");
    } else {
      setTestStatus("error");
      setTestError(res.error_message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await reqCreateRegistry({
      name,
      url,
      type,
      username: username || undefined,
      password: password || undefined,
    });
    if (res.success) {
      setRegistries((prev) => [...prev, res.data]);
      setShowForm(false);
      resetForm();
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setName("");
    setUrl("");
    setType("custom");
    setUsername("");
    setPassword("");
    setTestStatus("idle");
    setTestError("");
  };

  const startEdit = (reg: Registry) => {
    setEditId(reg.id);
    setEditName(reg.name);
    setEditUrl(reg.url);
    setEditType(reg.type);
    setEditUsername(reg.username ?? "");
    setEditPassword("");
  };

  const handleSaveEdit = async () => {
    if (editId === null) return;
    setEditSaving(true);
    const data: Record<string, unknown> = {
      name: editName.trim(),
      url: editUrl.trim(),
      type: editType,
      username: editUsername || undefined,
    };
    if (editPassword) data.password = editPassword;
    const res = await reqUpdateRegistry(
      editId,
      data as Parameters<typeof reqUpdateRegistry>[1],
    );
    if (res.success) {
      setRegistries((prev) =>
        prev.map((r) => (r.id === editId ? res.data : r)),
      );
      setEditId(null);
    }
    setEditSaving(false);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await showConfirm({
      title: "Delete registry",
      message:
        "This registry will be permanently removed. Any stacks using it may be affected.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    const res = await reqDeleteRegistry(id);
    if (res.success) {
      setRegistries((prev) => prev.filter((r) => r.id !== id));
      if (browseId === id) {
        setBrowseId(null);
        setRepos([]);
        setSelectedRepo(null);
        setTags([]);
      }
    }
  };

  const handleTestExisting = async (id: number) => {
    const res = await reqTestRegistry(id);
    if (res.success) {
      toast.success("Connection successful");
    } else {
      toast.error(
        "Connection failed: " + (res.error_message ?? "unknown error"),
      );
    }
  };

  const handleBrowse = async (id: number) => {
    if (browseId === id) {
      setBrowseId(null);
      setRepos([]);
      setSelectedRepo(null);
      setTags([]);
      return;
    }
    setBrowseId(id);
    setBrowseLoading(true);
    setSelectedRepo(null);
    setTags([]);
    const res = await reqListRegistryRepos(id);
    if (res.success) {
      setRepos(res.data ?? []);
    } else {
      setRepos([]);
    }
    setBrowseLoading(false);
  };

  const handleSelectRepo = async (repo: string) => {
    if (browseId === null) return;
    setSelectedRepo(repo);
    setBrowseLoading(true);
    const res = await reqListRegistryTags(browseId, repo);
    if (res.success) {
      setTags(res.data ?? []);
    } else {
      setTags([]);
    }
    setBrowseLoading(false);
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div className="flex-1">
          <div className="page-title">Registries</div>
          <div className="page-subtitle">
            Manage container registries
          </div>
        </div>
        {canEdit(user) && (
          <Button
            onClick={() => {
              setShowForm(!showForm);
              if (showForm) resetForm();
            }}
          >
            {showForm ? "Cancel" : "Add Registry"}
          </Button>
        )}
      </div>

      <div className="p-6">
      {/* Create Form */}
      {canEdit(user) && showForm && (
        <form
          onSubmit={handleCreate}
          className="card p-6 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="reg-name"
              label="Name"
              placeholder="My Registry"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              id="reg-url"
              label="URL"
              placeholder="https://registry.appleby.cloud"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setTestStatus("idle");
              }}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="reg-type"
                className="text-xs font-medium text-secondary uppercase tracking-wider"
              >
                Type
              </label>
              <select
                id="reg-type"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "dockerhub" | "ghcr" | "custom")
                }
                className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
              >
                <option value="custom">Custom Registry</option>
                <option value="dockerhub">Docker Hub</option>
                <option value="ghcr">GHCR</option>
              </select>
            </div>
            <div />
            <Input
              id="reg-username"
              label="Username"
              placeholder="registry username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setTestStatus("idle");
              }}
            />
            <Input
              id="reg-password"
              label="Password"
              type="password"
              placeholder="registry password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setTestStatus("idle");
              }}
            />
          </div>

          {/* Test + status */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleTestInline}
              disabled={!url.trim() || testStatus === "testing"}
            >
              {testStatus === "testing" ? "Testing..." : "Test Connection"}
            </Button>
            {testStatus === "success" && (
              <span className="text-sm text-healthy">
                Connected successfully
              </span>
            )}
            {testStatus === "error" && (
              <Alert variant="error">{testError}</Alert>
            )}
          </div>

          <Button
            type="submit"
            disabled={submitting || !name.trim() || !url.trim()}
          >
            {submitting ? "Creating..." : "Create Registry"}
          </Button>
        </form>
      )}

      {/* Registries List */}
      <div className="panel">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                URL
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Auth
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                Created
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {registries.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  No registries configured
                </td>
              </tr>
            ) : (
              registries.map((reg) => (
                <React.Fragment key={reg.id}>
                  <tr className="border-b border-border-subtle last:border-0 hover:bg-surface-elevated transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-primary">
                      {reg.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-secondary font-mono">
                      {reg.url}
                    </td>
                    <td className="px-4 py-3 text-sm text-secondary">
                      {reg.type}
                    </td>
                    <td className="px-4 py-3 text-sm text-secondary">
                      {reg.username ? (
                        <span className="text-healthy">{reg.username}</span>
                      ) : (
                        <span className="text-muted">none</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {formatDate(reg.inserted_at)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {canEdit(user) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(reg)}
                        >
                          Edit
                        </Button>
                      )}
                      {canEdit(user) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestExisting(reg.id)}
                        >
                          Test
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleBrowse(reg.id)}
                      >
                        {browseId === reg.id ? "Close" : "Browse"}
                      </Button>
                      {canEdit(user) && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(reg.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                  {canEdit(user) && editId === reg.id && (
                    <tr className="border-b border-border-subtle bg-background-alt">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                          <Input
                            id={`edit-name-${reg.id}`}
                            label="Name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                          <Input
                            id={`edit-url-${reg.id}`}
                            label="URL"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                          />
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                              Type
                            </label>
                            <select
                              value={editType}
                              onChange={(e) =>
                                setEditType(
                                  e.target.value as
                                    | "dockerhub"
                                    | "ghcr"
                                    | "custom",
                                )
                              }
                              className="h-9 w-full rounded-lg border border-border-strong bg-surface-elevated px-3 text-sm text-primary cursor-pointer focus:border-border-emphasis focus:outline-none"
                            >
                              <option value="custom">Custom Registry</option>
                              <option value="dockerhub">Docker Hub</option>
                              <option value="ghcr">GHCR</option>
                            </select>
                          </div>
                          <Input
                            id={`edit-username-${reg.id}`}
                            label="Username"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                          />
                          <Input
                            id={`edit-password-${reg.id}`}
                            label="Password (leave blank to keep)"
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={
                              editSaving || !editName.trim() || !editUrl.trim()
                            }
                          >
                            {editSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Browse panel */}
      {browseId !== null && (
        <div className="mt-4 card p-6">
          <h2 className="text-sm font-semibold text-primary mb-4">
            Browse: {registries.find((r) => r.id === browseId)?.name}
          </h2>

          {browseLoading && !selectedRepo ? (
            <p className="text-sm text-muted">Loading repositories...</p>
          ) : repos.length === 0 ? (
            <p className="text-sm text-muted">No repositories found</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Repository list */}
              <div>
                <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">
                  Repositories ({repos.length})
                </p>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {repos.map((repo) => (
                    <button
                      key={repo}
                      onClick={() => handleSelectRepo(repo)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors cursor-pointer ${
                        selectedRepo === repo
                          ? "bg-surface-active text-primary"
                          : "text-secondary hover:bg-surface-elevated hover:text-primary"
                      }`}
                    >
                      {repo}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags list */}
              <div>
                {selectedRepo && (
                  <>
                    <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">
                      Tags for {selectedRepo} ({tags.length})
                    </p>
                    {browseLoading ? (
                      <p className="text-sm text-muted">Loading tags...</p>
                    ) : tags.length === 0 ? (
                      <p className="text-sm text-muted">No tags found</p>
                    ) : (
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {tags.map((tag) => (
                          <div
                            key={tag}
                            className="px-3 py-2 rounded-lg text-sm font-mono text-secondary bg-background"
                          >
                            {selectedRepo}:{tag}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
