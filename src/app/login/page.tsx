"use client";

import { useEffect, useState } from "react";
import { reqLogin } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Logo } from "@/components/ui/logo";

const API_URL = process.env.NEXT_PUBLIC_LATTICE_API ?? "";

const MAX_ATTEMPTS = 5;
const LOCKOUT_BASE_MS = 2000; // 2s base, doubles each time

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  useEffect(() => {
    document.title = "Lattice - Login";
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Enforce client-side rate limiting
    const now = Date.now();
    if (lockedUntil > now) {
      const secsLeft = Math.ceil((lockedUntil - now) / 1000);
      setError(`Too many attempts. Try again in ${secsLeft}s.`);
      return;
    }

    setError("");
    setLoading(true);

    const res = await reqLogin(email, password);
    // Clear password from state immediately after submission
    setPassword("");

    if (res.success) {
      window.location.replace("/");
    } else {
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      if (attempts >= MAX_ATTEMPTS) {
        const lockoutMs = LOCKOUT_BASE_MS * Math.pow(2, Math.min(attempts - MAX_ATTEMPTS, 5));
        setLockedUntil(Date.now() + lockoutMs);
        setError(`Too many failed attempts. Try again in ${Math.ceil(lockoutMs / 1000)}s.`);
      } else {
        // Generic message to prevent user enumeration
        setError("Invalid email or password");
      }
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3.5 mb-8">
            <Logo size="md" />
            <div className="flex flex-col leading-none">
              <span className="page-title text-xl tracking-tight">
                Lattice
              </span>
              <span className="text-xs text-muted font-medium">
                Sign in to continue
              </span>
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

            {error && <Alert variant="error">{error}</Alert>}

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* OAuth */}
          <a
            href={`${API_URL}/forta/login`}
            className="btn btn-secondary w-full justify-center !h-10"
          >
            Sign in with Forta
          </a>
      </div>
    </div>
  );
}
