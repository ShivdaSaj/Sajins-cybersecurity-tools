/*
 * Catalog data model + Markdown / YAML / JSON conversion.
 * Shared by the Node server (seeding, exports) and the admin panel (import/export, ingestion).
 * No DOM or Node APIs are used here, so the module runs in both environments.
 */
import { load as yamlLoad, dump as yamlDump } from "./vendor/js-yaml.mjs";

export const FORMAT_VERSION = 1;

export const DEFAULT_GROUPS = [
  { id: "tools", label: "Tools" },
  { id: "learn", label: "Learning" },
  { id: "grc", label: "Compliance" },
];

export const ICONS = [
  ["core", "Star"], ["recon", "Target"], ["port", "Ports"], ["web", "Globe"], ["api", "Code"],
  ["cms", "Layout"], ["cloud", "Cloud"], ["box", "Container"], ["layers", "Layers"], ["key", "Key"],
  ["win", "Windows"], ["net", "Network"], ["wifi", "Wireless"], ["phone", "Mobile"], ["bin", "Chip"],
  ["bug", "Bug"], ["lock", "Lock"], ["eye", "Eye"], ["hook", "Pointer"], ["term", "Terminal"],
  ["radar", "Radar"], ["search", "Magnifier"], ["tunnel", "Tunnel"], ["tool", "Wrench"], ["chip", "Antenna"],
  ["book", "Book"], ["cert", "Badge"], ["flag", "Flag"], ["cap", "Graduation"], ["scale", "Scales"],
];
const ICON_SET = new Set(ICONS.map((i) => i[0]));

const ICON_GUESS = [
  ["core", "core"], ["recon", "recon"], ["port", "port"], ["web-app", "web"], ["api", "api"], ["cms", "cms"],
  ["cloud", "cloud"], ["container", "box"], ["kubernetes", "box"], ["iac", "layers"], ["secret", "key"],
  ["active-directory", "win"], ["windows", "win"], ["network", "net"], ["wireless", "wifi"], ["bluetooth", "wifi"],
  ["mobile", "phone"], ["reverse", "bin"], ["binary", "bin"], ["fuzz", "bug"], ["credential", "lock"],
  ["password", "lock"], ["osint", "eye"], ["threat", "eye"], ["phish", "hook"], ["c2", "term"],
  ["post-exploit", "term"], ["vuln", "radar"], ["dfir", "search"], ["forensic", "search"], ["tunnel", "tunnel"],
  ["pivot", "tunnel"], ["helper", "tool"], ["util", "tool"], ["hardware", "chip"], ["rf", "chip"],
  ["book", "book"], ["cert", "cert"], ["hands-on", "flag"], ["ctf", "flag"], ["lab", "flag"],
  ["course", "cap"], ["training", "cap"], ["compliance", "scale"], ["grc", "scale"], ["privacy", "scale"],
];

export const DEFAULT_SETTINGS = {
  siteTitle: "Sajins Cybersecurity Tools",
  brandName: "Sajins Cyber Tools",
  brandTagline: "curated · searchable",
  eyebrow: "Curated security catalog",
  heroTitle: "The {cybersecurity toolkit}, curated and instantly searchable",
  heroText:
    "Recon, web & API, cloud, containers, AD, DFIR, hardware and more — plus books, certifications, labs and compliance resources.",
  metaDescription:
    "Searchable, curated catalog of cybersecurity tools, books, certifications, training platforms and compliance resources.",
  searchPlaceholder: "Search tools, e.g. subdomain, kubernetes, hashcat, ADCS…",
  legalEnabled: true,
  legalText:
    "Use these tools only on systems you own or are explicitly authorized to test. Many are dual-use. Intended for education and authorized professional work.",
  footerText: "Curated list originally published at",
  sourceLabel: "ShivdaSaj/Sajins-cybersecurity-tools",
  sourceUrl: "https://github.com/ShivdaSaj/Sajins-cybersecurity-tools",
  accent: "#00f0ff",
  accent2: "#7c4dff",
  defaultTheme: "auto",
  showStats: true,
  showFavicons: true,
  animatedBackground: true,
  clockEnabled: true,
  defaultTimezone: "",
  clockHour12: false,
  clockSeconds: true,
  clockAllowVisitorChange: true,
};

const SETTING_TYPES = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, typeof v]));

/* ---------------- helpers ---------------- */

export function uid(prefix = "") {
  const a = new Uint8Array(8);
  globalThis.crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

export function slugify(t) {
  return String(t || "").trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
}

export function guessIcon(slugOrTitle) {
  const s = slugify(slugOrTitle);
  for (const [k, v] of ICON_GUESS) if (s.includes(k)) return v;
  return "tool";
}

export function guessGroup(slugOrTitle) {
  const s = slugify(slugOrTitle);
  if (/^(books|certifications|hands-on|courses|training)/.test(s)) return "learn";
  if (/^(compliance|grc|privacy|governance)/.test(s)) return "grc";
  return "tools";
}

export function safeUrl(u) {
  if (typeof u !== "string") return "";
  const s = u.trim();
  if (!/^https?:\/\//i.test(s)) return "";
  try {
    const x = new URL(s);
    return (x.protocol === "http:" || x.protocol === "https:") && x.hostname && !/[\s<>"]/.test(s) ? s.slice(0, 2000) : "";
  } catch {
    return "";
  }
}

export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function str(v, max = 2000) {
  if (v == null) return "";
  return String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

function clean(s) {
  return str(s).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export function normLicense(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "";
  if (/^(f\/c|c\/f|free\s*[+/&,]\s*(paid|commercial)|freemium|both|mixed)$/.test(s)) return "F/C";
  if (/^(f|free|oss|open[\s-]?source|foss|gratis)$/.test(s)) return "F";
  if (/^(c|paid|commercial|proprietary)$/.test(s)) return "C";
  return "";
}

const OS_CANON = { linux: "Linux", macos: "macOS", mac: "macOS", osx: "macOS", windows: "Windows", win: "Windows" };
export function normOS(v) {
  const arr = Array.isArray(v) ? v : String(v || "").split(/[\s,/]+/);
  const out = [];
  for (const o of arr) {
    const c = OS_CANON[String(o).trim().toLowerCase()];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/* ---------------- normalisation (accepts internal and portable keys) ---------------- */

export function normalizeItem(raw = {}) {
  const links = (Array.isArray(raw.links) ? raw.links : raw.links ? [raw.links] : []).map(safeUrl).filter(Boolean);
  let url = safeUrl(raw.url || raw.link || raw.href || "");
  if (!url && links.length) url = links.shift();
  return {
    id: typeof raw.id === "string" && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : uid("i"),
    name: clean(raw.name || raw.title || hostOf(url) || "Untitled").slice(0, 200),
    url,
    links: links.filter((l) => l !== url).slice(0, 10),
    desc: clean(raw.desc ?? raw.description ?? raw.summary ?? "").slice(0, 1500),
    lic: normLicense(raw.lic ?? raw.license ?? raw.licence ?? ""),
    os: normOS(raw.os ?? raw.platforms ?? raw.platform ?? []),
    sub: clean(raw.sub ?? raw.section ?? raw.subcategory ?? "").slice(0, 120),
  };
}

export function normalizeCategory(raw = {}, groups = DEFAULT_GROUPS) {
  const title = clean(raw.title || raw.name || "Untitled category").slice(0, 160);
  const gids = groups.map((g) => g.id);
  let group = String(raw.group || "").trim();
  if (!gids.includes(group)) group = gids.includes(guessGroup(title)) ? guessGroup(title) : gids[0];
  const icon = ICON_SET.has(raw.icon) ? raw.icon : guessIcon(title);
  const items = (Array.isArray(raw.items) ? raw.items : Array.isArray(raw.tools) ? raw.tools : []).map(normalizeItem);
  return {
    id: typeof raw.id === "string" && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : uid("c"),
    title,
    slug: slugify(title),
    group,
    icon,
    desc: clean(raw.desc ?? raw.description ?? "").slice(0, 600),
    source: safeUrl(raw.source || ""),
    items,
  };
}

export function normalizeGroups(raw) {
  const out = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    const id = slugify(g && (g.id || g.label)).slice(0, 30);
    if (id && !out.some((x) => x.id === id)) out.push({ id, label: clean(g.label || g.id).slice(0, 40) || id });
  }
  return out.length ? out : DEFAULT_GROUPS.map((g) => ({ ...g }));
}

export function normalizeSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS };
  for (const [k, t] of Object.entries(SETTING_TYPES)) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (t === "boolean") s[k] = v === true || v === "true";
    else if (t === "string") s[k] = str(v, 2000);
  }
  for (const k of ["accent", "accent2"]) if (!/^#[0-9a-f]{6}$/i.test(s[k])) s[k] = DEFAULT_SETTINGS[k];
  if (!["auto", "dark", "light"].includes(s.defaultTheme)) s.defaultTheme = "auto";
  s.sourceUrl = safeUrl(s.sourceUrl);
  if (s.defaultTimezone && !isValidTimeZone(s.defaultTimezone)) s.defaultTimezone = "";
  return s;
}

export function isValidTimeZone(tz) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

export function normalizeCatalog(raw = {}) {
  const groups = normalizeGroups(raw.groups);
  const cats = (Array.isArray(raw.categories) ? raw.categories : []).map((c) => normalizeCategory(c, groups));
  // keep ids unique
  const seenC = new Set(), seenI = new Set();
  for (const c of cats) {
    if (seenC.has(c.id)) c.id = uid("c");
    seenC.add(c.id);
    for (const it of c.items) { if (seenI.has(it.id)) it.id = uid("i"); seenI.add(it.id); }
  }
  return {
    version: FORMAT_VERSION,
    rev: Number.isInteger(raw.rev) ? raw.rev : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    settings: normalizeSettings(raw.settings || {}),
    groups,
    categories: cats,
  };
}

/* ---------------- Markdown ---------------- */

const URL_RE = /https?:\/\/[^\s)<>·|]+/g;
const trimUrl = (u) => u.replace(/[.,;:!?'"\]]+$/, "");

function nameFromUrl(u) {
  try {
    const x = new URL(u);
    if (x.hostname === "github.com") {
      const p = x.pathname.split("/").filter(Boolean);
      if (p[1]) return p[1];
    }
    const h = x.hostname.replace(/^www\./, "").split(".");
    const n = h.length > 2 && !/^(co|com|org|net|ac|gov)$/.test(h[h.length - 2]) ? h[h.length - 2] : h[0];
    return n.charAt(0).toUpperCase() + n.slice(1);
  } catch { return u; }
}

/**
 * Parse curated-list Markdown (README style) into categories.
 * Supports: "## Category" / "### Section" headings, optional
 * "<!-- group: x | icon: y | source: url -->" meta comments, and items written as
 *   - [Name](url) [F] [Linux macOS] — description
 *   - **Name** — description url
 *   - https://example.com — description
 * Items before any heading land in a category named by `defaultCategory`.
 */
export function parseMarkdown(md, { sourceBase = "", defaultCategory = "Imported", skip = ["navigation", "conventions", "table-of-contents", "contents", "contributing", "license"] } = {}) {
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  const cats = [];
  let cur = null, sub = "", last = null, inFence = false;
  const ensureCat = () => {
    if (!cur) { cur = { title: defaultCategory, items: [] }; cats.push(cur); }
    return cur;
  };
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    let m;
    if (/^\s*```/.test(L)) { inFence = !inFence; last = null; continue; }
    if (inFence) continue;
    if ((m = /^##\s+(.+?)\s*#*\s*$/.exec(L)) && !/^###/.test(L)) {
      const full = m[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
      const slug = slugify(full);
      last = null; sub = "";
      if (skip.includes(slug)) { cur = { skip: true, items: [] }; continue; }
      cur = { title: full.replace(/\s*\(.*\)\s*$/, "") || full, items: [], source: sourceBase ? sourceBase + "#" + slug : "" };
      cats.push(cur);
      continue;
    }
    if (/^#\s+/.test(L)) { last = null; continue; }
    if ((m = /^\s*<!--\s*(.*?)\s*-->\s*$/.exec(L))) {
      if (cur && !cur.skip) {
        for (const part of m[1].split(/\s+\|\s+/)) {
          const kv = /^(group|icon|source|description)\s*:\s*(.+)$/i.exec(part.trim());
          if (kv) cur[kv[1].toLowerCase() === "description" ? "desc" : kv[1].toLowerCase()] = kv[2].trim();
        }
      }
      continue;
    }
    if (cur && cur.skip) continue;
    if ((m = /^###+\s+(.+?)\s*#*\s*$/.exec(L))) { sub = m[1].replace(/\s*\(.*\)\s*$/, ""); last = null; continue; }
    if (/^\s*$/.test(L) || /^---/.test(L) || /^>/.test(L) || /^\[Back to/i.test(L) || /^\s*\|/.test(L)) { last = null; continue; }

    let it = null;
    if ((m = /^\s*[-*+]\s+\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*(.*)$/.exec(L))) {
      const rest = m[3];
      const dash = rest.search(/(^|\s)[—–-]\s/);
      const pre = dash < 0 ? rest : rest.slice(0, dash);
      const desc = dash < 0 ? (/^\s*\[/.test(rest) ? "" : rest.replace(/^[:\s]+/, "")) : rest.slice(dash).replace(/^\s*[—–-]\s/, "");
      let lic = "", os = [];
      const re = /\[([^\]]+)\]/g;
      let tm;
      while ((tm = re.exec(pre))) {
        const t = tm[1];
        if (/^(F|C|F\/C|C\/F)$/.test(t)) lic = t === "C/F" ? "F/C" : t;
        else os = os.concat(normOS(t));
      }
      it = { name: m[1], url: m[2], desc, lic, os };
    } else if ((m = /^\s*[-*+]\s+\*\*(.+?)\*\*\s*[:—–-]?\s*(.*)$/.exec(L))) {
      it = { name: m[1].replace(/[:\s]+$/, ""), url: "", desc: m[2] };
    } else if ((m = /^(?:\s?[-*+]\s+)?<?(https?:\/\/[^\s>]+)>?\s*(?:[—–:-]\s*(.*))?$/.exec(L))) {
      const u = trimUrl(m[1]);
      it = { name: nameFromUrl(u), url: u, desc: m[2] || "" };
    } else if (last && /^\s{2,}\S/.test(L) && !/^\s*([-*+]|\d+\.)\s/.test(L)) {
      (L.match(URL_RE) || []).forEach((u) => last.links.push(trimUrl(u)));
      const extra = L.replace(URL_RE, "").replace(/[·\s]+/g, " ").trim();
      if (extra) last.desc += " " + extra;
      continue;
    } else { last = null; continue; }

    const found = (it.desc.match(URL_RE) || []).map(trimUrl);
    it.desc = it.desc.replace(URL_RE, "").replace(/\s*·\s*/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    it.links = found;
    it.sub = sub;
    ensureCat().items.push(it);
    last = it;
  }
  return cats
    .filter((c) => !c.skip && c.items.length)
    .map((c) => {
      c.items = c.items.map((it) => {
        it.desc = clean(it.desc).replace(/^[—–-]\s*/, "").replace(/\s+([.,;])/g, "$1");
        return it;
      });
      return c;
    });
}

function mdEsc(s) { return String(s).replace(/([\[\]])/g, "\\$1"); }

function itemToMd(it) {
  const tags = [];
  if (it.lic) tags.push("[" + it.lic + "]");
  if (it.os && it.os.length) tags.push("[" + it.os.join(" ") + "]");
  const head = it.url ? `[${mdEsc(it.name)}](${it.url})` : `**${it.name.replace(/\*/g, "")}**`;
  let line = `- ${head}${tags.length ? " " + tags.join(" ") : ""}`;
  if (it.desc) line += ` — ${it.desc}`;
  if (it.links && it.links.length) line += (it.desc ? " " : " — ") + it.links.join(" · ");
  return line;
}

export function categoryToMarkdown(c, { meta = true } = {}) {
  const out = [`## ${c.title}`];
  if (meta) {
    const parts = [`group: ${c.group}`, `icon: ${c.icon}`];
    if (c.source) parts.push(`source: ${c.source}`);
    if (c.desc) parts.push(`description: ${c.desc.replace(/-->/g, "")}`);
    out.push(`<!-- ${parts.join(" | ")} -->`);
  }
  if (c.desc) out.push("", c.desc);
  out.push("");
  let sub = "";
  for (const it of c.items) {
    if ((it.sub || "") !== sub) {
      sub = it.sub || "";
      if (sub) out.push("", `### ${sub}`);
    }
    out.push(itemToMd(it));
  }
  return out.join("\n");
}

export function toMarkdown(catalog, { categories, title, meta = true } = {}) {
  const cats = categories || catalog.categories;
  const s = catalog.settings || DEFAULT_SETTINGS;
  const head = [
    `# ${title || s.siteTitle || "Curated list"}`,
    "",
    "Conventions: [F] = Free/Open Source, [C] = Commercial, [F/C] = free with paid tier · OS tags: [Linux macOS Windows]",
    "",
  ];
  return head.concat(cats.map((c) => categoryToMarkdown(c, { meta }) + "\n")).join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/* ---------------- YAML / JSON (portable form) ---------------- */

const LIC_OUT = { F: "free", C: "commercial", "F/C": "free+commercial" };

export function itemToPortable(it) {
  const o = { name: it.name };
  if (it.url) o.url = it.url;
  if (it.desc) o.description = it.desc;
  if (it.lic) o.license = LIC_OUT[it.lic];
  if (it.os && it.os.length) o.platforms = it.os.slice();
  if (it.sub) o.section = it.sub;
  if (it.links && it.links.length) o.links = it.links.slice();
  return o;
}

export function categoryToPortable(c) {
  const o = { title: c.title, group: c.group, icon: c.icon };
  if (c.desc) o.description = c.desc;
  if (c.source) o.source = c.source;
  o.items = c.items.map(itemToPortable);
  return o;
}

export function toPortable(catalog, { categories, items, includeSettings = false } = {}) {
  if (items) return { kind: "items", version: FORMAT_VERSION, items: items.map(itemToPortable) };
  const o = { kind: "catalog", version: FORMAT_VERSION, exportedAt: new Date().toISOString() };
  if (includeSettings) { o.settings = { ...catalog.settings }; }
  o.groups = catalog.groups.map((g) => ({ id: g.id, label: g.label }));
  o.categories = (categories || catalog.categories).map(categoryToPortable);
  return o;
}

export function toYAML(obj) {
  return yamlDump(obj, { lineWidth: 120, noRefs: true, quotingType: '"', sortKeys: false });
}

/**
 * Parse an import payload in any supported format.
 * Returns { categories: [...rawCategories], items: [...rawItems], groups?, settings?, format }.
 * `items` holds entries that are not inside a category (snippets, item lists).
 */
export function parseAny(text, hint = "") {
  const t = String(text || "").replace(/^﻿/, "");
  const h = hint.toLowerCase();
  let format = /\.(ya?ml)$/.test(h) || h === "yaml" ? "yaml" : /\.json$/.test(h) || h === "json" ? "json" : /\.(md|markdown|txt)$/.test(h) || h === "markdown" ? "markdown" : "";
  if (!format) {
    const s = t.trimStart();
    if (/^[\[{]/.test(s)) format = "json";
    else if (/^(---\s*\n)?(kind|version|categories|items|title|settings|groups|-\s+(name|title)):/m.test(s.slice(0, 400)) && !/^\s*-\s+\[/m.test(s)) format = "yaml";
    else format = "markdown";
  }
  if (format === "markdown") {
    const cats = parseMarkdown(t, { defaultCategory: "__loose__" });
    const loose = cats.filter((c) => c.title === "__loose__").flatMap((c) => c.items);
    return { format, categories: cats.filter((c) => c.title !== "__loose__"), items: loose };
  }
  let data;
  try {
    data = format === "json" ? JSON.parse(t) : yamlLoad(t, { json: true });
  } catch (e) {
    throw new Error(`Invalid ${format.toUpperCase()}: ${e.message.split("\n")[0]}`);
  }
  return fromStructured(data, format);
}

function fromStructured(data, format) {
  const res = { format, categories: [], items: [] };
  if (data && data.catalog && typeof data.catalog === "object") data = data.catalog;
  if (Array.isArray(data)) {
    if (data.some((x) => x && (Array.isArray(x.items) || Array.isArray(x.tools)))) res.categories = data;
    else res.items = data.filter((x) => x && typeof x === "object");
    return res;
  }
  if (!data || typeof data !== "object") throw new Error("Nothing recognisable in this file.");
  if (Array.isArray(data.categories)) res.categories = data.categories;
  else if (Array.isArray(data.items) && (data.title || data.name) && data.kind !== "items") res.categories = [data];
  else if (Array.isArray(data.items)) res.items = data.items;
  else if (data.name && (data.url || data.description)) res.items = [data];
  if (data.groups) res.groups = data.groups;
  if (data.settings && typeof data.settings === "object") res.settings = data.settings;
  if (!res.categories.length && !res.items.length && !res.settings) throw new Error("No categories or items found.");
  return res;
}

/* ---------------- merging ---------------- */

const keyUrl = (u) => (u || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/#?]+$/, "");

/**
 * Merge parsed import data into a catalog (mutates a deep copy and returns it).
 * mode: "merge" (add new + update matches) | "add" (add new, skip matches) | "replace"
 * target: category id to put everything into, or "" to keep the file's categories.
 * position: "end" | "start"
 */
export function mergeInto(catalog, parsed, { mode = "merge", target = "", position = "end", looseTitle = "Imported" } = {}) {
  const cat = structuredClone(catalog);
  const stats = { addedCategories: 0, addedItems: 0, updatedItems: 0, skippedItems: 0, removedItems: 0 };
  if (parsed.groups) {
    for (const g of normalizeGroups(parsed.groups)) if (!cat.groups.some((x) => x.id === g.id)) cat.groups.push(g);
  }
  let incoming = (parsed.categories || []).map((c) => normalizeCategory(c, cat.groups));
  if (parsed.items && parsed.items.length) {
    incoming.push(normalizeCategory({ title: looseTitle, items: parsed.items }, cat.groups));
  }
  if (target) {
    const tc = cat.categories.find((c) => c.id === target);
    if (!tc) throw new Error("Target category not found.");
    const items = incoming.flatMap((c) => c.items);
    if (mode === "replace") { stats.removedItems = tc.items.length; tc.items = []; }
    mergeItems(tc, items, mode, position, stats);
    return { catalog: cat, stats };
  }
  if (mode === "replace") {
    stats.removedItems = cat.categories.reduce((a, c) => a + c.items.length, 0);
    cat.categories = incoming;
    stats.addedCategories = incoming.length;
    stats.addedItems = incoming.reduce((a, c) => a + c.items.length, 0);
    return { catalog: cat, stats };
  }
  for (const ic of incoming) {
    let ec = cat.categories.find((c) => c.slug === ic.slug || c.title.toLowerCase() === ic.title.toLowerCase());
    if (!ec) {
      ec = { ...ic, items: [] };
      if (position === "start") cat.categories.unshift(ec); else cat.categories.push(ec);
      stats.addedCategories++;
    } else if (mode === "merge") {
      if (ic.desc) ec.desc = ic.desc;
      if (ic.source) ec.source = ic.source;
    }
    mergeItems(ec, ic.items, mode, position, stats);
  }
  return { catalog: cat, stats };
}

function mergeItems(cat, items, mode, position, stats) {
  const add = [];
  for (const it of items) {
    const ex = cat.items.find((x) => (it.url && keyUrl(x.url) === keyUrl(it.url)) || x.name.toLowerCase() === it.name.toLowerCase());
    if (ex) {
      if (mode === "merge") {
        for (const k of ["url", "desc", "lic", "sub"]) if (it[k]) ex[k] = it[k];
        if (it.os.length) ex.os = it.os;
        if (it.links.length) ex.links = Array.from(new Set(ex.links.concat(it.links))).filter((l) => l !== ex.url);
        stats.updatedItems++;
      } else stats.skippedItems++;
      continue;
    }
    if (add.some((x) => (it.url && keyUrl(x.url) === keyUrl(it.url)) || x.name.toLowerCase() === it.name.toLowerCase())) { stats.skippedItems++; continue; }
    add.push({ ...it, id: uid("i") });
  }
  cat.items = position === "start" ? add.concat(cat.items) : cat.items.concat(add);
  stats.addedItems += add.length;
}

/* ---------------- seed from README ---------------- */

export function catalogFromReadme(md, sourceRepo = "") {
  const sourceBase = sourceRepo ? sourceRepo.replace(/\/$/, "") + "/blob/main/README.md" : "";
  const cats = parseMarkdown(md, { sourceBase });
  return normalizeCatalog({ categories: cats.map((c) => ({ ...c, group: c.group || guessGroup(c.title) })) });
}
