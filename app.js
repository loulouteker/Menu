/* Menu de la semaine — application principale */
(() => {
  "use strict";

  const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const REPAS = [
    ["pdj", "Petit-déjeuner"], ["dej", "Déjeuner"], ["din", "Dîner"], ["snk", "Snacks / Goûters"], ["aut", "Autre"],
  ];
  const NB_SEMAINES = 4;
  const LS_DATA = "menu.data";
  const LS_UI = "menu.ui";

  // ───────────────────────── utilitaires
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n, d = 2) => (Math.round((+n || 0) * 10 ** d) / 10 ** d).toLocaleString("fr-FR", { maximumFractionDigits: d });
  const euro = (n) => (+n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const uid = () => Math.random().toString(36).slice(2, 10);
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ───────────────────────── état
  let data = null;          // données de l'utilisateur
  let meta = lsGet("menu.meta") || { etag: null, dirty: false };
  const ui = Object.assign({ view: "planning", semaine: 1, q: "", cat: "", anti: false }, lsGet(LS_UI) || {});
  const saveUi = () => lsSet(LS_UI, ui);

  function emptyData(base) {
    return {
      version: 1,
      recettes: base.recettes || [],
      parametres: base.parametres || {},
      planning: {},
      notes: {},
      courses: {},
      majLe: new Date().toISOString(),
    };
  }

  // ───────────────────────── sauvegarde + synchronisation OneDrive
  let pushTimer = null;
  function persist() {
    data.majLe = new Date().toISOString();
    lsSet(LS_DATA, data);
    meta.dirty = true; lsSet("menu.meta", meta);
    if (OneDrive.connected()) {
      setSync("busy", "Enregistrement…");
      clearTimeout(pushTimer); pushTimer = setTimeout(push, 1200);
    }
  }

  async function push() {
    try {
      const r = await OneDrive.save(data);
      meta = { etag: r.etag, dirty: false }; lsSet("menu.meta", meta);
      setSync("ok", "OneDrive ✓");
    } catch (e) { setSync("err", "Hors ligne"); console.error(e); }
  }

  async function pull({ silent } = {}) {
    if (!OneDrive.connected()) return;
    setSync("busy", "Synchronisation…");
    try {
      const remote = await OneDrive.load();
      if (!remote) { await push(); if (!silent) toast("Données envoyées sur OneDrive"); return; }
      if (meta.dirty && meta.etag !== remote.etag && meta.etag !== null) {
        const keepRemote = confirm(
          "Tes données ont été modifiées sur un autre appareil ET ici.\n\nOK = garder la version OneDrive\nAnnuler = garder la version de cet appareil"
        );
        if (!keepRemote) return push();
      } else if (meta.dirty && (meta.etag === remote.etag)) {
        return push();
      } else if (meta.dirty && meta.etag === null) {
        // premier branchement d'un appareil qui avait déjà des données locales
        const useRemote = confirm(
          "Des données existent déjà sur ton OneDrive.\n\nOK = utiliser les données OneDrive\nAnnuler = les remplacer par celles de cet appareil"
        );
        if (!useRemote) return push();
      }
      data = remote.data;
      lsSet(LS_DATA, data);
      meta = { etag: remote.etag, dirty: false }; lsSet("menu.meta", meta);
      setSync("ok", "OneDrive ✓");
      render();
    } catch (e) { setSync("err", e.message.includes("Session") ? "Reconnexion" : "Hors ligne"); console.error(e); }
  }

  function setSync(state, label) {
    $("#syncDot").className = "dot " + (state || "");
    $("#syncLabel").textContent = label;
  }

  // ───────────────────────── calculs
  const recette = (id) => data.recettes.find((r) => r.id === id);
  const coutRecette = (r, portions) => {
    const base = r.ingredients.reduce((s, i) => s + (+i.prix || 0), 0);
    return portions ? (base * portions) / (r.portions || 1) : base;
  };
  const cell = (w, d, m) => (((data.planning[w] ||= {})[d] ||= {})[m] ||= []);

  function itemsSemaine(w) {
    const out = [];
    const days = data.planning[w] || {};
    for (const d in days) for (const m in days[d]) for (const it of days[d][m]) if (it.r) out.push({ ...it, d: +d, m });
    return out;
  }

  function listeCourses(w) {
    const map = new Map();
    for (const it of itemsSemaine(w)) {
      const r = recette(it.r); if (!r) continue;
      const f = (it.p || r.portions) / (r.portions || 1);
      for (const i of r.ingredients) {
        if (!i.produit) continue;
        const key = norm(i.produit) + "|" + norm(i.unite);
        const e = map.get(key) || { key, produit: i.produit, unite: i.unite, qte: 0, prix: 0, recettes: new Set() };
        e.qte += (+i.qte || 0) * f; e.prix += (+i.prix || 0) * f; e.recettes.add(r.nom);
        map.set(key, e);
      }
    }
    return [...map.values()].sort((a, b) => a.produit.localeCompare(b.produit, "fr"));
  }

  const budgetSemaine = (w) => itemsSemaine(w).reduce((s, it) => {
    const r = recette(it.r); return r ? s + coutRecette(r, it.p || r.portions) : s;
  }, 0);

  // ───────────────────────── rendu
  function render() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === ui.view));
    ({ planning: vPlanning, recettes: vRecettes, courses: vCourses, budget: vBudget })[ui.view]();
  }

  const weekSeg = () => `<div class="seg" role="tablist">${Array.from({ length: NB_SEMAINES }, (_, i) =>
    `<button data-week="${i + 1}" class="${ui.semaine === i + 1 ? "active" : ""}">Sem. ${i + 1}</button>`).join("")}</div>`;

  // Planning
  function vPlanning() {
    const w = ui.semaine;
    const notes = data.notes[w] || {};
    $("#view").innerHTML = `
      <div class="bar"><h2>Planning des repas</h2>${weekSeg()}
        <button class="btn small" data-act="clear-week">Vider la semaine</button></div>
      <div class="week">${JOURS.map((j, d) => `
        <section class="card day">
          <h3>${j}<small>${euro(dayCost(w, d))}</small></h3>
          ${REPAS.map(([k, label]) => `
            <div class="meal">
              <div class="meal-head">${label}<button class="add" data-act="add" data-d="${d}" data-m="${k}" aria-label="Ajouter ${label} ${j}">+</button></div>
              ${cell(w, d, k).map((it, idx) => chip(it, d, k, idx)).join("")}
            </div>`).join("")}
          <textarea class="notes" data-note="${d}" placeholder="Notes…" rows="1">${esc(notes[d] || "")}</textarea>
        </section>`).join("")}
      </div>`;
  }
  function dayCost(w, d) {
    let s = 0; const day = (data.planning[w] || {})[d] || {};
    for (const m in day) for (const it of day[m]) { const r = it.r && recette(it.r); if (r) s += coutRecette(r, it.p || r.portions); }
    return s;
  }
  function chip(it, d, m, idx) {
    if (!it.r) return `<div class="chip free"><span class="name">${esc(it.t)}</span>
      <button class="x" data-act="rm" data-d="${d}" data-m="${m}" data-i="${idx}" aria-label="Retirer">×</button></div>`;
    const r = recette(it.r);
    if (!r) return "";
    return `<div class="chip" data-act="open" data-id="${r.id}"><span class="name">${r.anti ? "🌿 " : ""}${esc(r.nom)}</span>
      <span class="pp">${it.p || r.portions} p.</span>
      <button class="x" data-act="rm" data-d="${d}" data-m="${m}" data-i="${idx}" aria-label="Retirer">×</button></div>`;
  }

  // Recettes
  function vRecettes() {
    const cats = data.parametres.categories || [];
    const q = norm(ui.q);
    const list = data.recettes.filter((r) =>
      (!q || norm(r.nom).includes(q) || r.ingredients.some((i) => norm(i.produit).includes(q))) &&
      (!ui.cat || r.categorie === ui.cat) && (!ui.anti || r.anti))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    $("#view").innerHTML = `
      <div class="bar"><h2>Livre de recettes</h2><button class="btn primary" data-act="new">+ Nouvelle recette</button></div>
      <div class="filters">
        <input type="search" id="q" placeholder="Rechercher une recette ou un ingrédient…" value="${esc(ui.q)}">
        <select id="cat"><option value="">Toutes les catégories</option>${cats.map((c) => `<option ${c === ui.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <label class="check"><input type="checkbox" id="anti" ${ui.anti ? "checked" : ""}> 🌿 Anti-inflammatoire</label>
      </div>
      ${list.length ? `<div class="grid">${list.map((r) => `
        <article class="card rcard" data-act="open" data-id="${r.id}" tabindex="0">
          <h3>${r.anti ? "🌿 " : ""}${esc(r.nom)}</h3>
          <div class="meta">${r.categorie ? `<span class="tag">${esc(r.categorie)}</span>` : ""}
            ${r.prep || r.cuisson ? `<span>⏱ ${(+r.prep || 0) + (+r.cuisson || 0)} min</span>` : ""}
            <span>👥 ${r.portions}</span>
            <span class="cost">${r.ingredients.length ? euro(coutRecette(r)) : ""}</span></div>
        </article>`).join("")}</div>` : `<div class="empty">Aucune recette ne correspond.</div>`}`;
  }

  function openRecette(id) {
    const r = recette(id); if (!r) return;
    let p = r.portions || 1;
    const body = () => {
      const f = p / (r.portions || 1);
      return `<div class="mbody">
        <div class="mhead"><h2>${r.anti ? "🌿 " : ""}${esc(r.nom)}</h2><button class="close" data-close aria-label="Fermer">✕</button></div>
        <div class="meta">${r.categorie ? `<span class="tag">${esc(r.categorie)}</span>` : ""}${r.anti ? `<span class="tag leaf">Anti-inflammatoire</span>` : ""}
          ${r.saison ? `<span class="tag">${esc(r.saison)}</span>` : ""}${r.prix ? `<span class="tag">${esc(r.prix)}</span>` : ""}</div>
        <div class="facts">
          <div class="fact">Préparation<b>${r.prep ? r.prep + " min" : "—"}</b></div>
          <div class="fact">Cuisson<b>${r.cuisson ? r.cuisson + " min" : "—"}</b></div>
          <div class="fact">Coût<b>${euro(coutRecette(r, p))}</b></div>
          <div class="fact">Par portion<b>${euro(coutRecette(r) / (r.portions || 1))}</b></div>
        </div>
        <div class="bar" style="margin:0"><h3 style="margin-right:auto">Ingrédients</h3>
          <span class="portions">Portions <button class="btn icon small" data-p="-1">−</button><input type="number" min="1" id="pp" value="${p}"><button class="btn icon small" data-p="1">+</button></span></div>
        ${r.ingredients.length ? `<table><thead><tr><th>Produit</th><th class="num">Quantité</th><th class="num">Prix</th></tr></thead><tbody>
          ${r.ingredients.map((i) => `<tr><td>${esc(i.produit)}</td><td class="num">${num(i.qte * f)} ${esc(i.unite)}</td><td class="num">${euro(i.prix * f)}</td></tr>`).join("")}
        </tbody></table>` : `<p class="muted">Aucun ingrédient renseigné.</p>`}
        <h3>Recette</h3>
        ${r.etapes.length ? `<ol class="steps">${r.etapes.map((e) => `<li>${esc(e)}</li>`).join("")}</ol>` : `<p class="muted">Aucune étape renseignée.</p>`}
        ${r.lien ? `<a class="btn" href="${esc(r.lien)}" target="_blank" rel="noopener">🔗 Voir la source</a>` : ""}
        <div class="actions"><button class="btn danger" data-del>Supprimer</button><button class="btn" data-edit>Modifier</button>
          <button class="btn primary" data-plan>Ajouter au planning</button></div>
      </div>`;
    };
    modal(body(), (box) => {
      box.onclick = (e) => {
        const t = e.target;
        if (t.dataset.p) { p = Math.max(1, p + +t.dataset.p); box.innerHTML = body(); }
        else if (t.hasAttribute("data-edit")) editRecette(r.id);
        else if (t.hasAttribute("data-plan")) planifier(r.id, p);
        else if (t.hasAttribute("data-del") && confirm(`Supprimer « ${r.nom} » ?`)) {
          data.recettes = data.recettes.filter((x) => x.id !== r.id);
          for (const w in data.planning) for (const d in data.planning[w]) for (const m in data.planning[w][d])
            data.planning[w][d][m] = data.planning[w][d][m].filter((it) => it.r !== r.id);
          persist(); closeModal(); render(); toast("Recette supprimée");
        }
      };
      box.oninput = (e) => { if (e.target.id === "pp") { p = Math.max(1, +e.target.value || 1); const v = e.target.selectionStart; box.innerHTML = body(); const i = $("#pp", box); i.focus(); try { i.setSelectionRange(v, v); } catch {} } };
    });
  }

  function planifier(id, p) {
    const r = recette(id);
    const defaultMeal = /petit|brunch/i.test(r.categorie) ? "pdj" : /snack|goûter|dessert/i.test(r.categorie) ? "snk" : "din";
    modal(`<div class="mbody">
      <div class="mhead"><h2>Ajouter au planning</h2><button class="close" data-close>✕</button></div>
      <p class="muted" style="margin:0">${esc(r.nom)}</p>
      <div class="form-grid">
        <label>Semaine<select id="pw">${Array.from({ length: NB_SEMAINES }, (_, i) => `<option value="${i + 1}" ${ui.semaine === i + 1 ? "selected" : ""}>Semaine ${i + 1}</option>`).join("")}</select></label>
        <label>Jour<select id="pd">${JOURS.map((j, i) => `<option value="${i}">${j}</option>`).join("")}</select></label>
        <label>Repas<select id="pm">${REPAS.map(([k, l]) => `<option value="${k}" ${k === defaultMeal ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Portions<input type="number" id="pp2" min="1" value="${p}"></label>
      </div>
      <div class="actions"><button class="btn primary" data-ok>Ajouter</button></div></div>`, (box) => {
      $("[data-ok]", box).onclick = () => {
        const w = +$("#pw", box).value;
        cell(w, +$("#pd", box).value, $("#pm", box).value).push({ r: id, p: Math.max(1, +$("#pp2", box).value || 1) });
        persist(); closeModal(); ui.semaine = w; saveUi(); render(); toast("Ajouté au planning");
      };
    });
  }

  function pickRecette(d, m) {
    const w = ui.semaine;
    let sel = null;
    const list = (q) => data.recettes.filter((r) => !q || norm(r.nom).includes(norm(q)))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
      .map((r) => `<button class="pick ${sel === r.id ? "sel" : ""}" data-id="${r.id}">${r.anti ? "🌿 " : ""}${esc(r.nom)} <span class="muted">· ${r.portions} p.</span></button>`).join("")
      || `<p class="muted">Aucune recette. Tu peux écrire un repas libre ci-dessous.</p>`;
    modal(`<div class="mbody">
      <div class="mhead"><h2>${JOURS[d]} · ${REPAS.find((x) => x[0] === m)[1]}</h2><button class="close" data-close>✕</button></div>
      <input type="search" id="pq" placeholder="Chercher une recette…" autofocus>
      <div class="picker-list" id="pl">${list("")}</div>
      <div class="form-grid">
        <label>Portions<input type="number" id="pp3" min="1" placeholder="selon la recette"></label>
        <label>…ou repas libre<input type="text" id="pt" placeholder="ex. Restes, Resto, Pizza"></label>
      </div>
      <div class="actions"><button class="btn primary" data-ok>Ajouter</button></div></div>`, (box) => {
      $("#pq", box).oninput = (e) => { $("#pl", box).innerHTML = list(e.target.value); };
      $("#pl", box).onclick = (e) => {
        const b = e.target.closest(".pick"); if (!b) return;
        sel = b.dataset.id; box.querySelectorAll(".pick").forEach((x) => x.classList.toggle("sel", x === b));
        const pp = $("#pp3", box); if (!pp.value) pp.placeholder = recette(sel).portions + " (recette)";
      };
      $("#pl", box).ondblclick = () => sel && $("[data-ok]", box).click();
      $("[data-ok]", box).onclick = () => {
        const txt = $("#pt", box).value.trim();
        if (sel) { const p = +$("#pp3", box).value; cell(w, d, m).push({ r: sel, p: p > 0 ? p : recette(sel).portions }); }
        else if (txt) cell(w, d, m).push({ t: txt });
        else return toast("Choisis une recette ou écris un repas");
        persist(); closeModal(); render();
      };
    });
  }

  function editRecette(id) {
    const isNew = !id;
    const r = isNew ? { id: uid(), nom: "", categorie: "", anti: false, prep: "", cuisson: "", portions: 2, saison: "", prix: "", lien: "", ingredients: [], etapes: [] }
      : structuredClone(recette(id));
    const P = data.parametres;
    const opts = (arr, v) => `<option value=""></option>` + (arr || []).map((x) => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("");
    const ingRow = (i = {}) => `<div class="ing-row">
      <input type="text" list="dl-ing" placeholder="Produit" value="${esc(i.produit)}" data-f="produit">
      <input type="number" step="any" placeholder="Qté" value="${i.qte ?? ""}" data-f="qte">
      <input type="text" list="dl-unit" placeholder="Unité" value="${esc(i.unite)}" data-f="unite">
      <input class="p" type="number" step="any" placeholder="€" value="${i.prix ?? ""}" data-f="prix">
      <button class="btn icon small" data-rmrow aria-label="Retirer">×</button></div>`;
    modal(`<div class="mbody">
      <div class="mhead"><h2>${isNew ? "Nouvelle recette" : "Modifier la recette"}</h2><button class="close" data-close>✕</button></div>
      <div class="form-grid">
        <label class="full">Nom<input type="text" id="f-nom" value="${esc(r.nom)}" required></label>
        <label>Catégorie<select id="f-cat">${opts(P.categories, r.categorie)}</select></label>
        <label>Portions<input type="number" min="1" id="f-por" value="${r.portions}"></label>
        <label>Préparation (min)<input type="number" min="0" id="f-prep" value="${r.prep ?? ""}"></label>
        <label>Cuisson (min)<input type="number" min="0" id="f-cui" value="${r.cuisson ?? ""}"></label>
        <label>Saison<select id="f-sai">${opts(P.saisons, r.saison)}</select></label>
        <label>Prix<select id="f-prix">${opts(P.prix, r.prix)}</select></label>
        <label class="full">Lien (optionnel)<input type="text" id="f-lien" value="${esc(r.lien)}" placeholder="https://…"></label>
        <label class="check full"><input type="checkbox" id="f-anti" ${r.anti ? "checked" : ""}> 🌿 Recette anti-inflammatoire</label>
      </div>
      <div><h3 style="margin-bottom:8px">Ingrédients <span class="muted" style="font:400 13px var(--sans)">(prix = coût pour la quantité indiquée)</span></h3>
        <div id="ings">${(r.ingredients.length ? r.ingredients : [{}]).map(ingRow).join("")}</div>
        <button class="btn small" data-addrow>+ Ingrédient</button></div>
      <label>Étapes (une par ligne)<textarea id="f-etapes" rows="7">${esc(r.etapes.join("\n"))}</textarea></label>
      <datalist id="dl-ing">${(P.ingredients || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
      <datalist id="dl-unit">${(P.unites || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
      <div class="actions"><button class="btn" data-close>Annuler</button><button class="btn primary" data-save>Enregistrer</button></div></div>`, (box) => {
      box.onclick = (e) => {
        if (e.target.hasAttribute("data-addrow")) $("#ings", box).insertAdjacentHTML("beforeend", ingRow());
        if (e.target.hasAttribute("data-rmrow")) e.target.closest(".ing-row").remove();
        if (!e.target.hasAttribute("data-save")) return;
        const nom = $("#f-nom", box).value.trim();
        if (!nom) { $("#f-nom", box).focus(); return toast("Donne un nom à la recette"); }
        const n = (s) => { const v = $(s, box).value; return v === "" ? null : +v; };
        Object.assign(r, {
          nom, categorie: $("#f-cat", box).value, portions: Math.max(1, n("#f-por") || 1), prep: n("#f-prep"), cuisson: n("#f-cui"),
          saison: $("#f-sai", box).value, prix: $("#f-prix", box).value, lien: $("#f-lien", box).value.trim(), anti: $("#f-anti", box).checked,
          etapes: $("#f-etapes", box).value.split("\n").map((s) => s.trim()).filter(Boolean),
          ingredients: [...box.querySelectorAll(".ing-row")].map((row) => {
            const g = (f) => row.querySelector(`[data-f=${f}]`).value.trim();
            return { produit: g("produit"), qte: +g("qte") || 0, unite: g("unite"), prix: +g("prix") || 0 };
          }).filter((i) => i.produit),
        });
        // mémoriser les nouveaux ingrédients pour l'autocomplétion
        for (const i of r.ingredients) if (!(P.ingredients ||= []).some((x) => norm(x) === norm(i.produit))) P.ingredients.push(i.produit);
        if (isNew) data.recettes.push(r); else data.recettes[data.recettes.findIndex((x) => x.id === r.id)] = r;
        persist(); closeModal(); render(); toast("Recette enregistrée");
        openRecette(r.id);
      };
    });
  }

  // Courses
  function vCourses() {
    const w = ui.semaine;
    const c = (data.courses[w] ||= { coches: {}, extras: [] });
    const list = listeCourses(w);
    const total = list.reduce((s, e) => s + e.prix, 0);
    const restant = list.filter((e) => !c.coches[e.key]).length + c.extras.filter((x) => !x.done).length;
    $("#view").innerHTML = `
      <div class="bar"><h2>Liste de courses</h2>${weekSeg()}
        <button class="btn small" data-act="uncheck">Tout décocher</button>
        <button class="btn small" data-act="copy">Copier</button>
        <button class="btn small" data-act="print">Imprimer</button></div>
      <p class="muted" style="margin-top:-6px">${list.length ? `${restant} article(s) restant(s) · estimation ${euro(total)}` : ""}</p>
      ${list.length || c.extras.length ? `<div class="card shop">
        ${list.map((e) => `<label class="shop-item ${c.coches[e.key] ? "done" : ""}">
          <input type="checkbox" data-key="${esc(e.key)}" ${c.coches[e.key] ? "checked" : ""}>
          <span class="n">${esc(e.produit)}<br><span class="shop-sub">${esc([...e.recettes].join(" · "))}</span></span>
          <span class="q">${num(e.qte)} ${esc(e.unite)}</span></label>`).join("")}
        ${c.extras.map((x) => `<label class="shop-item ${x.done ? "done" : ""}">
          <input type="checkbox" data-extra="${x.id}" ${x.done ? "checked" : ""}><span class="n">${esc(x.txt)}</span>
          <button class="x" data-rmextra="${x.id}" aria-label="Retirer">×</button></label>`).join("")}
      </div>` : `<div class="empty">Rien pour l'instant.<br>Ajoute des recettes au planning de la semaine ${w} : la liste se remplit toute seule.</div>`}
      <form class="addline" id="addExtra"><input type="text" id="extra" placeholder="Ajouter un article (ex. papier toilette)"><button class="btn primary">Ajouter</button></form>`;
  }

  // Budget
  function vBudget() {
    const weeks = Array.from({ length: NB_SEMAINES }, (_, i) => budgetSemaine(i + 1));
    const max = Math.max(...weeks, 1);
    const w = ui.semaine;
    const items = itemsSemaine(w);
    const byRec = new Map();
    for (const it of items) {
      const r = recette(it.r); if (!r) continue;
      const e = byRec.get(r.id) || { r, fois: 0, portions: 0, cout: 0 };
      e.fois++; e.portions += it.p || r.portions; e.cout += coutRecette(r, it.p || r.portions); byRec.set(r.id, e);
    }
    const rows = [...byRec.values()].sort((a, b) => b.cout - a.cout);
    const portions = rows.reduce((s, e) => s + e.portions, 0);
    $("#view").innerHTML = `
      <div class="bar"><h2>Budget</h2>${weekSeg()}</div>
      <div class="stats">
        <div class="card stat"><div class="v">${euro(weeks[w - 1])}</div><div class="l">Semaine ${w}</div></div>
        <div class="card stat"><div class="v">${euro(portions ? weeks[w - 1] / portions : 0)}</div><div class="l">Coût moyen par portion</div></div>
        <div class="card stat"><div class="v">${euro(weeks.reduce((a, b) => a + b, 0))}</div><div class="l">Total des ${NB_SEMAINES} semaines</div></div>
      </div>
      <div class="card bars">${weeks.map((v, i) => `<div class="brow"><span>Semaine ${i + 1}</span>
        <div class="btrack"><div class="bfill" style="width:${(v / max) * 100}%"></div></div><span class="num" style="text-align:right">${euro(v)}</span></div>`).join("")}</div>
      <h3 style="margin:20px 0 8px">Détail de la semaine ${w}</h3>
      ${rows.length ? `<div class="card" style="padding:4px 12px"><table><thead><tr><th>Recette</th><th class="num">Fois</th><th class="num">Portions</th><th class="num">Coût</th></tr></thead><tbody>
        ${rows.map((e) => `<tr data-act="open" data-id="${e.r.id}" style="cursor:pointer"><td>${esc(e.r.nom)}</td><td class="num">${e.fois}</td><td class="num">${e.portions}</td><td class="num">${euro(e.cout)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Aucune recette planifiée cette semaine.</div>`}
      <p class="muted" style="font-size:13px">Estimation basée sur les prix saisis dans chaque recette, ajustés au nombre de portions planifiées.</p>`;
  }

  // ───────────────────────── modale
  function modal(html, setup) {
    const dlg = $("#modal"), box = $("#modalBody");
    box.innerHTML = html;
    box.onclick = null; box.oninput = null;
    if (!dlg.open) dlg.showModal();
    setup && setup(box);
  }
  function closeModal() { $("#modal").close(); }
  $("#modal").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === $("#modal")) closeModal();
  });

  // Réglages / synchronisation
  function openSync() {
    const conf = OneDrive.configured(), con = OneDrive.connected();
    modal(`<div class="mbody">
      <div class="mhead"><h2>OneDrive & données</h2><button class="close" data-close>✕</button></div>
      ${!conf ? `<p>La synchronisation OneDrive n'est pas encore activée : renseigne l'identifiant d'application dans <b>config.js</b> (voir le README). En attendant, tes données sont enregistrées dans ce navigateur.</p>`
        : con ? `<p>Connecté en tant que <b>${esc(OneDrive.user() || "ton compte Microsoft")}</b>. Tes données sont enregistrées dans OneDrive › Applications, et partagées entre tous tes appareils.</p>
          <div class="actions" style="justify-content:flex-start"><button class="btn" data-sync>Synchroniser maintenant</button><button class="btn danger" data-logout>Se déconnecter</button></div>`
        : `<p>Connecte ton compte Microsoft pour enregistrer tes recettes et plannings dans ton OneDrive et les retrouver sur tous tes appareils.</p>
          <div class="actions" style="justify-content:flex-start"><button class="btn primary" data-login>Se connecter à OneDrive</button></div>`}
      <h3>Sauvegarde manuelle</h3>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn" data-export>Exporter (.json)</button>
        <label class="btn" style="flex-direction:row;color:inherit;font-size:inherit">Importer<input type="file" accept=".json,application/json" data-import hidden></label>
        <button class="btn danger" data-reset>Réinitialiser</button>
      </div>
      <p class="muted" style="font-size:13px;margin:0">Dernière modification : ${new Date(data.majLe).toLocaleString("fr-FR")}</p>
    </div>`, (box) => {
      box.onclick = async (e) => {
        const t = e.target;
        if (t.hasAttribute("data-login")) OneDrive.login().catch((er) => toast(er.message));
        if (t.hasAttribute("data-logout")) { OneDrive.logout(); meta = { etag: null, dirty: true }; lsSet("menu.meta", meta); setSync("", "Local"); closeModal(); toast("Déconnecté — données conservées ici"); }
        if (t.hasAttribute("data-sync")) { closeModal(); await pull(); }
        if (t.hasAttribute("data-export")) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
          a.download = `menu-de-la-semaine-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        }
        if (t.hasAttribute("data-reset") && confirm("Remettre l'application à zéro ? Le planning et les recettes ajoutées seront effacés (les 15 recettes d'origine sont restaurées).")) {
          data = emptyData(await (await fetch("data/initial.json")).json()); persist(); closeModal(); render();
        }
      };
      $("[data-import]", box).onchange = async (e) => {
        try {
          const d = JSON.parse(await e.target.files[0].text());
          if (!Array.isArray(d.recettes)) throw 0;
          data = d; persist(); closeModal(); render(); toast("Données importées");
        } catch { toast("Fichier invalide"); }
      };
    });
  }

  // ───────────────────────── événements globaux
  $("#tabs").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; ui.view = b.dataset.view; saveUi(); render(); scrollTo(0, 0); };
  $("#syncBtn").onclick = openSync;

  const view = $("#view");
  view.addEventListener("click", (e) => {
    const t = e.target.closest("[data-week],[data-act],[data-rmextra]"); if (!t) return;
    if (t.dataset.week) { ui.semaine = +t.dataset.week; saveUi(); return render(); }
    if (t.dataset.rmextra) { const c = data.courses[ui.semaine]; c.extras = c.extras.filter((x) => x.id !== t.dataset.rmextra); persist(); return render(); }
    const a = t.dataset.act;
    if (a === "add") pickRecette(+t.dataset.d, t.dataset.m);
    if (a === "rm") { e.stopPropagation(); cell(ui.semaine, +t.dataset.d, t.dataset.m).splice(+t.dataset.i, 1); persist(); render(); }
    if (a === "open" && !e.target.closest("[data-act=rm]")) openRecette(t.dataset.id);
    if (a === "new") editRecette(null);
    if (a === "clear-week" && confirm(`Vider tout le planning de la semaine ${ui.semaine} ?`)) { data.planning[ui.semaine] = {}; data.notes[ui.semaine] = {}; persist(); render(); }
    if (a === "uncheck") { const c = data.courses[ui.semaine]; c.coches = {}; c.extras.forEach((x) => (x.done = false)); persist(); render(); }
    if (a === "print") print();
    if (a === "copy") {
      const c = data.courses[ui.semaine];
      const txt = listeCourses(ui.semaine).filter((x) => !c.coches[x.key]).map((x) => `• ${x.produit} — ${num(x.qte)} ${x.unite}`)
        .concat(c.extras.filter((x) => !x.done).map((x) => `• ${x.txt}`)).join("\n");
      navigator.clipboard?.writeText(txt).then(() => toast("Liste copiée"), () => toast("Copie impossible"));
    }
  });
  view.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".rcard")) openRecette(e.target.dataset.id); });
  view.addEventListener("change", (e) => {
    const t = e.target, c = data.courses[ui.semaine];
    if (t.dataset.key) { c.coches[t.dataset.key] = t.checked; persist(); t.closest(".shop-item").classList.toggle("done", t.checked); }
    if (t.dataset.extra) { c.extras.find((x) => x.id === t.dataset.extra).done = t.checked; persist(); t.closest(".shop-item").classList.toggle("done", t.checked); }
    if (t.id === "cat") { ui.cat = t.value; saveUi(); render(); }
    if (t.id === "anti") { ui.anti = t.checked; saveUi(); render(); }
    if (t.dataset.note !== undefined) { (data.notes[ui.semaine] ||= {})[t.dataset.note] = t.value; persist(); }
  });
  view.addEventListener("input", (e) => {
    if (e.target.id === "q") {
      ui.q = e.target.value; saveUi(); const pos = e.target.selectionStart; render();
      const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos);
    }
  });
  view.addEventListener("submit", (e) => {
    if (e.target.id !== "addExtra") return; e.preventDefault();
    const v = $("#extra").value.trim(); if (!v) return;
    data.courses[ui.semaine].extras.push({ id: uid(), txt: v, done: false }); persist(); render(); $("#extra").focus();
  });
  // récupérer les modifications faites ailleurs quand on revient sur l'appli
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && OneDrive.connected() && !meta.dirty) pull({ silent: true });
  });

  // ───────────────────────── démarrage
  (async function start() {
    data = lsGet(LS_DATA);
    if (!data) {
      try { data = emptyData(await (await fetch("data/initial.json")).json()); }
      catch { data = emptyData({}); }
      lsSet(LS_DATA, data);
    }
    render();
    if (!OneDrive.configured()) return setSync("", "Local");
    try { await OneDrive.handleRedirect(); } catch (e) { toast(e.message); }
    if (OneDrive.connected()) await pull({});
    else setSync("", "Se connecter");
  })();
})();
