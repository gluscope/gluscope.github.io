#!/usr/bin/env python3
"""
Vendor circuitsvis and patch its ColoredTokensMulti component.

WHY THIS EXISTS
---------------
The neuron pages render token heat-maps with circuitsvis' `ColoredTokensMulti`.
That component has two bugs, both in the upstream library (not in this repo):

  1. Stale bounds. The positive/negative colour bounds are held in `useState`,
     initialised once on mount:

         let f = Number(posBounds.arraySync()[c].toFixed(6));  // correct, recomputed
         let [d, setD] = useState(Number(f));                  // but never updated

     Switching the selected label changes `c`, so `f` recomputes -- but `d` keeps
     the *previous* label's number. Every label after the first is drawn against
     the wrong colour scale.

  2. A phantom "0". The Reset button renders as `defaultValue && <button/>`.
     When a channel is entirely negative the positive bound clamps to 1e-7, and
     (1e-7).toFixed(6) === "0.000000" -> 0 -> falsy -> React prints the literal
     character `0` where the button should be. So in exactly the cases where the
     bounds are most likely to be stale, the button that would fix them is gone.

THE FIX
-------
Replace the component with one that *derives* both bounds from the currently
selected label on every render, and shows them as read-only text instead of
editable inputs. The correct values are by definition the ones the
Reset button restored: the per-label column max/min, clamped to +/-1e-7 and
rounded to 6 decimal places.

Deriving rather than storing makes all three symptoms structurally impossible:
the bounds cannot go stale (not state), cannot be edited (no input exists), and
the `0` cannot appear (the buggy input component is no longer rendered).

The multi-channel hover tooltip is preserved -- that is the reason we patch the
bundle rather than wrapping the public API. circuitsvis exports `ColoredTokens`,
which does NOT accept tooltips; only the module-internal variant does.

MAINTENANCE
-----------
This patch is written against the *minified* identifiers of circuitsvis 1.43.3
and is pinned to that version. Every identifier it depends on is asserted below,
so a version bump fails loudly and immediately rather than half-applying.
Re-run after changing VERSION to re-vendor.

Usage:  python3 tools/patch-circuitsvis.py
"""

import hashlib
import pathlib
import re
import sys
import urllib.request

VERSION = "1.43.3"
SRC_URL = f"https://unpkg.com/circuitsvis@{VERSION}/dist/cdn/esm.js"

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / f".circuitsvis-{VERSION}.orig.js"
OUT = ROOT / "assets" / f"circuitsvis-{VERSION}-patched.js"

MARKER = "GLUSCOPE_PATCHED_COLORED_TOKENS_MULTI"

# --- token colours -----------------------------------------------------------
# The upstream defaults, stated explicitly so they are visible and editable.
# Nothing in this repo overrode them before, so these reproduce the exact
# colours the site has always had. Change these two lines to restyle the
# heat-map; the bound legend's gradient follows automatically.
NEGATIVE_COLOR = "red"
POSITIVE_COLOR = "blue"

# --- the exact upstream source we are replacing ------------------------------
# Matched in full. If circuitsvis changes by so much as a character, this fails.
BUGGY = (
    'function ibt({tokens:e,values:t,labels:r,positiveBounds:n,negativeBounds:o})'
    '{let s=nr(t),i=s.shape[1],a=n?nr(n):s.max(0).maximum(1e-7),'
    'l=o?nr(o):s.min(0).minimum(-1e-7),'
    'u=r||Array.from(Array(i).keys()).map((b,v)=>`${v}`),'
    '[c,p]=(0,Ae.useState)(0),f=Number(a.arraySync()[c].toFixed(r$)),'
    'm=Number(l.arraySync()[c].toFixed(r$)),[d,h]=(0,Ae.useState)(Number(f)),'
    '[x,g]=(0,Ae.useState)(Number(m)),y=s.slice([0,c],[-1,1]).squeeze([1]);'
)

# Module-internal identifiers the replacement relies on, with the context that
# proves each one is the thing we think it is.
REQUIRED_IDENTS = {
    "nr":  "s=nr(t)",                        # tensor constructor
    "Ae":  "(0,Ae.useState)(0)",             # React namespace
    "wX":  "Ae.default.createElement(wX,",   # ColoredTokens WITH tooltip support
    "sbt": "Ae.default.createElement(sbt,",  # per-token tooltip table
    "r$":  "toFixed(r$)",                    # decimal places (6)
}

EXPORT_OLD = "ibt as ColoredTokensMulti"
EXPORT_NEW = f"{MARKER} as ColoredTokensMulti"

REPLACEMENT = """

/* ----------------------------------------------------------------------------
 * GLUScope patch -- see tools/patch-circuitsvis.py for the full rationale.
 *
 * Drop-in replacement for circuitsvis' ColoredTokensMulti (minified as `ibt`).
 * Differences from upstream:
 *   1. The positive/negative colour bounds are DERIVED from the selected label
 *      on every render instead of being held in useState. This is the bug fix.
 *   2. The bounds are shown as a read-only legend, not editable inputs.
 *   3. The channel selector renders real class names instead of hard-coded
 *      inline black/white, so it can be themed, and is keyboard accessible.
 *      Its interaction is unchanged: hover previews a channel, click pins it.
 * Token colours are untouched.
 * -------------------------------------------------------------------------- */
var GLUSCOPE_NEGATIVE_COLOR = %(neg)s;
var GLUSCOPE_POSITIVE_COLOR = %(pos)s;

function %(marker)s({tokens: tokens, values: values, labels: labels,
                     positiveBounds: positiveBounds, negativeBounds: negativeBounds}) {
  var h = Ae.default.createElement;
  var grid = nr(values);
  var nLabels = grid.shape[1];

  /* Upstream's own bound formula, unchanged: per-label column max/min, clamped
     away from zero. These are exactly the values the old Reset button restored. */
  var posAll = positiveBounds ? nr(positiveBounds) : grid.max(0).maximum(1e-7);
  var negAll = negativeBounds ? nr(negativeBounds) : grid.min(0).minimum(-1e-7);

  var names = labels || Array.from(Array(nLabels).keys()).map(function (_, i) { return "" + i; });

  /* Upstream selector semantics, reproduced: the shown channel is whichever is
     hovered, falling back to whichever was last clicked. */
  var pinnedState = (0, Ae.useState)(0);
  var pinned = pinnedState[0], setPinned = pinnedState[1];
  var hoverState = (0, Ae.useState)(null);
  var hovered = hoverState[0], setHovered = hoverState[1];
  var selected = hovered === null ? pinned : hovered;

  /* THE FIX: derived on every render, so changing channel always recomputes.
     No useState -> cannot go stale. No input -> cannot be edited by the user. */
  var maxValue = Number(posAll.arraySync()[selected].toFixed(r$));
  var minValue = Number(negAll.arraySync()[selected].toFixed(r$));

  var column = grid.slice([0, selected], [-1, 1]).squeeze([1]);
  var columnValues = column.arraySync();

  var chips = names.map(function (name, i) {
    return h("button", {
      key: i,
      type: "button",
      className: "gs-chip" + (i === selected ? " gs-chip--on" : ""),
      "aria-pressed": i === pinned,
      onClick: function () { setPinned(i); },
      onMouseEnter: function () { setHovered(i); },
      onMouseLeave: function () { setHovered(null); },
      onFocus: function () { setHovered(i); },
      onBlur: function () { setHovered(null); }
    }, name);
  });

  /* Read-only negative/positive bounds. The gradient mirrors how the library mixes
     colours (towards white at zero), and collapses to a single-sided ramp when
     the channel never crosses zero. */
  var ramp;
  if (minValue >= 0) {
    ramp = "linear-gradient(to right, #fff, " + GLUSCOPE_POSITIVE_COLOR + ")";
  } else if (maxValue <= 0) {
    ramp = "linear-gradient(to right, " + GLUSCOPE_NEGATIVE_COLOR + ", #fff)";
  } else {
    ramp = "linear-gradient(to right, " + GLUSCOPE_NEGATIVE_COLOR + ", #fff, " +
           GLUSCOPE_POSITIVE_COLOR + ")";
  }

  var bound = function (label, value) {
    return h("span", {className: "gs-bound"},
      h("span", {className: "gs-bound-label"}, label),
      h("span", {className: "gs-bound-value"}, value.toFixed(2)));
  };

  var legend = h("div", {className: "gs-bounds"},
    bound("Negative bound", minValue),
    h("span", {className: "gs-bound-ramp", style: {backgroundImage: ramp},
               "aria-hidden": "true"}),
    bound("Positive bound", maxValue)
  );

  return h("div", {className: "gs-tokens", style: {paddingBottom: 20 * nLabels}},
    h("div", {className: "gs-chips", role: "group", "aria-label": "Activation channel"}, chips),
    legend,
    h(wX, {
      tokens: tokens,
      values: columnValues,
      maxValue: maxValue,
      minValue: minValue,
      negativeColor: GLUSCOPE_NEGATIVE_COLOR,
      positiveColor: GLUSCOPE_POSITIVE_COLOR,
      tooltips: columnValues.map(function (_, i) {
        return h(sbt, {key: i, title: tokens[i], labels: names,
                       values: grid, tokenIndex: i, currentValueIndex: selected});
      })
    })
  );
}
"""


def die(msg):
    sys.exit(f"patch-circuitsvis: FAILED: {msg}")


def fetch():
    if CACHE.exists():
        print(f"  using cached {CACHE.name}")
        return CACHE.read_text(encoding="utf-8")
    print(f"  downloading {SRC_URL}")
    with urllib.request.urlopen(SRC_URL, timeout=120) as r:
        text = r.read().decode("utf-8")
    CACHE.write_text(text, encoding="utf-8")
    return text


def main():
    src = fetch()
    print(f"  source: {len(src):,} bytes  sha256={hashlib.sha256(src.encode()).hexdigest()[:16]}")

    if MARKER in src:
        die("upstream source already contains the patch marker (double-vendored?)")

    # 1. Verify every assumption before changing anything.
    if src.count(BUGGY) != 1:
        die(f"expected exactly 1 occurrence of the buggy ColoredTokensMulti, "
            f"found {src.count(BUGGY)}. circuitsvis {VERSION} is not what we "
            f"patched against -- re-derive the patch before continuing.")

    for ident, context in REQUIRED_IDENTS.items():
        if context not in src:
            die(f"module-internal identifier `{ident}` not found via context "
                f"{context!r}; the minified names have changed.")

    if src.count(EXPORT_OLD) != 1:
        die(f"expected exactly 1 occurrence of {EXPORT_OLD!r} in the export list, "
            f"found {src.count(EXPORT_OLD)}.")

    # The buggy component must be defined before the export list, so that
    # appending our replacement just before the exports keeps every identifier
    # it references already in scope.
    if src.index(BUGGY) > src.rindex("export{"):
        die("unexpected layout: component is defined after the export list.")

    print(f"  all {len(REQUIRED_IDENTS) + 4} assertions passed")

    # 2. Apply. Insert immediately before the export statement so that `nr`,
    #    `Ae`, `obt`, `wX`, `sbt` and `r$` are all initialised by then.
    body = REPLACEMENT % {
        "marker": MARKER,
        "neg": repr(NEGATIVE_COLOR).replace("'", '"'),
        "pos": repr(POSITIVE_COLOR).replace("'", '"'),
    }

    at = src.rindex("export{")
    patched = src[:at] + body + "\n" + src[at:]
    patched = patched.replace(EXPORT_OLD, EXPORT_NEW)

    banner = (
        f"/* circuitsvis {VERSION} -- vendored and patched for GLUScope.\n"
        f" * DO NOT EDIT BY HAND. Regenerate with: python3 tools/patch-circuitsvis.py\n"
        f" * Upstream: {SRC_URL}\n"
        f" * Patch: ColoredTokensMulti derives its colour bounds from the selected\n"
        f" * label instead of holding them in useState. See the script for why.\n"
        f" */\n"
    )

    # Drop the sourcemap reference: the .map file is not vendored, so leaving it
    # would make devtools 404 on every page load.
    patched = re.sub(r"\n?//# sourceMappingURL=\S*", "", patched)

    # 3. Verify the result.
    if patched.count(MARKER) != 2:  # the function definition + the export entry
        die(f"post-patch marker count is {patched.count(MARKER)}, expected 2.")
    if "ibt as ColoredTokensMulti" in patched:
        die("export was not repointed.")
    if "sourceMappingURL" in patched:
        die("sourcemap reference survived stripping.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(banner + patched, encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size:,} bytes)")
    print("  note: upstream `ibt` is left in the bundle but is no longer exported.")


if __name__ == "__main__":
    main()
