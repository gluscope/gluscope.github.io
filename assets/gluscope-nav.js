/* ============================================================================
   GLUScope -- breadcrumb navigation for neuron pages.
   ----------------------------------------------------------------------------
   The generated vis.html pages contained no links at all, so once you opened
   one the only way out was the browser's Back button -- and Back landed on an
   index that had forgotten your selection. This module adds a sticky header
   with:

     * a home link that carries the current selection in the URL hash, so the
       index can restore it instead of starting from scratch;
     * model / layer / neuron dropdowns for jumping without going home;
     * previous / next neuron within the current layer.

   It is byte-identical on every page: model, layer and neuron are derived from
   the URL, and every path is resolved against this module's own location, so
   the file is independent of where the site is mounted (user page, project
   page, or a local file:// tree).

   If pages.json cannot be loaded the header still renders, with a working home
   link and the breadcrumb as static text. Navigation must never be worse than
   what it replaced.
   ========================================================================== */

const ROOT = new URL("../", import.meta.url);
const INDEX = new URL("index.html", ROOT);
const PAGES = new URL("pages.json", ROOT);

/** Current position, derived from the URL: ["gemma-2-2b", "L0", "N0"]. */
function currentPath() {
  const base = decodeURIComponent(new URL(ROOT).pathname);
  const here = decodeURIComponent(location.pathname);
  if (!here.startsWith(base)) return null;
  const parts = here.slice(base.length).split("/").filter(Boolean);
  // .../<model>/<layer>/<neuron>/vis.html
  return parts.length >= 4 ? parts.slice(0, 3) : null;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

function sep() {
  return el("span", { class: "gs-crumb-sep", text: "/", "aria-hidden": "true" });
}

/** Home link, with the current selection encoded so the index can restore it. */
function homeHref(path) {
  if (!path) return INDEX.href;
  const [m, l, n] = path.map(encodeURIComponent);
  return `${INDEX.href}#m=${m}&l=${l}&n=${n}`;
}

function select(id, label, options, selected) {
  const s = el("select", { class: "gs-select", id, "aria-label": label });
  for (const o of options) {
    const opt = el("option", { value: o.value, text: o.label });
    if (o.value === selected) opt.selected = true;
    s.appendChild(opt);
  }
  return s;
}

function stepLink(id, glyph, title) {
  return el("a", { class: "gs-btn gs-btn--icon", id, title, "aria-label": title, text: glyph });
}

function build(path, tree) {
  const inner = el("div", { class: "gs-header-inner" });

  inner.appendChild(el("a", {
    class: "gs-wordmark",
    href: homeHref(path),
    title: "All models",
  }, [el("span", { class: "gs-mark", "aria-hidden": "true" }), document.createTextNode("GLUScope")]));

  if (!path) {
    return el("header", { class: "gs-header" }, inner);
  }

  inner.appendChild(sep());
  const crumbs = el("div", { class: "gs-crumbs" });
  inner.appendChild(crumbs);

  const [model, layer, neuron] = path;

  if (!tree) {
    // Degraded mode: static breadcrumb, home link still works.
    crumbs.appendChild(el("span", { class: "gs-crumb", text: model }));
    crumbs.appendChild(sep());
    crumbs.appendChild(el("span", { class: "gs-crumb", text: layer }));
    crumbs.appendChild(sep());
    crumbs.appendChild(el("span", { class: "gs-crumb", text: neuron }));
    return el("header", { class: "gs-header" }, inner);
  }

  const byTitle = (list, title) => list.find((x) => x.title === title);
  const modelNode = byTitle(tree, model);
  const layerNode = modelNode && byTitle(modelNode.children || [], layer);
  const neurons = (layerNode && layerNode.children) || [];

  const opts = (list) => list.map((x) => ({ value: x.title, label: x.title }));

  const modelSel = select("gs-model", "Model", opts(tree), model);
  const layerSel = select("gs-layer", "Layer",
    opts((modelNode && modelNode.children) || []), layer);
  const neuronSel = select("gs-neuron", "Neuron", opts(neurons), neuron);

  crumbs.append(modelSel, sep(), layerSel, sep(), neuronSel);

  const go = (node) => {
    if (node && node.url) location.href = new URL(node.url, ROOT).href;
  };
  /** First neuron of a layer -- so a layer/model jump always lands somewhere real. */
  const firstNeuron = (ln) => (ln && ln.children && ln.children[0]) || null;

  neuronSel.addEventListener("change", () => {
    go(byTitle(neurons, neuronSel.value));
  });

  layerSel.addEventListener("change", () => {
    go(firstNeuron(byTitle(modelNode.children || [], layerSel.value)));
  });

  modelSel.addEventListener("change", () => {
    const nextModel = byTitle(tree, modelSel.value);
    if (!nextModel) return;
    const layers = nextModel.children || [];
    // Keep the same layer across models when it exists (L0 always does),
    // otherwise fall back to the model's first layer.
    go(firstNeuron(byTitle(layers, layer) || layers[0]));
  });

  // previous / next neuron within this layer
  inner.appendChild(el("span", { class: "gs-header-spacer" }));
  const steps = el("div", { class: "gs-steps" });
  const at = neurons.findIndex((x) => x.title === neuron);
  const prev = at > 0 ? neurons[at - 1] : null;
  const next = at >= 0 && at < neurons.length - 1 ? neurons[at + 1] : null;

  for (const [node, glyph, label] of [
    [prev, "‹", prev ? `Previous neuron (${prev.title})` : "No previous neuron"],
    [next, "›", next ? `Next neuron (${next.title})` : "No next neuron"],
  ]) {
    const a = stepLink(null, glyph, label);
    if (node) a.href = new URL(node.url, ROOT).href;
    else { a.setAttribute("aria-disabled", "true"); a.style.opacity = ".4"; a.style.pointerEvents = "none"; }
    steps.appendChild(a);
  }
  inner.appendChild(steps);

  return el("header", { class: "gs-header" }, inner);
}

async function main() {
  const mount = document.getElementById("gs-nav");
  if (!mount) return;
  const path = currentPath();

  // Render the degraded header first so navigation exists even if the fetch
  // below is slow or fails outright.
  mount.replaceChildren(build(path, null));

  let tree = null;
  try {
    const res = await fetch(PAGES);
    if (res.ok) tree = await res.json();
  } catch (_) {
    /* offline, or opened straight off disk with fetch blocked -- keep degraded */
  }
  if (tree) mount.replaceChildren(build(path, tree));
}

main();
