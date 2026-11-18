// Rififi dans l'Arizona : application statique sans build.
// Les données vivent dans /data/*.json ; ce script les charge et rend chaque section.

const FILES = ["acteurs", "relations", "chronologie", "citations", "dossier", "sources"];
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, html = "") => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  if (html) n.innerHTML = html;
  return n;
};
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SVGNS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

const fmtLong = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtShort = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", year: "numeric" });
const fmtMonth = new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric" });
const toDate = iso => new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
const dateLabel = (o, long = false) => o.date_floue || (long ? fmtLong : fmtShort).format(toDate(o.date));

let D = {};          // toutes les données
let A = new Map();   // acteurs par id
let SRC_NUM = new Map();

async function load() {
  const res = await Promise.all(FILES.map(f => fetch(`data/${f}.json`).then(r => { if (!r.ok) throw new Error(f); return r.json(); })));
  FILES.forEach((f, i) => (D[f] = res[i]));
  D.acteurs.acteurs.forEach(a => A.set(a.id, a));
  Object.keys(D.sources.sources).forEach((id, i) => SRC_NUM.set(id, i + 1));
}

const party = id => D.acteurs.partis[A.get(id)?.parti] || D.acteurs.partis.inst;
const nameOf = (id, q) => id === "anonyme" ? (q?.de_label || "Source anonyme") : (A.get(id)?.nom || id);
const pill = id => { const p = party(id); return `<span class="pill" style="background:${p.couleur};color:${p.texte}">${esc(nameOf(id))}</span>`; };
const srcLinks = (ids = []) => ids.length ? `<span class="srcs">Sources&nbsp;: ${ids.map(id => `<a href="#src-${id}" title="${esc(D.sources.sources[id]?.media || "")}">[${SRC_NUM.get(id)}]</a>`).join(" ")}</span>` : "";

/* ---------- En-tête ---------- */
function renderHeader() {
  const d = D.dossier;
  $("#etat-au").textContent = "État au " + fmtLong.format(new Date(d.etat_au)) + ", 22 h 30";
  const box = $("#countdown");
  const tick = () => {
    const ms = new Date(d.echeance.date) - Date.now();
    if (ms <= 0) { box.innerHTML = `<span class="countdown__label">${esc(d.echeance.label)} : échéance atteinte, le dossier doit être mis à jour</span>`; return; }
    const j = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    box.innerHTML = `<span class="countdown__label">${esc(d.echeance.label)}</span>` +
      [[j, "jours"], [h, "heures"], [m, "min"]].map(([v, l]) => `<div class="countdown__cell"><b>${v}</b><span>${l}</span></div>`).join("");
  };
  tick(); setInterval(tick, 30000);
}

/* ---------- Synthèse ---------- */
function renderSynthese() {
  const d = D.dossier;
  $("#these").textContent = d.these;
  $("#chiffres").innerHTML = d.chiffres.map(c => `<div class="stat"><b>${esc(c.valeur)}</b><span>${esc(c.label)}</span></div>`).join("");
  $("#points-cles").innerHTML = d.points_cles.map(k => `<div class="key"><h3>${esc(k.titre)}</h3><p>${esc(k.texte)}</p></div>`).join("");
}

/* ---------- Réseau ---------- */
const net = { etats: new Set(), sel: null };

function renderNetwork() {
  const R = D.relations, g = $("#graph");
  Object.keys(R.etats).forEach(k => net.etats.add(k));

  // filtres
  const chips = $("#filtre-etats");
  Object.entries(R.etats).forEach(([k, e]) => {
    const n = R.liens.filter(l => l.etat === k).length;
    const b = el("button", { class: "chip", "aria-pressed": "true", type: "button" }, `<i class="dot" style="background:${e.couleur}"></i>${esc(e.label)} <span class="muted">${n}</span>`);
    b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", String(!on));
      on ? net.etats.delete(k) : net.etats.add(k);
      drawGraph();
    });
    chips.append(b);
  });

  g.addEventListener("click", e => { if (e.target === g || e.target.classList.contains("bg")) select(null); });
  drawGraph();
  select(null);
}

function drawGraph() {
  const R = D.relations, g = $("#graph"), P = R.positions;
  g.innerHTML = "";
  g.append(svg("rect", { x: 0, y: 0, width: 1040, height: 640, fill: "transparent", class: "bg" }));

  // étiquettes de groupes
  const byParty = {};
  Object.keys(P).forEach(id => { const k = A.get(id).parti; (byParty[k] ||= []).push(P[id]); });
  for (const [k, pts] of Object.entries(byParty)) {
    const x = pts.reduce((s, p) => s + p[0], 0) / pts.length, y = Math.min(...pts.map(p => p[1])) - 46;
    const t = svg("text", { x, y: Math.max(16, y), "text-anchor": "middle", class: "cluster" }); t.textContent = D.acteurs.partis[k].nom; g.append(t);
  }

  const edges = svg("g"), nodes = svg("g");
  g.append(edges, nodes);

  R.liens.forEach((l, i) => {
    if (!net.etats.has(l.etat)) return;
    const [x1, y1] = P[l.a], [x2, y2] = P[l.b], st = R.etats[l.etat];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const bend = (i % 2 ? 1 : -1) * Math.min(40, len * .12);
    const cx = mx - dy / len * bend, cy = my + dx / len * bend;
    const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
    const path = svg("path", { d, class: "edge", stroke: st.couleur, "stroke-width": 1.4 + st.rang * .75, "data-i": i, "data-a": l.a, "data-b": l.b });
    if (l.etat === "tendu" || l.etat === "ambivalent") path.setAttribute("stroke-dasharray", "7 6");
    const hit = svg("path", { d, class: "edge-hit", "data-i": i });
    const title = svg("title"); title.textContent = `${nameOf(l.a)} – ${nameOf(l.b)} : ${st.label}`; hit.append(title);
    hit.addEventListener("click", e => { e.stopPropagation(); select({ edge: i }); });
    edges.append(path, hit);
  });

  Object.entries(P).forEach(([id, [x, y]]) => {
    const a = A.get(id), p = party(id), r = id === "dewever" ? 31 : 24;
    const n = svg("g", { class: "node", transform: `translate(${x},${y})`, tabindex: 0, role: "button", "aria-label": a.nom, "data-id": id });
    n.append(svg("circle", { r, fill: p.couleur }));
    const ini = svg("text", { class: "ini", fill: p.texte }); ini.textContent = a.initiales.slice(0, 4); n.append(ini);
    const lbl = svg("text", { class: "lbl", y: r + 16 }); lbl.textContent = a.nom.replace(/^\S+\s/, ""); n.append(lbl);
    n.addEventListener("click", e => { e.stopPropagation(); select({ node: id }); });
    n.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ node: id }); } });
    nodes.append(n);
  });
  applySelection();
}

function select(s) { net.sel = s; applySelection(); renderPanel(); }

function applySelection() {
  const g = $("#graph"), s = net.sel;
  g.classList.toggle("has-focus", !!s);
  g.querySelectorAll(".is-on,.is-sel").forEach(n => n.classList.remove("is-on", "is-sel"));
  if (!s) return;
  if (s.node) {
    const nb = new Set([s.node]);
    g.querySelectorAll(".edge").forEach(p => { if (p.dataset.a === s.node || p.dataset.b === s.node) { p.classList.add("is-on"); nb.add(p.dataset.a); nb.add(p.dataset.b); } });
    g.querySelectorAll(".node").forEach(n => { if (nb.has(n.dataset.id)) n.classList.add("is-on"); if (n.dataset.id === s.node) n.classList.add("is-sel"); });
  } else if (s.edge != null) {
    const l = D.relations.liens[s.edge];
    g.querySelectorAll(".edge").forEach(p => { if (+p.dataset.i === s.edge) p.classList.add("is-on", "is-sel"); });
    g.querySelectorAll(".node").forEach(n => { if (n.dataset.id === l.a || n.dataset.id === l.b) n.classList.add("is-on"); });
  }
}

function stateBadge(k) { const e = D.relations.etats[k]; return `<span class="badge state-badge" style="background:${e.couleur}">${esc(e.label)}</span>`; }

function renderPanel() {
  const pnl = $("#panel"), s = net.sel, R = D.relations;
  if (!s) {
    const counts = Object.entries(R.etats).map(([k, e]) => `<li>${stateBadge(k)} &nbsp;${R.liens.filter(l => l.etat === k).length} relation(s)</li>`).join("");
    const worst = R.liens.filter(l => l.etat === "rupture");
    pnl.innerHTML = `<h4>Mode d'emploi</h4><p class="hint">Cliquez sur une personne pour afficher ses relations et ses petites phrases, ou sur un trait pour en connaître l'histoire. Cliquez sur le fond pour revenir à cette vue.</p>
      <h4>Vue d'ensemble</h4><ul>${counts}</ul>
      <h4>Les ruptures</h4><ul>${worst.map(l => `<li><button class="link" data-edge="${R.liens.indexOf(l)}">${esc(nameOf(l.a))} ↔ ${esc(nameOf(l.b))}</button></li>`).join("")}</ul>
      <p class="hint" style="margin-top:1rem">Les traits pointillés signalent une relation tendue ou ambivalente. L'épaisseur traduit l'intensité du conflit.</p>`;
  } else if (s.node) {
    const a = A.get(s.node), p = party(s.node);
    const rels = R.liens.map((l, i) => ({ l, i })).filter(({ l }) => l.a === s.node || l.b === s.node).sort((x, y) => R.etats[y.l.etat].rang - R.etats[x.l.etat].rang);
    const said = D.citations.citations.filter(q => q.de === s.node);
    const recv = D.citations.citations.filter(q => q.vers.includes(s.node));
    const sample = [...said].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 2);
    pnl.innerHTML = `<span class="badge" style="background:${p.couleur};color:${p.texte}">${esc(p.nom)}</span>
      <h3>${esc(a.nom)}</h3><p class="hint">${esc(a.fonction)}</p>
      <p>${esc(a.posture)}</p>
      <h4>Relations (${rels.length})</h4>
      <ul>${rels.map(({ l, i }) => { const o = l.a === s.node ? l.b : l.a; return `<li>${stateBadge(l.etat)} <button class="link" data-edge="${i}">${esc(nameOf(o))}</button><br><span class="hint">${esc(l.titre)}</span></li>`; }).join("") || "<li class='hint'>Aucune relation cartographiée.</li>"}</ul>
      <h4>Petites phrases</h4>
      <p>${said.length} prononcée(s), ${recv.length} reçue(s). <button class="link" data-quotes-de="${s.node}">Voir ses phrases</button> · <button class="link" data-quotes-vers="${s.node}">Voir celles qui le/la visent</button></p>
      ${sample.map(q => `<blockquote>« ${esc(q.texte)} »</blockquote><p class="hint">${esc(dateLabel(q))} · ${esc(q.media)}</p>`).join("")}`;
  } else {
    const l = R.liens[s.edge];
    const qs = D.citations.citations.filter(q => (q.de === l.a && q.vers.includes(l.b)) || (q.de === l.b && q.vers.includes(l.a)));
    pnl.innerHTML = `${stateBadge(l.etat)}
      <h3>${esc(l.titre)}</h3>
      <div class="who">${pill(l.a)} <span class="arrow">↔</span> ${pill(l.b)}</div>
      <p>${esc(l.resume)}</p>
      ${qs.length ? `<h4>Échanges recensés</h4>${qs.map(q => `<blockquote>« ${esc(q.texte)} »</blockquote><p class="hint">${esc(nameOf(q.de, q))} · ${esc(dateLabel(q))} · ${esc(q.media)}</p>`).join("")}` : ""}
      <h4>Sources</h4><p>${srcLinks(l.sources)}</p>
      <p><button class="link" data-node="${l.a}">Fiche ${esc(nameOf(l.a))}</button> · <button class="link" data-node="${l.b}">Fiche ${esc(nameOf(l.b))}</button></p>`;
  }
  pnl.querySelectorAll("[data-edge]").forEach(b => b.addEventListener("click", () => select({ edge: +b.dataset.edge })));
  pnl.querySelectorAll("[data-node]").forEach(b => b.addEventListener("click", () => select({ node: b.dataset.node })));
  pnl.querySelectorAll("[data-quotes-de]").forEach(b => b.addEventListener("click", () => goQuotes({ de: b.dataset.quotesDe })));
  pnl.querySelectorAll("[data-quotes-vers]").forEach(b => b.addEventListener("click", () => goQuotes({ vers: b.dataset.quotesVers })));
}

/* ---------- Matrice ---------- */
function renderMatrix() {
  const qs = D.citations.citations.filter(q => q.de !== "anonyme" && q.vers.length && q.ton !== "defense");
  const pairs = new Map(), tot = new Map(), rec = new Map();
  qs.forEach(q => q.vers.forEach(v => {
    const k = q.de + ">" + v; pairs.set(k, (pairs.get(k) || 0) + 1);
    tot.set(q.de, (tot.get(q.de) || 0) + 1); rec.set(v, (rec.get(v) || 0) + 1);
  }));
  const rows = [...tot.keys()].sort((a, b) => tot.get(b) - tot.get(a));
  const cols = [...rec.keys()].sort((a, b) => rec.get(b) - rec.get(a));
  const max = Math.max(...pairs.values());
  const t = $("#matrice");
  t.innerHTML = `<thead><tr><th></th>${cols.map(c => `<th scope="col"><span class="swatch" style="background:${party(c).couleur}"></span>${esc(nameOf(c))}</th>`).join("")}<th scope="col">Total</th></tr></thead>
    <tbody>${rows.map(r => `<tr><th scope="row"><span class="swatch" style="background:${party(r).couleur}"></span>${esc(nameOf(r))}</th>${cols.map(c => {
      const n = pairs.get(r + ">" + c) || 0;
      if (!n) return `<td class="z">0</td>`;
      const a = .15 + .85 * n / max;
      return `<td style="background:rgba(200,16,46,${a.toFixed(2)});color:${a > .55 ? "#fff" : "var(--ink)"}"><button data-de="${r}" data-vers="${c}" title="${esc(nameOf(r))} → ${esc(nameOf(c))}">${n}</button></td>`;
    }).join("")}<td><b>${tot.get(r)}</b></td></tr>`).join("")}</tbody>`;
  t.querySelectorAll("button").forEach(b => b.addEventListener("click", () => goQuotes({ de: b.dataset.de, vers: b.dataset.vers })));
}

/* ---------- Chronologie ---------- */
const chrono = { types: new Set(), acteur: "" };
function renderChronoFilters() {
  const T = D.chronologie.types, box = $("#filtre-types");
  Object.keys(T).forEach(k => chrono.types.add(k));
  Object.entries(T).forEach(([k, label]) => {
    const n = D.chronologie.evenements.filter(e => e.type === k).length;
    const b = el("button", { class: "chip", type: "button", "aria-pressed": "true" }, `${esc(label)} <span class="muted">${n}</span>`);
    b.addEventListener("click", () => { const on = b.getAttribute("aria-pressed") === "true"; b.setAttribute("aria-pressed", String(!on)); on ? chrono.types.delete(k) : chrono.types.add(k); renderTimeline(); });
    box.append(b);
  });
  const sel = $("#filtre-acteur-chrono");
  const used = new Set(D.chronologie.evenements.flatMap(e => e.acteurs));
  D.acteurs.acteurs.filter(a => used.has(a.id)).forEach(a => sel.append(el("option", { value: a.id }, esc(a.nom))));
  sel.addEventListener("change", () => { chrono.acteur = sel.value; renderTimeline(); });
}
function renderTimeline() {
  const T = D.chronologie.types, ol = $("#timeline");
  const evs = D.chronologie.evenements.filter(e => chrono.types.has(e.type) && (!chrono.acteur || e.acteurs.includes(chrono.acteur)))
    .sort((a, b) => a.date.localeCompare(b.date));
  let month = "";
  ol.innerHTML = evs.map(e => {
    const m = fmtMonth.format(toDate(e.date));
    const head = m !== month ? `<li class="tl-month" aria-hidden="true">${esc(m)}</li>` : "";
    month = m;
    return `${head}<li class="tl-item${e.avenir ? " is-future" : ""}" data-type="${e.type}">
      <div class="tl-meta"><time datetime="${e.date}">${esc(dateLabel(e, true))}</time><span>· ${esc(T[e.type])}${e.avenir ? " · à venir" : ""}</span></div>
      <h3>${esc(e.titre)}</h3><p>${esc(e.texte)}</p>
      <div class="who">${e.acteurs.map(pill).join("")}</div>${srcLinks(e.sources)}</li>`;
  }).join("") || `<li class="hint">Aucun événement pour ces filtres.</li>`;
}

/* ---------- Citations ---------- */
const qf = { de: "", vers: "", tons: new Set(), q: "" };
const TON_COL = { attaque: "#c8102e", riposte: "#e0662b", ironie: "#6f5fb0", defense: "#2f7d5b", alerte: "#c99400" };
function renderQuoteFilters() {
  const C = D.citations;
  $("#note-citations").textContent = C.note;
  const speakers = [...new Set(C.citations.map(q => q.de))].filter(x => x !== "anonyme");
  const targets = [...new Set(C.citations.flatMap(q => q.vers))];
  const fill = (sel, ids) => ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b), "fr")).forEach(id => sel.append(el("option", { value: id }, esc(nameOf(id)))));
  fill($("#f-de"), speakers); $("#f-de").append(el("option", { value: "anonyme" }, "Sources anonymes"));
  fill($("#f-vers"), targets);
  Object.keys(C.tons).forEach(k => qf.tons.add(k));
  Object.entries(C.tons).forEach(([k, label]) => {
    const b = el("button", { class: "chip", type: "button", "aria-pressed": "true" }, `<i class="dot" style="background:${TON_COL[k]}"></i>${esc(label)}`);
    b.addEventListener("click", () => { const on = b.getAttribute("aria-pressed") === "true"; b.setAttribute("aria-pressed", String(!on)); on ? qf.tons.delete(k) : qf.tons.add(k); renderQuotes(); });
    $("#f-ton").append(b);
  });
  $("#f-de").addEventListener("change", e => { qf.de = e.target.value; renderQuotes(); });
  $("#f-vers").addEventListener("change", e => { qf.vers = e.target.value; renderQuotes(); });
  $("#f-q").addEventListener("input", e => { qf.q = e.target.value.trim().toLowerCase(); renderQuotes(); });
}
const norm = s => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
function renderQuotes() {
  const C = D.citations;
  const list = C.citations.filter(q =>
    (!qf.de || q.de === qf.de) && (!qf.vers || q.vers.includes(qf.vers)) && qf.tons.has(q.ton) &&
    (!qf.q || norm([q.texte, q.original, q.contexte, nameOf(q.de, q), q.media].join(" ")).includes(norm(qf.q)))
  ).sort((a, b) => b.date.localeCompare(a.date));
  $("#count-citations").textContent = `${list.length} citation${list.length > 1 ? "s" : ""} sur ${C.citations.length}`;
  $("#quotes").innerHTML = list.map(q => {
    const c = q.de === "anonyme" ? "#7d776c" : party(q.de).couleur;
    return `<article class="quote" style="--c:${c}">
      <blockquote>${esc(q.texte)}</blockquote>
      ${q.original ? `<p class="orig">VO : ${esc(q.original)}</p>` : ""}
      ${q.contexte ? `<p class="ctx">${esc(q.contexte)}</p>` : ""}
      <footer><strong>${esc(nameOf(q.de, q))}</strong>${q.vers.length ? ` <span class="arrow">→</span> ${q.vers.map(v => esc(nameOf(v))).join(", ")}` : ""}
        <span>· ${esc(dateLabel(q))} · ${esc(q.media)}</span>
        <span class="ton" style="color:${TON_COL[q.ton]}">${esc(C.tons[q.ton])}</span> ${srcLinks(q.sources)}</footer>
    </article>`;
  }).join("") || `<p class="hint">Aucune citation ne correspond.</p>`;
}
function goQuotes({ de = "", vers = "" }) {
  qf.de = de; qf.vers = vers; $("#f-de").value = de; $("#f-vers").value = vers;
  renderQuotes(); $("#phrases").scrollIntoView();
}

/* ---------- Acteurs ---------- */
function renderActors() {
  const P = D.acteurs.partis;
  $("#legende-partis").innerHTML = Object.values(P).map(p => `<span><i style="background:${p.couleur}"></i>${esc(p.nom)}</span>`).join("");
  const order = Object.keys(P);
  const list = [...D.acteurs.acteurs].sort((a, b) => order.indexOf(a.parti) - order.indexOf(b.parti));
  const box = $("#cards");
  list.forEach(a => {
    const p = P[a.parti];
    const nRel = D.relations.liens.filter(l => l.a === a.id || l.b === a.id).length;
    const nQ = D.citations.citations.filter(q => q.de === a.id).length;
    const inGraph = !!D.relations.positions[a.id];
    const card = el("article", { class: "card", id: "acteur-" + a.id }, `
      <div class="card__head"><div class="avatar" style="background:${p.couleur};color:${p.texte}">${esc(a.initiales.slice(0, 4))}</div>
        <div><h3>${esc(a.nom)}</h3><div class="fn">${esc(p.nom)} · ${esc(a.fonction)}</div></div></div>
      <div class="card__body"><p><b>Posture</b>${esc(a.posture)}</p><p><b>Style</b>${esc(a.style)}</p><p><b>Enjeu</b>${esc(a.enjeu)}</p></div>
      <div class="card__foot"><span class="muted">${nRel} relation(s) · ${nQ} citation(s)</span>
        ${inGraph ? `<button type="button" data-g="${a.id}">Voir dans le réseau</button>` : ""}
        ${nQ ? `<button type="button" data-q="${a.id}">Ses phrases</button>` : ""}</div>`);
    box.append(card);
  });
  box.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => { select({ node: b.dataset.g }); $("#reseau").scrollIntoView(); }));
  box.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => goQuotes({ de: b.dataset.q })));
}

/* ---------- Lectures, scénarios, méthode ---------- */
function renderRest() {
  const d = D.dossier;
  $("#analyses").innerHTML = d.analyses.map(a => `<div class="analysis"><h3>${esc(a.auteur)}<small>${esc(a.affiliation)}</small></h3><p>${esc(a.texte)}</p>${srcLinks(a.sources)}</div>`).join("");
  $("#scenarios-list").innerHTML = d.scenarios.map(s => `<div class="scenario"><span class="proba">${esc(s.proba)}</span><h3>${esc(s.titre)}</h3><p>${esc(s.texte)}</p><p class="cond"><b>Si :</b> ${esc(s.condition)}</p></div>`).join("");
  $("#signaux").innerHTML = d.signaux.map(s => `<li>${esc(s)}</li>`).join("");
  $("#divergences").innerHTML = d.divergences.map(v => `<dt>${esc(v.sujet)}</dt><dd>${esc(v.texte)}</dd>`).join("");
  const S = D.sources.sources;
  $("#nb-sources").textContent = `(${Object.keys(S).length})`;
  $("#sources").innerHTML = Object.entries(S).map(([id, s]) => `<li id="src-${id}"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.titre)}</a> <span class="m">${esc(s.media)} · ${esc(s.date)}</span></li>`).join("");
  $("#travaux").innerHTML = D.sources.travaux_lies.map(t => `<li><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.titre)}</a></li>`).join("");
}

/* ---------- Navigation active ---------- */
function navSpy() {
  const links = [...document.querySelectorAll(".nav a")];
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) links.forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id)); });
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("main section[id]").forEach(s => io.observe(s));
}

load().then(() => {
  renderHeader(); renderSynthese(); renderNetwork(); renderMatrix();
  renderChronoFilters(); renderTimeline(); renderQuoteFilters(); renderQuotes();
  renderActors(); renderRest(); navSpy();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}).catch(err => {
  console.error(err);
  $("main").insertAdjacentHTML("afterbegin", `<p class="noscript">Impossible de charger les données (${esc(err.message)}). Si vous ouvrez le fichier en local, servez le dossier via un petit serveur, par exemple <code>python3 -m http.server</code>.</p>`);
});
