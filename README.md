# @colonization-re/web-ui

The shared design system for the project's web tools: one stylesheet, one set
of components, one palette.

**Blueprint** — blue ink, flat fills, tight corners, and borders that are meant
to be seen. The line does the work a shadow or a gradient would do elsewhere.
Mono for anything that labels or measures, sans for anything read. There are no
decorative gradients in the sheet, by design.

```bash
npm install
npm run dev      # build, watch, serve the styleguide on :8000
npm run check    # build + lint + test, what CI runs
```

## Layout

```
src/
  css/
    index.css           entry point — its @import list IS the build order
    tokens/             ramps · scales · theme-light · theme-dark
    base/               reset · layout · typography
    components/         plate card bar dialog button form
                        tabs list disclosure props range
                        table badge meter tile note
    utilities.css
    a11y.css            focus, scrollbars, motion, print — imported last
  pages/index.html      the styleguide
  partials/             the sections it is assembled from
scripts/
  build.mjs             bundle, tokens, pages; --watch --serve --check
  tokens.mjs            resolve the tokens to literal values
  check-css.mjs         read the CSS the way a browser does
  lib/css.mjs           comments, blocks, custom properties, colour maths
dist/                   generated, git-ignored
```

Two rules keep the source honest:

- **`index.css` is hand-written, never globbed.** Order decides the cascade, so
  it should be visible in a diff.
- **A value that is the same in both themes belongs in `tokens/scales.css`.** A
  value that differs belongs in *both* theme files.

## Build outputs

| file | what it is |
| --- | --- |
| `dist/col.css` | the stylesheet, every `@import` inlined |
| `dist/col.min.css` | the same, minified (~19% smaller) |
| `dist/tokens.json` | the tokens resolved to literal values, per theme |
| `dist/index.html` | the styleguide, assembled from `src/partials/` |

`npm run build -- --check` fails if `dist/` does not match the sources — that
is what CI uses to prove the build is deterministic.

### `tokens.json`

Anything that draws outside CSS — a chart, an SVG, a canvas — should read the
palette from here rather than keeping a copy that drifts:

```js
const tokens = await fetch(
  "https://github.com/colonization-re/web-ui/releases/latest/download/tokens.json",
).then((r) => r.json());
const { "--border-strong": axis, "--brand": series } = tokens.themes.light;
```

`color-mix()` is resolved for you, in **premultiplied** space as CSS does it,
so `--ring` comes back as `rgba(12,80,182,0.380)` rather than a colour darkened
toward black.

## Using it

Consumers pin a release asset — no build step, no JavaScript:

```html
<!-- pinned, the one to use -->
<link rel="stylesheet"
      href="https://github.com/colonization-re/web-ui/releases/download/v1.0.0/col.css">

<!-- rolling -->
<link rel="stylesheet"
      href="https://github.com/colonization-re/web-ui/releases/latest/download/col.css">
```

Or from the package, if the consumer already has a bundler:

```html
<link rel="stylesheet" href="node_modules/@colonization-re/web-ui/dist/col.css">
```

Themes follow `prefers-color-scheme` and respect `data-theme="light|dark"` on
`<html>`; remove the attribute for auto.

Because a release URL can be pinned, **a class name or custom property that has
shipped is a public API** — add alongside, do not rename.

## Colour

Two blues carry the system. Everything else is a status colour and appears
nowhere decorative.

| ramp | role |
| --- | --- |
| `--azure-*` | the ink — brand, fills, links, focus |
| `--cyan-*` | the drawn line — eyebrows, active tabs, corner ticks |
| `--n-*` | neutrals, tilted cool; `300`/`400` are the borders you see everywhere |
| `--green-*` `--amber-*` `--red-*` | status only |

Write pages against the semantic tokens, not the ramps:

```
--bg  --grid  --grid-major
--surface  --surface-2  --surface-3
--border  --border-strong  --rule
--text  --text-2  --text-3
--brand  --brand-hover  --brand-soft  --on-brand
--line  --line-fill  --on-line
--ok  --warn  --danger  --danger-hover  --on-danger
--ring  --sh
--r-xs --r-sm --r --r-lg   --bw --bw-2
--t-fast --t --ease        --z-sticky --z-bar
--w --w-wide --w-narrow    --font --font-mono
```

Tinted variants use `color-mix()`, so a badge or notice in any colour is one
custom property:

```css
.col-badge--mine{ --_c:var(--cyan-500) }
```

Component-local properties are prefixed with an underscore (`--_c`, `--_bg`) so
a reader can tell them from the design tokens at a glance. Two of them are
meant to be set from outside: `--_k` widens `.col-prop`'s label column, and
`--_w` sizes one `.col-input`, `.col-select`, `.col-textarea` or `.col-range`
without asking for another class.

```html
<input class="col-input col-input--auto" style="--_w:260px">
```

### Shape and motion

Radii top out at **6px**; nothing is a pill. Depth comes from borders, not
shadows — the only `box-shadow` in the sheet is on `dialog`. Hover changes the
*edge*, not the elevation. There are two durations and two z-indexes; if you
need a third of either, something else is wrong.

### The grid is opt-in

The page background is flat by default. For the ruled ground — an 8px minor
grid under an 80px major one — put `.col-ruled` on `<body>`.

## Contrast

**Enforced by the test suite**, not by good intentions: every text token must
clear 4.5:1 against every surface it can land on, in both themes, and the ink
on every filled button must clear it too. Change a colour and the tests say so.

## Linting

`npm run lint` runs two things that do not overlap:

- **stylelint** — style. Its config disables a handful of rules, each with a
  reason in `stylelint.config.mjs`.
- **`scripts/check-css.mjs`** — survival. It reads the CSS the way a browser
  does and reports what would be *silently dropped*:
  1. **a comment opener inside a comment** — CSS comments do not nest, so `/*`
     inside one ends it early and everything down to the next `{` is parsed as
     a selector, taking the block after it with it. A whole `:root` of tokens
     can vanish with no console error.
  2. a selector that is not a selector (the symptom of 1)
  3. declarations stranded outside any block; unbalanced braces
  4. `var(--x)` with no `--x`, pooled across the files given
  5. a colour that is not a colour — a stray word after `#`, or a hex of the
     wrong length

Both failures in 1 and 5 are in the test suite because both have happened.

## Components

| group | classes |
| --- | --- |
| layout | `.col-wrap` (`--wide`, `--narrow`), `.col-row`, `.col-spread`, `.col-grid` (`--2`), `.col-stack`, `.col-push`, `.col-foot` |
| chrome | `.col-bar` + `.col-bar-in`, `.col-brand` + `.col-brand-mark`, `.col-sectionhead` |
| title block | `.col-plate`, `.col-plate-meta` |
| type | `.col-eyebrow`, `.col-lead`, `.col-dim`, `.col-faint`, `.col-mono`, `.col-meta`, `.col-tnum`, `.col-mark`, `.col-rule-dashed` |
| surfaces | `.col-card` (`--hover`, `--line`, `--ticks`), `details.col-disclosure`, `dialog.col-dialog` + `-head`/`-body`/`-foot` |
| buttons | `.col-btn` + `--outline`, `--line`, `--ghost`, `--quiet`, `--danger`, `--sm`, `--lg`, `--icon`, `--block`, `--file`; `.col-btnrow` |
| forms | `.col-field`, `.col-label` (`--inline`), `.col-hint` (`--error`), `.col-input` (`--mono`, `--sm`, `--xs`, `--auto`), `.col-inputgroup` + `-icon`, `.col-select`, `.col-textarea`, `.col-range`, `.col-fieldset`, `.col-check`, `.col-switch`, `.col-segmented`, `.col-cells` + `.col-cell` |
| navigation | `.col-tabs`, `.col-tab`, `.col-list` + `.col-list-item` (`--sub`) + `.col-list-i` |
| data | `.col-tablewrap` + `.col-scroll` + `.col-table` (`--ruled`, `--compact`), `.col-badge` (`--brand`, `--line`, `--ok`, `--warn`, `--danger`, `--solid`), `.col-chip` |
| figures | `.col-tiles`/`.col-tile` (`--accent`) + `.col-tile-k`/`-v` (`--text`)/`-d`, `.col-meter` (`--line`, `--tall`, `--ticked`), `.col-stack-bar`, `.col-legend` |
| notices | `.col-note` (`--ok`, `--warn`, `--danger`, `--line`), `.col-dl` |
| records | `.col-props`/`.col-prop` (`--muted`) + `.col-prop-label`/`-name`/`-desc` |
| status text | `.col-ok`, `.col-warn`, `.col-danger` — the status tokens as text, for a one-word verdict inside a sentence |
| misc | `.col-art` (pixel-art rendering), `body.col-ruled` |

## Conventions

- **Outline is the default button.** On a drawing most things are an edge, not
  a fill; keep the solid one for the single action a page is actually for.
- Mono is the labelling voice; sans is for prose.
- One plate per page, at the top.
- `.col-card--ticks` sparingly, or it stops meaning anything.

## Known rough edge

The sheet uses 19 distinct `font-size` values. That is more than a type scale
should need, and it is the one place the system is not yet systematic.
Collapsing it to about seven steps would move a few sizes by half a pixel, so
it is left until someone wants that change on purpose.

## Licence

MIT — see `LICENSE`.
