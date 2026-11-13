# Website: cybersecuritytools.sajinshivdas.online

A fast, searchable front-end for the curated list, plus an admin panel to manage it.

## Layout

| Path | What it is |
|---|---|
| `server/github-sync.mjs` | Two-way sync of the catalog with the reference GitHub repository. |
| `server/server.mjs` | Zero-dependency Node.js server (Node 20+). It serves the site, the public API and the admin API, and stores data in `DATA_DIR`. |
| `site/index.html`, `site/assets/app.js` | The public site. The catalog is embedded in the page on the server, so it loads with a single request. It has search, filters, and a header clock where visitors can choose a time zone. |
| `site/admin.html`, `admin.js`, `admin.css` | The admin panel at `/admin`. |
| `site/assets/themes.mjs`, `theme-init.js` | Theme palettes (served as `/assets/themes.css`) and the tiny script that applies the theme before first paint. |
| `site/assets/catalog-format.mjs` | The shared data model, used by the server and the panel: Markdown/YAML/JSON parsing, export and merge. |
| `site/assets/vendor/js-yaml.mjs` | js-yaml 4.1.0 (MIT), vendored. |
| `docker-compose.yml` | The Hostinger Docker Manager deployment (Traefik + Let's Encrypt). |

## Admin panel (`/admin`)

- **Catalog editor**:
  - Add, insert above/below, duplicate, delete, reorder (buttons or drag & drop) and sort categories.
  - Set each category's group, icon, description and source link.
  - For entries: add, insert below, edit, duplicate, delete and reorder. Bulk move, copy, set licence, set section, export and delete. Undo works until you save.
- **Import / Export**:
  - Markdown (README style), YAML and JSON.
  - Export the whole catalog, one group, one category, or entries selected in the editor.
  - Import into the file's own categories, an existing category, or a new one. When an entry already exists you can update it, keep the existing one, or replace everything. You review every import before it is added.
- **Ingest & snippets**:
  - Scan any web page, "awesome list" or GitHub repository (its README is used automatically) and pick the links to insert.
  - Add one tool from its URL (title and description are read from the page).
  - Paste a snippet of Markdown, YAML, JSON or plain URLs.
  - Pages are fetched by the server with SSRF protection: private and reserved addresses are blocked, and there are size and time limits.
- **Backup & restore**:
  - An automatic backup is made before every save and restore (the last 40 are kept), and you can also create manual backups.
  - Download and restore server backups, or load a backup file into the editor.
- **Themes & appearance**:
  - A gallery of 13 built-in themes, 10 dark and 3 light: Cyber Neon, Matrix Terminal, Deep Ocean, Red Team, Blue Team, Synthwave, Amethyst Night, Amber CRT, Arctic Frost, High Contrast, Paper Light, Mint Daylight and Sandstone.
  - Pick the default theme, an optional theme for visitors whose device is in light mode, and which themes visitors can switch to from the palette button in the header.
  - Appearance options that apply on top of any theme: font, corners, card style, density, background effect (network nodes, falling code, cyber grid, starfield, none), glow, favicons, stats tiles, and custom accent colours.
  - A live desktop/mobile preview shows unsaved changes before you publish. Themes are defined in `site/assets/themes.mjs`.
- **Site content**: titles, hero text, notice, footer and attribution, and groups.
- **Clock & time zone**: turn the clock on or off, set the default time zone, 12/24-hour, seconds, and whether visitors may pick their own zone.
- **GitHub sync**:
  - Shows the repository status: in sync, website ahead, GitHub ahead, or conflict.
  - Buttons to push now, apply GitHub edits now, "Pull & review" the GitHub version in the editor, and force push.
- **Security**: change the admin password (stored as a scrypt hash, which replaces `ADMIN_PASSWORD`). Sessions use HttpOnly, SameSite=Strict signed cookies, and failed sign-ins are rate-limited.

Every **Save & publish** writes a new revision, which goes live immediately. Public downloads are at `/catalog.md`, `/catalog.yaml` and `/catalog.json`.

## Reference repository and two-way sync

The private repository **ShivdaSaj/Sajin-Cybersecurity-Resources** is the reference repository. It holds this codebase, and the site deploys from it.

The catalog is synced with it in both directions:

- **Website → GitHub:** every *Save & publish* (and backup restore) is committed as `catalog/catalog.yaml` and `catalog/CATALOG.md`. The YAML file is the source of truth and includes the site settings; the Markdown file is a readable list.
- **GitHub → website:** edits to `catalog/catalog.yaml` on GitHub are applied automatically within `GITHUB_PULL_MINUTES` (default 5), with a backup first, provided the website has no unsynced changes.
- **Both changed:** nothing is overwritten. The admin resolves it with *Pull & review* or *Force push*.

Setup:
1. Create a fine-grained personal access token. Give it access to this repository only, with the permission **Contents: Read and write**.
2. In Docker Manager, add `GITHUB_REPO=ShivdaSaj/Sajin-Cybersecurity-Resources` and `GITHUB_TOKEN=<token>`, then restart the project.

Optional settings: `GITHUB_BRANCH` (default `main`), `GITHUB_CATALOG_DIR` (default `catalog`), `GITHUB_AUTO_PUSH=false`, `GITHUB_AUTO_PULL=false`, `GITHUB_PULL_MINUTES`. The token stays on the server and is never sent to the browser.

## Deploy / update

In Hostinger Docker Manager, create the project `cybersecuritytools` from `docker-compose.yml` and set these environment variables:

```
ADMIN_PASSWORD=<a long random password>
SITE_REF=main
GITHUB_REPO=ShivdaSaj/Sajin-Cybersecurity-Resources
GITHUB_TOKEN=<fine-grained token, Contents: Read and write>
```

On first start the catalog is seeded from this repository's `README.md`. After that, the copy in the `cybersecuritytools-data` volume is the source of truth. To deploy new site code, restart the project; the catalog in the volume is kept.

## Local development

```bash
DATA_DIR=./data ADMIN_PASSWORD=change-me-please node web/server/server.mjs
```

Then open http://localhost:8080 and http://localhost:8080/admin.
