/*
 * Two-way sync between the catalog and a GitHub repository.
 *
 * - Push: after every save the catalog is committed as <dir>/catalog.yaml (source of truth,
 *   includes site settings) and <dir>/CATALOG.md (readable list), in a single commit made
 *   with the Git Data API.
 * - Pull: edits made to <dir>/catalog.yaml on GitHub are detected. If the website has no
 *   unpublished-to-GitHub changes they are applied automatically (with a backup first);
 *   if both sides changed, the admin resolves it (pull & review, or force push).
 *
 * The token is read from the environment only and never sent to the browser.
 */
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { toYAML, toMarkdown, toPortable, parseAny, normalizeCatalog } from "../site/assets/catalog-format.mjs";

export function createGitHubSync({ dataDir, getCatalog, applyRemote, log, env = process.env }) {
  const cfg = {
    repo: String(env.GITHUB_REPO || "").trim(),
    branch: String(env.GITHUB_BRANCH || "main").trim(),
    token: String(env.GITHUB_TOKEN || "").trim(),
    api: String(env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, ""),
    dir: String(env.GITHUB_CATALOG_DIR || "catalog").replace(/^\/+|\/+$/g, "") || "catalog",
    autoPush: env.GITHUB_AUTO_PUSH !== "false",
    autoPull: env.GITHUB_AUTO_PULL !== "false",
    pullMinutes: Math.max(1, Number(env.GITHUB_PULL_MINUTES || 5)),
  };
  const validRepo = /^[\w.-]+\/[\w.-]+$/.test(cfg.repo);
  const enabled = !!(validRepo && cfg.token && /^[\w./-]+$/.test(cfg.branch));
  const yamlPath = `${cfg.dir}/catalog.yaml`;
  const mdPath = `${cfg.dir}/CATALOG.md`;
  const stateFile = path.join(dataDir, "github-sync.json");
  const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");

  let state = {
    lastPushedBlob: "", acceptedBlob: "", syncedRev: 0, lastCommit: "", lastCommitUrl: "",
    lastPushAt: "", lastPullAt: "", lastCheckAt: "", lastError: "", lastErrorAt: "", remoteBlob: "", remoteState: "unknown",
  };
  let chain = Promise.resolve();
  const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  let timer = null;

  async function load() {
    try { state = { ...state, ...JSON.parse(await fsp.readFile(stateFile, "utf8")) }; } catch {}
  }
  async function saveState() {
    const tmp = stateFile + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
    await fsp.rename(tmp, stateFile);
  }
  function fail(e) {
    state.lastError = e.message;
    state.lastErrorAt = new Date().toISOString();
    saveState().catch(() => {});
    return e;
  }

  async function gh(method, p, body) {
    const r = await fetch(cfg.api + p, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "cybersecuritytools-site",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000),
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      const hint = r.status === 401 ? " (token invalid or expired)" : r.status === 403 ? " (token lacks permission for this repository)" : r.status === 404 ? " (repository, branch or file not found — or the token cannot see it)" : "";
      const e = new Error(`GitHub ${method} ${p.split("?")[0]} failed: ${r.status}${data && data.message ? " " + data.message : ""}${hint}`);
      e.status = r.status;
      throw e;
    }
    return data;
  }
  const blobSha = (s) => { const b = Buffer.from(s); return crypto.createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex"); };

  function render(cat) {
    const port = toPortable(cat, { includeSettings: true });
    delete port.exportedAt;
    const yaml = "# Catalog for cybersecuritytools.sajinshivdas.online — kept in sync with the website's admin panel.\n" +
      "# Edit this file on GitHub to change the website (applied automatically within a few minutes),\n" +
      "# or edit in the admin panel (committed here on every Save & publish).\n" +
      toYAML({ ...port, rev: cat.rev, updatedAt: cat.updatedAt });
    return { yaml, md: toMarkdown(cat) };
  }

  async function remoteFile(p) {
    try {
      const d = await gh("GET", `/repos/${cfg.repo}/contents/${encPath(p)}?ref=${encodeURIComponent(cfg.branch)}`);
      if (Array.isArray(d) || d.type !== "file") return null;
      let text;
      if (d.content && d.encoding === "base64") text = Buffer.from(d.content, "base64").toString("utf8");
      else {
        const blob = await gh("GET", `/repos/${cfg.repo}/git/blobs/${d.sha}`);
        text = Buffer.from(blob.content, "base64").toString("utf8");
      }
      return { sha: d.sha, text, path: p, url: d.html_url };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }
  const remoteIsKnown = (sha) => !sha || sha === state.lastPushedBlob || sha === state.acceptedBlob;

  /** Commit the current catalog. Throws {code:409} when GitHub has edits we have not seen, unless force. */
  function push({ force = false, message } = {}) {
    if (!enabled) return Promise.resolve({ skipped: true, reason: "not configured" });
    return serial(async () => {
      try {
        const cat = getCatalog();
        const { yaml, md } = render(cat);
        const localBlob = blobSha(yaml);
        const ref = await gh("GET", `/repos/${cfg.repo}/git/ref/heads/${encPath(cfg.branch)}`);
        const headSha = ref.object.sha;
        const head = await gh("GET", `/repos/${cfg.repo}/git/commits/${headSha}`);
        const remote = await remoteFile(yamlPath);
        if (remote && remote.sha === localBlob) {
          Object.assign(state, { lastPushedBlob: localBlob, syncedRev: cat.rev, remoteBlob: localBlob, remoteState: "in-sync", lastError: "" });
          await saveState();
          return { skipped: true, reason: "already up to date" };
        }
        if (remote && !remoteIsKnown(remote.sha) && !force) {
          state.remoteBlob = remote.sha;
          state.remoteState = "conflict";
          await saveState();
          throw Object.assign(new Error("The catalog on GitHub was edited since the last sync. Pull it first, or force push to overwrite it."), { code: 409 });
        }
        const tree = await gh("POST", `/repos/${cfg.repo}/git/trees`, {
          base_tree: head.tree.sha,
          tree: [
            { path: yamlPath, mode: "100644", type: "blob", content: yaml },
            { path: mdPath, mode: "100644", type: "blob", content: md },
          ],
        });
        if (tree.sha === head.tree.sha) return { skipped: true, reason: "no changes" };
        const commit = await gh("POST", `/repos/${cfg.repo}/git/commits`, {
          message: (message || `Update catalog (revision ${cat.rev})`).slice(0, 200) + "\n\nCommitted by the cybersecuritytools.sajinshivdas.online admin panel.",
          tree: tree.sha,
          parents: [headSha],
        });
        await gh("PATCH", `/repos/${cfg.repo}/git/refs/heads/${encPath(cfg.branch)}`, { sha: commit.sha, force: false });
        Object.assign(state, {
          lastPushedBlob: localBlob, syncedRev: cat.rev, lastCommit: commit.sha, lastCommitUrl: commit.html_url || `https://github.com/${cfg.repo}/commit/${commit.sha}`,
          lastPushAt: new Date().toISOString(), lastError: "", remoteBlob: localBlob, remoteState: "in-sync",
        });
        await saveState();
        log(`github: committed revision ${cat.rev} as ${commit.sha.slice(0, 7)}`);
        return { committed: true, sha: commit.sha, url: state.lastCommitUrl };
      } catch (e) {
        if (e.code !== 409) fail(e);
        throw e;
      }
    });
  }

  /** Fetch the GitHub version for review in the admin panel (falls back to the repo README). */
  async function fetchRemote() {
    if (!enabled) throw Object.assign(new Error("GitHub sync is not configured"), { code: 400 });
    const f = (await remoteFile(yamlPath)) || (await remoteFile("README.md"));
    if (!f) throw Object.assign(new Error(`Neither ${yamlPath} nor README.md exists on branch ${cfg.branch}`), { code: 404 });
    return f;
  }

  /** Remember that the admin applied this GitHub version, so the next push may replace it. */
  async function accept(sha) {
    if (typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha)) { state.acceptedBlob = sha; await saveState(); }
  }

  /** Check GitHub for edits; apply them automatically when the website has nothing unsynced. */
  function check({ apply = cfg.autoPull } = {}) {
    if (!enabled) return Promise.resolve(status());
    return serial(async () => {
      try {
        const remote = await remoteFile(yamlPath);
        state.lastCheckAt = new Date().toISOString();
        const cat = getCatalog();
        if (!remote) state.remoteState = "missing";
        else if (remoteIsKnown(remote.sha)) state.remoteState = cat.rev === state.syncedRev ? "in-sync" : "local-ahead";
        else if (cat.rev === state.syncedRev && apply) {
          const parsed = parseAny(remote.text, "catalog.yaml");
          if (!parsed.categories || !parsed.categories.length) throw new Error("catalog.yaml on GitHub has no categories — not applied");
          const next = normalizeCatalog({ settings: { ...cat.settings, ...(parsed.settings || {}) }, groups: parsed.groups || cat.groups, categories: parsed.categories });
          const saved = await applyRemote(next, `Auto: before applying GitHub edit ${remote.sha.slice(0, 7)}`);
          Object.assign(state, { acceptedBlob: remote.sha, syncedRev: saved.rev, lastPullAt: new Date().toISOString(), remoteState: "in-sync", lastError: "" });
          log(`github: applied edits from GitHub (${remote.sha.slice(0, 7)}) as revision ${saved.rev}`);
        } else state.remoteState = cat.rev === state.syncedRev ? "remote-ahead" : "conflict";
        state.remoteBlob = remote ? remote.sha : "";
        await saveState();
      } catch (e) { fail(e); }
      return status();
    });
  }

  function status() {
    return {
      enabled,
      configured: { repo: cfg.repo, branch: cfg.branch, dir: cfg.dir, files: [yamlPath, mdPath], autoPush: cfg.autoPush, autoPull: cfg.autoPull, pullMinutes: cfg.pullMinutes, hasToken: !!cfg.token, validRepo },
      repoUrl: validRepo ? `https://github.com/${cfg.repo}` : "",
      fileUrl: validRepo ? `https://github.com/${cfg.repo}/blob/${cfg.branch}/${yamlPath}` : "",
      state: { ...state },
      localRev: getCatalog().rev,
    };
  }

  function start() {
    if (!enabled) { log(cfg.repo || cfg.token ? "github sync: not enabled (needs GITHUB_REPO=owner/name and GITHUB_TOKEN)" : "github sync: off"); return; }
    log(`github sync: ${cfg.repo}@${cfg.branch} (${yamlPath}), auto-push ${cfg.autoPush ? "on" : "off"}, auto-pull ${cfg.autoPull ? "every " + cfg.pullMinutes + " min" : "off"}`);
    setTimeout(async () => {
      // first run: if GitHub has no catalog yet, publish ours; otherwise reconcile
      const st = await check({ apply: false });
      if (st.state.remoteState === "missing" && cfg.autoPush) push({ message: "Add catalog from the website" }).catch(() => {});
      else if (cfg.autoPull) check();
    }, 3000).unref();
    if (cfg.autoPull) timer = setInterval(() => check(), cfg.pullMinutes * 60000);
    if (timer) timer.unref();
  }

  return { enabled, cfg, load, push, fetchRemote, accept, check, status, start, autoPush: cfg.autoPush };
}
