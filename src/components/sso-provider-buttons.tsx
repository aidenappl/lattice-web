"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightToBracket } from "@fortawesome/free-solid-svg-icons";

/**
 * SSOProvider is one entry from `GET /auth/sso/config`.
 *
 * ⚠️ THE SHAPE IS SHARED across monitor-core, lattice-api and openbucket-api. If
 * a field changes here it changes in all three APIs and all three login pages.
 *
 * Every nullable field is nullable ON PURPOSE and null is the DEFAULT state, not
 * an error: a provider with no branding renders a plain text button in the
 * default style. That is what a provider looks like before an administrator
 * configures an icon, and what it returns to when an icon fetch fails.
 */
export interface SSOProvider {
  name: string;
  display_name: string;
  display_icon: string | null;
  button_color: string | null;
  button_text_color: string | null;
  login_url: string;
  sort_order: number;
}

/**
 * hexColor matches #rrggbb exactly.
 *
 * ⚠️ THIS IS THE THIRD PLACE THIS CHECK EXISTS — the API validates on write, again
 * on render, and now the browser validates what it received. That is not
 * redundancy for its own sake: this value is about to be interpolated into a
 * style, and a client that trusts whatever the server sent inherits any hole in
 * the server. Anything not matching is dropped to the default rather than escaped.
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function safeColor(c: string | null): string | undefined {
  return c && HEX_COLOR.test(c) ? c : undefined;
}

/**
 * ⚠️ BUNDLED BRAND GLYPHS ARE NOT SHIPPED IN THIS APP.
 *
 * The API may send `display_icon: "bundled:google"`, but lattice-web depends only
 * on @fortawesome/free-solid-svg-icons — the brand marks live in
 * @fortawesome/free-brands-svg-icons, which is not a dependency here. Rather than
 * add one silently, a bundled slug falls back to the generic sign-in glyph.
 *
 * This is a real gap, not a decision to leave it this way: an administrator who
 * picks "google" gets a generic icon rather than the Google mark. The two fixes
 * are to add the brands package, or to configure a custom icon URL — which the
 * API fetches, caches and serves, and which this component DOES render.
 */
/**
 * ssoHref turns a provider's login_url into a safe absolute URL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ THE LEADING-SLASH CHECK IS THE WHOLE POINT OF THIS FUNCTION.
 *
 * login_url arrives from the API and is rendered as an anchor the user is
 * invited to click on an unauthenticated page. Without this guard, a value of
 * `javascript:…` executes on click, and an absolute `https://evil.example` is an
 * open redirect wearing your own domain — a phishing lure that survives scrutiny
 * precisely because the page really is yours.
 *
 * The API computes login_url from the slug and never stores it, so this should be
 * unreachable. It is here anyway because "should be unreachable" is a statement
 * about today's server, and this is the last line before a user's click.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ssoHref(apiURL: string, loginURL: string): string | null {
  if (!loginURL.startsWith("/")) return null;
  // A protocol-relative URL ("//evil.example/x") also starts with a slash and is
  // an absolute URL to another origin. Refused explicitly.
  if (loginURL.startsWith("//")) return null;
  return `${apiURL}${loginURL}`;
}

/** A cached third-party icon served by the API, or null. */
function cachedIconSrc(apiURL: string, displayIcon: string | null): string | null {
  // Only a same-origin API path is accepted, for the same reason as ssoHref: this
  // becomes an <img src>, and an absolute URL here would hot-link a third party
  // from an unauthenticated page — leaking every visitor's IP, UA and Referer.
  if (!displayIcon || !displayIcon.startsWith("/") || displayIcon.startsWith("//")) {
    return null;
  }
  return `${apiURL}${displayIcon}`;
}

export interface SSOProviderButtonsProps {
  providers: SSOProvider[];
  apiURL: string;
}

/**
 * SSOProviderButtons renders one button per configured provider.
 *
 * Sorted by sort_order then name, matching the API's ordering, so the list is
 * stable rather than dependent on however the rows came back.
 */
export function SSOProviderButtons({ providers, apiURL }: SSOProviderButtonsProps) {
  const sorted = [...providers].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((p) => {
        const href = ssoHref(apiURL, p.login_url);
        if (!href) return null;

        const bg = safeColor(p.button_color);
        const fg = safeColor(p.button_text_color);
        const imgSrc = cachedIconSrc(apiURL, p.display_icon);

        return (
          <a
            key={p.name}
            href={href}
            // Colours go through STYLE VALUES, never into a class string or a
            // constructed stylesheet. Both have already been validated twice on the
            // server and once above; this keeps them as data rather than as CSS
            // source in the first place.
            style={bg || fg ? { backgroundColor: bg, color: fg } : undefined}
            className={[
              "cursor-pointer w-full flex items-center justify-center gap-2.5",
              "border border-border-strong rounded-lg py-2.5 text-sm font-medium",
              "transition-all",
              bg ? "hover:opacity-90" : "text-primary hover:bg-surface-elevated hover:border-border-emphasis",
            ].join(" ")}
          >
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- the API serves
              // this from its own origin at an arbitrary path; next/image would
              // require configuring a remote pattern for what is already a
              // same-origin, size-capped, re-encoded PNG.
              <img src={imgSrc} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
            ) : (
              <FontAwesomeIcon icon={faRightToBracket} className="h-4 w-4" />
            )}
            {p.display_name}
          </a>
        );
      })}
    </div>
  );
}
