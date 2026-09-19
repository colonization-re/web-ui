#!/usr/bin/env node
/* check-css.mjs - read a stylesheet the way a browser does, and report what it
 * would silently drop.
 *
 *   node scripts/check-css.mjs [file ...]     default: dist/col.css, dist/*.html
 *
 * stylelint checks style; this checks survival. The two do not overlap: a
 * stylesheet can be perfectly formatted and still lose a whole block.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { stripComments, blocks, lineOf } from "./lib/css.mjs";

const SELECTOR_OK = /^[\w\s.#:,[\]="'>~+*()\-/%^$|]*$/;

export function check(path, pool, deferred) {
  const raw = readFileSync(path, "utf8");
  let css = raw;
  if (/\.html?$/.test(path)) {
    const styles = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    if (styles.length === 0) return [];
    css = styles.join("\n");
  }

  const problems = [];
  const { css: stripped, nested } = stripComments(css);

  for (const { line, why } of nested) {
    problems.push({
      line,
      why: `${why} — everything after it, down to the next block, is parsed as a selector`,
    });
  }

  const open = (stripped.match(/{/g) || []).length;
  const close = (stripped.match(/}/g) || []).length;
  if (open !== close) {
    problems.push({ line: 0, why: `unbalanced braces: ${open} open, ${close} close` });
  }

  let rules = 0;
  for (const { line, selector } of blocks(stripped)) {
    rules++;
    const s = selector.trim();
    if (!s || s.startsWith("@")) continue;
    if (!SELECTOR_OK.test(s)) {
      const bad = [...new Set([...s].filter((c) => !SELECTOR_OK.test(c)))].join("");
      problems.push({
        line,
        why: `not a selector (contains ${JSON.stringify(bad)}): ${JSON.stringify(s.replace(/\s+/g, " ").slice(0, 70))}`,
      });
    }
  }

  // declarations stranded outside any block
  let outside = stripped;
  for (;;) {
    const next = outside.replace(/\{[^{}]*\}/g, "");
    if (next === outside) break;
    outside = next;
  }
  for (const chunk of outside.split("}")) {
    const head = chunk.split("{")[0];
    if (head.includes(";") && !head.trim().startsWith("@")) {
      problems.push({
        line: 0,
        why: `declaration outside any block: ${JSON.stringify(head.replace(/\s+/g, " ").slice(0, 70))}`,
      });
    }
  }

  // colours that are not colours
  for (const m of stripped.matchAll(/#[0-9a-f]*[g-z_][\w-]*/gi)) {
    problems.push({ line: lineOf(stripped, m.index), why: `not a colour: ${JSON.stringify(m[0])}` });
  }
  for (const m of stripped.matchAll(/#([0-9a-f]+)\b/gi)) {
    if (![3, 4, 6, 8].includes(m[1].length)) {
      problems.push({
        line: lineOf(stripped, m.index),
        why: `hex of ${m[1].length} digits: ${JSON.stringify(m[0])}`,
      });
    }
  }

  const defined = new Set([...stripped.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...stripped.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
  for (const d of defined) pool.add(d);
  deferred.push({ path, used });

  const name = basename(path);
  if (problems.length) {
    for (const { line, why } of problems.sort((a, b) => a.line - b.line)) {
      console.log(`  FAIL ${line ? `${name}:${line}` : name}: ${why}`);
    }
  } else {
    console.log(`  ok   ${name}: ${rules} rules, ${defined.size} custom properties`);
  }
  return problems;
}

/** Custom properties are pooled: a page's inline <style> may legitimately use
 *  tokens the bundle defines. */
export function checkAll(paths) {
  const pool = new Set();
  const deferred = [];
  let bad = 0;
  for (const p of paths) bad += check(p, pool, deferred).length;
  for (const { path, used } of deferred) {
    for (const v of [...used].sort()) {
      if (!pool.has(v)) {
        console.log(`  FAIL ${basename(path)}: var(${v}) is never defined`);
        bad++;
      }
    }
  }
  return bad;
}

function defaults() {
  const out = [];
  if (existsSync("dist/col.css")) out.push("dist/col.css");
  if (existsSync("dist")) {
    for (const f of readdirSync("dist")) if (f.endsWith(".html")) out.push(join("dist", f));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : defaults();
  if (!files.length) {
    console.error("nothing to check — run `npm run build` first");
    process.exit(1);
  }
  const bad = checkAll(files);
  if (bad) console.log(`\n${bad} problem(s)`);
  process.exit(bad ? 1 : 0);
}
