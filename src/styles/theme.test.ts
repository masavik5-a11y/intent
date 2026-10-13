import { describe, expect, test } from "vitest";
import css from "./theme.css?raw";

// The colour keys from docs/DESIGN.md, section 5.
const KEYS = [
  "violet",
  "teal",
  "coral",
  "pink",
  "amber",
  "gray",
  "slate",
  "red",
] as const;

const AA_TEXT = 4.5;
const AA_GRAPHICS = 3;

type Tokens = Map<string, string>;

/** Every `--name: #rrggbb;` declared in blocks with the given selector. */
function hexTokens(selector: ":root" | ".dark"): Tokens {
  const tokens: Tokens = new Map();
  const escaped = selector.replace(".", "\\.");
  const blocks = css.matchAll(new RegExp(`^${escaped} \\{([^}]*)\\}`, "gm"));
  for (const block of blocks) {
    const body = block[1] ?? "";
    for (const decl of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
      const [, name, value] = decl;
      if (name !== undefined && value !== undefined) tokens.set(name, value);
    }
  }
  return tokens;
}

const light = hexTokens(":root");
// The dark theme overrides the light one; anything it does not mention is inherited.
const dark: Tokens = new Map([...light, ...hexTokens(".dark")]);

function token(tokens: Tokens, name: string): string {
  const value = tokens.get(name);
  if (value === undefined)
    throw new Error(`theme.css has no hex token --${name}`);
  return value;
}

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

describe("contrast helper", () => {
  test("matches the known extremes", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBe(1);
  });
});

describe.each([
  ["light", light],
  ["dark", dark],
])("colour keys, %s theme", (_theme, tokens) => {
  test.each(KEYS)("%s: ink on tint meets AA for text", (key) => {
    const ratio = contrast(
      token(tokens, `${key}-ink`),
      token(tokens, `${key}-tint`),
    );
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test.each(KEYS)("%s: text on solid meets AA for text", (key) => {
    const ratio = contrast(
      token(tokens, "on-solid"),
      token(tokens, `${key}-solid`),
    );
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test.each(KEYS)("%s: solid is visible on the tint and on the page", (key) => {
    const solid = token(tokens, `${key}-solid`);
    expect(
      contrast(solid, token(tokens, `${key}-tint`)),
    ).toBeGreaterThanOrEqual(AA_GRAPHICS);
    expect(contrast(solid, token(tokens, "background"))).toBeGreaterThanOrEqual(
      AA_GRAPHICS,
    );
  });
});

describe("colour key wiring", () => {
  test.each(KEYS)("%s can be selected with data-color", (key) => {
    expect(css).toContain(`[data-color="${key}"]`);
    for (const part of ["tint", "ink", "solid"]) {
      expect(css).toContain(`--key-${part}: var(--${key}-${part});`);
    }
  });
});
