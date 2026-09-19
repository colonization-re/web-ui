import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAll } from "../scripts/check-css.mjs";

const dir = mkdtempSync(join(tmpdir(), "col-check-"));

function withCss(name, css) {
  const p = join(dir, name);
  writeFileSync(p, css);
  return p;
}

let logged;
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "log").mockImplementation((line) => logged.push(line));
});
afterEach(() => vi.restoreAllMocks());

const output = () => logged.join("\n");

describe("check-css", () => {
  it("passes a healthy stylesheet", () => {
    expect(checkAll([withCss("ok.css", ":root{--a:#fff}\n.col-x{color:var(--a)}")])).toBe(0);
  });

  it("catches a comment opener inside a comment", () => {
    // The real-world failure: the header comment ends early, `:root` is eaten
    // as part of a selector, and every token in it disappears.
    const bad = "/* header /*inner*/ still the comment */\n:root{--a:#fff}\n";
    expect(checkAll([withCss("nested.css", bad)])).toBeGreaterThan(0);
    expect(output()).toMatch(/opener inside a comment/);
  });

  it("catches a colour that is not a colour", () => {
    expect(checkAll([withCss("hex.css", ":root{--a:#5a7placeholder}")])).toBeGreaterThan(0);
    expect(output()).toMatch(/not a colour/);
  });

  it("catches a hex of the wrong length", () => {
    expect(checkAll([withCss("len.css", ":root{--a:#12345}")])).toBeGreaterThan(0);
    expect(output()).toMatch(/hex of 5 digits/);
  });

  it("catches an undefined custom property", () => {
    expect(checkAll([withCss("undef.css", ".col-x{color:var(--nope)}")])).toBeGreaterThan(0);
    expect(output()).toMatch(/var\(--nope\) is never defined/);
  });

  it("pools custom properties across files", () => {
    // A page's inline <style> may legitimately use a token the bundle defines.
    const a = withCss("pool-a.css", ":root{--a:#fff}");
    const b = withCss("pool-b.css", ".col-x{color:var(--a)}");
    expect(checkAll([a, b])).toBe(0);
  });

  it("catches unbalanced braces", () => {
    expect(checkAll([withCss("brace.css", ".col-x{color:red")])).toBeGreaterThan(0);
    expect(output()).toMatch(/unbalanced braces/);
  });

  it("does not flag at-rules as bad selectors", () => {
    const css = "@media (max-width:640px){.col-x{color:red}}\n@supports (a:b){.col-y{color:red}}";
    expect(checkAll([withCss("at.css", css)])).toBe(0);
  });
});
