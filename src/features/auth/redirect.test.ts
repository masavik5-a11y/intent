import { describe, expect, test } from "vitest";
import { safeRedirectPath, signInSearchFor } from "./redirect";

describe("signInSearchFor", () => {
  test.each([
    ["/week", "/week", { redirect: "/week" }],
    [
      "/day/2026-11-21",
      "/day/2026-11-21?block=abc",
      { redirect: "/day/2026-11-21?block=abc" },
    ],
    ["/", "/", {}], // nothing worth remembering
  ])("from %s", (pathname, href, expected) => {
    expect(signInSearchFor({ pathname, href })).toEqual(expected);
  });

  // Regression: the redirect used to fire again while the navigation to /signin was
  // pending, nesting /signin?redirect=/signin?redirect=… dozens of times.
  test.each([
    ["/signin", "/signin"],
    ["/signin", "/signin?redirect=%2Fweek"],
    ["/signin/", "/signin/"],
  ])("does nothing when already at %s (%s)", (pathname, href) => {
    expect(signInSearchFor({ pathname, href })).toBeNull();
  });

  test("a redirect it produces is one it accepts back", () => {
    const search = signInSearchFor({ pathname: "/week", href: "/week?x=1" });
    expect(safeRedirectPath(search?.redirect)).toBe("/week?x=1");
  });
});

describe("safeRedirectPath", () => {
  test.each([
    ["/week", "/week"],
    ["/day/2026-11-21", "/day/2026-11-21"],
    ["/day/2026-11-21?block=abc#top", "/day/2026-11-21?block=abc#top"],
    ["/signing-day", "/signing-day"], // only looks like /signin
  ])("keeps %s", (target, expected) => {
    expect(safeRedirectPath(target)).toBe(expected);
  });

  test.each([
    [undefined, "nothing asked"],
    ["", "empty"],
    ["week", "not a path"],
    ["https://evil.test/", "another site"],
    ["//evil.test/", "protocol-relative"],
    ["/\\evil.test/", "backslash trick"],
    ["/go?to=https://evil.test", "a URL inside"],
    ["javascript:alert(1)", "a script URL"],
    ["/signin", "the sign-in screen itself"],
    ["/signin?redirect=/week", "the sign-in screen with a query"],
    ["/signin/", "the sign-in screen with a slash"],
  ])("sends %s to today (%s)", (target, _reason) => {
    expect(safeRedirectPath(target)).toBe("/");
  });
});
