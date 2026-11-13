(function () {
"use strict";
var ICONS = "assets/icons.svg#";
var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function okUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : ""; }
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
function shortName(h) { return h.replace(/^(cdn|docs|www|github)\./, ""); }
function store(k, v) {
  try {
    if (v === null) localStorage.removeItem(k);
    else if (v !== undefined) localStorage.setItem(k, v);
    return localStorage.getItem(k);
  } catch (e) { return null; }
}

/* ---------------- data ---------------- */
var DB = null, SET = {};
function build(data) {
  SET = data.settings || {};
  var groups = data.groups && data.groups.length ? data.groups : [{ id: "tools", label: "Tools" }];
  var cats = [], items = [], id = 0;
  (data.categories || []).forEach(function (c, i, all) {
    if (!c.items || !c.items.length) return;
    var cat = { id: c.id, title: c.title, slug: c.slug || c.id, group: c.group, icon: c.icon || "tool", source: okUrl(c.source), desc: c.desc || "", count: c.items.length };
    cat.h = Math.round((i * 360 / Math.max(all.length, 1) * 7) % 360);
    cats.push(cat);
    c.items.forEach(function (it) {
      var o = { id: id++, name: it.name, url: okUrl(it.url), links: (it.links || []).filter(okUrl), desc: it.desc || "", lic: it.lic || "", os: it.os || [], sub: it.sub || "", cat: cat };
      o.host = o.url ? hostOf(o.url) : "";
      o.free = /F/.test(o.lic); o.paid = /C/.test(o.lic);
      o.nameL = o.name.toLowerCase();
      o.hay = (o.name + " \u0001" + o.desc + " \u0001" + cat.title + " " + o.sub + " " + o.host + " " + o.os.join(" ")).toLowerCase();
      items.push(o);
    });
  });
  return { cats: cats, items: items, groups: groups.filter(function (g) { return cats.some(function (c) { return c.group === g.id; }); }), updatedAt: data.updatedAt };
}

/* ---------------- settings ---------------- */
function applySettings() {
  var s = SET;
  document.title = s.siteTitle || document.title;
  $("brandName").textContent = s.brandName || s.siteTitle || "";
  $("brandTag").textContent = s.brandTagline || "";
  $("eyebrow").textContent = s.eyebrow || "";
  var ht = $("heroTitle"); ht.textContent = "";
  String(s.heroTitle || "").split(/(\{[^}]*\})/).forEach(function (part) {
    if (/^\{.*\}$/.test(part)) { var sp = document.createElement("span"); sp.className = "grad"; sp.textContent = part.slice(1, -1); ht.appendChild(sp); }
    else if (part) ht.appendChild(document.createTextNode(part));
  });
  $("heroText").textContent = s.heroText || "";
  $("q").placeholder = s.searchPlaceholder || "Search…";
  $("legalText").textContent = s.legalText || "";
  $("stats").hidden = s.showStats === false;
  var fs = $("footSrc"); fs.textContent = "";
  if (s.sourceUrl) {
    fs.appendChild(document.createTextNode((s.footerText || "Source:") + " "));
    var a = document.createElement("a"); a.href = s.sourceUrl; a.target = "_blank"; a.rel = "noopener"; a.textContent = s.sourceLabel || hostOf(s.sourceUrl);
    fs.appendChild(a);
  } else if (s.footerText) fs.textContent = s.footerText;
}

/* ---------------- state ---------------- */
var S = { q: "", cat: "", kind: "", lic: "", os: "", sort: "cat" };
var qEl = $("q"), results = $("results"), rbar = $("rbar"), catsEl = $("cats");
function readURL() {
  var p = new URLSearchParams(location.search);
  S.q = p.get("q") || ""; S.cat = p.get("cat") || ""; S.kind = p.get("kind") || ""; S.lic = p.get("lic") || ""; S.os = p.get("os") || ""; S.sort = p.get("sort") || "cat";
}
var urlT;
function writeURL() {
  clearTimeout(urlT);
  urlT = setTimeout(function () {
    var p = new URLSearchParams(), cur = new URLSearchParams(location.search);
    ["preview", "theme"].forEach(function (k) { if (cur.has(k)) p.set(k, cur.get(k)); });
    ["q", "cat", "kind", "lic", "os"].forEach(function (k) { if (S[k]) p.set(k, S[k]); });
    if (S.sort !== "cat") p.set("sort", S.sort);
    var s = p.toString();
    history.replaceState(null, "", s ? "?" + s : location.pathname);
  }, 250);
}

/* ---------------- search ---------------- */
function tokens(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
function score(it, tk) {
  var s = 0;
  for (var i = 0; i < tk.length; i++) {
    var t = tk[i], p = it.hay.indexOf(t);
    if (p < 0) return -1;
    var np = it.nameL.indexOf(t);
    if (it.nameL === t) s += 100;
    else if (np === 0) s += 60;
    else if (np > 0) s += (/[\s\-\/(.]/.test(it.nameL[np - 1]) ? 40 : 25);
    else if (p < it.hay.indexOf("\u0001", it.nameL.length + 2)) s += 10;
    else s += 4;
  }
  return s;
}
function hl(text, tk) {
  var h = esc(text);
  if (!tk.length) return h;
  var re = new RegExp("(" + tk.map(function (t) { return esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).sort(function (a, b) { return b.length - a.length; }).join("|") + ")", "gi");
  return h.replace(/(<[^>]*>)|([^<]+)/g, function (all, tag, txt) { return tag ? tag : txt.replace(re, "<mark>$1</mark>"); });
}
function richDesc(d, tk) {
  var parts = d.split(/`([^`]+)`/), out = "";
  for (var i = 0; i < parts.length; i++) out += i % 2 ? "<code>" + hl(parts[i], tk) + "</code>" : hl(parts[i], tk);
  return out;
}
function passes(it, ignoreCat) {
  if (!ignoreCat && S.cat && it.cat.slug !== S.cat) return false;
  if (S.kind && it.cat.group !== S.kind) return false;
  if (S.lic === "F" && !it.free) return false;
  if (S.lic === "C" && !it.paid) return false;
  if (S.os && it.os.indexOf(S.os) < 0) return false;
  return true;
}
function filtered() {
  var tk = tokens(S.q), out = [];
  for (var i = 0; i < DB.items.length; i++) {
    var it = DB.items[i];
    if (!passes(it)) continue;
    var sc = tk.length ? score(it, tk) : 0;
    if (sc < 0) continue;
    out.push({ it: it, s: sc });
  }
  return { list: out, tk: tk };
}

/* ---------------- render ---------------- */
function iconHTML(it) {
  var h = it.host, mono = esc(it.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2) || "?");
  if (!h || SET.showFavicons === false) return '<span class="ico">' + mono + "</span>";
  var gh = h === "github.com" && /^\/([^\/]+)/.exec(new URL(it.url).pathname);
  var src = gh ? "https://github.com/" + encodeURIComponent(gh[1]) + ".png?size=64" : "https://icons.duckduckgo.com/ip3/" + encodeURIComponent(h) + ".ico";
  return '<span class="ico' + (gh ? " gh" : "") + '" data-m="' + mono + '"><img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" width="20" height="20"></span>';
}
function card(it, tk, showCat) {
  var t = "";
  if (it.free && it.paid) t += '<span class="tag free">FREE</span><span class="tag paid">PAID TIER</span>';
  else if (it.free) t += '<span class="tag free">FREE</span>';
  else if (it.paid) t += '<span class="tag paid">PAID</span>';
  it.os.forEach(function (o) { t += '<span class="tag">' + esc(o) + "</span>"; });
  if (showCat) t += '<span class="tag cat">' + esc(it.cat.title) + "</span>";
  else if (it.sub && tk.length) t += '<span class="tag cat">' + esc(it.sub) + "</span>";
  var more = it.links.length ? '<div class="more">' + it.links.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">↗ ' + esc(shortName(hostOf(u))) + "</a>"; }).join("") + "</div>" : "";
  var name = it.url ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + hl(it.name, tk) + "</a>" : hl(it.name, tk);
  return '<article class="card" style="--h:' + it.cat.h + '"><div class="hd">' + iconHTML(it) + '<div style="min-width:0"><h4>' + name + "</h4>" + (it.host ? '<div class="host">' + hl(it.host, tk) + "</div>" : "") + "</div></div>" +
    (it.desc ? "<p>" + richDesc(it.desc, tk) + "</p>" : "") + more + (t ? '<div class="tags">' + t + "</div>" : "") + "</article>";
}
function groupHead(c, n) {
  return '<div class="ghead" style="--h:' + c.h + '"><span class="dot"><svg><use href="' + ICONS + "c-" + esc(c.icon) + '"/></svg></span><h2 id="g-' + esc(c.slug) + '">' + esc(c.title) + '</h2><span class="cnt">' + n + "</span>" +
    (c.source ? '<a class="src" href="' + esc(c.source) + '" target="_blank" rel="noopener" title="View the original source of this section"><svg><use href="' + ICONS + 'i-ext"/></svg><span>Source</span></a>' : "") + "</div>";
}
function render() {
  var r = filtered(), list = r.list, tk = r.tk, html = "";
  $("searchWrap").classList.toggle("has-q", !!S.q);
  var sort = S.sort;
  if (!list.length) {
    html = '<div class="empty"><b>No matches</b>Try fewer words, or clear the filters. <br><br><button class="btn" id="reset">Reset filters</button></div>';
  } else if (sort === "cat") {
    var by = {};
    list.forEach(function (x) { (by[x.it.cat.slug] = by[x.it.cat.slug] || []).push(x); });
    DB.cats.forEach(function (c) {
      var g = by[c.slug];
      if (!g) return;
      if (tk.length) g.sort(function (a, b) { return b.s - a.s; });
      html += '<section class="group">' + groupHead(c, g.length);
      if (c.desc && !tk.length) html += '<p style="color:var(--muted);margin:-4px 0 12px;font-size:14px">' + esc(c.desc) + "</p>";
      var lastSub = null, buf = "";
      g.forEach(function (x) {
        if (!tk.length && x.it.sub !== lastSub && x.it.sub) {
          if (buf) html += '<div class="grid">' + buf + "</div>";
          buf = "";
          html += '<div class="sub">' + esc(x.it.sub) + "</div>";
          lastSub = x.it.sub;
        }
        buf += card(x.it, tk, false);
      });
      html += '<div class="grid">' + buf + "</div></section>";
    });
  } else {
    if (sort === "az") list.sort(function (a, b) { return a.it.nameL.localeCompare(b.it.nameL); });
    else list.sort(function (a, b) { return b.s - a.s || a.it.id - b.it.id; });
    html = '<div class="grid">' + list.map(function (x) { return card(x.it, tk, true); }).join("") + "</div>";
  }
  results.innerHTML = html;
  var rs = $("reset");
  if (rs) rs.onclick = resetAll;

  var chips = "";
  if (S.cat) { var c = DB.cats.filter(function (c) { return c.slug === S.cat; })[0]; if (c) chips += '<button class="chip" data-x="cat">' + esc(c.title) + " ✕</button>"; }
  if (S.kind) { var g = DB.groups.filter(function (g) { return g.id === S.kind; })[0]; chips += '<button class="chip" data-x="kind">' + esc(g ? g.label : S.kind) + " ✕</button>"; }
  if (S.lic) chips += '<button class="chip" data-x="lic">' + (S.lic === "F" ? "Free" : "Commercial") + " ✕</button>";
  if (S.os) chips += '<button class="chip" data-x="os">' + esc(S.os) + " ✕</button>";
  rbar.innerHTML = "<span><b>" + list.length + "</b> of " + DB.items.length + " entries" + (S.q ? " for “" + esc(S.q) + "”" : "") + "</span>" + chips;
  syncButtons();
  renderCats();
  writeURL();
}
function renderCats() {
  var counts = {}, tk = tokens(S.q), total = 0;
  DB.items.forEach(function (it) {
    if (!passes(it, true)) return;
    if (tk.length && score(it, tk) < 0) return;
    counts[it.cat.slug] = (counts[it.cat.slug] || 0) + 1;
    total++;
  });
  var h = '<div class="list"><button class="cat" data-c="" aria-pressed="' + (!S.cat) + '" style="--h:190"><span class="dot"><svg><use href="' + ICONS + 'c-layers"/></svg></span><span class="lbl">All categories</span><span class="n">' + total + "</span></button>";
  DB.groups.forEach(function (g) {
    var cs = DB.cats.filter(function (c) { return c.group === g.id; });
    if (!cs.length) return;
    h += "</div><h3>" + esc(g.label) + '</h3><div class="list">';
    cs.forEach(function (c) {
      var n = counts[c.slug] || 0;
      h += '<button class="cat" data-c="' + esc(c.slug) + '" aria-pressed="' + (S.cat === c.slug) + '" style="--h:' + c.h + ";" + (n ? "" : "opacity:.4") + '"><span class="dot"><svg><use href="' + ICONS + "c-" + esc(c.icon) + '"/></svg></span><span class="lbl">' + esc(c.title) + '</span><span class="n">' + n + "</span></button>";
    });
  });
  catsEl.innerHTML = h + "</div>";
}
function syncButtons() {
  [["fKind", "kind"], ["fLic", "lic"], ["fOs", "os"]].forEach(function (p) {
    $(p[0]).querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === S[p[1]])); });
  });
  $("sort").value = S.sort;
}
function resetAll() { S.q = ""; S.cat = ""; S.kind = ""; S.lic = ""; S.os = ""; qEl.value = ""; render(); }

/* ---------------- clock ---------------- */
var CLK = { tz: "", h12: false, zones: null };
function deviceTz() { try { var t = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; return t === "Asia/Calcutta" ? "Asia/Kolkata" : t; } catch (e) { return "UTC"; } }
function validTz(tz) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch (e) { return false; } }
function effectiveTz() { return CLK.tz && validTz(CLK.tz) ? CLK.tz : SET.defaultTimezone && validTz(SET.defaultTimezone) ? SET.defaultTimezone : deviceTz(); }
function tzParts(tz, d) {
  var o = {};
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).forEach(function (p) { if (p.type === "timeZoneName") o.abbr = p.value; });
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(d).forEach(function (p) { if (p.type === "timeZoneName") o.off = p.value.replace("GMT", "UTC") || "UTC"; });
  } catch (e) {}
  if (o.off === "UTC") o.off = "UTC+00:00";
  return o;
}
function fmtTime(tz, d, sec) {
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit", second: sec ? "2-digit" : undefined, hour12: CLK.h12 }).format(d);
}
function tickClock() {
  var d = new Date(), tz = effectiveTz(), p = tzParts(tz, d), sec = SET.clockSeconds !== false;
  $("cTime").textContent = fmtTime(tz, d, sec);
  $("cDate").textContent = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
  $("cZone").textContent = p.abbr || tz;
  $("clockBtn").title = "Time zone: " + tz + " (" + (p.off || "") + ")" + (SET.clockAllowVisitorChange !== false ? " — click to change" : "");
  if (!$("tzPop").hidden) {
    $("pTime").textContent = fmtTime(tz, d, true);
    $("pMeta").textContent = new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: "full" }).format(d) + " · " + tz.replace(/_/g, " ") + " · " + (p.off || "");
  }
}
function zoneList() {
  if (CLK.zones) return CLK.zones;
  var z = [];
  try { z = Intl.supportedValuesOf("timeZone"); } catch (e) { z = ["UTC", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"]; }
  if (z.indexOf("UTC") < 0) z.unshift("UTC");
  var now = new Date(), ALIAS = {"Asia/Calcutta":"Asia/Kolkata","Asia/Saigon":"Asia/Ho_Chi_Minh","Europe/Kiev":"Europe/Kyiv","Asia/Rangoon":"Asia/Yangon","Asia/Katmandu":"Asia/Kathmandu","America/Godthab":"America/Nuuk","Atlantic/Faeroe":"Atlantic/Faroe","Pacific/Truk":"Pacific/Chuuk","Pacific/Ponape":"Pacific/Pohnpei","Pacific/Enderbury":"Pacific/Kanton","America/Buenos_Aires":"America/Argentina/Buenos_Aires","Asia/Dacca":"Asia/Dhaka","Asia/Thimbu":"Asia/Thimphu","Asia/Ujung_Pandang":"Asia/Makassar","Africa/Asmera":"Africa/Asmara"}, seen = {};
  CLK.zones = [];
  z.forEach(function (old) {
    var tz = ALIAS[old] && validTz(ALIAS[old]) ? ALIAS[old] : old;
    if (seen[tz]) return;
    seen[tz] = 1;
    var p = tzParts(tz, now);
    CLK.zones.push({ tz: tz, off: p.off || "", abbr: p.abbr || "", key: (tz + " " + tz.replace(/_/g, " ") + " " + old + " " + (p.abbr || "") + " " + (p.off || "")).toLowerCase() });
  });
  return CLK.zones;
}
function renderZones() {
  var q = $("tzSearch").value.trim().toLowerCase(), cur = effectiveTz(), html = "", n = 0;
  zoneList().forEach(function (z) {
    if (q && z.key.indexOf(q) < 0) return;
    if (n++ > 400) return;
    html += '<button role="option" data-tz="' + esc(z.tz) + '" aria-selected="' + (z.tz === cur) + '"><span>' + esc(z.tz.replace(/_/g, " ")) + "</span><small>" + esc(z.abbr) + " · " + esc(z.off) + "</small></button>";
  });
  $("tzList").innerHTML = html || '<div style="padding:10px;color:var(--muted);font-size:13px">No matching time zone</div>';
}
function setupClock() {
  if (SET.clockEnabled === false) return;
  $("clockWrap").hidden = false;
  CLK.tz = store("tz") || "";
  var h = store("h12");
  CLK.h12 = h === null ? !!SET.clockHour12 : h === "1";
  $("tz12").checked = CLK.h12;
  var allow = SET.clockAllowVisitorChange !== false;
  $("tzPick").hidden = !allow;
  var def = SET.defaultTimezone || "";
  $("tzDefault").textContent = "Site default" + (def ? " (" + def.replace(/_/g, " ") + ")" : " (device)");
  var btn = $("clockBtn"), pop = $("tzPop");
  function open(o) {
    pop.hidden = !o; btn.setAttribute("aria-expanded", String(o));
    if (o) { tickClock(); if (allow) { renderZones(); $("tzSearch").focus(); var sel = $("tzList").querySelector('[aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: "center" }); } }
  }
  btn.onclick = function (e) { e.stopPropagation(); var sp = $("skinPop"); if (sp) sp.hidden = true; open(pop.hidden); };
  document.addEventListener("click", function (e) { if (!pop.hidden && !pop.contains(e.target)) open(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !pop.hidden) { open(false); btn.focus(); } });
  $("tzSearch").addEventListener("input", renderZones);
  $("tzSearch").addEventListener("keydown", function (e) { if (e.key === "Enter") { var b = $("tzList").querySelector("button"); if (b) b.click(); } });
  $("tzList").addEventListener("click", function (e) { var b = e.target.closest("button[data-tz]"); if (!b) return; CLK.tz = b.dataset.tz; store("tz", CLK.tz); tickClock(); renderZones(); });
  $("tzLocal").onclick = function () { CLK.tz = deviceTz(); store("tz", CLK.tz); tickClock(); renderZones(); };
  $("tzDefault").onclick = function () { CLK.tz = ""; store("tz", null); tickClock(); renderZones(); };
  $("tz12").onchange = function () { CLK.h12 = this.checked; store("h12", CLK.h12 ? "1" : "0"); tickClock(); };
  tickClock();
  var align = 1000 - (Date.now() % 1000);
  setTimeout(function () { tickClock(); setInterval(tickClock, 1000); }, align);
}

/* ---------------- events ---------------- */
var t;
qEl.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { S.q = qEl.value.trim(); render(); }, 70); });
$("clear").onclick = function () { qEl.value = ""; S.q = ""; render(); qEl.focus(); };
[["fKind", "kind"], ["fLic", "lic"], ["fOs", "os"]].forEach(function (p) {
  $(p[0]).addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S[p[1]] = b.dataset.v; if (p[1] === "kind") S.cat = ""; render(); });
});
$("sort").onchange = function () { S.sort = this.value; render(); };
catsEl.addEventListener("click", function (e) {
  var b = e.target.closest(".cat");
  if (!b) return;
  S.cat = b.dataset.c;
  if (S.cat) S.kind = "";
  render();
  var top = results.getBoundingClientRect().top + scrollY - 210;
  if (scrollY > top) scrollTo({ top: top });
  if (innerWidth <= 980) { catsEl.classList.remove("open"); $("catToggle").setAttribute("aria-expanded", "false"); }
});
rbar.addEventListener("click", function (e) { var b = e.target.closest(".chip"); if (b) { S[b.dataset.x] = ""; render(); } });
results.addEventListener("error", function (e) {
  var img = e.target;
  if (img.tagName !== "IMG") return;
  var s = img.parentNode; s.classList.remove("gh"); s.textContent = s.dataset.m || "?";
}, true);
document.addEventListener("keydown", function (e) {
  var a = document.activeElement;
  if (e.key === "/" && a !== qEl && !/INPUT|TEXTAREA|SELECT/.test(a.tagName)) { e.preventDefault(); qEl.focus(); qEl.select(); }
  else if (e.key === "Escape" && a === qEl) { qEl.value = ""; S.q = ""; render(); }
});
$("catToggle").onclick = function () { var o = catsEl.classList.toggle("open"); this.setAttribute("aria-expanded", String(o)); };
$("legalX").onclick = function () { $("legal").hidden = true; store("legal", "x"); };
var tt = $("totop");
addEventListener("scroll", function () { tt.classList.toggle("show", scrollY > 900); }, { passive: true });
tt.onclick = function () { scrollTo({ top: 0 }); };
addEventListener("popstate", function () { readURL(); qEl.value = S.q; render(); });

/* ---------------- themes ---------------- */
var TH = window.__cstTheme || null;
function themeColorMeta() {
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || m.content;
}
function setSkin(id, remember) {
  if (!TH) return;
  TH.apply(id);
  if (remember !== undefined) store("skin", remember);
  themeColorMeta();
  FX.restart();
  renderSkins();
}
function renderSkins() {
  var list = $("skinList");
  if (!list || !TH) return;
  var cur = document.documentElement.getAttribute("data-skin"), mine = TH.stored();
  var themes = (window.__bootThemes || []), html = "";
  if (document.documentElement.dataset.auto === "1") {
    html += '<button role="radio" data-skin="" aria-checked="' + (!mine) + '"><span class="sw"><i style="background:#0b1220"></i><i style="background:#f4f7fc"></i></span><span>Match my device</span><small>auto</small></button>';
  }
  var auto = document.documentElement.dataset.auto === "1";
  themes.forEach(function (t) {
    var on = (mine || !auto) && t.id === cur;
    html += '<button role="radio" data-skin="' + esc(t.id) + '" aria-checked="' + on + '"><span class="sw">' +
      t.sw.map(function (c) { return '<i style="background:' + esc(c) + '"></i>'; }).join("") + "</span><span>" + esc(t.name) + "</span><small>" + esc(t.mode) + "</small></button>";
  });
  list.innerHTML = html;
}
function setupSkins(themes) {
  window.__bootThemes = themes || [];
  var ds = document.documentElement.dataset;
  if (!TH || ds.allow !== "1" || window.__bootThemes.length < 2 || TH.preview) return;
  $("skinWrap").hidden = false;
  var btn = $("skinBtn"), pop = $("skinPop");
  function open(o) { pop.hidden = !o; btn.setAttribute("aria-expanded", String(o)); if (o) { renderSkins(); var c = $("skinList").querySelector('[aria-checked="true"]'); if (c) c.focus(); } }
  btn.onclick = function (e) { e.stopPropagation(); var tp = $("tzPop"); if (tp) tp.hidden = true; open(pop.hidden); };
  document.addEventListener("click", function (e) { if (!pop.hidden && !pop.contains(e.target)) open(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !pop.hidden) { open(false); btn.focus(); } });
  $("skinList").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-skin]");
    if (!b) return;
    if (!b.dataset.skin) { store("skin", null); setSkin(TH.resolve()); }
    else setSkin(b.dataset.skin, b.dataset.skin);
  });
  try {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () { if (!TH.stored()) setSkin(TH.resolve()); });
  } catch (e) {}
}

/* live preview from the admin panel (same origin only) */
addEventListener("message", function (e) {
  if (e.origin !== location.origin || !e.data || e.data.type !== "cst-preview" || !TH) return;
  var s = e.data.settings || {}, d = document.documentElement, ds = d.dataset;
  ds.fontSetting = s.fontStyle || "theme";
  ds.fxSetting = s.bgEffect || "theme";
  d.setAttribute("data-radius", s.radius || "default");
  d.setAttribute("data-card", s.cardStyle || "glass");
  d.setAttribute("data-density", s.density || "comfortable");
  d.setAttribute("data-glow", s.glow === false ? "0" : "1");
  var ok = /^#[0-9a-f]{6}$/i;
  $("accentStyle").textContent = s.accentOverride && ok.test(s.accent || "") && ok.test(s.accent2 || "") ? ":root:root[data-skin]{--accent:" + s.accent + ";--accent2:" + s.accent2 + "}" : "";
  if (s.showFavicons !== undefined && DB) { SET.showFavicons = s.showFavicons; }
  if (s.showStats !== undefined) $("stats").hidden = s.showStats === false;
  setSkin(TH.meta[e.data.skin] ? e.data.skin : s.theme || "cyber");
  if (DB) render();
});

/* ---------------- background effects ---------------- */
var FX = (function () {
  var c = $("net"), x = c.getContext && c.getContext("2d"), W, H, dpr = Math.min(devicePixelRatio || 1, 2), raf = 0, mode = "", P = [], drops = [], col = "0,240,255", run = true;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var GLYPHS = "01アイウエオカキクケコサシスセソ<>/{}[]#$%&*+=ABCDEF0123456789";
  function readColor() { col = (getComputedStyle(document.documentElement).getPropertyValue("--net") || "0,240,255").trim(); }
  function size() {
    W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr;
    P = []; drops = [];
    if (mode === "network") { var n = Math.min(70, Math.round(innerWidth * innerHeight / 22000)); for (var i = 0; i < n; i++) P.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25 * dpr, vy: (Math.random() - .5) * .25 * dpr }); }
    if (mode === "stars") { var m = Math.min(260, Math.round(innerWidth * innerHeight / 6000)); for (var j = 0; j < m; j++) P.push({ x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 1.3 + .3) * dpr, t: Math.random() * 6.28, s: .004 + Math.random() * .018, v: (Math.random() * .08 + .02) * dpr }); }
    if (mode === "matrix") { var cols = Math.ceil(W / (16 * dpr)); for (var k = 0; k < cols; k++) drops.push(Math.random() * -H / (16 * dpr)); }
  }
  var last = 0;
  function step(ts) {
    raf = 0;
    if (!run || !mode) return;
    if (mode === "matrix") {
      if (ts - last < 55) { raf = requestAnimationFrame(step); return; }
      last = ts;
      var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#000";
      x.globalAlpha = .12; x.fillStyle = bg; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
      var fs = 16 * dpr;
      x.font = (14 * dpr) + "px ui-monospace,monospace";
      for (var i = 0; i < drops.length; i++) {
        var ch = GLYPHS[(Math.random() * GLYPHS.length) | 0], yy = drops[i] * fs;
        x.fillStyle = "rgba(" + col + ",.85)";
        x.fillText(ch, i * fs, yy);
        if (yy > H && Math.random() > .975) drops[i] = 0;
        drops[i] += 1;
      }
    } else {
      x.clearRect(0, 0, W, H);
      if (mode === "network") {
        var D = 140 * dpr;
        for (var a = 0; a < P.length; a++) {
          var p = P[a];
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
          x.fillStyle = "rgba(" + col + ",.7)";
          x.fillRect(p.x - dpr, p.y - dpr, 2 * dpr, 2 * dpr);
          for (var b = a + 1; b < P.length; b++) {
            var q = P[b], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
            if (d2 < D * D) { x.strokeStyle = "rgba(" + col + "," + (.18 * (1 - Math.sqrt(d2) / D)) + ")"; x.lineWidth = dpr; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke(); }
          }
        }
      } else if (mode === "stars") {
        for (var s2 = 0; s2 < P.length; s2++) {
          var st = P[s2];
          st.t += st.s; st.y += st.v;
          if (st.y > H) { st.y = 0; st.x = Math.random() * W; }
          x.fillStyle = "rgba(" + col + "," + (.25 + .55 * (.5 + .5 * Math.sin(st.t))) + ")";
          x.beginPath(); x.arc(st.x, st.y, st.r, 0, 6.283); x.fill();
        }
      }
    }
    raf = requestAnimationFrame(step);
  }
  function restart() {
    if (!x) return;
    var want = document.documentElement.getAttribute("data-fx") || "network";
    if (want === "grid" || want === "none" || reduced) want = "";
    readColor();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    mode = want;
    c.style.display = mode ? "" : "none";
    if (!mode) return;
    size();
    x.clearRect(0, 0, W, H);
    raf = requestAnimationFrame(step);
  }
  addEventListener("resize", function () { if (mode) size(); });
  document.addEventListener("visibilitychange", function () { run = !document.hidden; if (run && mode && !raf) raf = requestAnimationFrame(step); });
  return { restart: restart };
})();
FX.restart();
themeColorMeta();
/* ---------------- boot ---------------- */
function start(data) {
  DB = build(data);
  applySettings();
  $("legal").hidden = !(SET.legalEnabled !== false && SET.legalText && store("legal") !== "x");
  $("fKind").innerHTML = '<button data-v="" aria-pressed="true">All</button>' + DB.groups.map(function (g) { return '<button data-v="' + esc(g.id) + '" aria-pressed="false">' + esc(g.label) + "</button>"; }).join("");
  $("fKind").hidden = DB.groups.length < 2;
  $("sTotal").textContent = DB.items.length;
  var g0 = DB.groups[0];
  $("sTools").textContent = g0 ? DB.items.filter(function (i) { return i.cat.group === g0.id; }).length : DB.items.length;
  $("sToolsL").textContent = g0 ? g0.label : "Tools";
  $("sCats").textContent = DB.cats.length;
  $("sFree").textContent = DB.items.filter(function (i) { return i.free; }).length;
  $("synced").textContent = DB.updatedAt ? "Updated " + new Date(DB.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  readURL();
  qEl.value = S.q;
  render();
  setupClock();
  setupSkins(data.themes);
}
var bootEl = $("boot"), boot = null;
try { boot = JSON.parse(bootEl.textContent); } catch (e) {}
if (boot && boot.categories) start(boot);
else fetch("api/catalog").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(start).catch(function () {
  results.innerHTML = '<div class="empty"><b>Could not load the catalog</b>Please try again later.</div>';
});

})();
