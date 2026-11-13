/*
 * Built-in colour themes for the public site.
 * Shared by the server (generates /assets/themes.css), the admin panel (gallery) and
 * settings validation. Each theme is a complete palette; `fx` and `font` are the
 * theme's suggested background effect and font, used when the site settings say "theme".
 */
const DARK_SHADOW = "0 10px 30px -12px rgba(0,0,0,.6)";
const LIGHT_SHADOW = "0 10px 26px -14px rgba(20,40,90,.35)";

export const THEMES = [
  {
    id: "cyber", name: "Cyber Neon", mode: "dark", fx: "network", font: "system",
    desc: "The original look: deep navy with neon cyan and violet.",
    c: { bg: "#05080f", bg2: "#0a1020", panel: "rgba(14,22,40,.72)", panelSolid: "#0e1628", line: "rgba(120,160,255,.14)", line2: "rgba(120,160,255,.28)", text: "#e6edf7", muted: "#8b9ab5", dim: "#5d6b85", accent: "#00f0ff", accent2: "#7c4dff", accent3: "#ff4dd8", good: "#2ee59d", warn: "#ffb547", mark: "rgba(0,240,255,.22)", net: "0,240,255", glow: ".28" },
  },
  {
    id: "matrix", name: "Matrix Terminal", mode: "dark", fx: "matrix", font: "mono",
    desc: "Green-on-black hacker terminal with falling code.",
    c: { bg: "#020804", bg2: "#06130a", panel: "rgba(6,22,12,.8)", panelSolid: "#071a0d", line: "rgba(0,255,120,.15)", line2: "rgba(0,255,120,.3)", text: "#d7ffe4", muted: "#7fbf95", dim: "#4f7a5e", accent: "#00ff88", accent2: "#00c853", accent3: "#b2ff59", good: "#00ff88", warn: "#e6ff4d", mark: "rgba(0,255,136,.22)", net: "0,255,136", glow: ".18" },
  },
  {
    id: "ocean", name: "Deep Ocean", mode: "dark", fx: "network", font: "system",
    desc: "Calm teal and blue on a dark sea.",
    c: { bg: "#04121a", bg2: "#082230", panel: "rgba(9,34,48,.74)", panelSolid: "#0a2433", line: "rgba(80,200,255,.14)", line2: "rgba(80,200,255,.28)", text: "#e3f4fb", muted: "#86a9b8", dim: "#577886", accent: "#22d3ee", accent2: "#3b82f6", accent3: "#34d399", good: "#34d399", warn: "#fbbf24", mark: "rgba(34,211,238,.2)", net: "34,211,238", glow: ".26" },
  },
  {
    id: "redteam", name: "Red Team", mode: "dark", fx: "grid", font: "system",
    desc: "Aggressive crimson and orange for offensive security.",
    c: { bg: "#0d0506", bg2: "#1a0a0c", panel: "rgba(36,12,15,.76)", panelSolid: "#220c10", line: "rgba(255,90,90,.15)", line2: "rgba(255,90,90,.3)", text: "#fde8e8", muted: "#c39a9a", dim: "#8a6464", accent: "#ff3b3b", accent2: "#ff8a00", accent3: "#ffd166", good: "#4ade80", warn: "#ffb547", mark: "rgba(255,59,59,.22)", net: "255,70,70", glow: ".24" },
  },
  {
    id: "blueteam", name: "Blue Team", mode: "dark", fx: "grid", font: "system",
    desc: "Defensive SOC blues with crisp contrast.",
    c: { bg: "#060b16", bg2: "#0c1426", panel: "rgba(16,28,52,.76)", panelSolid: "#0f1b33", line: "rgba(96,165,250,.15)", line2: "rgba(96,165,250,.3)", text: "#e8f0ff", muted: "#93a8cc", dim: "#61769a", accent: "#60a5fa", accent2: "#2563eb", accent3: "#a5f3fc", good: "#34d399", warn: "#fbbf24", mark: "rgba(96,165,250,.22)", net: "96,165,250", glow: ".26" },
  },
  {
    id: "synthwave", name: "Synthwave", mode: "dark", fx: "grid", font: "system",
    desc: "Retro 80s neon pink, orange and electric cyan.",
    c: { bg: "#12061f", bg2: "#1d0b31", panel: "rgba(40,14,64,.74)", panelSolid: "#26103d", line: "rgba(255,90,200,.16)", line2: "rgba(255,90,200,.32)", text: "#ffe9fb", muted: "#c79bd0", dim: "#8e6a99", accent: "#ff4fd8", accent2: "#ffb000", accent3: "#00e5ff", good: "#3cf2a0", warn: "#ffcb47", mark: "rgba(255,79,216,.22)", net: "255,79,216", glow: ".32" },
  },
  {
    id: "amethyst", name: "Amethyst Night", mode: "dark", fx: "stars", font: "system",
    desc: "Soft purple and pink on a starry violet night.",
    c: { bg: "#14111f", bg2: "#1d1830", panel: "rgba(36,29,58,.74)", panelSolid: "#221b38", line: "rgba(190,160,255,.15)", line2: "rgba(190,160,255,.3)", text: "#f1ecff", muted: "#a99cc8", dim: "#75699a", accent: "#c084fc", accent2: "#f472b6", accent3: "#fde047", good: "#4ade80", warn: "#fbbf24", mark: "rgba(192,132,252,.24)", net: "192,132,252", glow: ".26" },
  },
  {
    id: "amber", name: "Amber CRT", mode: "dark", fx: "network", font: "mono",
    desc: "Warm amber phosphor monitor vibes.",
    c: { bg: "#0c0802", bg2: "#181005", panel: "rgba(32,22,8,.78)", panelSolid: "#1c1307", line: "rgba(255,176,0,.15)", line2: "rgba(255,176,0,.3)", text: "#ffe7b8", muted: "#c9a86c", dim: "#8a7244", accent: "#ffb000", accent2: "#ff7a00", accent3: "#ffe066", good: "#b5e655", warn: "#ffcc66", mark: "rgba(255,176,0,.22)", net: "255,176,0", glow: ".2" },
  },
  {
    id: "arctic", name: "Arctic Frost", mode: "dark", fx: "stars", font: "system",
    desc: "Muted slate with icy blues — easy on the eyes.",
    c: { bg: "#0f1419", bg2: "#171e26", panel: "rgba(30,39,50,.76)", panelSolid: "#1b232d", line: "rgba(160,200,230,.14)", line2: "rgba(160,200,230,.28)", text: "#eceff4", muted: "#a3b1c2", dim: "#6f7d8f", accent: "#88c0d0", accent2: "#81a1c1", accent3: "#b48ead", good: "#a3be8c", warn: "#ebcb8b", mark: "rgba(136,192,208,.24)", net: "136,192,208", glow: ".18" },
  },
  {
    id: "contrast", name: "High Contrast", mode: "dark", fx: "none", font: "system",
    desc: "Maximum readability: pure black, white and yellow.",
    c: { bg: "#000000", bg2: "#121212", panel: "rgba(8,8,8,.96)", panelSolid: "#0a0a0a", line: "rgba(255,255,255,.38)", line2: "rgba(255,255,255,.62)", text: "#ffffff", muted: "#e4e4e4", dim: "#c4c4c4", accent: "#ffe600", accent2: "#00e5ff", accent3: "#ff7ad9", good: "#5dff9b", warn: "#ffd24d", mark: "rgba(255,230,0,.38)", net: "255,230,0", glow: "0" },
  },
  {
    id: "paper", name: "Paper Light", mode: "light", fx: "network", font: "system",
    desc: "Clean, bright and professional.",
    c: { bg: "#f4f7fc", bg2: "#e9eef8", panel: "rgba(255,255,255,.84)", panelSolid: "#ffffff", line: "rgba(30,60,120,.12)", line2: "rgba(30,60,120,.24)", text: "#0d1726", muted: "#4a5872", dim: "#7a879d", accent: "#0077d9", accent2: "#6a3df0", accent3: "#d6338a", good: "#0e9f62", warn: "#b86e00", mark: "rgba(0,119,217,.16)", net: "0,90,200", glow: ".22" },
  },
  {
    id: "mint", name: "Mint Daylight", mode: "light", fx: "network", font: "system",
    desc: "Fresh greens and teals on a light background.",
    c: { bg: "#f2fbf7", bg2: "#e2f3ea", panel: "rgba(255,255,255,.86)", panelSolid: "#ffffff", line: "rgba(16,90,60,.12)", line2: "rgba(16,90,60,.24)", text: "#0b2018", muted: "#45645a", dim: "#7a948a", accent: "#047857", accent2: "#0d9488", accent3: "#2563eb", good: "#047857", warn: "#b45309", mark: "rgba(5,150,105,.16)", net: "5,150,105", glow: ".2" },
  },
  {
    id: "sand", name: "Sandstone", mode: "light", fx: "none", font: "serif",
    desc: "Warm paper tones with an editorial serif.",
    c: { bg: "#faf6ef", bg2: "#f1e9db", panel: "rgba(255,252,246,.88)", panelSolid: "#fffcf6", line: "rgba(90,60,20,.13)", line2: "rgba(90,60,20,.25)", text: "#2a1e10", muted: "#6b5840", dim: "#93836a", accent: "#c2410c", accent2: "#b45309", accent3: "#7c3aed", good: "#15803d", warn: "#a16207", mark: "rgba(194,65,12,.14)", net: "194,65,12", glow: ".18" },
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const themeById = (id) => THEMES.find((t) => t.id === id);

export const APPEARANCE_OPTIONS = {
  fontStyle: [["theme", "Theme default"], ["system", "System sans-serif"], ["mono", "Monospace (terminal)"], ["rounded", "Rounded"], ["serif", "Serif (editorial)"]],
  radius: [["sharp", "Sharp"], ["default", "Rounded"], ["round", "Extra round"]],
  cardStyle: [["glass", "Glass (translucent)"], ["solid", "Solid"], ["outline", "Outline"], ["elevated", "Elevated (shadow)"]],
  density: [["comfortable", "Comfortable"], ["compact", "Compact"]],
  bgEffect: [["theme", "Theme default"], ["network", "Network nodes"], ["matrix", "Falling code"], ["grid", "Cyber grid"], ["stars", "Starfield"], ["none", "None"]],
};

const VAR_NAMES = { bg: "--bg", bg2: "--bg2", panel: "--panel", panelSolid: "--panel-solid", line: "--line", line2: "--line2", text: "--text", muted: "--muted", dim: "--dim", accent: "--accent", accent2: "--accent2", accent3: "--accent3", good: "--good", warn: "--warn", mark: "--mark", net: "--net", glow: "--glow-op" };

function themeVars(t) {
  const v = Object.entries(t.c).map(([k, val]) => `${VAR_NAMES[k]}:${val}`);
  v.push(`--shadow:${t.mode === "light" ? LIGHT_SHADOW : DARK_SHADOW}`, `color-scheme:${t.mode}`);
  return v.join(";");
}

/** CSS with one variable block per theme, keyed on <html data-skin="id">. */
export function themesCSS() {
  const out = [`:root{${themeVars(THEMES[0])}}`];
  for (const t of THEMES) out.push(`:root[data-skin="${t.id}"]{${themeVars(t)}}`);
  return out.join("\n") + "\n";
}
