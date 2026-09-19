import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stripComments, declarations, resolve } from "../scripts/lib/css.mjs";
import { buildTokens } from "../scripts/tokens.mjs";

const build = () => execFileSync("node", ["scripts/build.mjs"], { encoding: "utf8" });

describe("build output", () => {
  let css;

  beforeAll(() => {
    if (!existsSync("dist/col.css")) build();
    css = readFileSync("dist/col.css", "utf8");
  });

  it("inlines every @import — nothing is left for the browser to fetch", () => {
    expect(css).not.toMatch(/@import/);
  });

  it("keeps the imports in the order the entry point lists them", () => {
    const entry = readFileSync("src/css/index.css", "utf8");
    const order = [...entry.matchAll(/@import "\.\/([^"]+)"/g)].map((m) => m[1]);
    const positions = order.map((f) => css.indexOf(`/* src/css/${f} */`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("preserves color-mix() rather than lowering it", () => {
    expect(css).toMatch(/color-mix\(in srgb/);
  });

  it("is deterministic — a second build produces the same bytes", () => {
    const before = readFileSync("dist/col.css", "utf8");
    build();
    expect(readFileSync("dist/col.css", "utf8")).toBe(before);
  });

  it("--check passes immediately after a build", () => {
    const out = execFileSync("node", ["scripts/build.mjs", "--check"], { encoding: "utf8" });
    expect(out).toMatch(/up to date/);
  });
});

describe("tokens.json", () => {
  const doc = JSON.parse(readFileSync("dist/tokens.json", "utf8"));

  it("carries the package version", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(doc.version).toBe(pkg.version);
  });

  it("has both themes, with the same keys", () => {
    expect(Object.keys(doc.themes)).toEqual(["light", "dark"]);
    expect(Object.keys(doc.themes.light)).toEqual(Object.keys(doc.themes.dark));
  });

  it("actually differs between themes", () => {
    // The regression this guards: a loose selector match put the light values
    // in both tables, and the JSON looked plausible either way.
    expect(doc.themes.dark["--bg"]).not.toBe(doc.themes.light["--bg"]);
    expect(doc.themes.dark["--brand"]).not.toBe(doc.themes.light["--brand"]);
  });

  it("resolves every token to a literal — no var() survives", () => {
    for (const theme of ["light", "dark"]) {
      for (const [k, v] of Object.entries(doc.themes[theme])) {
        expect(v, `${theme} ${k}`).not.toMatch(/var\(/);
        expect(v, `${theme} ${k}`).not.toMatch(/color-mix\(/);
      }
    }
  });

  it("resolves alpha tints premultiplied", () => {
    expect(doc.themes.light["--ring"]).toMatch(/^rgba\(12,80,182,0\.38/);
  });
});

describe("contrast", () => {
  const doc = JSON.parse(readFileSync("dist/tokens.json", "utf8"));

  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const TEXT = ["--text", "--text-2", "--text-3", "--brand", "--line", "--ok", "--warn", "--danger"];
  const SURFACES = ["--surface", "--surface-2", "--surface-3", "--bg"];

  for (const theme of ["light", "dark"]) {
    for (const fg of TEXT) {
      it(`${theme}: ${fg} clears 4.5:1 on every surface`, () => {
        for (const bg of SURFACES) {
          const r = ratio(doc.themes[theme][fg], doc.themes[theme][bg]);
          expect(r, `${fg} on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it("text on a filled button clears 4.5:1", () => {
    for (const theme of ["light", "dark"]) {
      const t = doc.themes[theme];
      expect(ratio(t["--on-brand"], t["--brand"])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t["--on-line"], t["--line-fill"])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t["--on-danger"], t["--danger"])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t["--on-danger"], t["--danger-hover"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
