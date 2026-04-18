"use client";

import { useEffect, useState } from "react";
import { Registry } from "@/types";
import { reqGetRegistries, reqCreateRegistry, reqDeleteRegistry } from "@/services/registries.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export default function RegistriesPage() {
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("dockerhub");
  const [keyringKey, setKeyringKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const res = await reqGetRegistries();
    if (res.success) setRegistries(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await reqCreateRegistry({
      name,
      url,
      type,
      keyring_secret_key: keyringKey || undefined,
    });
    if (res.success) {
      setRegistries((prev) => [...prev, res.data]);
      setShowForm(false);
      setName("");
      setUrl("");
      setType("dockerhub");
      setKeyringKey("");
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    const res = await reqDeleteRegistry(id);
    if (res.success) {
      setRegistries((prev) => prev.filter((r) => r.id !== id));
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Registries</h1>
          <p className="text-sm text-[#888888] mt-1">Manage container registries</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
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
              placeholder="https://registry.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
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
                className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
              >
                <option value="dockerhub">Docker Hub</option>
                <option value="ghcr">GHCR</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <Input
              id="reg-keyring"
              label="Keyring Secret Key"
              placeholder="Optional"
              value={keyringKey}
              onChange={(e) => setKeyringKey(e.target.value)}
            />
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
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#888888] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {registries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-[#555555]">
                  No registries configured
                </td>
              </tr>
            ) : (
              registries.map((reg) => (
                <tr key={reg.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white">{reg.name}</td>
                  <td className="px-4 py-3 text-sm text-[#888888] font-mono">{reg.url}</td>
                  <td className="px-4 py-3 text-sm text-[#888888]">{reg.type}</td>
                  <td className="px-4 py-3 text-sm text-[#555555]">{formatDate(reg.inserted_at)}</td>
                  <td className="px-4 py-3 text-right">
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
    </div>
  );
}
