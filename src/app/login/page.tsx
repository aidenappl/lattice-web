"use client";

import { useState } from "react";
import { reqLogin } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const API_URL = process.env.NEXT_PUBLIC_LATTICE_API ?? "";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await reqLogin(email, password);
    if (res.success) {
      window.location.href = "/";
    } else {
      setError(res.error_message || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-[#1a1a1a] bg-[#111111] p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3.5 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3b82f6]">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-xl font-semibold text-white tracking-tight">
                Lattice
              </span>
              <span className="text-xs text-[#555555] font-medium">Sign in to continue</span>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="password"
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <Alert variant="error">{error}</Alert>
            )}

            <Button type="submit" size="lg" className="w-full mt-2" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[#222222]" />
            <span className="text-xs text-[#555555]">or</span>
            <div className="flex-1 h-px bg-[#222222]" />
          </div>

          {/* OAuth */}
          <a
            href={`${API_URL}/forta/login`}
            className="flex h-10 w-full items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#161616] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a1a1a] hover:border-[#333333]"
          >
            Sign in with Forta
          </a>
        </div>
      </div>
    </div>
  );
}
