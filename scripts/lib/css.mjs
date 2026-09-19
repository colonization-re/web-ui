/* css.mjs - a small CSS reader: comments, blocks, custom properties, and the
 * colour maths needed to resolve a token to a literal value.
 *
 * Deliberately not a full parser. It only has to see what a browser would
 * see, which is exactly enough to catch the things a browser drops silently.
 */

/**
 * Strip comments the way a browser does.
 *
 * CSS comments DO NOT NEST: a comment ends at the FIRST closing marker. A
 * comment opener written inside one therefore ends it early, and everything
 * from there to the next `{` is parsed as a selector, taking the block after
 * it with it. An entire `:root` of custom properties can vanish that way with
 * no console error, so the openers found inside comments are reported.
 *
 * @returns {{css: string, nested: {line: number, why: string}[]}}
 */
export function stripComments(input) {
  const out = [];
  const nested = [];
  let i = 0;
  for (;;) {
    const a = input.indexOf("/*", i);
    if (a < 0) {
      out.push(input.slice(i));
      break;
    }
    out.push(input.slice(i, a));
    const b = input.indexOf("*/", a + 2);
    if (b < 0) {
      nested.push({ line: lineOf(input, a), why: "unterminated comment" });
      break;
    }
    const inner = input.slice(a + 2, b);
    const opener = inner.indexOf("/*");
    if (opener >= 0) {
      nested.push({
        line: lineOf(input, a + 2 + opener),
        why: "comment opener inside a comment",
      });
    }
    i = b + 2;
  }
  return { css: out.join(""), nested };
}

export const lineOf = (s, index) => s.slice(0, index).split("\n").length;

/** Every top-level block, as {line, selector, body}. */
export function* blocks(css) {
  let depth = 0;
  let selStart = 0;
  let bodyStart = 0;
  let sel = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      if (depth === 0) {
        sel = css.slice(selStart, i);
        bodyStart = i + 1;
      }
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        yield { line: lineOf(css, selStart), selector: sel, body: css.slice(bodyStart, i) };
        selStart = i + 1;
      }
    }
  }
}

/**
 * Every `--x: y` inside blocks whose selector is EXACTLY `selector`.
 *
 * Matching loosely would be wrong: `:root` is a substring of
 * `:root[data-theme="dark"]`, so a light table would quietly end up holding
 * the dark values.
 */
export function declarations(css, selector) {
  const out = {};
  const want = normalizeSelector(selector);
  for (const { selector: sel, body } of blocks(css)) {
    if (normalizeSelector(sel.split("{").pop()) !== want) continue;
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      out[m[1]] = m[2].trim();
    }
  }
  return out;
}

/**
 * Normalise a selector for comparison.
 *
 * Attribute values may or may not be quoted — a bundler is free to write
 * [data-theme=dark] where the source said [data-theme="dark"], and both
 * select the same elements. Comparing raw text would silently fail to find
 * the theme block, which is how a token table ends up holding one theme
 * twice.
 */
export function normalizeSelector(sel) {
  return sel
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\[[^\]]*\]/g, (attr) => attr.replace(/["']/g, ""));
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** @returns {[number,number,number,number]|null} rgba, alpha 0..1 */
export function parseColor(value) {
  const c = value.trim();
  if (c === "transparent") return [0, 0, 0, 0];
  if (!HEX.test(c)) return null;
  let h = c.slice(1);
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    1,
  ];
}

export function formatColor([r, g, b, a]) {
  const hex = (n) => Math.round(n).toString(16).padStart(2, "0");
  if (a >= 1) return `#${hex(r)}${hex(g)}${hex(b)}`;
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;
}

/**
 * color-mix(in srgb, A p%, B).
 *
 * CSS interpolates in PREMULTIPLIED space, which matters whenever one side is
 * `transparent`: mixing a colour 38% with transparent must give that colour at
 * alpha .38, not a colour darkened toward black.
 */
export function mix(a, b, p) {
  const alpha = p * a[3] + (1 - p) * b[3];
  if (alpha === 0) return [0, 0, 0, 0];
  const ch = [0, 1, 2].map((i) => (p * a[3] * a[i] + (1 - p) * b[3] * b[i]) / alpha);
  return [...ch, alpha];
}

/** Split on commas that are not inside parentheses. */
export function splitArgs(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** Expand var() and evaluate the color-mix() forms this system uses. */
export function resolve(value, table, depth = 0) {
  if (depth > 16) return value;
  const expanded = value
    .replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, name) =>
      name in table ? resolve(table[name], table, depth + 1) : m,
    )
    .trim();

  const m = /^color-mix\(\s*in srgb\s*,([\s\S]+)\)$/.exec(expanded);
  if (!m) return expanded;

  const args = splitArgs(m[1]);
  if (args.length !== 2) return expanded;
  const parts = args[0].split(/\s+/);
  const pct = parts.at(-1);
  if (!pct?.endsWith("%")) return expanded;

  const a = parseColor(resolve(parts.slice(0, -1).join(" "), table, depth + 1));
  const b = parseColor(resolve(args[1], table, depth + 1));
  if (!a || !b) return expanded;
  return formatColor(mix(a, b, parseFloat(pct) / 100));
}
