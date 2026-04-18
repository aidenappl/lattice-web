"use client";

import { useEffect, useState } from "react";
import { User } from "@/types";
import { reqGetUsers, reqCreateUser, reqUpdateUser } from "@/services/admin.service";
import { PageLoader } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default function SettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const res = await reqGetUsers();
    if (res.success) setUsers(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await reqCreateUser({
      email,
      name: name || undefined,
      password,
      role,
    });
    if (res.success) {
      setUsers((prev) => [...prev, res.data]);
      setShowForm(false);
      setEmail("");
      setName("");
      setPassword("");
      setRole("viewer");
    } else {
      setError(res.error_message || "Failed to create user");
    }
    setSubmitting(false);
  };

  const handleToggleActive = async (user: User) => {
    const res = await reqUpdateUser(user.id, { active: !user.active });
    if (res.success) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.data : u)));
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Settings</h1>
          <p className="text-sm text-[#888888] mt-1">User management</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Create User"}
        </Button>
      </div>

      {/* Create User Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="user-email"
              label="Email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="user-name"
              label="Name"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              id="user-password"
              label="Password"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="user-role" className="text-xs font-medium text-[#888888] uppercase tracking-wider">
                Role
              </label>
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white cursor-pointer focus:border-[#444444] focus:outline-none focus:ring-1 focus:ring-[#444444]/50"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button type="submit" disabled={submitting || !email.trim() || !password.trim()}>
            {submitting ? "Creating..." : "Create User"}
          </Button>
        </form>
      )}

      {/* Users Table */}
      <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a1a1a]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Auth Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#888888] uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#888888] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#555555]">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#161616] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-white">{user.name || user.email}</p>
                    {user.name && <p className="text-xs text-[#555555]">{user.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888888]">{user.auth_type}</td>
                  <td className="px-4 py-3">
                    <Badge variant={user.role === "admin" ? "warning" : "default"}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.active ? "success" : "error"}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.active ? "bg-[#22c55e]" : "bg-red-500"}`} />
                      {user.active ? "active" : "inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#555555]">{formatDate(user.inserted_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant={user.active ? "destructive" : "secondary"}
                      size="sm"
                      onClick={() => handleToggleActive(user)}
                    >
                      {user.active ? "Deactivate" : "Activate"}
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
