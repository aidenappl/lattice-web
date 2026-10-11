import { describe, it, expect, beforeEach } from "vitest";
import { clearSilentSSO, loginReturnTo, silentSSOAllowed, ssoLoginURL } from "@/lib/sso";

function setSearch(search: string) {
  window.history.replaceState({}, "", "/login" + search);
}

describe("loginReturnTo", () => {
  const origin = window.location.origin;
  it.each([
    ["", origin + "/"],
    ["?return_to=%2Fstacks%2F3%3Ftab%3Dlogs", origin + "/stacks/3?tab=logs"],
    // Anything that is not a same-origin path falls back to the root: this
    // value becomes a navigation target after sign-in (open redirect).
    ["?return_to=https%3A%2F%2Fevil.test%2F", origin + "/"],
    ["?return_to=%2F%2Fevil.test%2F", origin + "/"],
    ["?return_to=%2F%5Cevil.test%2F", origin + "/"],
  ])("search %s → %s", (search, want) => {
    setSearch(search);
    expect(loginReturnTo()).toBe(want);
  });
});

describe("ssoLoginURL", () => {
  it("carries prompt and return_to", () => {
    const u = new URL(ssoLoginURL("https://api.test", "/auth/sso/login", { prompt: "none", returnTo: "https://app.test/x" }));
    expect(u.origin + u.pathname).toBe("https://api.test/auth/sso/login");
    expect(u.searchParams.get("prompt")).toBe("none");
    expect(u.searchParams.get("return_to")).toBe("https://app.test/x");
  });
});

describe("silent SSO loop guard", () => {
  beforeEach(() => clearSilentSSO());

  it("allows an attempt when none was made", () => {
    expect(silentSSOAllowed()).toBe(true);
  });

  it("refuses a second attempt within the window", () => {
    sessionStorage.setItem("lattice-sso-silent-at", String(Date.now()));
    expect(silentSSOAllowed()).toBe(false);
  });

  it("allows again once the window has passed", () => {
    sessionStorage.setItem("lattice-sso-silent-at", String(Date.now() - 61_000));
    expect(silentSSOAllowed()).toBe(true);
  });
});
