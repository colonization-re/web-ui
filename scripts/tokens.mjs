#!/usr/bin/env node
/* tokens.mjs - export the design tokens as JSON, resolved to literal values.
 *
 *   node scripts/tokens.mjs           reads dist/col.css, writes dist/tokens.json
 *
 * Anything that draws outside CSS — a chart, an SVG, a canvas — should read
 * the palette from here rather than keeping its own copy that drifts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { stripComments, declarations, resolve } from "./lib/css.mjs";

export function buildTokens(css, version) {
  const { css: stripped } = stripComments(css);
  const light = declarations(stripped, ":root");
  const dark = { ...light, ...declarations(stripped, ':root[data-theme="dark"]') };

  const themes = {};
  for (const [name, table] of [
    ["light", light],
    ["dark", dark],
  ]) {
    themes[name] = Object.fromEntries(
      Object.keys(table)
        .sort()
        .map((k) => [k, resolve(table[k], table)]),
    );
  }
  return { version, themes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const doc = buildTokens(readFileSync("dist/col.css", "utf8"), version);
  writeFileSync("dist/tokens.json", JSON.stringify(doc, null, 2) + "\n");
  console.log(`dist/tokens.json  ${Object.keys(doc.themes.light).length} tokens x 2 themes`);
}
