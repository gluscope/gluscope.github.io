/* ============================================================================
   GLUScope -- the model / layer / neuron picker on the landing page.
   ----------------------------------------------------------------------------
   The original version kept the selection only in the DOM. Opening a neuron
   navigated away, and coming back re-ran the script from scratch: the layer and
   neuron dropdowns were hidden again and the whole selection had to be redone.

   The selection now lives in the URL hash (#m=...&l=...&n=...), written with
   replaceState so that twiddling dropdowns does not fill up the history, and
   restored on load. Neuron pages link back here with the same hash, so the
   round trip survives a cold load -- it does not depend on the back/forward
   cache.
   ========================================================================== */

const PAGES = new URL("pages.json", new URL("../", import.meta.url));

const els = {
  model: document.getElementById("modelSelect"),
  layer: document.getElementById("layerSelect"),
  neuron: document.getElementById("neuronSelect"),
  open: document.getElementById("openBtn"),
  hint: document.getElementById("openHint"),
  summary: document.getElementById("gs-summary"),
  error: document.getElementById("gs-error"),
};

const byTitle = (list, title) => (list || []).find((x) => x.title === title) || null;

/* ------------------------------------------------------------- hash state -- */

function readHash() {
  const raw = location.hash.replace(/^#/, "");
  const out = {};
  for (const pair of raw.split("&")) {
    const [k, v] = pair.split("=");
    if (k && v) out[k] = decodeURIComponent(v);
  }
  return { m: out.m || null, l: out.l || null, n: out.n || null };
}

function writeHash() {
  const parts = [];
  if (els.model.value) parts.push("m=" + encodeURIComponent(els.model.value));
  if (els.layer.value && !els.layer.disabled) parts.push("l=" + encodeURIComponent(els.layer.value));
  if (els.neuron.value && !els.neuron.disabled) parts.push("n=" + encodeURIComponent(els.neuron.value));
  // replaceState, not a hash assignment: the picker should not generate a
  // history entry for every dropdown change.
  history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname);
}

/* ---------------------------------------------------------------- filling -- */

function fill(select, items, placeholder, selected) {
  select.replaceChildren();
  const ph = new Option(placeholder, "");
  ph.disabled = true;
  ph.selected = true;
  select.appendChild(ph);
  for (const item of items) {
    const opt = new Option(item.title, item.title);
    if (item.title === selected) opt.selected = true;
    select.appendChild(opt);
  }
  select.disabled = items.length === 0;
}

function resetDownstream(select, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  select.disabled = true;
}

function setOpen(url) {
  if (url) {
    els.open.href = url;
    els.open.setAttribute("aria-disabled", "false");
    els.hint.textContent = "Opens in this tab — or middle-click to open in a new one.";
  } else {
    els.open.removeAttribute("href");
    els.open.setAttribute("aria-disabled", "true");
    els.hint.textContent = "Choosing a neuron opens it straight away.";
  }
}

/* ------------------------------------------------------------------ main -- */

function start(tree) {
  const models = tree.length;
  let layers = 0;
  let neurons = 0;
  for (const m of tree) {
    layers += (m.children || []).length;
    for (const l of m.children || []) neurons += (l.children || []).length;
  }
  els.summary.textContent =
    `${neurons} neuron${neurons === 1 ? "" : "s"} across ` +
    `${layers} layer${layers === 1 ? "" : "s"} of ${models} model${models === 1 ? "" : "s"}.`;

  const onModel = () => {
    const model = byTitle(tree, els.model.value);
    fill(els.layer, (model && model.children) || [], "Select a layer…");
    resetDownstream(els.neuron, "Select a layer first");
    setOpen(null);
    writeHash();
  };

  const onLayer = () => {
    const model = byTitle(tree, els.model.value);
    const layer = byTitle(model && model.children, els.layer.value);
    fill(els.neuron, (layer && layer.children) || [], "Select a neuron…");
    setOpen(null);
    writeHash();
  };

  const onNeuron = () => {
    const model = byTitle(tree, els.model.value);
    const layer = byTitle(model && model.children, els.layer.value);
    const neuron = byTitle(layer && layer.children, els.neuron.value);
    if (!neuron) return;
    setOpen(neuron.url);
    writeHash();
    location.href = neuron.url;
  };

  els.model.addEventListener("change", onModel);
  els.layer.addEventListener("change", onLayer);
  els.neuron.addEventListener("change", onNeuron);

  // Restore whatever the hash carries, as far down the hierarchy as it is valid.
  const want = readHash();
  fill(els.model, tree, "Select a model…", want.m);

  const model = byTitle(tree, want.m);
  if (!model) return;

  fill(els.layer, model.children || [], "Select a layer…", want.l);
  const layer = byTitle(model.children, want.l);
  if (!layer) return;

  fill(els.neuron, layer.children || [], "Select a neuron…", want.n);
  const neuron = byTitle(layer.children, want.n);
  // Deliberately does NOT navigate: arriving here from a neuron page must not
  // bounce straight back to it. It just arms the Open button.
  if (neuron) setOpen(neuron.url);
}

function fail(message) {
  els.error.hidden = false;
  els.error.textContent = message;
  els.summary.textContent = "";
  for (const s of [els.model, els.layer, els.neuron]) s.disabled = true;
}

(async () => {
  try {
    const res = await fetch(PAGES);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    start(await res.json());
  } catch (err) {
    fail(`Could not load the neuron index (pages.json): ${err.message}`);
  }
})();
