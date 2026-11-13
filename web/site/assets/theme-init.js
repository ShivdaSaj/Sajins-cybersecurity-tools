/* Runs before first paint (loaded synchronously in <head>) so the page never flashes the wrong theme.
   The server renders the theme settings as data-* attributes on <html>. */
(function () {
  var d = document.documentElement, ds = d.dataset, meta = {};
  (ds.themes || "").split(",").forEach(function (x) {
    var p = x.split(":");
    if (p[0]) meta[p[0]] = { mode: p[1] === "l" ? "light" : "dark", fx: p[2] || "network", font: p[3] || "system" };
  });
  var enabled = (ds.skins || "").split(",").filter(Boolean);
  var q = new URLSearchParams(location.search);
  var preview = q.has("preview");
  function stored() { if (preview) return null; try { return localStorage.getItem("skin"); } catch (e) { return null; } }
  function prefersLight() { try { return matchMedia("(prefers-color-scheme: light)").matches; } catch (e) { return false; } }
  function resolve() {
    var qs = q.get("theme");
    if (qs && meta[qs]) return qs;
    var mine = stored();
    if (ds.allow === "1" && mine && meta[mine] && enabled.indexOf(mine) >= 0) return mine;
    if (ds.auto === "1" && ds.skinLight && meta[ds.skinLight] && prefersLight()) return ds.skinLight;
    return meta[ds.skinDefault] ? ds.skinDefault : "cyber";
  }
  function apply(skin) {
    var m = meta[skin] || { mode: "dark", fx: "network", font: "system" };
    d.setAttribute("data-skin", skin);
    d.setAttribute("data-mode", m.mode);
    d.setAttribute("data-font", ds.fontSetting && ds.fontSetting !== "theme" ? ds.fontSetting : m.font);
    d.setAttribute("data-fx", ds.fxSetting && ds.fxSetting !== "theme" ? ds.fxSetting : m.fx);
  }
  window.__cstTheme = { meta: meta, enabled: enabled, resolve: resolve, apply: apply, stored: stored, preview: preview };
  apply(resolve());
})();
