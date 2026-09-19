import { describe, it, expect } from "vitest";
import {
  stripComments,
  declarations,
  normalizeSelector,
  parseColor,
  formatColor,
  mix,
  resolve,
  blocks,
} from "../scripts/lib/css.mjs";

describe("stripComments", () => {
  it("ends a comment at the first closing marker, as a browser does", () => {
    const { css } = stripComments("/* a */:root{--x:1}");
    expect(css.trim()).toBe(":root{--x:1}");
  });

  it("reports a comment opener inside a comment", () => {
    // This is the failure the rule exists for: the comment ends early and the
    // text after it is parsed as a selector, swallowing the next block.
    const { nested } = stripComments("/* header /*inner*/ tail */\n:root{--x:1}");
    expect(nested).toHaveLength(1);
    expect(nested[0].why).toMatch(/opener inside/);
  });

  it("reports an unterminated comment", () => {
    expect(stripComments("/* never closed").nested[0].why).toMatch(/unterminated/);
  });
});

describe("declarations", () => {
  const css = `
    :root{--bg:#fff;--text:#000}
    :root[data-theme="dark"]{--bg:#000;--text:#fff}
  `;

  it("matches a selector exactly, not by substring", () => {
    // ':root' is a substring of ':root[data-theme="dark"]'. Matching loosely
    // would put the dark values in the light table.
    expect(declarations(css, ":root")["--bg"]).toBe("#fff");
  });

  it("finds the theme block", () => {
    expect(declarations(css, ':root[data-theme="dark"]')["--bg"]).toBe("#000");
  });

  it("finds it even when a bundler has unquoted the attribute value", () => {
    // esbuild prints [data-theme=dark]; both select the same elements.
    const bundled = ":root[data-theme=dark]{--bg:#000}";
    expect(declarations(bundled, ':root[data-theme="dark"]')["--bg"]).toBe("#000");
  });

  it("ignores blocks nested in an at-rule with a different selector", () => {
    const media = '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111}}';
    expect(declarations(media, ":root")["--bg"]).toBeUndefined();
  });
});

describe("normalizeSelector", () => {
  it("strips quotes inside attribute selectors and collapses space", () => {
    expect(normalizeSelector('  :root[data-theme="dark"]  ')).toBe(":root[data-theme=dark]");
  });
});

describe("colour maths", () => {
  it("parses short and long hex", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
    expect(parseColor("#0c50b6")).toEqual([12, 80, 182, 1]);
    expect(parseColor("transparent")).toEqual([0, 0, 0, 0]);
    expect(parseColor("not-a-colour")).toBeNull();
  });

  it("mixes two opaque colours per channel", () => {
    expect(formatColor(mix(parseColor("#000000"), parseColor("#ffffff"), 0.5))).toBe("#808080");
  });

  it("mixes with transparent in PREMULTIPLIED space", () => {
    // The whole point: 38% of a colour with transparent is that colour at
    // alpha .38 — not the colour darkened toward black.
    const out = formatColor(mix(parseColor("#0c50b6"), parseColor("transparent"), 0.38));
    expect(out).toBe("rgba(12,80,182,0.380)");
  });

  it("returns fully transparent when both sides are", () => {
    expect(formatColor(mix(parseColor("transparent"), parseColor("transparent"), 0.5)))
      .toBe("rgba(0,0,0,0.000)");
  });
});

describe("resolve", () => {
  const table = { "--brand": "#0c50b6", "--alias": "var(--brand)", "--r": "4px" };

  it("expands a var chain", () => {
    expect(resolve("var(--alias)", table)).toBe("#0c50b6");
  });

  it("leaves an unknown var alone rather than guessing", () => {
    expect(resolve("var(--nope)", table)).toBe("var(--nope)");
  });

  it("evaluates color-mix through a var", () => {
    expect(resolve("color-mix(in srgb,var(--brand) 8%,#ffffff)", table)).toBe("#ecf1f9");
  });

  it("passes through values it cannot evaluate", () => {
    expect(resolve("0 10px 28px -14px rgba(13,28,46,.35)", table))
      .toBe("0 10px 28px -14px rgba(13,28,46,.35)");
  });

  it("does not loop forever on a cycle", () => {
    const loop = { "--a": "var(--b)", "--b": "var(--a)" };
    expect(() => resolve("var(--a)", loop)).not.toThrow();
  });
});

describe("blocks", () => {
  it("yields top-level blocks with their selector", () => {
    const found = [...blocks("a{x:1}b{y:2}")].map((b) => b.selector);
    expect(found).toEqual(["a", "b"]);
  });

  it("does not split on a nested block", () => {
    expect([...blocks("@media x{a{y:1}}")]).toHaveLength(1);
  });
});
