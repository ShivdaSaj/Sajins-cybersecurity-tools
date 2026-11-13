/*
 * Sajins Cybersecurity Tools — web server + admin API.
 * Zero dependencies (Node >= 20). Data lives in DATA_DIR (mount a volume there).
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns";
import zlib from "node:zlib";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeCatalog, catalogFromReadme, toMarkdown, toYAML, toPortable, DEFAULT_SETTINGS,
} from "../site/assets/catalog-format.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, "../site");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.resolve(__dirname, "../../data"));
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const PORT = Number(process.env.PORT || 8080);
const SEED_URL = process.env.SEED_README_URL || "https://raw.githubusercontent.com/ShivdaSaj/Sajins-cybersecurity-tools/main/README.md";
const SEED_REPO = process.env.SEED_REPO_URL || "https://github.com/ShivdaSaj/Sajins-cybersecurity-tools";
const SEED_LOCAL = process.env.SEED_README_FILE || path.resolve(__dirname, "../../README.md");
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const MAX_AUTO_BACKUPS = Number(process.env.MAX_AUTO_BACKUPS || 40);
const COOKIE = "cst_admin";

const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------------- storage ---------------- */

let catalog = null;
let writeChain = Promise.resolve();
let secret = null;
let auth = null; // { salt, hash, version } when password set from the panel

async function readJSON(file, fallback = null) {
  try { return JSON.parse(await fsp.readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJSONAtomic(file, data) {
  const tmp = file + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fsp.rename(tmp, file);
}
function queue(fn) {
  const p = writeChain.then(fn, fn);
  writeChain = p.catch(() => {});
  return p;
}

async function init() {
  // Drop root privileges when asked (the container entrypoint chowns DATA_DIR first).
  const dropUid = Number(process.env.RUN_AS_UID || 0);
  if (dropUid && process.getuid && process.getuid() === 0) {
    process.setgid(Number(process.env.RUN_AS_GID || dropUid));
    process.setuid(dropUid);
    log(`dropped privileges to uid ${dropUid}`);
  }
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const sf = path.join(DATA_DIR, "secret.key");
  try { secret = await fsp.readFile(sf); } catch {
    secret = crypto.randomBytes(32);
    await fsp.writeFile(sf, secret, { mode: 0o600 });
  }
  auth = await readJSON(path.join(DATA_DIR, "auth.json"));
  const raw = await readJSON(path.join(DATA_DIR, "catalog.json"));
  if (raw) {
    catalog = normalizeCatalog(raw);
    log(`catalog loaded: rev ${catalog.rev}, ${countItems(catalog)} items`);
  } else {
    let md = "";
    try {
      const r = await fetch(SEED_URL, { signal: AbortSignal.timeout(20000) });
      if (r.ok) md = await r.text();
    } catch (e) { log("seed fetch failed:", e.message); }
    if (!md) { try { md = await fsp.readFile(SEED_LOCAL, "utf8"); } catch {} }
    catalog = catalogFromReadme(md, SEED_REPO);
    catalog.rev = 1;
    catalog.updatedAt = new Date().toISOString();
    await writeJSONAtomic(path.join(DATA_DIR, "catalog.json"), catalog);
    log(`catalog seeded from README: ${countItems(catalog)} items`);
  }
  rebuildPublic();
}

const countItems = (c) => c.categories.reduce((a, x) => a + x.items.length, 0);

async function saveCatalog(next, { backupLabel = "Auto: before save", auto = true } = {}) {
  return queue(async () => {
    await createBackup(backupLabel, auto, catalog);
    next.rev = catalog.rev + 1;
    next.updatedAt = new Date().toISOString();
    await writeJSONAtomic(path.join(DATA_DIR, "catalog.json"), next);
    catalog = next;
    rebuildPublic();
    return catalog;
  });
}

/* ---------------- backups ---------------- */

const BACKUP_ID = /^[0-9]{13}-(auto|manual)-[a-f0-9]{6}$/;

async function createBackup(label, auto, data = catalog) {
  const id = `${Date.now()}-${auto ? "auto" : "manual"}-${crypto.randomBytes(3).toString("hex")}`;
  const meta = {
    id, label: String(label || "").slice(0, 120), auto: !!auto, createdAt: new Date().toISOString(),
    rev: data.rev, categories: data.categories.length, items: countItems(data),
  };
  await writeJSONAtomic(path.join(BACKUP_DIR, id + ".json"), { meta, catalog: data });
  if (auto) await pruneAuto();
  return meta;
}

async function listBackups() {
  const files = (await fsp.readdir(BACKUP_DIR)).filter((f) => BACKUP_ID.test(f.replace(/\.json$/, "")));
  const out = [];
  for (const f of files) {
    const st = await fsp.stat(path.join(BACKUP_DIR, f)).catch(() => null);
    const b = st && (await readJSON(path.join(BACKUP_DIR, f)));
    if (b && b.meta) out.push({ ...b.meta, size: st.size });
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

async function pruneAuto() {
  const autos = (await fsp.readdir(BACKUP_DIR)).filter((f) => /-auto-/.test(f)).sort();
  for (const f of autos.slice(0, Math.max(0, autos.length - MAX_AUTO_BACKUPS))) await fsp.unlink(path.join(BACKUP_DIR, f)).catch(() => {});
}

/* ---------------- auth ---------------- */

const b64u = (b) => Buffer.from(b).toString("base64url");
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  return body + "." + crypto.createHmac("sha256", secret).update(body).digest("base64url");
}
function verify(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const exp = crypto.createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp < Date.now() || p.v !== authVersion()) return null;
    return p;
  } catch { return null; }
}
const authVersion = () => (auth ? auth.version : "env");
const authConfigured = () => !!(auth || process.env.ADMIN_PASSWORD);

function checkPassword(pw) {
  if (typeof pw !== "string" || !pw) return false;
  if (auth) {
    const h = crypto.scryptSync(pw, Buffer.from(auth.salt, "hex"), 64);
    return crypto.timingSafeEqual(h, Buffer.from(auth.hash, "hex"));
  }
  const env = process.env.ADMIN_PASSWORD;
  if (!env) return false;
  const a = crypto.createHash("sha256").update(pw).digest();
  const b = crypto.createHash("sha256").update(env).digest();
  return crypto.timingSafeEqual(a, b);
}

async function setPassword(pw) {
  const salt = crypto.randomBytes(16);
  auth = { salt: salt.toString("hex"), hash: crypto.scryptSync(pw, salt, 64).toString("hex"), version: crypto.randomBytes(6).toString("hex"), changedAt: new Date().toISOString() };
  await writeJSONAtomic(path.join(DATA_DIR, "auth.json"), auth);
}

const attempts = new Map();
function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return xf.length ? xf[xf.length - 1] : req.socket.remoteAddress || "?";
}
function rateLimited(ip) {
  const a = attempts.get(ip);
  return a && a.reset > Date.now() && a.count >= 8;
}
function noteFailure(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) attempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
  else a.count++;
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const isHttps = (req) => req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
function sessionCookie(req, value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`;
}
function isAdmin(req) { return !!verify(parseCookies(req)[COOKIE]); }

/* ---------------- SSRF-guarded fetch for ingestion ---------------- */

function ipv4ToInt(ip) { return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0; }
const V4_BLOCK = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].map(([b, m]) => [ipv4ToInt(b), m]);
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCK.some(([b, m]) => (n >>> (32 - m)) === (b >>> (32 - m)));
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) || /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateIp(mapped[1]);
    if (s === "::" || s === "::1") return true;
    return /^(f[cd]|fe[89ab]|ff|::ffff:|2001:db8|64:ff9b)/.test(s);
  }
  return true;
}
function guardedLookup(hostname, opts, cb) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return cb(new Error("Blocked: host resolves to a private or reserved address"));
    if (opts && opts.all) cb(null, addrs);
    else cb(null, addrs[0].address, addrs[0].family);
  });
}

const FETCH_LIMIT = 4 * 1024 * 1024;
function fetchOnce(u) {
  return new Promise((resolve, reject) => {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return reject(new Error("Only http and https URLs are allowed"));
    if (url.username || url.password) return reject(new Error("URLs with credentials are not allowed"));
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    if (![80, 443, 8080, 8443].includes(port)) return reject(new Error("Port not allowed"));
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isPrivateIp(host)) return reject(new Error("Blocked: private or reserved address"));
    if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) return reject(new Error("Blocked host"));
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "GET", lookup: guardedLookup, timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CatalogIngest/1.0)",
        Accept: "text/html,application/xhtml+xml,text/markdown,text/plain,application/json,application/yaml,text/yaml;q=0.9,*/*;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, url).href });
      }
      const ct = String(res.headers["content-type"] || "");
      if (ct && !/(text\/|json|xml|yaml|markdown)/i.test(ct)) { res.destroy(); return reject(new Error(`Unsupported content type: ${ct}`)); }
      let stream = res;
      const enc = String(res.headers["content-encoding"] || "").toLowerCase();
      if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
      const chunks = [];
      let size = 0;
      stream.on("data", (c) => {
        size += c.length;
        if (size > FETCH_LIMIT) { res.destroy(); stream.destroy(); reject(new Error("Response too large (4 MB limit)")); }
        else chunks.push(c);
      });
      stream.on("end", () => resolve({ status: res.statusCode, contentType: ct, text: Buffer.concat(chunks).toString("utf8") }));
      stream.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Timed out after 15s")));
    req.on("error", reject);
    req.end();
  });
}
async function guardedFetch(u) {
  let cur = u;
  for (let i = 0; i < 6; i++) {
    const r = await fetchOnce(cur);
    if (r.redirect) { cur = r.redirect; continue; }
    return { ...r, url: cur };
  }
  throw new Error("Too many redirects");
}

/* ---------------- static files ---------------- */

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".ico": "image/x-icon", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};
const staticCache = new Map();
function loadStatic(rel) {
  if (staticCache.has(rel)) return staticCache.get(rel);
  const abs = path.resolve(SITE_DIR, "." + rel);
  if (!abs.startsWith(SITE_DIR + path.sep)) return null;
  let buf;
  try { if (!fs.statSync(abs).isFile()) return null; buf = fs.readFileSync(abs); } catch { return null; }
  const type = MIME[path.extname(abs)] || "application/octet-stream";
  const entry = { buf, type, etag: '"' + crypto.createHash("sha1").update(buf).digest("base64url").slice(0, 16) + '"' };
  if (/text|javascript|svg|json/.test(type)) { entry.gz = zlib.gzipSync(buf, { level: 9 }); entry.br = zlib.brotliCompressSync(buf); }
  if (process.env.NODE_ENV === "production") staticCache.set(rel, entry);
  return entry;
}

/* ---------------- public catalog render ---------------- */

let pub = null; // { json, etag, gz, br, html: {buf,gz,br,etag} }
function escHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
function rebuildPublic() {
  const data = { rev: catalog.rev, updatedAt: catalog.updatedAt, settings: catalog.settings, groups: catalog.groups, categories: catalog.categories };
  const json = JSON.stringify(data);
  const etag = `"r${catalog.rev}-${crypto.createHash("sha1").update(json).digest("base64url").slice(0, 10)}"`;
  pub = { json: Buffer.from(json), etag, gz: zlib.gzipSync(json, { level: 9 }), br: zlib.brotliCompressSync(json), htmlFor: null };
}
function renderIndex() {
  const tpl = loadStatic("/index.html");
  if (!tpl) return null;
  if (pub.htmlFor === tpl.etag && pub.html) return pub.html;
  const s = catalog.settings;
  const boot = pub.json.toString().replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const html = tpl.buf.toString()
    .replace("<!--BOOT-->", boot)
    .replace(/\{\{TITLE\}\}/g, escHtml(s.siteTitle || DEFAULT_SETTINGS.siteTitle))
    .replace(/\{\{DESC\}\}/g, escHtml(s.metaDescription || ""))
    .replace(/\{\{THEME\}\}/g, s.defaultTheme === "light" || s.defaultTheme === "dark" ? s.defaultTheme : "");
  const buf = Buffer.from(html);
  pub.html = { buf, gz: zlib.gzipSync(buf, { level: 9 }), br: zlib.brotliCompressSync(buf), etag: pub.etag.replace(/"$/, "-" + tpl.etag.slice(1, 7) + '"'), type: MIME[".html"] };
  pub.htmlFor = tpl.etag;
  return pub.html;
}

/* ---------------- http helpers ---------------- */

const CSP_PUBLIC = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://icons.duckduckgo.com https://github.com https://avatars.githubusercontent.com; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
function secHeaders(res, csp = CSP_PUBLIC) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
}
function sendEntry(req, res, e, cache = "no-cache", extra = {}) {
  res.setHeader("ETag", e.etag);
  res.setHeader("Cache-Control", cache);
  res.setHeader("Vary", "Accept-Encoding");
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  if (req.headers["if-none-match"] === e.etag) { res.statusCode = 304; return res.end(); }
  res.setHeader("Content-Type", e.type);
  const ae = String(req.headers["accept-encoding"] || "");
  let body = e.buf;
  if (e.br && /\bbr\b/.test(ae)) { body = e.br; res.setHeader("Content-Encoding", "br"); }
  else if (e.gz && /\bgzip\b/.test(ae)) { body = e.gz; res.setHeader("Content-Encoding", "gzip"); }
  res.setHeader("Content-Length", body.length);
  res.end(req.method === "HEAD" ? undefined : body);
}
function json(res, code, obj) {
  const b = Buffer.from(JSON.stringify(obj));
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", b.length);
  res.end(b);
}
function sendText(res, code, text, type, filename) {
  const b = Buffer.from(text);
  res.statusCode = code;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-cache");
  if (filename) res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", b.length);
  res.end(b);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("Payload too large"), { code: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(Object.assign(new Error("Invalid JSON"), { code: 400 })); }
    });
    req.on("error", reject);
  });
}

/* ---------------- routes ---------------- */

async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === "/api/catalog" && (m === "GET" || m === "HEAD")) {
    return sendEntry(req, res, { buf: pub.json, gz: pub.gz, br: pub.br, etag: pub.etag, type: MIME[".json"] }, "public, max-age=60, must-revalidate");
  }

  // auth endpoints
  if (p === "/api/auth/session" && m === "GET") return json(res, 200, { authenticated: isAdmin(req), configured: authConfigured() });
  const mutating = m !== "GET" && m !== "HEAD";
  if (mutating) {
    // CSRF defence: JSON-only + custom header (cannot be sent cross-site without CORS preflight) + SameSite=Strict cookie
    if (req.headers["x-requested-with"] !== "cst-admin" || !/^application\/json/.test(String(req.headers["content-type"] || ""))) {
      return json(res, 400, { error: "Bad request" });
    }
  }
  if (p === "/api/auth/login" && m === "POST") {
    const ip = clientIp(req);
    if (rateLimited(ip)) return json(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
    if (!authConfigured()) return json(res, 503, { error: "Admin password is not configured. Set ADMIN_PASSWORD on the container." });
    const body = await readBody(req, 4096);
    if (!checkPassword(body.password)) {
      noteFailure(ip);
      log("admin login failed from", ip);
      await new Promise((r) => setTimeout(r, 400));
      return json(res, 401, { error: "Incorrect password" });
    }
    attempts.delete(ip);
    log("admin login from", ip);
    res.setHeader("Set-Cookie", sessionCookie(req, sign({ exp: Date.now() + SESSION_HOURS * 3600e3, v: authVersion() }), SESSION_HOURS * 3600));
    return json(res, 200, { ok: true });
  }
  if (p === "/api/auth/logout" && m === "POST") {
    res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
    return json(res, 200, { ok: true });
  }

  if (!p.startsWith("/api/admin/") && p !== "/api/auth/password") return json(res, 404, { error: "Not found" });
  if (!isAdmin(req)) return json(res, 401, { error: "Not signed in" });

  if (p === "/api/auth/password" && m === "POST") {
    const body = await readBody(req, 4096);
    if (!checkPassword(body.current)) return json(res, 403, { error: "Current password is incorrect" });
    if (typeof body.next !== "string" || body.next.length < 12) return json(res, 400, { error: "New password must be at least 12 characters" });
    await setPassword(body.next);
    log("admin password changed");
    res.setHeader("Set-Cookie", sessionCookie(req, sign({ exp: Date.now() + SESSION_HOURS * 3600e3, v: authVersion() }), SESSION_HOURS * 3600));
    return json(res, 200, { ok: true });
  }

  if (p === "/api/admin/catalog" && m === "GET") return json(res, 200, catalog);

  if (p === "/api/admin/catalog" && m === "PUT") {
    const body = await readBody(req, 20 * 1024 * 1024);
    if (!body.catalog || typeof body.catalog !== "object") return json(res, 400, { error: "Missing catalog" });
    if (body.rev !== catalog.rev && !body.force) return json(res, 409, { error: "The catalog was changed elsewhere. Reload to get the latest version.", rev: catalog.rev });
    const next = normalizeCatalog(body.catalog);
    const saved = await saveCatalog(next, { backupLabel: "Auto: before " + String(body.note || "save").slice(0, 80) });
    log(`catalog saved rev ${saved.rev} (${String(body.note || "save").slice(0, 80)})`);
    return json(res, 200, saved);
  }

  if (p === "/api/admin/backups" && m === "GET") return json(res, 200, await listBackups());
  if (p === "/api/admin/backups" && m === "POST") {
    const body = await readBody(req, 4096);
    const meta = await queue(() => createBackup(body.label || "Manual backup", false));
    return json(res, 200, meta);
  }
  let mm;
  if ((mm = /^\/api\/admin\/backups\/([\w-]+)(\/restore)?$/.exec(p))) {
    const id = mm[1];
    if (!BACKUP_ID.test(id)) return json(res, 400, { error: "Bad backup id" });
    const file = path.join(BACKUP_DIR, id + ".json");
    if (m === "GET" && !mm[2]) {
      const b = await readJSON(file);
      if (!b) return json(res, 404, { error: "Not found" });
      return sendText(res, 200, JSON.stringify(b, null, 2), "application/json; charset=utf-8", `catalog-backup-${id}.json`);
    }
    if (m === "POST" && mm[2]) {
      const b = await readJSON(file);
      if (!b || !b.catalog) return json(res, 404, { error: "Not found" });
      const saved = await saveCatalog(normalizeCatalog(b.catalog), { backupLabel: `Auto: before restore of ${b.meta.label || id}` });
      log(`restored backup ${id} -> rev ${saved.rev}`);
      return json(res, 200, saved);
    }
    if (m === "DELETE" && !mm[2]) {
      await fsp.unlink(file).catch(() => {});
      return json(res, 200, { ok: true });
    }
  }

  if (p === "/api/admin/fetch" && m === "POST") {
    const body = await readBody(req, 4096);
    try {
      const r = await guardedFetch(String(body.url || ""));
      return json(res, 200, r);
    } catch (e) {
      return json(res, 422, { error: e.message });
    }
  }

  return json(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, "http://x"); } catch { res.statusCode = 400; return res.end(); }
  const p = url.pathname;
  try {
    if (p === "/healthz") { res.setHeader("Content-Type", "text/plain"); return res.end("ok\n"); }
    if (p.startsWith("/api/")) { secHeaders(res, "default-src 'none'; frame-ancestors 'none'"); return await handleApi(req, res, url); }
    if (req.method !== "GET" && req.method !== "HEAD") { res.statusCode = 405; return res.end(); }

    if (p === "/" || p === "/index.html") {
      secHeaders(res);
      const e = renderIndex();
      if (!e) { res.statusCode = 500; return res.end("index missing"); }
      return sendEntry(req, res, e, "no-cache");
    }
    if (p === "/admin" || p === "/admin/") {
      secHeaders(res);
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      const e = loadStatic("/admin.html");
      return sendEntry(req, res, e, "no-cache");
    }
    if (p === "/catalog.md" || p === "/catalog.yaml" || p === "/catalog.json") {
      secHeaders(res);
      if (p.endsWith(".md")) return sendText(res, 200, toMarkdown(catalog), "text/markdown; charset=utf-8");
      if (p.endsWith(".yaml")) return sendText(res, 200, toYAML(toPortable(catalog)), "text/yaml; charset=utf-8");
      return sendText(res, 200, JSON.stringify(toPortable(catalog), null, 2), "application/json; charset=utf-8");
    }
    if (p === "/robots.txt") return sendText(res, 200, "User-agent: *\nDisallow: /admin\nDisallow: /api/\n", "text/plain");
    if (/^\/(assets\/|admin\.(js|css)$|favicon)/.test(p) && !p.includes("..")) {
      const e = loadStatic(p);
      if (e) { secHeaders(res); return sendEntry(req, res, e, p.startsWith("/assets/vendor/") ? "public, max-age=604800" : "public, max-age=300, must-revalidate"); }
    }
    secHeaders(res);
    res.statusCode = 302;
    res.setHeader("Location", "/");
    res.end();
  } catch (e) {
    log("error", req.method, p, e.message);
    if (!res.headersSent) json(res, e.code && e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : "Server error" });
    else res.destroy();
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
server.requestTimeout = 60000;

init().then(() => {
  server.listen(PORT, () => log(`listening on :${PORT}, data in ${DATA_DIR}, admin ${authConfigured() ? "enabled" : "DISABLED (set ADMIN_PASSWORD)"}`));
}).catch((e) => { console.error(e); process.exit(1); });

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
