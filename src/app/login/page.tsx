"use client";

import { useEffect, useState } from "react";
import { reqLogin } from "@/services/auth.service";
import { SSOProviderButtons, type SSOProvider } from "@/components/sso-provider-buttons";
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
  const [ssoConfig, setSsoConfig] = useState<{
    enabled: boolean;
    button_label?: string;
    login_url?: string;
    // The shared contract. Optional so this page still renders against an API
    // that has not yet deployed it — see the fallback where it is consumed.
    providers?: SSOProvider[];
  } | null>(null);

  useEffect(() => {
    document.title = "Sign in | Lattice";
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
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        // ⚠️ ACCEPT EITHER SHAPE. Gating solely on `enabled` was a latent
        // outage: that field is a LEGACY one this API still emits alongside the
        // shared `providers` contract, and the day it is dropped this condition
        // goes false, setSsoConfig never fires, and every SSO button vanishes
        // from the login page — silently, with `providers` sitting right there
        // in the response. monitor-web shipped exactly that bug and locked
        // SSO-only users out. The derivation below already prefers `providers`;
        // this gate just has to stop throwing the payload away.
        if (Array.isArray(data.providers) || typeof data.enabled === "boolean") {
          setSsoConfig(data);
        }
      })
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

    // The lockout window has passed — clear it and reset the counter so
    // attempts don't keep escalating across separate lockout cycles.
    let baseAttempts = failedAttempts;
    if (lockedUntil && lockedUntil <= now) {
      setLockedUntil(0);
      setFailedAttempts(0);
      baseAttempts = 0;
    }

    setError("");
    setLoading(true);

    const res = await reqLogin(email, password);
    // Clear password from state immediately after submission
    setPassword("");

    if (res.success) {
      setFailedAttempts(0);
      setLockedUntil(0);
      window.location.replace("/");
    } else {
      const attempts = baseAttempts + 1;
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

  // Prefer the shared `providers` array; fall back to the legacy single-provider
  // fields when the API has not deployed the new contract yet.
  //
  // ⚠️ The fallback is DATED, not permanent. Once all three APIs serve
  // `providers`, delete it along with button_label/login_url — leaving it means
  // carrying two rendering paths for a login page forever, and only one of them
  // supports icons or more than one provider.
  const providers: SSOProvider[] =
    ssoConfig?.providers && ssoConfig.providers.length > 0
      ? ssoConfig.providers
      : ssoConfig?.enabled && ssoConfig.login_url
        ? [
            {
              name: "sso",
              display_name: ssoConfig.button_label || "Sign in with SSO",
              display_icon: null,
              button_color: null,
              button_text_color: null,
              login_url: ssoConfig.login_url,
              sort_order: 0,
            },
          ]
        : [];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-background">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="flex items-center gap-3 mb-6">
          <Logo size="md" className="w-10 h-10 shadow-md rounded-xl" />
          <span className="text-xl font-semibold tracking-tight text-primary">
            Lattice
          </span>
          <span className="h-4 w-px bg-border-strong" />
          <span className="text-sm text-muted">Appleby Cloud</span>
        </div>

        <div className="w-full bg-background-alt rounded-xl p-6 shadow-sm border border-border">
          <p className="text-sm text-muted text-center mb-5">
            Sign in to continue
          </p>

          {checking ? (
            <InlineLoading message="Checking session…" />
          ) : (
            <div className="flex flex-col gap-5">
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={setEmail}
                />
                <Field
                  id="password"
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                />

                {error && <ErrorAlert message={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer bg-brand text-black rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--brand-muted)] transition-colors"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              {providers.length > 0 && (
                <>
                  <Divider />
                  {/* Each href is re-validated inside the component: login_url is
                      rendered as a clickable anchor on an unauthenticated page, so
                      `javascript:` and absolute URLs are refused there rather than
                      trusted from the API. */}
                  <SSOProviderButtons providers={providers} apiURL={API_URL} />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="absolute bottom-6 text-xs text-dimmed">
        © {new Date().getFullYear()} Appleby Cloud
      </footer>
    </main>
  );
}

// Sub-components

function Field({
  id,
  label,
  type,
  placeholder,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-secondary">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="border border-border-strong bg-surface-elevated text-primary placeholder:text-muted rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-shadow"
      />
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-failed bg-[var(--failed-bg)] border border-[#ef4444]/20 rounded-lg p-3">
      <svg
        className="w-4 h-4 mt-0.5 shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-dimmed uppercase tracking-wide">
        or continue with
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}


function InlineLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="w-5 h-5 border-2 border-border-strong border-t-brand rounded-full animate-spin" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
