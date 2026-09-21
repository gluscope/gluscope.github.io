/* ============================================================================
   GLUScope -- activation heat-map loader.
   ----------------------------------------------------------------------------
   Replaces the ~60-line script that was inlined, near-identically, into all 174
   generated vis.html pages. Behaviour is unchanged: each .circuit-viz
   placeholder lazily fetches its JSON and renders a ColoredTokensMulti heat-map
   when it scrolls near the viewport (or when the <details> around it is opened).

   Two differences from the original inline version:
     * it imports circuitsvis from the vendored, patched copy rather than the
       CDN -- see tools/patch-circuitsvis.py for what is patched and why;
     * a failed fetch now says so in place, instead of leaving a silent
       empty box.
   ========================================================================== */

import { render, ColoredTokensMulti } from "./circuitsvis-1.43.3-patched.js";

async function loadAndRender(container) {
  container.classList.add("loading");
  try {
    const res = await fetch(container.dataset.url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const payload = await res.json();

    // circuitsvis renders into an element looked up by id.
    if (!container.id) {
      container.id = "viz-" + Math.random().toString(36).slice(2);
    }
    render(container.id, ColoredTokensMulti, payload);
  } catch (err) {
    container.textContent =
      `Could not load this example (${container.dataset.url}): ${err.message}`;
    container.classList.add("gs-viz-error");
  } finally {
    container.classList.remove("loading");
  }
}

/* Start loading a little before the element scrolls into view. Placeholders
   inside a closed <details> have no box, so they simply stay unobserved until
   the section is expanded -- which is the behaviour we want. */
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        loadAndRender(entry.target);
      }
    }
  },
  { rootMargin: "200px" }
);

for (const el of document.querySelectorAll(".circuit-viz")) {
  observer.observe(el);
}
