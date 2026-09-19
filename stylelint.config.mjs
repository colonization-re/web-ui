/* stylelint config.
 *
 * The disabled rules below are disabled on purpose, and each one says why.
 * stylelint checks style; scripts/check-css.mjs checks survival — whether a
 * browser would silently drop something. Both run under `npm run lint`.
 */
export default {
  extends: "stylelint-config-standard",
  rules: {
    // Every class is namespaced. `is-*` is a state hook; the styleguide's own
    // demo classes are allowed because the page is part of this repo.
    "selector-class-pattern": [
      "^col-[a-z0-9]+(-[a-z0-9]+)*(--[a-z0-9]+(-[a-z0-9]+)*)?$|^is-[a-z-]+$|^ramp(-name)?$|^demo$",
      { message: "class names are namespaced: col-block, col-block--modifier, is-state" },
    ],

    // Component-local custom properties are prefixed with an underscore
    // (--_c, --_bg) so a reader can tell them from the design tokens.
    "custom-property-pattern": "^_?[a-z][a-z0-9]*(-[a-z0-9]+)*$",

    // esbuild resolves the bare-string form, which is also what the entry
    // point documents as the build order. url() would work but reads worse.
    "import-notation": null,

    // These prefixes are load-bearing, not legacy: -webkit-backdrop-filter
    // and -webkit-box-decoration-break are still required in Safari.
    "property-no-vendor-prefix": null,

    // The sheet is written compactly on purpose — one rule per line where the
    // rule is short, media queries hard against the block they modify.
    "at-rule-empty-line-before": null,
    "rule-empty-line-before": null,
    "declaration-empty-line-before": null,
    "custom-property-empty-line-before": null,
    "comment-empty-line-before": null,
    "declaration-block-single-line-max-declarations": null,

    // rgba() with an explicit alpha is clearer here than rgb() with a slash,
    // and short hex is deliberate.
    "color-function-alias-notation": null,
    "color-function-notation": null,
    "alpha-value-notation": null,
    "color-hex-length": null,

    // Modifier classes intentionally follow their base class in the file.
    "no-descending-specificity": null,

    "media-feature-range-notation": null,
    "value-keyword-case": null,
  },
};
