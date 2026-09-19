#!/usr/bin/env node
/* build.mjs - bundle the CSS, export the tokens, render the pages.
 *
 *   node scripts/build.mjs                   one build
 *   node scripts/build.mjs --watch           rebuild on change
 *   node scripts/build.mjs --watch --serve   ...and serve dist/ on :8000
 *   node scripts/build.mjs --check           fail if dist/ is stale
 *
 * The CSS entry point is src/css/index.css, whose @import list IS the build
 * order. esbuild inlines them; nothing here globs a directory, so the cascade
 * stays reviewable.
 *
 * Pages are plain HTML with two directives:
 *   <!-- include: partials/x.html -->   inlined, recursively
 *   {{version}} {{name}} {{year}}       replaced
 */
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { buildTokens } from "./tokens.mjs";
import { checkAll } from "./check-css.mjs";

const SRC = "src";
const OUT = "dist";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);

/* ------------------------------------------------------------------ CSS */

async function css() {
  const result = await esbuild.build({
    entryPoints: [join(SRC, "css", "index.css")],
    bundle: true,
    write: false,
    logLevel: "warning",
  });
  const banner =
    `/* ${pkg.name} ${pkg.version} — ${pkg.description}\n` +
    ` *\n` +
    ` * GENERATED. Edit src/css/ and run \`npm run build\`.\n` +
    ` */\n`;
  const plain = banner + result.outputFiles[0].text;

  const min = await esbuild.build({
    entryPoints: [join(SRC, "css", "index.css")],
    bundle: true,
    minify: true,
    write: false,
    logLevel: "warning",
  });

  return { plain, min: min.outputFiles[0].text };
}

/* ----------------------------------------------------------------- HTML */

function render(file, seen = new Set()) {
  if (seen.has(file)) throw new Error(`include cycle at ${file}`);
  seen.add(file);
  let html = readFileSync(file, "utf8");
  html = html.replace(/[ \t]*<!--\s*include:\s*([^\s>]+)\s*-->/g, (_, rel) =>
    render(join(SRC, rel), new Set(seen)),
  );
  return html
    .replaceAll("{{version}}", pkg.version)
    .replaceAll("{{name}}", pkg.name)
    .replaceAll("{{year}}", String(new Date().getUTCFullYear()));
}

function pages() {
  const dir = join(SRC, "pages");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ name: f, html: render(join(dir, f)) }));
}

/* ---------------------------------------------------------------- build */

async function buildAll() {
  const { plain, min } = await css();
  const tokens = buildTokens(plain, pkg.version);
  return {
    "col.css": plain,
    "col.min.css": min,
    "tokens.json": JSON.stringify(tokens, null, 2) + "\n",
    ...Object.fromEntries(pages().map((p) => [p.name, p.html])),
  };
}

function write(files) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(OUT, name), text);
  }
}

function report(files) {
  const n = (name) => files[name].length;
  console.log(`dist/col.css      ${String(n("col.css")).padStart(6)} bytes`);
  console.log(
    `dist/col.min.css  ${String(n("col.min.css")).padStart(6)} bytes` +
      `  (${Math.round((1 - n("col.min.css") / n("col.css")) * 100)}% smaller)`,
  );
  const tokens = JSON.parse(files["tokens.json"]);
  console.log(
    `dist/tokens.json  ${String(Object.keys(tokens.themes.light).length).padStart(6)} tokens x 2 themes`,
  );
  for (const name of Object.keys(files).filter((f) => f.endsWith(".html"))) {
    console.log(`dist/${name.padEnd(13)} ${String(n(name)).padStart(6)} bytes`);
  }
}

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(css|html)$/.test(p)) out.push(p);
    }
  };
  walk(SRC);
  return out;
}

/* ----------------------------------------------------------------- main */

const files = await buildAll();

if (flag("--check")) {
  let stale = [];
  for (const [name, text] of Object.entries(files)) {
    const p = join(OUT, name);
    if (!existsSync(p) || readFileSync(p, "utf8") !== text) stale.push(name);
  }
  if (stale.length) {
    console.log(`dist/ is STALE (${stale.join(", ")}) — run: npm run build`);
    process.exit(1);
  }
  console.log("dist/ is up to date");
  process.exit(0);
}

write(files);
report(files);

if (flag("--watch")) {
  const { watch } = await import("node:fs");
  let timer = null;
  const rebuild = async () => {
    try {
      write(await buildAll());
      console.log(`rebuilt  ${new Date().toTimeString().slice(0, 8)}`);
    } catch (err) {
      console.error(`build failed: ${err.message}`);
    }
  };
  for (const dir of [join(SRC, "css"), join(SRC, "pages"), join(SRC, "partials")]) {
    watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 40);
    });
  }
  console.log(`watching ${relative(".", SRC)}/ …`);
}

if (flag("--serve")) {
  const ctx = await esbuild.context({});
  const served = await ctx.serve({ servedir: OUT, port: 8000 });
  // esbuild reports `hosts`; fall back rather than printing "undefined".
  const host = served.hosts?.find((h) => h !== "0.0.0.0") ?? "localhost";
  console.log(`serving  http://${host}:${served.port}/`);
}

if (!flag("--watch") && !flag("--serve")) {
  const bad = checkAll(
    Object.keys(files)
      .filter((f) => f.endsWith(".css") && !f.endsWith(".min.css"))
      .concat(Object.keys(files).filter((f) => f.endsWith(".html")))
      .map((f) => join(OUT, f)),
  );
  process.exit(bad ? 1 : 0);
}
