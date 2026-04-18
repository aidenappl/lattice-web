"use client";

import { useEffect, useState } from "react";
import { Registry } from "@/types";
import {
  reqGetRegistries,
  reqCreateRegistry,
  reqDeleteRegistry,
  reqTestRegistry,
  reqTestRegistryInline,
  reqListRegistryRepos,
  reqListRegistryTags,
} from "@/services/registries.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export default function RegistriesPage() {
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("custom");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState("");

  // Browse state
  const [browseId, setBrowseId] = useState<number | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const load = async () => {
    const res = await reqGetRegistries();
    if (res.success) setRegistries(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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

  const handleDelete = async (id: number) => {
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
      alert("Connection successful");
    } else {
      alert("Connection failed: " + res.error_message);
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Registries</h1>
          <p className="text-sm text-[#888888] mt-1">Manage container registries</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
          {showForm ? "Cancel" : "Add Registry"}
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-6 mb-6 space-y-4">
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
              onChange={(e) => { setUrl(e.target.value); setTestStatus("idle"); }}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-type" className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                Type
              </label>
              <select
                id="reg-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
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
              onChange={(e) => { setUsername(e.target.value); setTestStatus("idle"); }}
            />
            <Input
              id="reg-password"
              label="Password"
              type="password"
              placeholder="registry password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setTestStatus("idle"); }}
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
              <span className="text-sm text-green-400">Connected successfully</span>
            )}
            {testStatus === "error" && (
              <span className="text-sm text-red-400">{testError}</span>
            )}
          </div>

          <Button type="submit" disabled={submitting || !name.trim() || !url.trim()}>
            {submitting ? "Creating..." : "Create Registry"}
          </Button>
        </form>
      )}

      {/* Registries List */}
      <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">URL</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Auth</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#888888] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {registries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#555555]">
                  No registries configured
                </td>
              </tr>
            ) : (
              registries.map((reg) => (
                <tr key={reg.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white">{reg.name}</td>
                  <td className="px-4 py-3 text-sm text-[#888888] font-mono">{reg.url}</td>
                  <td className="px-4 py-3 text-sm text-[#888888]">{reg.type}</td>
                  <td className="px-4 py-3 text-sm text-[#888888]">
                    {reg.username ? (
                      <span className="text-green-400">{reg.username}</span>
                    ) : (
                      <span className="text-[#555555]">none</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#555555]">{formatDate(reg.inserted_at)}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleTestExisting(reg.id)}>
                      Test
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleBrowse(reg.id)}>
                      {browseId === reg.id ? "Close" : "Browse"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(reg.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Browse panel */}
      {browseId !== null && (
        <div className="mt-4 rounded-xl border border-[#1a1a1a] bg-[#111111] p-6">
          <h2 className="text-sm font-semibold text-white mb-4">
            Browse: {registries.find((r) => r.id === browseId)?.name}
          </h2>

          {browseLoading && !selectedRepo ? (
            <p className="text-sm text-[#555555]">Loading repositories...</p>
          ) : repos.length === 0 ? (
            <p className="text-sm text-[#555555]">No repositories found</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Repository list */}
              <div>
                <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">
                  Repositories ({repos.length})
                </p>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {repos.map((repo) => (
                    <button
                      key={repo}
                      onClick={() => handleSelectRepo(repo)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors cursor-pointer ${
                        selectedRepo === repo
                          ? "bg-[#1a1a1a] text-white"
                          : "text-[#888888] hover:bg-[#161616] hover:text-white"
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
                    <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">
                      Tags for {selectedRepo} ({tags.length})
                    </p>
                    {browseLoading ? (
                      <p className="text-sm text-[#555555]">Loading tags...</p>
                    ) : tags.length === 0 ? (
                      <p className="text-sm text-[#555555]">No tags found</p>
                    ) : (
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {tags.map((tag) => (
                          <div
                            key={tag}
                            className="px-3 py-2 rounded-lg text-sm font-mono text-[#888888] bg-[#0a0a0a]"
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
  );
}
