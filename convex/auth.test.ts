/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { errorCodeOf } from "../shared/errors";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const OWNER = "owner@intent.test";
const PASSWORD = "a-long-enough-password";

/** A throwaway RSA key in the PEM form Convex Auth signs session tokens with. */
async function generatePrivateKeyPem(): Promise<string> {
  const { privateKey } = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", privateKey),
  );
  const base64 = btoa(String.fromCharCode(...der));
  return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
}

let privateKeyPem: string;

beforeAll(async () => {
  privateKeyPem = await generatePrivateKeyPem();
});

beforeEach(() => {
  vi.stubEnv("JWT_PRIVATE_KEY", privateKeyPem);
  vi.stubEnv("CONVEX_SITE_URL", "https://intent.test");
  vi.stubEnv("ALLOWED_EMAILS", OWNER);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function setup() {
  const t = convexTest(schema, modules);
  const password = (
    flow: "signUp" | "signIn",
    email: string,
    secret: string = PASSWORD,
  ) =>
    t.action(api.auth.signIn, {
      provider: "password",
      params: { flow, email, password: secret },
    });
  const counts = () =>
    t.run(async (ctx) => ({
      users: (await ctx.db.query("users").take(10)).length,
      accounts: (await ctx.db.query("authAccounts").take(10)).length,
      sessions: (await ctx.db.query("authSessions").take(10)).length,
    }));
  return { t, password, counts };
}

/** The app error code a call fails with, or the raw error when it is not one of ours. */
async function failureOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error instanceof ConvexError ? errorCodeOf(error.data) : error;
  }
  throw new Error("Expected the call to fail, but it succeeded.");
}

describe("sign-up is limited to ALLOWED_EMAILS", () => {
  test("the allow-listed address can create the account and gets a session", async () => {
    const { password, counts } = setup();
    const result = await password("signUp", OWNER);
    expect(result.tokens?.token).toEqual(expect.any(String));
    expect(await counts()).toEqual({ users: 1, accounts: 1, sessions: 1 });
  });

  test("another address is refused and nothing is stored for it", async () => {
    const { password, counts } = setup();
    expect(await failureOf(password("signUp", "stranger@intent.test"))).toBe(
      "SIGN_UP_CLOSED",
    );
    expect(await counts()).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  test("a second address is refused after the account exists", async () => {
    const { password, counts } = setup();
    await password("signUp", OWNER);
    expect(await failureOf(password("signUp", "second@intent.test"))).toBe(
      "SIGN_UP_CLOSED",
    );
    expect(await counts()).toMatchObject({ users: 1, accounts: 1 });
  });

  test.each([
    ["unset", undefined],
    ["empty", ""],
  ])("nobody can sign up when the list is %s", async (_label, value) => {
    vi.stubEnv("ALLOWED_EMAILS", value);
    const { password, counts } = setup();
    expect(await failureOf(password("signUp", OWNER))).toBe("SIGN_UP_CLOSED");
    expect(await counts()).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  test("a look-alike of the allowed address is refused", async () => {
    const { password } = setup();
    expect(await failureOf(password("signUp", `${OWNER}.evil.test`))).toBe(
      "SIGN_UP_CLOSED",
    );
  });
});

describe("the email is one identity whatever its case", () => {
  test("signing up again in another case does not create a second user", async () => {
    const { t, password, counts } = setup();
    await password("signUp", OWNER);
    await password("signUp", "  OWNER@Intent.Test ");
    expect(await counts()).toMatchObject({ users: 1, accounts: 1 });
    const user = await t.run((ctx) => ctx.db.query("users").first());
    expect(user?.email).toBe(OWNER);
  });

  test("sign-in works in another case", async () => {
    const { password } = setup();
    await password("signUp", OWNER);
    const result = await password("signIn", "Owner@INTENT.test");
    expect(result.tokens?.token).toEqual(expect.any(String));
  });
});

describe("sign-in", () => {
  test("a wrong password is refused", async () => {
    const { password, counts } = setup();
    await password("signUp", OWNER);
    await expect(
      password("signIn", OWNER, "not-the-password"),
    ).rejects.toThrow();
    expect(await counts()).toMatchObject({ sessions: 1 });
  });

  test("an unknown address is refused, allow-listed or not", async () => {
    const { password, counts } = setup();
    await expect(password("signIn", OWNER)).rejects.toThrow();
    await expect(password("signIn", "stranger@intent.test")).rejects.toThrow();
    expect(await counts()).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  test("a missing email is refused", async () => {
    const { password } = setup();
    expect(await failureOf(password("signIn", "   "))).toBe("INVALID_EMAIL");
  });
});

describe("password rules", () => {
  test("a short password cannot create the account", async () => {
    const { password, counts } = setup();
    expect(await failureOf(password("signUp", OWNER, "short"))).toBe(
      "WEAK_PASSWORD",
    );
    expect(await counts()).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });
});
