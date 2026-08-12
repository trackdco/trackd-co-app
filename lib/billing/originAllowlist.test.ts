import { describe, expect, it } from "vitest";

import {
  isAllowedHost,
  isOwnPreview,
  isPrivateIPv4,
  originFromHost,
  PRODUCTION_ORIGIN,
} from "./originAllowlist";

/**
 * Both of the cases below marked ⚠️ were LIVE, and were found by a cold review
 * driving a real Stripe portal session and reading the return link off the page
 * Stripe served back. Neither was caught by tsc, eslint, or the comment sitting
 * directly above the code claiming the opposite.
 */

describe("isPrivateIPv4", () => {
  it("accepts the real private ranges", () => {
    expect(isPrivateIPv4("192.168.1.50")).toBe(true);
    expect(isPrivateIPv4("10.0.0.7")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
  });

  it("⚠️ refuses a DOMAIN that merely starts like one", () => {
    // `/^192\.168\./` matched this, and the same test chose the scheme, so it
    // was handed a PLAINTEXT return URL as well:
    //   192.168.evil.com -> http://192.168.evil.com/billing
    expect(isPrivateIPv4("192.168.evil.com")).toBe(false);
    expect(isPrivateIPv4("192.168.1.50.evil.com")).toBe(false);
    expect(isPrivateIPv4("10.0.0.7.attacker.net")).toBe(false);
  });

  it("refuses out-of-range and non-private addresses", () => {
    expect(isPrivateIPv4("192.168.1.999")).toBe(false);
    expect(isPrivateIPv4("172.15.0.1")).toBe(false);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("")).toBe(false);
  });
});

describe("isOwnPreview", () => {
  it("accepts this project's own preview deploys", () => {
    expect(isOwnPreview("trackd-co-app-abc123.vercel.app")).toBe(true);
    expect(isOwnPreview("trackd-co-app.vercel.app")).toBe(true);
  });

  it("⚠️ refuses everybody else's Vercel deployment", () => {
    // `.endsWith(".vercel.app")` accepted all of these. The comment said the
    // suffix "cannot be claimed by anyone else", which is true of the SUFFIX and
    // false of every subdomain under it, and this value is where Stripe sends a
    // signed-in user immediately after a billing action.
    expect(isOwnPreview("attacker.vercel.app")).toBe(false);
    expect(isOwnPreview("evil.vercel.app")).toBe(false);
    expect(isOwnPreview("trackd-co-app.evil.vercel.app")).toBe(false);
    expect(isOwnPreview("nottrackd-co-app-x.vercel.app")).toBe(false);
  });

  it("is not fooled by the name appearing elsewhere in the host", () => {
    expect(isOwnPreview("trackd-co-app.vercel.app.evil.com")).toBe(false);
    expect(isOwnPreview("x-trackd-co-app.vercel.app")).toBe(false);
  });
});

describe("originFromHost", () => {
  it("returns the host for everything on the list", () => {
    expect(originFromHost("trackdco.app")).toBe("https://trackdco.app");
    expect(originFromHost("www.trackdco.app")).toBe("https://www.trackdco.app");
    expect(originFromHost("trackd-co-app-abc.vercel.app")).toBe(
      "https://trackd-co-app-abc.vercel.app",
    );
    // A dev server keeps its port AND its scheme.
    expect(originFromHost("localhost:3100")).toBe("http://localhost:3100");
    expect(originFromHost("192.168.1.50:3100")).toBe("http://192.168.1.50:3100");
  });

  it("FAILS TO PRODUCTION for everything else, and never echoes it", () => {
    for (const host of [
      "evil-attacker.example.com",
      "192.168.evil.com",
      "attacker.vercel.app",
      "trackdco.app.evil.com",
      "",
      null,
      undefined,
    ]) {
      const origin = originFromHost(host);
      expect(origin).toBe(PRODUCTION_ORIGIN);
      if (host) expect(origin).not.toContain(host.split(":")[0]);
    }
  });

  it("lowercases before deciding, so case cannot walk past the list", () => {
    expect(originFromHost("TRACKDCO.APP")).toBe("https://TRACKDCO.APP");
    expect(isAllowedHost("trackdco.app")).toBe(true);
    // ...but an unrecognised host in any case still falls back.
    expect(originFromHost("EVIL.COM")).toBe(PRODUCTION_ORIGIN);
  });
});
