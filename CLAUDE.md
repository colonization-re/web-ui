# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

`col.css` — one shared stylesheet consumed by the other Colonization RE web
projects over HTTP from a GitHub release. It is a CSS-only library: no
JavaScript ships, and consumers need no build step.

Because consumers pin a release URL, **a class name or custom property that has
shipped is a public API.** Renaming one is a breaking change; add the new name
alongside the old rather than swapping it.

## Layout

```
src/css/index.css      the entry point — its @import list IS the build order
src/css/tokens/        ramps, scales, theme-light, theme-dark
src/css/base/          reset, layout, typography
src/css/components/    one file per component
src/css/utilities.css  and a11y.css — loaded last, they have to win
src/pages/             gallery HTML
src/partials/          included into pages
scripts/build.mjs      bundles CSS, exports tokens, renders pages
test/                  vitest suites for the build and CSS helpers
dist/                  GENERATED and git-ignored — never edit
```

## Commands

```sh
npm run build    # one build into dist/
npm run dev      # watch + serve dist/ on :8000
npm run lint     # stylelint + scripts/check-css.mjs
npm test         # vitest — covers the build, check-css and the css lib
npm run check    # all of the above — run this before saying you're done
```

## Rules

- **Never edit `dist/`.** Change `src/` and rebuild.
- **Add a component file to the `@import` list in `src/css/index.css` by hand.**
  Nothing globs a directory; the list is explicit so a reviewer can read the
  cascade. A new file that isn't imported silently does nothing.
- **A token that is the same in both themes goes in `tokens/scales.css`. A token
  that differs goes in BOTH `theme-light.css` and `theme-dark.css`** — a token
  defined in only one theme is a bug that shows up as an unstyled element.
- **CSS comments do not nest.** A `/*` inside a comment ends it there and the
  rest parses as a selector. `npm run lint` catches this; don't work around it.
- **Contrast is a hard constraint:** every text token clears 4.5:1 against its
  background in both themes. If you add or change a color, check both.
- **No decorative gradients**, and no JavaScript in the shipped CSS.
- Classes are `col-<name>` with `col-<name>--<modifier>` variants. The
  stylelint `selector-class-pattern` enforces this.

## Lint config

`stylelint.config.mjs` disables several `stylelint-config-standard` rules on
purpose, and each one carries a comment saying why — `import-notation` (esbuild
resolves the bare-string form), `property-no-vendor-prefix` (the `-webkit-`
prefixes are load-bearing in Safari), the `rgba()`/hex color rules, and some
empty-line formatting. Don't re-enable one to "fix" a lint error without
reading the comment first.

There is exactly one stylelint config. Don't add a `.stylelintrc*` file — it
would take precedence over `stylelint.config.mjs` and silently shadow it.

stylelint checks style; `scripts/check-css.mjs` checks survival, i.e. whether a
browser would silently drop something. `npm run lint` runs both.

## CI and releases

- Push to `main` → `.github/workflows/ci.yml` builds, lints, tests, and deploys
  `dist/` to GitHub Pages (the dev channel).
- Push a `v*` tag → `.github/workflows/release.yml` stamps the version from the
  tag, builds, and attaches `col.css`, `col.min.css`, `tokens.json` and
  `SHA256SUMS.txt` to the release.
- Those four asset filenames are a contract with the consuming projects.
  Renaming one breaks every pinned URL.
- The version lives in the tag, not in a commit. Don't bump `package.json` as
  part of a release — the workflow does it at build time.
