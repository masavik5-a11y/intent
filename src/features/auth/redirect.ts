// Where a signed-out visit goes, and where it returns after signing in.

const SIGN_IN_PATH = "/signin";

function isSignInPath(path: string): boolean {
  return path === SIGN_IN_PATH || /^\/signin[/?#]/.test(path);
}

/**
 * The search params for sending a signed-out visit to the sign-in screen, or null
 * when the visit is already there or on its way.
 *
 * The null case matters: the router reports the new location as soon as a navigation
 * starts, while the old screen is still mounted. Redirecting again from that state
 * would wrap the sign-in address in itself.
 */
export function signInSearchFor(location: {
  pathname: string;
  href: string;
}): { redirect?: string } | null {
  if (isSignInPath(location.pathname)) return null;
  return location.href === "/" ? {} : { redirect: location.href };
}

/**
 * Where to go after signing in: the in-app address that asked for the sign-in, or
 * today. Anything that could lead off this site, or back to the sign-in screen, is
 * ignored.
 */
export function safeRedirectPath(target: string | undefined): string {
  if (target === undefined) return "/";
  const isInAppPath =
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.includes("\\") &&
    !target.includes("://");
  if (!isInAppPath || isSignInPath(target)) return "/";
  return target;
}
