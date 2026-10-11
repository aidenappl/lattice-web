/**
 * Single sign-on helpers.
 *
 * The API owns the SSO session (an HttpOnly cookie whose lifetime is the
 * identity provider's). When it ends, the browser goes to /login, which first
 * tries a SILENT sign-in: a full-page redirect to the API's
 * /auth/sso/login?prompt=none. A user still signed in at the provider comes
 * straight back with a new session and never sees a form; otherwise the
 * provider answers login_required and /login shows the form.
 */

const SILENT_KEY = "lattice-sso-silent-at";

// A silent attempt that comes back to /login without an error within this
// window means the session did not stick (e.g. a blocked cookie). Do not try
// again, or the browser would loop.
const SILENT_RETRY_MS = 60_000;

/** The API URL that starts an SSO sign-in. */
export function ssoLoginURL(apiURL: string, loginPath: string, opts: { prompt?: "none" | "login"; returnTo?: string } = {}): string {
  const u = new URL(loginPath, apiURL || window.location.origin);
  if (opts.prompt) u.searchParams.set("prompt", opts.prompt);
  if (opts.returnTo) u.searchParams.set("return_to", opts.returnTo);
  return u.toString();
}

/** Whether a silent SSO sign-in may be attempted (none in the last minute). */
export function silentSSOAllowed(): boolean {
  const last = Number(sessionStorage.getItem(SILENT_KEY) ?? 0);
  return Date.now() - last >= SILENT_RETRY_MS;
}

/** Navigates to a silent (prompt=none) SSO sign-in and records the attempt. */
export function startSilentSSO(apiURL: string, loginPath: string, returnTo: string): void {
  sessionStorage.setItem(SILENT_KEY, String(Date.now()));
  window.location.replace(ssoLoginURL(apiURL, loginPath, { prompt: "none", returnTo }));
}

/** Forgets the loop guard once a session is confirmed working. */
export function clearSilentSSO(): void {
  sessionStorage.removeItem(SILENT_KEY);
}

/**
 * The return_to for a sign-in started from /login: the ?return_to= the user
 * was sent with when it is a same-origin path, else the app root.
 */
export function loginReturnTo(): string {
  const raw = new URLSearchParams(window.location.search).get("return_to");
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    return window.location.origin + raw;
  }
  return window.location.origin + "/";
}

/**
 * Completes a sign-out: follows the API's redirect_url (this app's login page —
 * sign-out ends only this app's session) or lands on /login with
 * signed_out=1, which stops it signing the user straight back in.
 */
export function finishSignOut(redirectURL?: string | null): void {
  clearSilentSSO();
  window.location.replace(redirectURL || "/login?signed_out=1");
}

/** Sends the browser to /login, remembering where it was. */
export function redirectToLogin(): void {
  const here = window.location.pathname + window.location.search;
  window.location.href = "/login?return_to=" + encodeURIComponent(here);
}

/** Messages for the ?error= codes the API's SSO callback can return. */
export const SSO_ERRORS: Record<string, string> = {
  state_expired: "Sign-in took too long. Please try again.",
  state_mismatch: "Sign-in was started in another tab or browser. Please try again.",
  access_denied: "You don't have access to Lattice. Contact your administrator.",
  provider_unavailable: "The identity provider is unavailable. Try again shortly.",
  provider_error: "The identity provider returned an error. Please try again.",
  login_failed: "SSO sign-in failed. Please try again.",
  sso_no_email: "The identity provider did not return an email address.",
  sso_no_account: "No account found for this email. Contact your administrator.",
  account_disabled: "Your account has been disabled. Contact your administrator.",
};
