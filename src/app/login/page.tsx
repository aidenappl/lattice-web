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
  const [checking, setChecking] = useState(true);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [ssoConfig, setSsoConfig] = useState<{ enabled: boolean; button_label: string; login_url: string } | null>(null);

  useEffect(() => {
    document.title = "Lattice - Login";
  }, []);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    fetch(`${API_URL}/auth/self`, { credentials: "include" })
      .then((res) => {
        if (res.ok) {
          window.location.replace("/");
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    // Fetch SSO config (public endpoint)
    fetch(`${API_URL}/auth/sso/config`)
      .then(res => res.json())
      .then(data => setSsoConfig(data))
      .catch(() => {}); // SSO not available
  }, []);

  // Handle SSO error from redirect
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const ssoError = params.get("error");
      if (ssoError) {
        const messages: Record<string, string> = {
          sso_denied: "SSO authentication was denied by the provider.",
          sso_failed: "SSO authentication failed. Please try again.",
          sso_no_email: "The SSO provider did not return an email address. Ensure your SSO scopes include 'email'.",
          sso_no_account: "No account found for this email. Contact your administrator.",
          sso_state_expired: "SSO session expired. Please try again.",
          account_disabled: "Your account has been disabled. Contact your administrator.",
        };
        setError(messages[ssoError] ?? "SSO authentication failed");
        // Clean up URL
        window.history.replaceState({}, "", "/login");
      }
    }
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

  if (checking) return null;

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

          {ssoConfig?.enabled && (
            <>
              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* SSO — validate login_url starts with / to prevent javascript: or open redirect */}
              <a
                href={ssoConfig.login_url?.startsWith("/") ? `${API_URL}${ssoConfig.login_url}` : "#"}
                className="btn btn-secondary w-full justify-center !h-10"
              >
                {ssoConfig.button_label}
              </a>
            </>
          )}
      </div>
    </div>
  );
}
