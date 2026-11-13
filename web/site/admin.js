import * as F from "./assets/catalog-format.mjs";
import { THEMES, APPEARANCE_OPTIONS, themeById } from "./assets/themes.mjs";

/* =========================================================================
   helpers
   ========================================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clone = (o) => structuredClone(o);
const icon = (id) => `<svg><use href="assets/icons.svg#${esc(id)}"/></svg>`;
const fmtDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const keyUrl = (u) => (u || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/#?]+$/, "");
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

function toast(msg, kind = "ok", ms = 3500) {
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function confirmBox(title, text, okLabel = "Confirm", danger = true) {
  const d = $("#confirmDlg");
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = text;
  $("#confirmOk").textContent = okLabel;
  $("#confirmOk").className = "btn " + (danger ? "danger" : "primary");
  d.returnValue = "";
  d.showModal();
  return new Promise((res) => d.addEventListener("close", () => res(d.returnValue === "ok"), { once: true }));
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function api(method, path, body) {
  const opt = { method, credentials: "same-origin", headers: { "X-Requested-With": "cst-admin" } };
  if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  else if (method !== "GET") { opt.headers["Content-Type"] = "application/json"; opt.body = "{}"; }
  const r = await fetch(path, opt);
  let data = null;
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("json")) data = await r.json().catch(() => null);
  else data = await r.text();
  if (r.status === 401 && !path.startsWith("/api/auth/login")) { showLogin(); throw new Error("Session expired — please sign in again."); }
  if (!r.ok) { const e = new Error((data && data.error) || `Request failed (${r.status})`); e.status = r.status; e.data = data; throw e; }
  return data;
}

/* =========================================================================
   state
   ========================================================================= */
const S = {
  saved: null, savedStr: "", draft: null, history: [], lastKey: "", lastAt: 0, labels: [],
  view: "dashboard", catId: null, catQ: "", itemQ: "", sel: new Set(),
  review: null, ingestInfo: null, backups: null, exportScope: "all", exportFmt: "markdown", exportSettings: false,
  importTab: "import", ingestTab: "scan", clockTimer: null,
};
const views = {
  dashboard: ["Dashboard", renderDashboard], catalog: ["Catalog editor", renderCatalog], import: ["Import / Export", renderImport],
  ingest: ["Ingest & snippets", renderIngest], backups: ["Backup & restore", renderBackups], appearance: ["Site content", renderAppearance], themes: ["Themes & appearance", renderThemes],
  clock: ["Clock & time zone", renderClock], security: ["Security", renderSecurity],
};
const strip = (c) => JSON.stringify({ settings: c.settings, groups: c.groups, categories: c.categories });
const dirty = () => S.draft && strip(S.draft) !== S.savedStr;
const cats = () => S.draft.categories;
const catById = (id) => S.draft.categories.find((c) => c.id === id);
const countItems = (c) => c.categories.reduce((a, x) => a + x.items.length, 0);

function setSaved(cat) {
  S.saved = cat;
  S.savedStr = strip(cat);
  S.draft = clone(cat);
  S.history = [];
  S.labels = [];
  S.sel.clear();
  if (!S.catId || !catById(S.catId)) S.catId = S.draft.categories[0]?.id || null;
}

/** Apply a change to the draft with undo support. `coalesce` merges rapid edits of the same field into one undo step. */
function commit(label, fn, { coalesce = "", rerender = true } = {}) {
  const now = Date.now();
  if (!(coalesce && coalesce === S.lastKey && now - S.lastAt < 2000)) {
    S.history.push(JSON.stringify(S.draft));
    if (S.history.length > 80) S.history.shift();
    S.labels.push(label);
  }
  S.lastKey = coalesce; S.lastAt = now;
  fn(S.draft);
  updateTopbar();
  if (rerender) render();
}
function undo() {
  if (!S.history.length) return;
  S.draft = JSON.parse(S.history.pop());
  S.labels.pop();
  S.lastKey = "";
  if (!catById(S.catId)) S.catId = cats()[0]?.id || null;
  updateTopbar(); render();
  toast("Undone");
}
function updateTopbar() {
  const d = dirty();
  $("#dirtyPill").hidden = !d;
  $("#saveBtn").disabled = !d;
  $("#discardBtn").disabled = !d;
  $("#undoBtn").disabled = !S.history.length;
}
async function save() {
  if (!dirty()) return;
  const note = [...new Set(S.labels)].slice(-4).join(", ") || "edit";
  $("#saveBtn").disabled = true;
  try {
    const res = await api("PUT", "/api/admin/catalog", { rev: S.saved.rev, catalog: S.draft, note });
    const keepCat = S.catId;
    setSaved(res);
    S.catId = catById(keepCat) ? keepCat : S.catId;
    S.backups = null;
    updateTopbar(); render();
    toast(`Saved and published (revision ${res.rev})`);
  } catch (e) {
    if (e.status === 409) {
      const ok = await confirmBox("Catalog changed elsewhere", "Someone saved a newer version (maybe in another tab). Overwrite it with your changes? The newer version is kept as an automatic backup.", "Overwrite");
      if (ok) {
        try {
          const res = await api("PUT", "/api/admin/catalog", { rev: S.saved.rev, catalog: S.draft, note, force: true });
          setSaved(res); updateTopbar(); render(); toast(`Saved (revision ${res.rev})`);
        } catch (e2) { toast(e2.message, "bad"); }
      }
    } else toast(e.message, "bad", 6000);
    updateTopbar();
  }
}

/* =========================================================================
   auth / boot
   ========================================================================= */
function showLogin(configured = true) {
  $("#app").hidden = true;
  $("#login").hidden = false;
  if (!configured) $("#loginNote").textContent = "The admin password is not configured yet. Set the ADMIN_PASSWORD environment variable for the container, then restart it.";
  setTimeout(() => $("#loginPw").focus(), 50);
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginErr").textContent = "";
  $("#loginBtn").disabled = true;
  try {
    await api("POST", "/api/auth/login", { password: $("#loginPw").value });
    $("#loginPw").value = "";
    await loadApp();
  } catch (err) { $("#loginErr").textContent = err.message; }
  $("#loginBtn").disabled = false;
});
async function loadApp() {
  const cat = await api("GET", "/api/admin/catalog");
  setSaved(cat);
  $("#login").hidden = true;
  $("#app").hidden = false;
  const v = location.hash.slice(1);
  go(views[v] ? v : "dashboard");
}
async function boot() {
  try {
    const s = await api("GET", "/api/auth/session");
    if (s.authenticated) await loadApp(); else showLogin(s.configured);
  } catch (e) { showLogin(); }
}

$("#logout").onclick = async () => {
  if (dirty() && !(await confirmBox("Sign out?", "You have unsaved changes that will be lost.", "Sign out"))) return;
  await api("POST", "/api/auth/logout").catch(() => {});
  S.draft = null;
  showLogin();
};
$("#saveBtn").onclick = save;
$("#undoBtn").onclick = undo;
$("#discardBtn").onclick = async () => {
  if (await confirmBox("Discard changes?", "All unsaved edits since the last save will be lost.", "Discard")) { setSaved(S.saved); updateTopbar(); render(); toast("Changes discarded"); }
};
$("#menuBtn").onclick = () => $("#side").classList.toggle("open");
$("#nav").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) go(b.dataset.view); });
addEventListener("keydown", (e) => {
  if (!S.draft || $("#app").hidden) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  else if (mod && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
});
addEventListener("beforeunload", (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });
addEventListener("hashchange", () => { const v = location.hash.slice(1); if (views[v] && v !== S.view) go(v); });

function go(v) {
  S.view = v;
  if (location.hash.slice(1) !== v) history.replaceState(null, "", "#" + v);
  $$("#nav button").forEach((b) => b.setAttribute("aria-current", b.dataset.view === v ? "page" : "false"));
  $("#side").classList.remove("open");
  render();
  scrollTo({ top: 0 });
}
function render() {
  if (!S.draft) return;
  clearInterval(S.clockTimer);
  const [title, fn] = views[S.view];
  $("#viewTitle").textContent = title;
  fn($("#view"));
  updateTopbar();
}

/* generic delegated actions */
const ACT = {};
$("#view").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const f = ACT[b.dataset.act];
  if (f) { e.preventDefault(); f(b, e); }
});

/* =========================================================================
   dashboard
   ========================================================================= */
function renderDashboard(el) {
  const d = S.draft, n = countItems(d);
  const free = d.categories.reduce((a, c) => a + c.items.filter((i) => /F/.test(i.lic)).length, 0);
  const top = d.categories.slice().sort((a, b) => b.items.length - a.items.length).slice(0, 8);
  const max = Math.max(1, ...top.map((c) => c.items.length));
  el.innerHTML = `
  <div class="cards">
    <div class="kpi"><b>${n}</b><span>Entries</span></div>
    <div class="kpi"><b>${d.categories.length}</b><span>Categories</span></div>
    <div class="kpi"><b>${d.groups.length}</b><span>Groups</span></div>
    <div class="kpi"><b>${free}</b><span>Free / OSS</span></div>
    <div class="kpi"><b>r${S.saved.rev}</b><span>Published revision</span></div>
  </div>
  <div class="cols">
    <div class="panel"><h3>Quick actions</h3><p class="muted">Last published ${esc(fmtDate(S.saved.updatedAt))}${dirty() ? " · <b style='color:var(--warn)'>unsaved changes pending</b>" : ""}</p>
      <div class="row">
        <button class="btn" data-act="goto" data-v="catalog">${icon("c-layers")}Edit catalog</button>
        <button class="btn" data-act="quickBackup">${icon("c-box")}Create backup now</button>
        <button class="btn" data-act="quickExport" data-f="markdown">${icon("i-dl")}Export .md</button>
        <button class="btn" data-act="quickExport" data-f="yaml">${icon("i-dl")}Export .yaml</button>
        <button class="btn" data-act="goto" data-v="ingest">${icon("c-search")}Ingest from a website</button>
        <a class="btn" href="/" target="_blank" rel="noopener">${icon("i-ext")}Open public site</a>
      </div>
    </div>
    <div class="panel"><h3>Largest categories</h3><p class="muted">Entries per category</p>
      ${top.map((c) => `<div style="display:flex;align-items:center;gap:10px;margin:6px 0;cursor:pointer" data-act="openCat" data-id="${esc(c.id)}">
        <span style="width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">${esc(c.title)}</span>
        <span style="flex:1;height:8px;border-radius:5px;background:var(--bg2);overflow:hidden"><span style="display:block;height:100%;width:${(c.items.length / max) * 100}%;background:linear-gradient(90deg,var(--accent),var(--accent2))"></span></span>
        <span class="mono small muted" style="width:28px;text-align:right">${c.items.length}</span></div>`).join("")}
    </div>
  </div>
  <div class="panel"><h3>Getting around</h3><p class="muted">Every change is a draft until you press <b>Save &amp; publish</b> (Ctrl+S). Each save creates an automatic backup, and <b>Undo</b> (Ctrl+Z) works until then.</p>
    <div class="grid3 small muted">
      <div><b style="color:var(--text)">Catalog editor</b><br>Add, edit, reorder and move categories and entries; bulk actions on selected entries.</div>
      <div><b style="color:var(--text)">Import / Export</b><br>Markdown, YAML or JSON, for the whole list, one category or selected entries.</div>
      <div><b style="color:var(--text)">Ingest &amp; snippets</b><br>Scan a web page or GitHub list and pick the tools to insert, or paste a snippet.</div>
    </div>
  </div>`;
}
ACT.goto = (b) => go(b.dataset.v);
ACT.openCat = (b) => { S.catId = b.dataset.id; S.sel.clear(); go("catalog"); };
ACT.quickBackup = async () => {
  try { const m = await api("POST", "/api/admin/backups", { label: "Manual backup" }); S.backups = null; toast(`Backup created (${m.items} entries)`); } catch (e) { toast(e.message, "bad"); }
};
ACT.quickExport = (b) => exportData({ scope: "all", fmt: b.dataset.f, settings: false });

/* =========================================================================
   catalog editor
   ========================================================================= */
function groupLabel(id) { return (S.draft.groups.find((g) => g.id === id) || {}).label || id; }

function renderCatalog(el) {
  if (!cats().length) {
    el.innerHTML = `<div class="empty"><p>No categories yet.</p><button class="btn primary" data-act="addCat">+ New category</button></div>`;
    return;
  }
  if (!catById(S.catId)) S.catId = cats()[0].id;
  el.innerHTML = `<div class="editor">
    <div class="catlist">
      <div class="head">
        <input type="search" id="catQ" placeholder="Filter categories or entries…" value="${esc(S.catQ)}">
        <div class="row"><button class="btn sm primary" data-act="addCat">+ Category</button><button class="btn sm" data-act="sortCats" title="Sort categories A→Z inside each group">Sort A→Z</button><span class="spacer"></span><span class="small muted" id="catCount"></span></div>
      </div>
      <div class="scroll" id="catScroll"></div>
    </div>
    <div id="catPane"></div>
  </div>`;
  renderCatList();
  renderCatPane();
  $("#catQ").addEventListener("input", (e) => { S.catQ = e.target.value; S.itemQ = S.catQ; renderCatList(); renderItems(); const iq = $("#itemQ"); if (iq) iq.value = S.itemQ; });
}

function catMatches(c, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return c.title.toLowerCase().includes(q) || c.items.some((i) => (i.name + " " + i.url + " " + i.desc).toLowerCase().includes(q));
}
function renderCatList() {
  const box = $("#catScroll");
  if (!box) return;
  const q = S.catQ.trim();
  let html = "", shown = 0;
  for (const g of S.draft.groups) {
    const cs = cats().filter((c) => c.group === g.id);
    html += `<div class="ghdr"><span>${esc(g.label)}</span><span>${cs.length}</span></div>`;
    for (const c of cs) {
      if (!catMatches(c, q)) continue;
      shown++;
      const i = cats().indexOf(c);
      const hits = q ? c.items.filter((it) => (it.name + " " + it.url + " " + it.desc).toLowerCase().includes(q.toLowerCase())).length : c.items.length;
      html += `<div class="citem${c.id === S.catId ? " on" : ""}" data-act="selCat" data-id="${esc(c.id)}" draggable="true" data-drag="cat" data-idx="${i}">
        <span class="ic">${icon("c-" + c.icon)}</span><span class="t" title="${esc(c.title)}">${esc(c.title)}</span>
        <span class="mv"><button data-act="moveCat" data-d="-1" data-id="${esc(c.id)}" title="Move up">▲</button><button data-act="moveCat" data-d="1" data-id="${esc(c.id)}" title="Move down">▼</button></span>
        <span class="n">${hits}</span></div>`;
    }
  }
  box.innerHTML = html;
  $("#catCount").textContent = `${shown}/${cats().length}`;
}
ACT.selCat = (b, e) => { if (e.target.closest(".mv")) return; S.catId = b.dataset.id; S.sel.clear(); renderCatList(); renderCatPane(); };
ACT.moveCat = (b) => {
  const id = b.dataset.id, d = Number(b.dataset.d);
  commit("reorder categories", (dr) => {
    const arr = dr.categories, i = arr.findIndex((c) => c.id === id), c = arr[i];
    // move within the same group: find the next category of that group in direction d
    let j = i + d;
    while (j >= 0 && j < arr.length && arr[j].group !== c.group) j += d;
    if (j < 0 || j >= arr.length) return;
    arr.splice(i, 1); arr.splice(j, 0, c);
  });
};
ACT.sortCats = () => commit("sort categories", (dr) => {
  const order = dr.groups.map((g) => g.id);
  dr.categories.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.title.localeCompare(b.title));
});
ACT.addCat = () => newCategory(cats().length);
function newCategory(at, group) {
  const id = F.uid("c");
  commit("add category", (dr) => {
    const g = group || (catById(S.catId) || {}).group || dr.groups[0].id;
    dr.categories.splice(at, 0, { id, title: "New category", slug: "new-category", group: g, icon: "tool", desc: "", source: "", items: [] });
  });
  S.catId = id; S.sel.clear(); render();
  setTimeout(() => { const t = $("#cTitle"); if (t) { t.focus(); t.select(); } }, 30);
}

function renderCatPane() {
  const pane = $("#catPane");
  const c = catById(S.catId);
  if (!pane || !c) return;
  const idx = cats().indexOf(c);
  pane.innerHTML = `
  <div class="panel">
    <div class="row" style="margin-bottom:12px">
      <h3 style="font-size:16px">${icon("c-" + c.icon)} ${esc(c.title)}</h3><span class="badge">${c.items.length} entries</span>
      <span class="spacer"></span>
      <button class="btn sm" data-act="insCat" data-at="${idx}">Insert above</button>
      <button class="btn sm" data-act="insCat" data-at="${idx + 1}">Insert below</button>
      <button class="btn sm" data-act="dupCat">Duplicate</button>
      <button class="btn sm" data-act="exportCat" data-f="markdown">${icon("i-dl")}.md</button>
      <button class="btn sm" data-act="exportCat" data-f="yaml">${icon("i-dl")}.yaml</button>
      <button class="btn sm danger" data-act="delCat">Delete</button>
    </div>
    <div class="grid2">
      <label class="fld"><span>Title</span><input id="cTitle" data-cf="title" value="${esc(c.title)}" maxlength="160"></label>
      <label class="fld"><span>Group</span><select data-cf="group">${S.draft.groups.map((g) => `<option value="${esc(g.id)}"${g.id === c.group ? " selected" : ""}>${esc(g.label)}</option>`).join("")}</select></label>
      <label class="fld span2"><span>Description (optional, shown under the heading)</span><input data-cf="desc" value="${esc(c.desc)}" maxlength="600"></label>
      <label class="fld span2"><span>Source link (optional, shown as “Source” on the heading)</span><input data-cf="source" value="${esc(c.source)}" placeholder="https://"></label>
      <div class="fld span2"><span>Icon</span><div class="iconpick">${F.ICONS.map(([k, l]) => `<button data-act="setIcon" data-i="${k}" title="${esc(l)}" aria-pressed="${k === c.icon}">${icon("c-" + k)}</button>`).join("")}</div></div>
    </div>
  </div>
  <div class="panel">
    <div class="row" style="margin-bottom:10px">
      <input type="search" id="itemQ" placeholder="Search entries in this category…" value="${esc(S.itemQ)}" style="max-width:320px">
      <span class="spacer"></span>
      <button class="btn sm" data-act="sortItems">Sort A→Z</button>
      <button class="btn sm" data-act="addItem" data-at="0">+ Add at top</button>
      <button class="btn sm primary" data-act="addItem" data-at="end">+ Add entry</button>
    </div>
    <div id="itemsBox"></div>
  </div>`;
  pane.querySelectorAll("[data-cf]").forEach((inp) => {
    inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
      const k = inp.dataset.cf, v = inp.value;
      if (k === "source" && v && !F.safeUrl(v)) { inp.style.borderColor = "var(--bad)"; return; }
      inp.style.borderColor = "";
      commit("edit category", (dr) => {
        const cc = dr.categories.find((x) => x.id === c.id);
        cc[k] = k === "source" ? F.safeUrl(v) : v;
        if (k === "title") cc.slug = F.slugify(v);
      }, { coalesce: "cat:" + c.id + ":" + k, rerender: false });
      if (k === "title" || k === "group") renderCatList();
    });
  });
  $("#itemQ").addEventListener("input", (e) => { S.itemQ = e.target.value; renderItems(); });
  renderItems();
}
ACT.insCat = (b) => newCategory(Number(b.dataset.at));
ACT.dupCat = () => {
  const c = catById(S.catId), id = F.uid("c");
  commit("duplicate category", (dr) => {
    const i = dr.categories.findIndex((x) => x.id === c.id);
    const copy = clone(dr.categories[i]);
    copy.id = id; copy.title += " (copy)"; copy.slug = F.slugify(copy.title);
    copy.items.forEach((it) => (it.id = F.uid("i")));
    dr.categories.splice(i + 1, 0, copy);
  });
  S.catId = id; render();
};
ACT.delCat = async () => {
  const c = catById(S.catId);
  if (!(await confirmBox(`Delete “${c.title}”?`, `This removes the category and its ${c.items.length} entries from the draft. You can undo before saving.`, "Delete category"))) return;
  const i = cats().indexOf(c);
  commit("delete category", (dr) => dr.categories.splice(i, 1));
  S.catId = (cats()[i] || cats()[i - 1] || {}).id || null;
  render();
};
ACT.setIcon = (b) => commit("change icon", (dr) => { dr.categories.find((x) => x.id === S.catId).icon = b.dataset.i; });
ACT.exportCat = (b) => exportData({ scope: S.catId, fmt: b.dataset.f });
ACT.sortItems = () => commit("sort entries", (dr) => {
  const c = dr.categories.find((x) => x.id === S.catId);
  c.items.sort((a, b) => (a.sub || "").localeCompare(b.sub || "") || a.name.localeCompare(b.name));
});

function itemMatch(it, q) { return !q || (it.name + " " + it.url + " " + it.desc + " " + it.sub).toLowerCase().includes(q.toLowerCase()); }
function renderItems() {
  const box = $("#itemsBox"), c = catById(S.catId);
  if (!box || !c) return;
  const q = S.itemQ.trim();
  const sel = S.sel;
  let rows = "", lastSub = null, shown = 0;
  c.items.forEach((it, i) => {
    if (!itemMatch(it, q)) return;
    shown++;
    if (!q && (it.sub || "") !== lastSub) { lastSub = it.sub || ""; if (lastSub || i) rows += `<tr class="subrow"><td colspan="6">${esc(lastSub || "No section")}</td></tr>`; }
    const lic = it.lic === "F" ? '<span class="tag free">FREE</span>' : it.lic === "C" ? '<span class="tag paid">PAID</span>' : it.lic === "F/C" ? '<span class="tag free">FREE</span><span class="tag paid">PAID</span>' : "";
    rows += `<tr class="${sel.has(it.id) ? "sel" : ""}" draggable="${q ? "false" : "true"}" data-drag="item" data-idx="${i}">
      <td style="width:28px"><input type="checkbox" data-sel="${esc(it.id)}" ${sel.has(it.id) ? "checked" : ""} aria-label="Select ${esc(it.name)}"></td>
      <td class="mono small muted" style="width:34px">${i + 1}</td>
      <td><div class="iname">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)}</div>${it.url ? `<div class="ihost">${esc(F.hostOf(it.url))}${it.links.length ? ` +${it.links.length} link${it.links.length > 1 ? "s" : ""}` : ""}</div>` : ""}<div class="idesc">${esc(it.desc)}</div></td>
      <td class="hide-m" style="width:150px">${lic}${it.os.map((o) => `<span class="tag">${esc(o)}</span>`).join("")}</td>
      <td class="hide-m small muted" style="width:150px">${esc(it.sub)}</td>
      <td style="width:1%"><div class="acts">
        <button class="btn xs" data-act="mvItem" data-id="${esc(it.id)}" data-d="-1" title="Move up">▲</button>
        <button class="btn xs" data-act="mvItem" data-id="${esc(it.id)}" data-d="1" title="Move down">▼</button>
        <button class="btn xs" data-act="editItem" data-id="${esc(it.id)}" title="Edit">Edit</button>
        <button class="btn xs" data-act="addItem" data-at="${i + 1}" data-sub="${esc(it.sub)}" title="Insert a new entry below">+ Below</button>
        <button class="btn xs" data-act="dupItem" data-id="${esc(it.id)}" title="Duplicate">⧉</button>
        <button class="btn xs danger" data-act="delItem" data-id="${esc(it.id)}" title="Delete">✕</button>
      </div></td></tr>`;
  });
  const selIn = c.items.filter((i) => sel.has(i.id)).length;
  const bulk = sel.size ? `<div class="bulkbar"><b>${sel.size} selected</b>${selIn !== sel.size ? `<span class="small muted">(${sel.size - selIn} in other categories)</span>` : ""}
    <select id="bulkMove"><option value="">Move to…</option>${cats().map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join("")}</select>
    <select id="bulkCopy"><option value="">Copy to…</option>${cats().map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join("")}</select>
    <select id="bulkLic"><option value="">Set licence…</option><option value="F">Free</option><option value="C">Commercial</option><option value="F/C">Free + paid</option><option value="-">Clear</option></select>
    <button class="btn xs" data-act="bulkSection">Set section…</button>
    <button class="btn xs" data-act="bulkExport" data-f="markdown">${icon("i-dl")}.md</button>
    <button class="btn xs" data-act="bulkExport" data-f="yaml">${icon("i-dl")}.yaml</button>
    <button class="btn xs danger" data-act="bulkDel">Delete</button>
    <span class="spacer"></span><button class="btn xs ghost" data-act="selClear">Clear selection</button></div>` : "";
  box.innerHTML = bulk + (shown ? `<table class="items"><thead><tr><th><input type="checkbox" id="selAll" aria-label="Select all shown"></th><th>#</th><th>Entry</th><th class="hide-m">Licence / OS</th><th class="hide-m">Section</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">${c.items.length ? "No entries match your search." : "This category is empty."}<br><br><button class="btn primary" data-act="addItem" data-at="end">+ Add entry</button> <button class="btn" data-act="goto" data-v="ingest">Ingest from a website</button></div>`);
  const sa = $("#selAll");
  if (sa) {
    const vis = c.items.filter((i) => itemMatch(i, q));
    sa.checked = vis.length > 0 && vis.every((i) => sel.has(i.id));
    sa.onchange = () => { vis.forEach((i) => (sa.checked ? sel.add(i.id) : sel.delete(i.id))); renderItems(); };
  }
  box.querySelectorAll("[data-sel]").forEach((cb) => cb.addEventListener("change", () => { cb.checked ? sel.add(cb.dataset.sel) : sel.delete(cb.dataset.sel); renderItems(); }));
  const mv = $("#bulkMove"); if (mv) mv.onchange = () => mv.value && bulkMove(mv.value, false);
  const cp = $("#bulkCopy"); if (cp) cp.onchange = () => cp.value && bulkMove(cp.value, true);
  const bl = $("#bulkLic"); if (bl) bl.onchange = () => bl.value && commit("set licence", (dr) => forSel(dr, (it) => (it.lic = bl.value === "-" ? "" : bl.value)));
}
function forSel(dr, fn) { dr.categories.forEach((c) => c.items.forEach((it) => S.sel.has(it.id) && fn(it, c))); }
function selectedItems() { const out = []; forSel(S.draft, (it) => out.push(it)); return out; }
function bulkMove(target, copy) {
  commit(copy ? "copy entries" : "move entries", (dr) => {
    const tc = dr.categories.find((c) => c.id === target), moving = [];
    dr.categories.forEach((c) => {
      if (copy) c.items.forEach((it) => S.sel.has(it.id) && moving.push({ ...clone(it), id: F.uid("i") }));
      else if (c !== tc) c.items = c.items.filter((it) => (S.sel.has(it.id) ? (moving.push(it), false) : true));
    });
    tc.items.push(...moving);
  });
  toast(`${copy ? "Copied" : "Moved"} ${S.sel.size} entries to “${catById(target).title}”`);
  if (!copy) S.sel.clear();
  renderItems();
}
ACT.selClear = () => { S.sel.clear(); renderItems(); };
ACT.bulkDel = async () => {
  if (!(await confirmBox(`Delete ${S.sel.size} entries?`, "They are removed from the draft. You can undo before saving.", "Delete"))) return;
  commit("delete entries", (dr) => dr.categories.forEach((c) => (c.items = c.items.filter((it) => !S.sel.has(it.id)))));
  S.sel.clear(); render();
};
ACT.bulkSection = () => {
  const v = prompt("Section (sub-heading) for the selected entries. Leave empty to clear.", "");
  if (v === null) return;
  commit("set section", (dr) => forSel(dr, (it) => (it.sub = v.trim().slice(0, 120))));
};
ACT.bulkExport = (b) => {
  const items = selectedItems();
  const name = `entries-${items.length}-${stamp()}`;
  if (b.dataset.f === "yaml") download(name + ".yaml", F.toYAML(F.toPortable(S.draft, { items })), "text/yaml");
  else download(name + ".md", F.toMarkdown(S.draft, { categories: [{ title: "Selected entries", group: "", icon: "tool", items }], meta: false, title: "Selected entries" }), "text/markdown");
};
ACT.mvItem = (b) => commit("reorder entries", (dr) => {
  const c = dr.categories.find((x) => x.id === S.catId), d = Number(b.dataset.d);
  const i = c.items.findIndex((x) => x.id === b.dataset.id), j = i + d;
  if (j < 0 || j >= c.items.length) return;
  const [it] = c.items.splice(i, 1);
  c.items.splice(j, 0, it);
  // crossing into a neighbouring section makes the entry part of that section
  const nb = c.items[j - d];
  if (nb && (nb.sub || "") !== (it.sub || "")) it.sub = nb.sub;
});
ACT.dupItem = (b) => commit("duplicate entry", (dr) => {
  const c = dr.categories.find((x) => x.id === S.catId), i = c.items.findIndex((x) => x.id === b.dataset.id);
  c.items.splice(i + 1, 0, { ...clone(c.items[i]), id: F.uid("i"), name: c.items[i].name + " (copy)" });
});
ACT.delItem = (b) => {
  const c = catById(S.catId), it = c.items.find((x) => x.id === b.dataset.id);
  commit("delete entry", (dr) => { const cc = dr.categories.find((x) => x.id === S.catId); cc.items = cc.items.filter((x) => x.id !== it.id); });
  S.sel.delete(it.id);
  toast(`Deleted “${it.name}” — Undo with Ctrl+Z`);
};
ACT.editItem = (b) => openItem({ catId: S.catId, id: b.dataset.id });
ACT.addItem = (b) => {
  const c = catById(S.catId);
  openItem({ catId: S.catId, at: b.dataset.at === "end" ? c.items.length : Number(b.dataset.at), sub: b.dataset.sub || "" });
};

/* drag & drop reordering (categories and entries) */
let drag = null;
$("#view").addEventListener("dragstart", (e) => {
  const el = e.target.closest("[data-drag]");
  if (!el) return;
  drag = { kind: el.dataset.drag, idx: Number(el.dataset.idx) };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(drag.idx));
});
$("#view").addEventListener("dragover", (e) => {
  const el = e.target.closest("[data-drag]");
  if (!drag || !el || el.dataset.drag !== drag.kind) return;
  e.preventDefault();
  $$(".drop").forEach((x) => x.classList.remove("drop"));
  el.classList.add("drop");
  if (el.tagName === "TR") el.style.boxShadow = "inset 0 2px 0 var(--accent)";
});
$("#view").addEventListener("dragleave", (e) => { const el = e.target.closest("[data-drag]"); if (el) { el.classList.remove("drop"); el.style.boxShadow = ""; } });
$("#view").addEventListener("drop", (e) => {
  const el = e.target.closest("[data-drag]");
  if (!drag || !el || el.dataset.drag !== drag.kind) return;
  e.preventDefault();
  const from = drag.idx, to = Number(el.dataset.idx);
  drag = null;
  if (from === to) return render();
  if (el.dataset.drag === "cat") {
    commit("reorder categories", (dr) => {
      const [c] = dr.categories.splice(from, 1);
      const target = dr.categories[to > from ? to - 1 : to];
      if (target) c.group = target.group;
      dr.categories.splice(to > from ? to - 1 : to, 0, c);
    });
  } else {
    commit("reorder entries", (dr) => {
      const c = dr.categories.find((x) => x.id === S.catId);
      const [it] = c.items.splice(from, 1);
      const at = to > from ? to - 1 : to;
      const nb = c.items[at];
      if (nb) it.sub = nb.sub;
      c.items.splice(at, 0, it);
    });
  }
});
$("#view").addEventListener("dragend", () => { drag = null; $$(".drop").forEach((x) => { x.classList.remove("drop"); x.style.boxShadow = ""; }); });

/* item dialog */
let itemCtx = null;
function openItem(ctx, prefill) {
  itemCtx = ctx;
  const f = $("#itemForm"), c = catById(ctx.catId);
  const it = ctx.id ? c.items.find((x) => x.id === ctx.id) : { name: "", url: "", desc: "", lic: "", os: [], sub: ctx.sub || "", links: [], ...(prefill || {}) };
  $("#itemDlgTitle").textContent = ctx.id ? "Edit entry" : prefill ? "Add entry from website" : "New entry";
  f.name.value = it.name; f.url.value = it.url; f.desc.value = it.desc; f.lic.value = it.lic || ""; f.sub.value = it.sub || "";
  f.links.value = (it.links || []).join("\n");
  $$('input[name="os"]', f).forEach((cb) => (cb.checked = (it.os || []).includes(cb.value)));
  f.cat.innerHTML = cats().map((x) => `<option value="${esc(x.id)}"${x.id === ctx.catId ? " selected" : ""}>${esc(x.title)}</option>`).join("");
  const subs = [...new Set(cats().flatMap((x) => x.items.map((i) => i.sub)).filter(Boolean))];
  $("#subList").innerHTML = subs.map((s) => `<option value="${esc(s)}">`).join("");
  $("#itemErr").textContent = "";
  $("#itemDlg").showModal();
  setTimeout(() => f.name.focus(), 30);
}
$("#itemForm").addEventListener("submit", (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  const f = e.target;
  const url = f.url.value.trim();
  if (url && !F.safeUrl(url)) { e.preventDefault(); $("#itemErr").textContent = "URL must start with http:// or https://"; return; }
  const links = f.links.value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const bad = links.find((l) => !F.safeUrl(l));
  if (bad) { e.preventDefault(); $("#itemErr").textContent = "Invalid extra link: " + bad; return; }
  if (!f.name.value.trim()) { e.preventDefault(); $("#itemErr").textContent = "Name is required"; return; }
  const data = F.normalizeItem({
    id: itemCtx.id, name: f.name.value, url, desc: f.desc.value, lic: f.lic.value, sub: f.sub.value, links,
    os: $$('input[name="os"]:checked', f).map((x) => x.value),
  });
  const ctx = itemCtx, target = f.cat.value;
  const dupe = !ctx.id && catById(target).items.find((x) => (data.url && keyUrl(x.url) === keyUrl(data.url)) || x.name.toLowerCase() === data.name.toLowerCase());
  commit(ctx.id ? "edit entry" : "add entry", (dr) => {
    const src = dr.categories.find((x) => x.id === ctx.catId), dst = dr.categories.find((x) => x.id === target);
    if (ctx.id) {
      const i = src.items.findIndex((x) => x.id === ctx.id);
      if (src === dst) src.items[i] = data;
      else { src.items.splice(i, 1); dst.items.push(data); }
    } else {
      if (src === dst) dst.items.splice(Math.min(ctx.at ?? dst.items.length, dst.items.length), 0, data);
      else dst.items.push(data);
    }
  });
  if (dupe) toast(`Note: “${dupe.name}” already exists in this category`, "bad");
  else toast(ctx.id ? "Entry updated" : `Added “${data.name}”`);
});

/* =========================================================================
   import / export
   ========================================================================= */
function scopeCats(scope) { return scope === "all" ? cats() : scope.startsWith("g:") ? cats().filter((c) => c.group === scope.slice(2)) : cats().filter((c) => c.id === scope); }
function exportText({ scope, fmt, settings }) {
  const cs = scopeCats(scope);
  const full = scope === "all";
  if (fmt === "markdown") return F.toMarkdown(S.draft, { categories: cs, title: full ? undefined : cs.length === 1 ? cs[0].title : undefined });
  const obj = F.toPortable(S.draft, { categories: cs, includeSettings: full && settings });
  if (!full && cs.length === 1) { const c = F.categoryToPortable(cs[0]); return fmt === "yaml" ? F.toYAML({ kind: "category", version: 1, ...c }) : JSON.stringify({ kind: "category", version: 1, ...c }, null, 2); }
  return fmt === "yaml" ? F.toYAML(obj) : JSON.stringify(obj, null, 2);
}
function exportData(o) {
  const cs = scopeCats(o.scope);
  const base = o.scope === "all" ? "catalog" : cs.length === 1 ? cs[0].slug || "category" : "catalog-part";
  const ext = { markdown: "md", yaml: "yaml", json: "json" }[o.fmt];
  download(`${base}-${stamp()}.${ext}`, exportText(o), { md: "text/markdown", yaml: "text/yaml", json: "application/json" }[ext]);
  toast(`Exported ${cs.length === 1 && o.scope !== "all" ? "“" + cs[0].title + "”" : cs.length + " categories"} as .${ext}`);
}

function renderImport(el) {
  const tab = S.importTab;
  el.innerHTML = `<div class="tabs" role="tablist">
      <button role="tab" data-act="impTab" data-t="import" aria-selected="${tab === "import"}">Import</button>
      <button role="tab" data-act="impTab" data-t="export" aria-selected="${tab === "export"}">Export</button></div>
    <div id="impBody"></div>`;
  tab === "export" ? renderExportTab($("#impBody")) : renderImportTab($("#impBody"));
}
ACT.impTab = (b) => { S.importTab = b.dataset.t; render(); };

function scopeOptions(sel) {
  return `<option value="all"${sel === "all" ? " selected" : ""}>Entire catalog (${cats().length} categories)</option>
    <optgroup label="Group">${S.draft.groups.map((g) => `<option value="g:${esc(g.id)}"${sel === "g:" + g.id ? " selected" : ""}>${esc(g.label)}</option>`).join("")}</optgroup>
    <optgroup label="Single category">${cats().map((c) => `<option value="${esc(c.id)}"${sel === c.id ? " selected" : ""}>${esc(c.title)} (${c.items.length})</option>`).join("")}</optgroup>`;
}
function renderExportTab(el) {
  el.innerHTML = `<div class="panel"><h3>Export</h3><p class="muted">Download the curated list, one group or one category. Markdown matches the README format; YAML/JSON round-trip everything (and can include site settings for a full backup). To export hand-picked entries, select them in the Catalog editor.</p>
    <div class="grid3">
      <label class="fld"><span>Scope</span><select id="exScope">${scopeOptions(S.exportScope)}</select></label>
      <label class="fld"><span>Format</span><select id="exFmt"><option value="markdown">Markdown (.md)</option><option value="yaml">YAML (.yaml)</option><option value="json">JSON (.json)</option></select></label>
      <label class="fld"><span>Options</span><label class="chk" style="min-height:36px"><input type="checkbox" id="exSet" ${S.exportSettings ? "checked" : ""}> Include site settings (full YAML/JSON only)</label></label>
    </div>
    <div class="row" style="margin:12px 0"><button class="btn primary" data-act="doExport">${icon("i-dl")}Download</button><button class="btn" data-act="copyExport">Copy to clipboard</button><span class="small muted" id="exInfo"></span></div>
    <textarea class="code" id="exPrev" rows="18" readonly></textarea></div>
    <div class="panel"><h3>Public download links</h3><p class="muted">Visitors can always download the published list: <a href="/catalog.md" target="_blank">/catalog.md</a> · <a href="/catalog.yaml" target="_blank">/catalog.yaml</a> · <a href="/catalog.json" target="_blank">/catalog.json</a></p></div>`;
  $("#exFmt").value = S.exportFmt;
  const upd = () => {
    S.exportScope = $("#exScope").value; S.exportFmt = $("#exFmt").value; S.exportSettings = $("#exSet").checked;
    const t = exportText({ scope: S.exportScope, fmt: S.exportFmt, settings: S.exportSettings });
    $("#exPrev").value = t.length > 200000 ? t.slice(0, 200000) + "\n… (preview truncated)" : t;
    $("#exInfo").textContent = `${t.split("\n").length} lines · ${fmtSize(new Blob([t]).size)}`;
  };
  ["#exScope", "#exFmt", "#exSet"].forEach((s) => $(s).addEventListener("change", upd));
  upd();
}
ACT.doExport = () => exportData({ scope: S.exportScope, fmt: S.exportFmt, settings: S.exportSettings });
ACT.copyExport = async () => {
  try { await navigator.clipboard.writeText(exportText({ scope: S.exportScope, fmt: S.exportFmt, settings: S.exportSettings })); toast("Copied to clipboard"); }
  catch { $("#exPrev").select(); toast("Press Ctrl+C to copy", "bad"); }
};

function renderImportTab(el) {
  el.innerHTML = `<div class="panel"><h3>Import files</h3><p class="muted">Markdown (.md, README style), YAML (.yaml/.yml) or JSON. A file can hold a whole catalog, one category, or a plain list of entries. You review everything before it is added.</p>
    <label class="drop-zone" id="dz"><input type="file" id="impFile" multiple accept=".md,.markdown,.txt,.yaml,.yml,.json" hidden>
      ${icon("i-dl")}<div><b>Drop files here</b> or click to choose</div><div class="small">.md · .yaml · .yml · .json</div></label>
  </div>
  <div class="panel"><h3>…or paste content</h3>
    <div class="row" style="margin-bottom:8px"><select id="pasteFmt" style="width:auto"><option value="">Detect format</option><option value="markdown">Markdown</option><option value="yaml">YAML</option><option value="json">JSON</option></select><button class="btn" data-act="parsePaste">Review import</button></div>
    <textarea class="code" id="pasteTxt" rows="8" placeholder="## Category&#10;- [Tool](https://example.com) [F] [Linux] — What it does"></textarea></div>
  <div id="reviewBox"></div>`;
  const dz = $("#dz"), fi = $("#impFile");
  fi.addEventListener("change", () => readFiles(fi.files));
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); readFiles(e.dataTransfer.files); });
  if (S.review && S.review.source === "import") renderReview($("#reviewBox"));
}
async function readFiles(files) {
  const parsed = [];
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) { toast(`${f.name} is larger than 10 MB`, "bad"); continue; }
    try { parsed.push({ name: f.name, data: F.parseAny(await f.text(), f.name) }); }
    catch (e) { toast(`${f.name}: ${e.message}`, "bad", 6000); }
  }
  if (!parsed.length) return;
  startReview("import", parsed.map((p) => p.data), parsed.map((p) => p.name).join(", "));
}
ACT.parsePaste = () => {
  const t = $("#pasteTxt").value;
  if (!t.trim()) return toast("Paste something first", "bad");
  try { startReview(S.view === "ingest" ? "ingest" : "import", [F.parseAny(t, $("#pasteFmt").value)], "Pasted content"); }
  catch (e) { toast(e.message, "bad", 6000); }
};

/* ---------- shared review & insert ---------- */
function existingIndex() {
  const m = new Map();
  for (const c of cats()) for (const it of c.items) { if (it.url) m.set("u:" + keyUrl(it.url), c.title); m.set("n:" + it.name.toLowerCase(), c.title); }
  return m;
}
function startReview(source, parsedList, label) {
  const rows = [], catMeta = {};
  let settings = null, groups = null, hasCats = false;
  for (const p of parsedList) {
    if (p.settings) settings = p.settings;
    if (p.groups) groups = p.groups;
    for (const c of p.categories || []) {
      hasCats = true;
      const nc = F.normalizeCategory(c, S.draft.groups);
      catMeta[nc.title] = catMeta[nc.title] || { group: c.group ? nc.group : "", icon: nc.icon, source: nc.source, desc: nc.desc };
      nc.items.forEach((it) => rows.push({ ...it, cat: nc.title, on: true }));
    }
    for (const it of p.items || []) rows.push({ ...F.normalizeItem(it), cat: it.cat || "", on: true });
  }
  if (!rows.length && !settings) return toast("No entries found in that content", "bad");
  const idx = existingIndex();
  rows.forEach((r) => { r.dup = idx.get("u:" + keyUrl(r.url)) || idx.get("n:" + r.name.toLowerCase()) || ""; });
  const target = hasCats && Object.keys(catMeta).length ? "keep" : S.catId || "keep";
  S.review = { source, label, rows, catMeta, settings, groups, hasCats, target, mode: "merge", position: "end", newName: "", newGroup: S.draft.groups[0].id, filter: "", hideDup: false, importSettings: false };
  const box = $("#reviewBox");
  if (box) { renderReview(box); box.scrollIntoView({ behavior: "smooth", block: "start" }); }
}
function renderReview(el) {
  const R = S.review;
  if (!R) { el.innerHTML = ""; return; }
  const q = R.filter.toLowerCase();
  const vis = R.rows.filter((r) => (!R.hideDup || !r.dup) && (!q || (r.name + " " + r.url + " " + r.desc + " " + r.cat).toLowerCase().includes(q)));
  const on = R.rows.filter((r) => r.on).length;
  const dups = R.rows.filter((r) => r.dup).length;
  const srcCats = [...new Set(R.rows.map((r) => r.cat).filter(Boolean))];
  el.innerHTML = `<div class="panel">
    <div class="row"><h3>Review: ${esc(R.label)}</h3><span class="spacer"></span><button class="btn sm ghost" data-act="revClose">Close</button></div>
    <div class="stat-line"><span><b>${R.rows.length}</b> entries found</span><span><b>${srcCats.length}</b> source categories</span><span><b>${dups}</b> already in catalog</span><span><b>${on}</b> selected</span>${R.settings ? "<span>· file includes <b>site settings</b></span>" : ""}</div>
    <div class="grid3" style="margin:10px 0">
      <label class="fld"><span>Insert into</span><select id="rvTarget">
        <option value="keep"${R.target === "keep" ? " selected" : ""}>Categories from the source${srcCats.length ? "" : " (“Imported”)"}</option>
        <option value="new"${R.target === "new" ? " selected" : ""}>A new category…</option>
        <optgroup label="Existing category">${cats().map((c) => `<option value="${esc(c.id)}"${R.target === c.id ? " selected" : ""}>${esc(c.title)}</option>`).join("")}</optgroup></select></label>
      <label class="fld"><span>When an entry already exists</span><select id="rvMode">
        <option value="merge"${R.mode === "merge" ? " selected" : ""}>Update it with the imported details</option>
        <option value="add"${R.mode === "add" ? " selected" : ""}>Keep the existing one (add new only)</option>
        <option value="replace"${R.mode === "replace" ? " selected" : ""}>Replace ${R.target === "keep" ? "the WHOLE catalog" : "everything in the target category"}</option></select></label>
      <label class="fld"><span>Position for new entries</span><select id="rvPos"><option value="end">At the end</option><option value="start"${R.position === "start" ? " selected" : ""}>At the top</option></select></label>
      <label class="fld" ${R.target === "new" ? "" : "hidden"}><span>New category name</span><input id="rvNewName" value="${esc(R.newName)}" placeholder="e.g. Recon (imported)"></label>
      <label class="fld" ${R.target === "new" ? "" : "hidden"}><span>Group</span><select id="rvNewGroup">${S.draft.groups.map((g) => `<option value="${esc(g.id)}"${g.id === R.newGroup ? " selected" : ""}>${esc(g.label)}</option>`).join("")}</select></label>
      ${R.settings ? `<label class="fld"><span>Site settings</span><label class="chk" style="min-height:36px"><input type="checkbox" id="rvSet" ${R.importSettings ? "checked" : ""}> Also import settings from the file</label></label>` : ""}
    </div>
    <div class="row" style="margin-bottom:8px">
      <input type="search" id="rvFilter" placeholder="Filter…" value="${esc(R.filter)}" style="max-width:260px">
      <label class="chk small"><input type="checkbox" id="rvHideDup" ${R.hideDup ? "checked" : ""}> Hide entries already in catalog</label>
      <button class="btn xs" data-act="revAll" data-v="1">Select shown</button><button class="btn xs" data-act="revAll" data-v="0">Unselect shown</button><button class="btn xs" data-act="revNoDup">Unselect existing</button>
      <span class="spacer"></span>
      <button class="btn primary" data-act="revApply" ${on || (R.settings && R.importSettings) ? "" : "disabled"}>Insert ${on} entr${on === 1 ? "y" : "ies"}</button>
    </div>
    <div class="preview"><table class="items"><thead><tr><th></th><th>Name</th><th>Description</th><th class="hide-m">Source category</th><th>Status</th></tr></thead><tbody>
    ${vis.slice(0, 1500).map((r) => { const i = R.rows.indexOf(r); return `<tr class="${r.on ? "sel" : ""}">
      <td><input type="checkbox" data-rv="${i}" ${r.on ? "checked" : ""}></td>
      <td style="min-width:180px"><input data-rvf="name" data-i="${i}" value="${esc(r.name)}" style="min-height:30px;padding:4px 8px;font-weight:600"><div class="ihost" title="${esc(r.url)}">${esc(r.url ? F.hostOf(r.url) + new URL(r.url).pathname.replace(/\/$/, "").slice(0, 40) : "no URL")}</div></td>
      <td style="min-width:240px"><textarea data-rvf="desc" data-i="${i}" rows="2" style="min-height:30px;padding:4px 8px;font-size:12.5px">${esc(r.desc)}</textarea></td>
      <td class="hide-m small muted">${esc(r.cat || "—")}${r.sub ? `<br><span class="small">${esc(r.sub)}</span>` : ""}</td>
      <td>${r.dup ? `<span class="tag dup" title="Exists in ${esc(r.dup)}">exists</span>` : '<span class="tag new">new</span>'}</td></tr>`; }).join("")}
    </tbody></table>${vis.length > 1500 ? `<p class="small muted" style="padding:8px">Showing 1500 of ${vis.length}. Use the filter to narrow down.</p>` : ""}</div>
  </div>`;
  const reRender = () => renderReview(el);
  $("#rvTarget", el).onchange = (e) => { R.target = e.target.value; reRender(); };
  $("#rvMode", el).onchange = (e) => (R.mode = e.target.value);
  $("#rvPos", el).onchange = (e) => (R.position = e.target.value);
  const nn = $("#rvNewName", el); if (nn) nn.oninput = (e) => (R.newName = e.target.value);
  const ng = $("#rvNewGroup", el); if (ng) ng.onchange = (e) => (R.newGroup = e.target.value);
  const rs = $("#rvSet", el); if (rs) rs.onchange = (e) => { R.importSettings = e.target.checked; reRender(); };
  $("#rvFilter", el).oninput = (e) => { R.filter = e.target.value; clearTimeout(R._t); R._t = setTimeout(() => { reRender(); const f = $("#rvFilter", el); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 200); };
  $("#rvHideDup", el).onchange = (e) => { R.hideDup = e.target.checked; reRender(); };
  el.querySelectorAll("[data-rv]").forEach((cb) => (cb.onchange = () => { R.rows[cb.dataset.rv].on = cb.checked; reRender(); }));
  el.querySelectorAll("[data-rvf]").forEach((inp) => (inp.oninput = () => (R.rows[inp.dataset.i][inp.dataset.rvf] = inp.value)));
  R._vis = vis;
}
ACT.revClose = () => { S.review = null; const b = $("#reviewBox"); if (b) b.innerHTML = ""; };
ACT.revAll = (b) => { S.review._vis.forEach((r) => (r.on = b.dataset.v === "1")); renderReview($("#reviewBox")); };
ACT.revNoDup = () => { S.review.rows.forEach((r) => r.dup && (r.on = false)); renderReview($("#reviewBox")); };
ACT.revApply = async () => {
  const R = S.review;
  const rows = R.rows.filter((r) => r.on).map(({ on, dup, cat, ...it }) => ({ ...it, _cat: cat }));
  if (R.mode === "replace") {
    const what = R.target === "keep" ? `the ENTIRE catalog (${countItems(S.draft)} entries) with ${rows.length} entries` : `all entries in the target category with ${rows.length} entries`;
    if (!(await confirmBox("Replace content?", `This replaces ${what}. You can still undo or discard before saving.`, "Replace"))) return;
  }
  let parsed, target = "";
  if (R.target === "keep") {
    const by = new Map();
    for (const r of rows) {
      const t = r._cat || "Imported";
      if (!by.has(t)) by.set(t, { title: t, ...(R.catMeta[t] || {}), items: [] });
      by.get(t).items.push(r);
    }
    parsed = { categories: [...by.values()].map((c) => ({ ...c, group: c.group || F.guessGroup(c.title) })), groups: R.groups };
  } else if (R.target === "new") {
    const name = (R.newName || "").trim() || "Imported " + new Date().toLocaleDateString();
    parsed = { categories: [{ title: name, group: R.newGroup, items: rows }] };
  } else { parsed = { items: rows }; target = R.target; }
  try {
    let stats;
    commit(R.source === "ingest" ? "ingest entries" : "import", (dr) => {
      const res = F.mergeInto(dr, parsed, { mode: R.mode, target, position: R.position });
      Object.assign(dr, res.catalog);
      if (R.settings && R.importSettings) dr.settings = F.normalizeSettings({ ...dr.settings, ...R.settings });
      stats = res.stats;
    }, { rerender: false });
    toast(`Inserted: ${stats.addedItems} new, ${stats.updatedItems} updated, ${stats.skippedItems} skipped${stats.addedCategories ? `, ${stats.addedCategories} new categories` : ""}. Remember to Save & publish.`, "ok", 7000);
    if (target) S.catId = target;
    else if (R.target === "new") S.catId = cats().find((c) => c.title === parsed.categories[0].title)?.id || S.catId;
    S.review = null;
    render();
  } catch (e) { toast(e.message, "bad", 6000); }
};

/* =========================================================================
   ingestion from websites & snippets
   ========================================================================= */
function renderIngest(el) {
  const tab = S.ingestTab;
  el.innerHTML = `<div class="tabs" role="tablist">
      <button role="tab" data-act="ingTab" data-t="scan" aria-selected="${tab === "scan"}">Scan a website</button>
      <button role="tab" data-act="ingTab" data-t="single" aria-selected="${tab === "single"}">Add one tool from its URL</button>
      <button role="tab" data-act="ingTab" data-t="snippet" aria-selected="${tab === "snippet"}">Paste a snippet</button></div>
    <div id="ingBody"></div><div id="reviewBox"></div>`;
  const b = $("#ingBody");
  if (tab === "scan") {
    b.innerHTML = `<div class="panel"><h3>Scan a web page or curated list</h3><p class="muted">Paste the address of an “awesome list”, a GitHub repository, a raw Markdown/YAML file, or any web page. Markdown and YAML lists keep their categories; for HTML pages, links are collected with their surrounding text and nearest heading. Nothing is added until you review it.</p>
      <div class="row"><input id="ingUrl" type="url" placeholder="https://github.com/owner/awesome-list" style="flex:1;min-width:240px" value="${esc(S.ingestInfo?.input || "")}"><button class="btn primary" data-act="scan" id="scanBtn">Scan</button></div>
      <div class="row small" style="margin-top:10px;gap:16px">
        <label class="chk"><input type="checkbox" id="ingExt" checked> Only links to other sites</label>
        <label class="chk"><input type="checkbox" id="ingHead" checked> Use page headings as categories</label>
        <label class="chk"><input type="checkbox" id="ingSelf"> Include the scanned page itself as an entry</label>
      </div>
      <p class="small muted" id="ingInfo" style="margin:10px 0 0">${S.ingestInfo?.text ? esc(S.ingestInfo.text) : ""}</p></div>`;
    $("#ingUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") ACT.scan(); });
  } else if (tab === "single") {
    b.innerHTML = `<div class="panel"><h3>Add a single tool from its website</h3><p class="muted">Reads the page title and description, then opens the entry editor so you can adjust it and choose the category.</p>
      <div class="row"><input id="oneUrl" type="url" placeholder="https://tool.example.com" style="flex:1;min-width:240px"><select id="oneCat" style="width:auto;max-width:260px">${cats().map((c) => `<option value="${esc(c.id)}"${c.id === S.catId ? " selected" : ""}>${esc(c.title)}</option>`).join("")}</select><button class="btn primary" data-act="fetchOne">Fetch details</button></div></div>`;
    $("#oneUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") ACT.fetchOne(); });
  } else {
    b.innerHTML = `<div class="panel"><h3>Paste a snippet</h3><p class="muted">Paste Markdown (README style), YAML, JSON, or just a list of URLs — one per line, optionally followed by “ — description”.</p>
      <div class="row" style="margin-bottom:8px"><select id="pasteFmt" style="width:auto"><option value="">Detect format</option><option value="markdown">Markdown / URL list</option><option value="yaml">YAML</option><option value="json">JSON</option></select><button class="btn primary" data-act="parsePaste">Review snippet</button></div>
      <textarea class="code" id="pasteTxt" rows="12" placeholder="https://github.com/projectdiscovery/katana — Next-generation crawling framework&#10;- [Caido](https://caido.io) [F/C] [Linux macOS Windows] — Lightweight web security auditing toolkit&#10;&#10;# or YAML&#10;- name: Tool&#10;  url: https://example.com&#10;  description: What it does&#10;  license: free"></textarea></div>`;
  }
  if (S.review && S.review.source === "ingest") renderReview($("#reviewBox"));
}
ACT.ingTab = (b) => { S.ingestTab = b.dataset.t; render(); };

function rawGitHub(u) {
  try {
    const x = new URL(u);
    if (x.hostname !== "github.com") return null;
    const p = x.pathname.split("/").filter(Boolean);
    if (p.length === 2) return [`https://raw.githubusercontent.com/${p[0]}/${p[1]}/HEAD/README.md`, `https://raw.githubusercontent.com/${p[0]}/${p[1]}/HEAD/readme.md`];
    if (p[2] === "blob" && p.length > 4) return [`https://raw.githubusercontent.com/${p[0]}/${p[1]}/${p.slice(3).join("/")}`];
    if (p[2] === "tree" && p.length >= 4) return [`https://raw.githubusercontent.com/${p[0]}/${p[1]}/${p.slice(3).join("/")}/README.md`];
  } catch {}
  return null;
}
async function fetchRemote(u) {
  for (const cand of rawGitHub(u) || []) {
    try { const r = await api("POST", "/api/admin/fetch", { url: cand }); if (r.status < 400 && r.text.trim()) return { ...r, via: "GitHub README" }; } catch {}
  }
  const r = await api("POST", "/api/admin/fetch", { url: u });
  if (r.status >= 400) throw new Error(`The site answered with HTTP ${r.status}`);
  return r;
}
ACT.scan = async () => {
  const input = $("#ingUrl").value.trim();
  if (!F.safeUrl(input)) return toast("Enter a full http(s) URL", "bad");
  const opts = { ext: $("#ingExt").checked, head: $("#ingHead").checked, self: $("#ingSelf").checked };
  const btn = $("#scanBtn"); btn.disabled = true; btn.textContent = "Scanning…";
  $("#ingInfo").textContent = "Fetching…";
  try {
    const r = await fetchRemote(input);
    const ct = (r.contentType || "").toLowerCase();
    const looksHtml = /html/.test(ct) || /^\s*<(!doctype|html|head|body)/i.test(r.text);
    let parsed, kind;
    if (!looksHtml) {
      parsed = F.parseAny(r.text, /ya?ml/.test(ct) || /\.ya?ml$/i.test(r.url) ? "yaml" : /json/.test(ct) ? "json" : "");
      kind = parsed.format;
    } else {
      parsed = extractFromHTML(r.text, r.url, opts);
      kind = "HTML page";
    }
    const n = (parsed.categories || []).reduce((a, c) => a + (c.items || []).length, 0) + (parsed.items || []).length;
    S.ingestInfo = { input, text: `Fetched ${r.url}${r.via ? " (" + r.via + ")" : ""} · ${kind} · ${n} candidate entries` };
    $("#ingInfo").textContent = S.ingestInfo.text;
    if (!n) toast("No usable links found on that page", "bad");
    else startReview("ingest", [parsed], F.hostOf(r.url) + new URL(r.url).pathname.replace(/\/$/, ""));
  } catch (e) {
    $("#ingInfo").textContent = "Error: " + e.message;
    toast(e.message, "bad", 6000);
  }
  btn.disabled = false; btn.textContent = "Scan";
};

const JUNK = /(^|\.)(twitter|x|facebook|linkedin|instagram|youtube|reddit|t|tiktok|pinterest|mastodon\.social)\.com$|^(t\.co|bit\.ly)$|shields\.io$|badge|^img\./i;
const JUNK_PATH = /\/(login|signin|sign-in|signup|sign-up|register|share|intent|privacy|terms|cookie|contact|about|careers|pricing|sponsors?)(\/|$)/i;
function extractFromHTML(html, base, opts) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const baseUrl = new URL(base);
  const meta = (sel) => doc.querySelector(sel)?.getAttribute("content")?.trim() || "";
  const page = {
    name: meta('meta[property="og:site_name"]') || meta('meta[property="og:title"]') || doc.title.trim() || baseUrl.hostname,
    url: doc.querySelector('link[rel="canonical"]')?.href && F.safeUrl(new URL(doc.querySelector('link[rel="canonical"]').getAttribute("href"), baseUrl).href) || baseUrl.href,
    desc: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
  };
  doc.querySelectorAll("script,style,noscript,template,svg,iframe,form,nav,footer,header,[role=navigation],[aria-hidden=true]").forEach((n) => n.remove());
  const root = doc.querySelector("article, .markdown-body, main, [role=main], #readme, #content, .content") || doc.body;
  const out = new Map();
  let heading = "", sub = "";
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let n = walker.currentNode; n; n = walker.nextNode()) {
    const tag = n.tagName;
    if (/^H[1-3]$/.test(tag)) { heading = n.textContent.replace(/\s+/g, " ").trim().slice(0, 120); sub = ""; continue; }
    if (/^H[4-6]$/.test(tag)) { sub = n.textContent.replace(/\s+/g, " ").trim().slice(0, 120); continue; }
    if (tag !== "A") continue;
    const href = n.getAttribute("href");
    if (!href || href.startsWith("#") || /^(mailto|javascript|tel):/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, baseUrl); } catch { continue; }
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = "";
    const h = abs.hostname.replace(/^www\./, "");
    if (opts.ext && h === baseUrl.hostname.replace(/^www\./, "")) continue;
    if (JUNK.test(h) || JUNK_PATH.test(abs.pathname)) continue;
    if (h === "github.com" && abs.pathname.split("/").filter(Boolean).length < 2) continue;
    let name = n.textContent.replace(/\s+/g, " ").trim() || n.getAttribute("title") || n.querySelector("img")?.getAttribute("alt") || "";
    if (!name || /^https?:\/\//.test(name) || name.length > 90) name = F.parseAny(abs.href, "markdown").items[0]?.name || h;
    if (/^(here|link|website|homepage|docs?|documentation|read more|more|source|github|download|demo)$/i.test(name)) {
      const ctxName = n.closest("li,p,td,dd")?.querySelector("a,strong,b")?.textContent?.trim();
      if (ctxName && ctxName !== name) name = ctxName;
    }
    const ctx = n.closest("li,p,td,dd,dt");
    let desc = "";
    if (ctx) {
      // text that follows this link inside its list item / paragraph (stops at the next link)
      const r = doc.createRange();
      r.setStartAfter(n);
      r.setEnd(ctx, ctx.childNodes.length);
      const frag = r.cloneContents();
      let next = frag.querySelector("a");
      if (next) { const r2 = doc.createRange(); r2.selectNodeContents(frag); r2.setStartBefore(next); r2.deleteContents(); }
      desc = frag.textContent.replace(/\s+/g, " ").trim();
      if (!desc && ctx.firstElementChild !== n) desc = ctx.textContent.replace(/\s+/g, " ").replace(n.textContent, "").trim();
      desc = desc.replace(/^[\s:—–\-|,.]+/, "").slice(0, 300);
    }
    const key = keyUrl(abs.href);
    if (out.has(key)) { const ex = out.get(key); if (!ex.desc && desc) ex.desc = desc; continue; }
    out.set(key, { name: name.slice(0, 120), url: abs.href, desc, sub: opts.head ? sub : "", cat: opts.head ? heading : "" });
  }
  const items = [...out.values()];
  if (opts.self) items.unshift({ name: page.name.slice(0, 120), url: page.url, desc: page.desc, cat: "" });
  if (!opts.head) return { items };
  const by = new Map();
  const loose = [];
  for (const it of items) {
    if (!it.cat) { loose.push(it); continue; }
    if (!by.has(it.cat)) by.set(it.cat, { title: it.cat, items: [] });
    by.get(it.cat).items.push(it);
  }
  return { categories: [...by.values()], items: loose };
}
ACT.fetchOne = async () => {
  const u = $("#oneUrl").value.trim();
  if (!F.safeUrl(u)) return toast("Enter a full http(s) URL", "bad");
  let prefill = { name: F.parseAny(u, "markdown").items[0]?.name || F.hostOf(u), url: u, desc: "" };
  try {
    const r = await api("POST", "/api/admin/fetch", { url: u });
    if (/html/i.test(r.contentType || "")) {
      const doc = new DOMParser().parseFromString(r.text, "text/html");
      const meta = (s) => doc.querySelector(s)?.getAttribute("content")?.trim() || "";
      const title = meta('meta[property="og:title"]') || doc.title.trim();
      const site = meta('meta[property="og:site_name"]');
      prefill.name = (site && title.toLowerCase().includes(site.toLowerCase()) ? site : title.split(/\s[|–—-]\s/)[0] || prefill.name).slice(0, 120);
      prefill.desc = (meta('meta[name="description"]') || meta('meta[property="og:description"]')).slice(0, 400);
      if (/github\.com$/.test(F.hostOf(u))) { prefill.lic = "F"; prefill.desc = prefill.desc.replace(/ - [\w.-]+\/[\w.-]+$/, "").replace(/^Contribute to .*? by creating an account on GitHub\.?$/, ""); }
    }
  } catch (e) { toast("Could not read the page (" + e.message + "). You can still fill the details in.", "bad", 5000); }
  openItem({ catId: $("#oneCat").value, at: catById($("#oneCat").value).items.length }, prefill);
};

/* =========================================================================
   backups
   ========================================================================= */
async function renderBackups(el) {
  el.innerHTML = `<div class="cols">
    <div class="panel"><h3>Create a backup</h3><p class="muted">Saves the published catalog and settings on the server. An automatic backup is also made before every save and restore (the latest 40 are kept).</p>
      <div class="row"><input id="bkLabel" placeholder="Label, e.g. Before big cleanup" maxlength="120" style="flex:1"><button class="btn primary" data-act="mkBackup">Create backup</button></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="dlCurrent" data-f="json">${icon("i-dl")}Download full backup (.json)</button><button class="btn" data-act="dlCurrent" data-f="yaml">${icon("i-dl")}Download full backup (.yaml)</button></div></div>
    <div class="panel"><h3>Restore from a file</h3><p class="muted">Accepts a downloaded backup (.json/.yaml) or a full export. The content is loaded into the editor as a draft, so you can check it before pressing Save &amp; publish.</p>
      <label class="drop-zone" id="rdz"><input type="file" id="rFile" accept=".json,.yaml,.yml" hidden>${icon("c-box")}<div><b>Drop a backup file</b> or click to choose</div></label></div>
  </div>
  <div class="panel"><div class="row"><h3>Server backups</h3><span class="spacer"></span><button class="btn sm" data-act="reloadBk">Refresh</button></div><div id="bkList" style="margin-top:10px"><p class="muted">Loading…</p></div></div>`;
  const rdz = $("#rdz"), rf = $("#rFile");
  rf.addEventListener("change", () => rf.files[0] && restoreFile(rf.files[0]));
  rdz.addEventListener("dragover", (e) => { e.preventDefault(); rdz.classList.add("over"); });
  rdz.addEventListener("dragleave", () => rdz.classList.remove("over"));
  rdz.addEventListener("drop", (e) => { e.preventDefault(); rdz.classList.remove("over"); e.dataTransfer.files[0] && restoreFile(e.dataTransfer.files[0]); });
  try { if (!S.backups) S.backups = await api("GET", "/api/admin/backups"); } catch (e) { $("#bkList").innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  if (S.view !== "backups") return;
  const list = S.backups;
  $("#bkList").innerHTML = list.length ? `<div class="list">${list.map((b) => `<div class="li">
      <span class="badge ${b.auto ? "" : "manual"}">${b.auto ? "AUTO" : "MANUAL"}</span>
      <div class="grow"><b>${esc(b.label || "Backup")}</b><div class="small muted">${esc(fmtDate(b.createdAt))} · revision ${b.rev} · ${b.categories} categories · ${b.items} entries · ${fmtSize(b.size)}</div></div>
      <a class="btn sm" href="/api/admin/backups/${esc(b.id)}" download>${icon("i-dl")}Download</a>
      <button class="btn sm" data-act="restoreBk" data-id="${esc(b.id)}" data-l="${esc(b.label)}">Restore</button>
      <button class="btn sm danger" data-act="delBk" data-id="${esc(b.id)}">Delete</button></div>`).join("")}</div>` : '<p class="muted">No backups yet.</p>';
}
ACT.reloadBk = () => { S.backups = null; render(); };
ACT.mkBackup = async () => {
  try { const m = await api("POST", "/api/admin/backups", { label: $("#bkLabel").value.trim() || "Manual backup" }); toast(`Backup created (${m.items} entries)`); S.backups = null; render(); } catch (e) { toast(e.message, "bad"); }
};
ACT.dlCurrent = (b) => {
  const full = { kind: "backup", version: 1, exportedAt: new Date().toISOString(), catalog: { rev: S.saved.rev, settings: S.saved.settings, groups: S.saved.groups, categories: S.saved.categories } };
  if (b.dataset.f === "yaml") download(`catalog-backup-${stamp()}.yaml`, F.toYAML({ kind: "catalog", version: 1, ...F.toPortable(S.saved, { includeSettings: true }) }), "text/yaml");
  else download(`catalog-backup-${stamp()}.json`, JSON.stringify(full, null, 2), "application/json");
};
ACT.restoreBk = async (b) => {
  if (!(await confirmBox("Restore this backup?", `“${b.dataset.l}” replaces the live catalog and settings immediately. The current version is backed up first.${dirty() ? " Your unsaved changes will be discarded." : ""}`, "Restore now"))) return;
  try { const res = await api("POST", `/api/admin/backups/${b.dataset.id}/restore`); setSaved(res); S.backups = null; render(); toast(`Restored — now at revision ${res.rev}`); } catch (e) { toast(e.message, "bad"); }
};
ACT.delBk = async (b) => {
  if (!(await confirmBox("Delete this backup?", "This cannot be undone.", "Delete"))) return;
  try { await api("DELETE", `/api/admin/backups/${b.dataset.id}`); S.backups = null; render(); toast("Backup deleted"); } catch (e) { toast(e.message, "bad"); }
};
async function restoreFile(file) {
  try {
    const text = await file.text();
    let data;
    if (/\.json$/i.test(file.name)) data = JSON.parse(text);
    else { const p = F.parseAny(text, file.name); data = { categories: p.categories, groups: p.groups, settings: p.settings }; }
    if (data.catalog) data = data.catalog;
    if (!Array.isArray(data.categories)) throw new Error("No catalog found in this file");
    const next = F.normalizeCatalog({ ...data, settings: data.settings || S.draft.settings, groups: data.groups || S.draft.groups });
    if (!(await confirmBox("Load this backup into the editor?", `${next.categories.length} categories and ${countItems(next)} entries${data.settings ? " plus site settings" : ""} will replace the current draft. Nothing is published until you press Save & publish.`, "Load", false))) return;
    commit("restore from file", (dr) => { dr.settings = next.settings; dr.groups = next.groups; dr.categories = next.categories; }, { rerender: false });
    S.catId = cats()[0]?.id;
    toast("Backup loaded into the editor — review it, then Save & publish", "ok", 6000);
    go("catalog");
  } catch (e) { toast(`${file.name}: ${e.message}`, "bad", 6000); }
}

/* =========================================================================
   appearance / settings
   ========================================================================= */
function setField(k, label, type = "text", extra = "") {
  const v = S.draft.settings[k];
  if (type === "check") return `<label class="chk"><input type="checkbox" data-set="${k}" ${v ? "checked" : ""}> ${label}</label>`;
  if (type === "area") return `<label class="fld ${extra}"><span>${label}</span><textarea data-set="${k}" rows="3">${esc(v)}</textarea></label>`;
  return `<label class="fld ${extra}"><span>${label}</span><input data-set="${k}" type="${type}" value="${esc(v)}"></label>`;
}
function bindSettings(el) {
  el.querySelectorAll("[data-set]").forEach((inp) => {
    const k = inp.dataset.set;
    inp.addEventListener(inp.type === "checkbox" || inp.tagName === "SELECT" || inp.type === "color" ? "change" : "input", () => {
      let v = inp.type === "checkbox" ? inp.checked : inp.value;
      if (k === "sourceUrl" && v && !F.safeUrl(v)) { inp.style.borderColor = "var(--bad)"; return; }
      inp.style.borderColor = "";
      commit("settings", (dr) => { dr.settings[k] = v; }, { coalesce: "set:" + k, rerender: false });
      if (S.view === "clock") tickPreview();
      if (S.view === "themes") onThemeSettingChange(k);
    });
  });
}
function renderAppearance(el) {
  const s = S.draft.settings;
  el.innerHTML = `
  <div class="panel"><h3>Branding</h3><p class="muted">Names shown in the browser tab, header and search engines.</p><div class="grid2">
    ${setField("siteTitle", "Site title (browser tab)")}${setField("brandName", "Header name")}
    ${setField("brandTagline", "Header tagline")}${setField("metaDescription", "Search-engine description")}
  </div></div>
  <div class="panel"><h3>Hero section</h3><p class="muted">Wrap words in {curly braces} in the headline to give them the gradient highlight.</p><div class="grid2">
    ${setField("eyebrow", "Small label above the headline")}${setField("searchPlaceholder", "Search box placeholder")}
    ${setField("heroTitle", "Headline", "text", "span2")}${setField("heroText", "Intro text", "area", "span2")}
  </div></div>
  <div class="panel"><h3>Notice &amp; footer</h3><div class="grid2">
    <div class="fld span2">${setField("legalEnabled", "Show the legal &amp; ethical-use notice", "check")}</div>
    ${setField("legalText", "Notice text", "area", "span2")}
    ${setField("footerText", "Footer attribution text")}${setField("sourceLabel", "Attribution link text")}
    ${setField("sourceUrl", "Attribution link URL (leave empty to hide)", "url", "span2")}
  </div></div>
  <div class="panel"><h3>Groups</h3><p class="muted">Groups organise categories in the sidebar and the filter buttons on the site (for example Tools, Learning, Compliance).</p>
    <div class="list">${S.draft.groups.map((g, i) => {
      const used = cats().filter((c) => c.group === g.id).length;
      return `<div class="li"><span class="mono small muted" style="width:90px">${esc(g.id)}</span><input data-grp="${i}" value="${esc(g.label)}" maxlength="40" style="max-width:300px"><span class="small muted grow">${used} categories</span>
        <button class="btn xs" data-act="mvGrp" data-i="${i}" data-d="-1">▲</button><button class="btn xs" data-act="mvGrp" data-i="${i}" data-d="1">▼</button>
        <button class="btn xs danger" data-act="delGrp" data-i="${i}" ${S.draft.groups.length < 2 ? "disabled" : ""}>Delete</button></div>`; }).join("")}</div>
    <div class="row" style="margin-top:10px"><input id="newGrp" placeholder="New group name" maxlength="40" style="max-width:300px"><button class="btn" data-act="addGrp">+ Add group</button></div></div>`;
  bindSettings(el);
  el.querySelectorAll("[data-grp]").forEach((inp) => inp.addEventListener("input", () => commit("rename group", (dr) => { dr.groups[inp.dataset.grp].label = inp.value.trim() || dr.groups[inp.dataset.grp].id; }, { coalesce: "grp" + inp.dataset.grp, rerender: false })));
}
/* =========================================================================
   themes & appearance
   ========================================================================= */
function fontFor(t) {
  const f = S.draft.settings.fontStyle === "theme" ? t.font : S.draft.settings.fontStyle;
  return { mono: "ui-monospace,Menlo,Consolas,monospace", serif: "ui-serif,Georgia,serif", rounded: "ui-rounded,'SF Pro Rounded',Nunito,system-ui,sans-serif" }[f] || "system-ui,sans-serif";
}
function themeMock(t) {
  const c = t.c;
  return `<div class="tmock" style="background:${c.bg};color:${c.text};font-family:${fontFor(t)}">
    <div class="tm-bar" style="border-bottom:1px solid ${c.line}"><span class="tm-logo" style="background:linear-gradient(135deg,${c.accent},${c.accent2})"></span><span class="tm-name">Cyber Tools</span><span class="tm-pill" style="background:${c.panel};border:1px solid ${c.line2};color:${c.muted}">12:00 <b style="color:${c.accent}">UTC</b></span></div>
    <div class="tm-hero"><span style="background:linear-gradient(90deg,${c.accent},${c.accent2},${c.accent3});-webkit-background-clip:text;background-clip:text;color:transparent">Security toolkit</span></div>
    <div class="tm-search" style="background:${c.panelSolid};border:1px solid ${c.line2};color:${c.dim}">Search tools…</div>
    <div class="tm-cards">
      <div style="background:${c.panel};border:1px solid ${c.line};box-shadow:inset 0 2px 0 ${c.accent}"><b>Nmap</b><span style="color:${c.muted}">Network scanner</span><i style="color:${c.good};border-color:${c.good}">FREE</i></div>
      <div style="background:${c.panel};border:1px solid ${c.line};box-shadow:inset 0 2px 0 ${c.accent2}"><b>Burp</b><span style="color:${c.muted}">Web proxy</span><i style="color:${c.warn};border-color:${c.warn}">PAID</i></div>
    </div></div>`;
}
function previewSkin() { return S.previewSkin && themeById(S.previewSkin) ? S.previewSkin : S.draft.settings.theme; }
function sendPreview() {
  const f = $("#tPrev");
  if (!f || !f.contentWindow) return;
  f.contentWindow.postMessage({ type: "cst-preview", skin: previewSkin(), settings: S.draft.settings }, location.origin);
  const lbl = $("#tPrevLbl");
  if (lbl) lbl.textContent = (themeById(previewSkin()) || {}).name + (S.previewSkin && S.previewSkin !== S.draft.settings.theme ? " (previewing)" : " (default)");
}
function onThemeSettingChange(k) {
  sendPreview();
  if (["fontStyle", "accentOverride", "themeAuto", "themeAllowVisitor"].includes(k)) renderThemeBody();
}
function renderThemes(el) {
  el.innerHTML = `<div class="themes-layout">
    <div id="themeBody"></div>
    <aside class="tprev-wrap">
      <div class="panel tprev-panel">
        <div class="row" style="margin-bottom:8px"><h3>Live preview</h3><span class="spacer"></span>
          <div class="tabs" style="margin:0"><button data-act="prevDev" data-d="desk" aria-selected="${S.prevDev !== "mobile"}">Desktop</button><button data-act="prevDev" data-d="mobile" aria-selected="${S.prevDev === "mobile"}">Mobile</button></div></div>
        <div class="small muted" style="margin-bottom:8px">Showing <b id="tPrevLbl"></b>. Unsaved changes are previewed here only; <b>Save &amp; publish</b> makes them live.</div>
        <div class="tprev-frame ${S.prevDev === "mobile" ? "mobile" : ""}"><iframe id="tPrev" src="/?preview=1" title="Site preview" loading="eager"></iframe></div>
      </div>
    </aside></div>`;
  $("#tPrev").addEventListener("load", sendPreview);
  renderThemeBody();
}
function renderThemeBody() {
  const box = $("#themeBody");
  if (!box) return;
  const s = S.draft.settings, en = new Set(s.themesEnabled);
  const opt = (k) => APPEARANCE_OPTIONS[k].map(([v, l]) => `<option value="${v}"${s[k] === v ? " selected" : ""}>${esc(l)}</option>`).join("");
  box.innerHTML = `
  <div class="panel"><h3>Theme gallery</h3><p class="muted">Click a theme to preview it. Set one as the <b>default</b>, and tick the themes visitors can switch to from the palette button in the site header.</p>
    <div class="tgrid">${THEMES.map((t) => {
      const isDef = s.theme === t.id, isLight = s.themeAuto && s.themeLight === t.id;
      return `<div class="tcard${isDef ? " def" : ""}${previewSkin() === t.id ? " prev" : ""}">
        <button class="tmock-btn" data-act="prevTheme" data-id="${t.id}" title="Preview ${esc(t.name)}">${themeMock(t)}</button>
        <div class="tmeta"><div class="row" style="gap:6px"><b>${esc(t.name)}</b><span class="badge">${t.mode}</span>${isDef ? '<span class="badge manual">DEFAULT</span>' : ""}${isLight ? '<span class="badge manual">LIGHT DEVICES</span>' : ""}</div>
          <div class="small muted">${esc(t.desc)}</div>
          <div class="row" style="margin-top:8px;gap:6px">
            <button class="btn xs ${isDef ? "" : "primary"}" data-act="setTheme" data-id="${t.id}" ${isDef ? "disabled" : ""}>${isDef ? "Default ✓" : "Set as default"}</button>
            ${s.themeAuto && t.mode === "light" ? `<button class="btn xs" data-act="setLight" data-id="${t.id}" ${isLight ? "disabled" : ""}>${isLight ? "Light default ✓" : "Use for light devices"}</button>` : ""}
            <label class="chk small" style="margin-left:auto" title="Visitors can pick this theme"><input type="checkbox" data-en="${t.id}" ${en.has(t.id) ? "checked" : ""} ${isDef || isLight ? "disabled" : ""}> Visitors</label>
          </div></div></div>`;
    }).join("")}</div>
    <div class="row" style="margin-top:12px"><button class="btn sm" data-act="enAll">Offer all themes</button><button class="btn sm" data-act="enNone">Offer only the default</button><span class="small muted">${s.themesEnabled.length} of ${THEMES.length} themes offered to visitors</span></div>
  </div>
  <div class="panel"><h3>Theme behaviour</h3><div style="display:flex;flex-direction:column;gap:10px">
    ${setField("themeAuto", "Follow the visitor's device: use a light theme for devices set to light mode", "check")}
    ${s.themeAuto ? `<label class="fld" style="max-width:340px"><span>Theme for light-mode devices</span><select data-set="themeLight">${THEMES.filter((t) => t.mode === "light").map((t) => `<option value="${t.id}"${s.themeLight === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>` : ""}
    ${setField("themeAllowVisitor", "Let visitors switch themes (palette button in the header; their choice is remembered in their browser)", "check")}
  </div></div>
  <div class="panel"><h3>Appearance</h3><p class="muted">These apply on top of every theme.</p><div class="grid3">
    <label class="fld"><span>Font</span><select data-set="fontStyle">${opt("fontStyle")}</select></label>
    <label class="fld"><span>Corners</span><select data-set="radius">${opt("radius")}</select></label>
    <label class="fld"><span>Card style</span><select data-set="cardStyle">${opt("cardStyle")}</select></label>
    <label class="fld"><span>Layout density</span><select data-set="density">${opt("density")}</select></label>
    <label class="fld"><span>Background effect</span><select data-set="bgEffect">${opt("bgEffect")}</select></label>
    <div class="fld"><span>Extras</span><div style="display:flex;flex-direction:column;gap:6px">${setField("glow", "Colour glow blobs", "check")}${setField("showFavicons", "Tool icons (favicons)", "check")}${setField("showStats", "Statistics tiles", "check")}</div></div>
  </div></div>
  <div class="panel"><h3>Custom accent colours</h3><p class="muted">Override the selected theme's accent colours with your brand colours. Check that text stays readable in both light and dark themes.</p>
    <div class="row" style="gap:18px">${setField("accentOverride", "Use custom accent colours", "check")}
      <label class="row small" ${s.accentOverride ? "" : 'style="opacity:.45;pointer-events:none"'}><input type="color" data-set="accent" value="${esc(s.accent)}"> Accent</label>
      <label class="row small" ${s.accentOverride ? "" : 'style="opacity:.45;pointer-events:none"'}><input type="color" data-set="accent2" value="${esc(s.accent2)}"> Gradient</label>
      <button class="btn sm" data-act="resetLook">Reset to default colours</button></div></div>`;
  bindSettings(box);
  box.querySelectorAll("[data-en]").forEach((cb) => cb.addEventListener("change", () => {
    commit("themes offered", (dr) => {
      const set = new Set(dr.settings.themesEnabled);
      cb.checked ? set.add(cb.dataset.en) : set.delete(cb.dataset.en);
      dr.settings.themesEnabled = THEMES.map((t) => t.id).filter((id) => set.has(id));
    }, { rerender: false });
    renderThemeBody();
  }));
  sendPreview();
}
function themeCommit(label, fn) { commit(label, fn, { rerender: false }); renderThemeBody(); }
ACT.prevTheme = (b) => { S.previewSkin = b.dataset.id; renderThemeBody(); };
ACT.setTheme = (b) => themeCommit("default theme", (dr) => {
  dr.settings.theme = b.dataset.id;
  if (!dr.settings.themesEnabled.includes(b.dataset.id)) dr.settings.themesEnabled = THEMES.map((t) => t.id).filter((id) => id === b.dataset.id || dr.settings.themesEnabled.includes(id));
  S.previewSkin = b.dataset.id;
});
ACT.setLight = (b) => themeCommit("light theme", (dr) => {
  dr.settings.themeLight = b.dataset.id;
  if (!dr.settings.themesEnabled.includes(b.dataset.id)) dr.settings.themesEnabled = THEMES.map((t) => t.id).filter((id) => id === b.dataset.id || dr.settings.themesEnabled.includes(id));
  S.previewSkin = b.dataset.id;
});
ACT.enAll = () => themeCommit("themes offered", (dr) => (dr.settings.themesEnabled = THEMES.map((t) => t.id)));
ACT.enNone = () => themeCommit("themes offered", (dr) => (dr.settings.themesEnabled = THEMES.map((t) => t.id).filter((id) => id === dr.settings.theme || (dr.settings.themeAuto && id === dr.settings.themeLight))));
ACT.prevDev = (b) => { S.prevDev = b.dataset.d; $(".tprev-frame").classList.toggle("mobile", S.prevDev === "mobile"); $$('[data-act="prevDev"]').forEach((x) => x.setAttribute("aria-selected", String(x === b))); };
ACT.resetLook = () => { commit("reset colours", (dr) => { dr.settings.accent = F.DEFAULT_SETTINGS.accent; dr.settings.accent2 = F.DEFAULT_SETTINGS.accent2; dr.settings.accentOverride = false; }, { rerender: false }); renderThemeBody(); };
ACT.mvGrp = (b) => commit("reorder groups", (dr) => { const i = Number(b.dataset.i), j = i + Number(b.dataset.d); if (j < 0 || j >= dr.groups.length) return; const [g] = dr.groups.splice(i, 1); dr.groups.splice(j, 0, g); });
ACT.addGrp = () => {
  const label = $("#newGrp").value.trim();
  if (!label) return toast("Enter a group name", "bad");
  let id = F.slugify(label).slice(0, 30) || "group";
  while (S.draft.groups.some((g) => g.id === id)) id += "-2";
  commit("add group", (dr) => dr.groups.push({ id, label }));
};
ACT.delGrp = async (b) => {
  const g = S.draft.groups[b.dataset.i];
  const used = cats().filter((c) => c.group === g.id);
  const other = S.draft.groups.find((x) => x.id !== g.id);
  if (used.length && !(await confirmBox(`Delete group “${g.label}”?`, `${used.length} categories will move to “${other.label}”.`, "Delete group"))) return;
  commit("delete group", (dr) => { dr.categories.forEach((c) => c.group === g.id && (c.group = other.id)); dr.groups = dr.groups.filter((x) => x.id !== g.id); });
};

/* =========================================================================
   clock & timezone
   ========================================================================= */
let ZONES = null;
function zones() {
  if (ZONES) return ZONES;
  let z = [];
  try { z = Intl.supportedValuesOf("timeZone"); } catch { z = ["Europe/London", "Asia/Dubai", "Asia/Kolkata", "America/New_York"]; }
  if (!z.includes("UTC")) z.unshift("UTC");
  const now = new Date(), ALIAS = {"Asia/Calcutta":"Asia/Kolkata","Asia/Saigon":"Asia/Ho_Chi_Minh","Europe/Kiev":"Europe/Kyiv","Asia/Rangoon":"Asia/Yangon","Asia/Katmandu":"Asia/Kathmandu","America/Godthab":"America/Nuuk","Atlantic/Faeroe":"Atlantic/Faroe","Pacific/Truk":"Pacific/Chuuk","Pacific/Ponape":"Pacific/Pohnpei","Pacific/Enderbury":"Pacific/Kanton","America/Buenos_Aires":"America/Argentina/Buenos_Aires","Asia/Dacca":"Asia/Dhaka","Asia/Thimbu":"Asia/Thimphu","Asia/Ujung_Pandang":"Asia/Makassar","Africa/Asmera":"Africa/Asmara"};
  const valid = (t) => { try { new Intl.DateTimeFormat("en", { timeZone: t }); return true; } catch { return false; } };
  ZONES = [...new Map(z.map((old) => { const tz = ALIAS[old] && valid(ALIAS[old]) ? ALIAS[old] : old; return [tz, { tz, old, off: offsetOf(tz, now) }]; })).values()];
  return ZONES;
}
function offsetOf(tz, d) {
  try { const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(d).find((x) => x.type === "timeZoneName"); return (p?.value || "GMT").replace("GMT", "UTC") || "UTC"; } catch { return ""; }
}
function tickPreview() {
  const box = $("#clkPrev");
  if (!box) return;
  const s = S.draft.settings, tz = s.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone, d = new Date();
  box.textContent = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit", second: s.clockSeconds ? "2-digit" : undefined, hour12: !!s.clockHour12 }).format(d);
  $("#clkMeta").textContent = new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: "full" }).format(d) + " · " + tz.replace(/_/g, " ") + " · " + offsetOf(tz, d) + (s.defaultTimezone ? "" : " (visitor's device — preview uses yours)");
}
function renderClock(el) {
  const s = S.draft.settings;
  el.innerHTML = `<div class="cols">
    <div class="panel"><h3>Header clock</h3><p class="muted">A live clock with the date and time zone appears in the site header.</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${setField("clockEnabled", "Show the clock on the site", "check")}
        ${setField("clockSeconds", "Show seconds", "check")}
        ${setField("clockHour12", "Use 12-hour time by default (visitors can switch)", "check")}
        ${setField("clockAllowVisitorChange", "Let visitors pick their own time zone (remembered in their browser)", "check")}
      </div>
      <div class="panel" style="margin:16px 0 0;background:var(--bg2)"><div class="small muted">Preview of the default</div><div class="clockprev" id="clkPrev"></div><div class="small muted" id="clkMeta"></div></div>
    </div>
    <div class="panel"><h3>Default time zone</h3><p class="muted">Used for visitors who have not picked a zone themselves. Currently: <b id="tzCur">${esc(s.defaultTimezone || "Visitor's device time zone")}</b></p>
      <div class="row"><input id="tzQ" type="search" placeholder="Search, e.g. Dubai, Kolkata, London, UTC+05:30" style="flex:1"><button class="btn sm" data-act="tzDevice">Use visitor's device</button></div>
      <div class="tzsel" id="tzSel" role="listbox"></div></div></div>`;
  bindSettings(el);
  const draw = () => {
    const q = $("#tzQ").value.trim().toLowerCase(), cur = S.draft.settings.defaultTimezone;
    $("#tzSel").innerHTML = zones().filter((z) => !q || (z.tz + " " + z.tz.replace(/_/g, " ") + " " + z.old + " " + z.off).toLowerCase().includes(q)).slice(0, 450)
      .map((z) => `<button role="option" data-act="tzPick" data-tz="${esc(z.tz)}" aria-selected="${z.tz === cur}"><span>${esc(z.tz.replace(/_/g, " "))}</span><small>${esc(z.off)}</small></button>`).join("") || '<p class="muted small" style="padding:8px">No match</p>';
  };
  $("#tzQ").addEventListener("input", draw);
  draw();
  const sel = $('#tzSel [aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: "center" });
  tickPreview();
  S.clockTimer = setInterval(tickPreview, 1000);
}
ACT.tzPick = (b) => { commit("default time zone", (dr) => (dr.settings.defaultTimezone = b.dataset.tz), { rerender: false }); $$("#tzSel button").forEach((x) => x.setAttribute("aria-selected", String(x === b))); $("#tzCur").textContent = b.dataset.tz; tickPreview(); };
ACT.tzDevice = () => { commit("default time zone", (dr) => (dr.settings.defaultTimezone = ""), { rerender: false }); $$("#tzSel button").forEach((x) => x.setAttribute("aria-selected", "false")); $("#tzCur").textContent = "Visitor's device time zone"; tickPreview(); };

/* =========================================================================
   security
   ========================================================================= */
function renderSecurity(el) {
  el.innerHTML = `<div class="cols"><div class="panel"><h3>Change admin password</h3><p class="muted">At least 12 characters. Changing it signs out every other session. Once set here, it replaces the ADMIN_PASSWORD environment variable.</p>
    <form id="pwForm" style="display:flex;flex-direction:column;gap:10px">
      <label class="fld"><span>Current password</span><input type="password" id="pwCur" autocomplete="current-password" required></label>
      <label class="fld"><span>New password</span><input type="password" id="pwNew" autocomplete="new-password" minlength="12" required></label>
      <label class="fld"><span>Repeat new password</span><input type="password" id="pwRep" autocomplete="new-password" minlength="12" required></label>
      <p class="err" id="pwErr"></p><div><button class="btn primary">Change password</button></div></form></div>
    <div class="panel"><h3>Session</h3><p class="muted">Sessions last 12 hours and are tied to this browser (HttpOnly, SameSite=Strict cookie). Failed sign-ins are rate-limited.</p>
      <button class="btn" data-act="signout">Sign out</button></div></div>`;
  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#pwErr").textContent = "";
    if ($("#pwNew").value !== $("#pwRep").value) { $("#pwErr").textContent = "The new passwords do not match"; return; }
    try { await api("POST", "/api/auth/password", { current: $("#pwCur").value, next: $("#pwNew").value }); e.target.reset(); toast("Password changed"); }
    catch (err) { $("#pwErr").textContent = err.message; }
  });
}
ACT.signout = () => $("#logout").click();

boot();
