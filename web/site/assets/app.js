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
  setOrbit(s.heroFx || "radar");
  renderFooter(s.footer);
}

/* ---------------- hero animation (radar / globe / waves / shield) ---------------- */
var ORBIT = { mode: "", built: false, counted: false, chips: [] };
var HERO_FX = ["radar", "globe", "waves", "shield", "map", "terminal", "topology", "constellation"];
var ORBIT_ANGLES = [-90, -28, 30, 90, 150, 208]; // degrees, 0 = right, clockwise (screen coordinates)
function setOrbit(mode) {
  var q = new URLSearchParams(location.search).get("hero");
  if (q && (HERO_FX.indexOf(q) >= 0 || q === "none")) mode = q;
  if (HERO_FX.indexOf(mode) < 0) mode = "none";
  var on = mode !== "none";
  $("orbit").hidden = !on;
  $("hero").classList.toggle("split", on);
  $("orbit").setAttribute("data-fx", mode);
  var changed = mode !== ORBIT.mode;
  ORBIT.mode = mode;
  if (on && DB) { buildOrbit(); if (changed) HV.start(mode); }
  else HV.stop();
}
function buildOrbit() {
  var o = $("orbit"), chips = $("oChips"), links = $("oLinks");
  var T = 9, R = 44;
  var top = DB.cats.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, ORBIT_ANGLES.length);
  chips.textContent = ""; links.innerHTML = ""; ORBIT.chips = [];
  top.forEach(function (c, i) {
    var a = ORBIT_ANGLES[i], rad = a * Math.PI / 180;
    var x = 50 + R * Math.cos(rad), y = 50 + R * Math.sin(rad);
    var b = document.createElement("button");
    b.className = "o-chip"; b.type = "button"; b.dataset.c = c.slug;
    b.style.left = x + "%"; b.style.top = y + "%";
    b.style.setProperty("--h", c.h);
    // light up as the sweep's leading edge passes: sweep angle 0 = top, clockwise
    b.style.setProperty("--ld", (-(((a + 90) % 360 + 360) % 360) / 360 * T).toFixed(2) + "s");
    b.style.setProperty("--fd", (-i * 0.9).toFixed(1) + "s");
    b.setAttribute("aria-label", "Show " + c.title + " (" + c.count + ")");
    b.title = c.title + " (" + c.count + ")";
    var sp = document.createElement("span"), dot = document.createElement("i"), em = document.createElement("em"), n = document.createElement("small");
    em.textContent = c.title.replace(/\s*[&(].*$/, "") || c.title; n.textContent = c.count;
    sp.appendChild(dot); sp.appendChild(em); sp.appendChild(n); b.appendChild(sp); chips.appendChild(b);
    ORBIT.chips.push(b);
    var lx = 50 + (R - 6) * Math.cos(rad), ly = 50 + (R - 6) * Math.sin(rad), cx = 50 + 15 * Math.cos(rad), cy = 50 + 15 * Math.sin(rad);
    links.insertAdjacentHTML("beforeend", '<line x1="' + cx.toFixed(2) + '" y1="' + cy.toFixed(2) + '" x2="' + lx.toFixed(2) + '" y2="' + ly.toFixed(2) + '"/>' +
      '<line class="flow" style="animation-delay:' + (-i * 0.4).toFixed(1) + 's" x1="' + lx.toFixed(2) + '" y1="' + ly.toFixed(2) + '" x2="' + cx.toFixed(2) + '" y2="' + cy.toFixed(2) + '"/>');
  });
  if (!ORBIT.built) {
    ORBIT.built = true;
    chips.addEventListener("click", function (e) {
      var b = e.target.closest(".o-chip"); if (!b) return;
      S.cat = b.dataset.c; S.kind = ""; render();
      scrollTo({ top: results.getBoundingClientRect().top + scrollY - 210 });
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        var vis = en[0].isIntersecting;
        o.classList.toggle("paused", !vis); HV.visible(vis);
        if (vis && !ORBIT.counted) { ORBIT.counted = true; countUp($("oCount"), DB.items.length); }
      }).observe(o);
    } else countUp($("oCount"), DB.items.length);
    document.addEventListener("visibilitychange", function () { o.classList.toggle("paused", document.hidden); HV.visible(!document.hidden); });
  } else if (ORBIT.counted) $("oCount").textContent = DB.items.length;
}
function countUp(el, n) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = n; return; }
  var t0 = performance.now(), d = 1400;
  (function step(t) {
    var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(n * e);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/* Canvas renderer for the globe, waves and shield styles. Colours come from the theme's CSS variables. */
var HV = (function () {
  var cv = $("oCv"), x = cv.getContext && cv.getContext("2d"), mode = "", raf = 0, vis = true, W = 0, H = 0, dpr = 1, t0 = 0;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var C = {}, G = {};
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ["accent", "accent2", "accent3", "text", "line2", "muted"].forEach(function (k) { C[k] = cs.getPropertyValue("--" + k).trim() || "#0af"; });
    C.light = document.documentElement.getAttribute("data-mode") === "light";
  }
  function size() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    ORBIT.box = $("orbit").getBoundingClientRect().width;
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = W * dpr; cv.height = H * dpr;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    G = {};
  }
  // chips are positioned in the orbit box (0..100%), the canvas overhangs it by 6% on each side
  function toBox(px, py) { return [((px / W) * 112 - 6), ((py / H) * 112 - 6)]; }
  function placeChip(i, px, py, scale, alpha, z) {
    var b = ORBIT.chips[i]; if (!b) return;
    var p = toBox(px, py);
    b.style.left = p[0].toFixed(2) + "%"; b.style.top = p[1].toFixed(2) + "%";
    b.style.transform = "translate(-50%,-50%) scale(" + scale.toFixed(3) + ")";
    b.style.opacity = alpha.toFixed(2); b.style.zIndex = z;
  }
  function resetChips() { ORBIT.chips.forEach(function (b) { b.style.transform = ""; b.style.opacity = ""; b.style.zIndex = ""; b.style.pointerEvents = ""; }); }

  /* --- particle globe: points on a rotating sphere, linked to near neighbours; chips ride on the surface --- */
  function globe(t) {
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34;
    if (!G.pts) {
      var n = W < 420 ? 150 : 240, pts = [];
      for (var i = 0; i < n; i++) { var y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963; pts.push([Math.cos(th) * r, y, Math.sin(th) * r]); }
      var pairs = [];
      for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) {
        var dx = pts[a][0] - pts[b][0], dy = pts[a][1] - pts[b][1], dz = pts[a][2] - pts[b][2];
        if (dx * dx + dy * dy + dz * dz < (n < 200 ? 0.075 : 0.05)) pairs.push([a, b]);
      }
      var anchors = [];
      for (var k = 0; k < 6; k++) anchors.push(Math.floor((k + 0.5) * n / 6));
      G.pts = pts; G.pairs = pairs; G.anchors = anchors; G.proj = new Array(n);
    }
    var ry = t * 0.00018, rx = 0.38, cY = Math.cos(ry), sY = Math.sin(ry), cX = Math.cos(rx), sX = Math.sin(rx), P = G.proj;
    for (var i2 = 0; i2 < G.pts.length; i2++) {
      var p = G.pts[i2], x1 = p[0] * cY + p[2] * sY, z1 = -p[0] * sY + p[2] * cY, y1 = p[1] * cX - z1 * sX, z2 = p[1] * sX + z1 * cX;
      var f = 2.6 / (2.6 - z2);
      P[i2] = [cx + x1 * R * f, cy + y1 * R * f, z2];
    }
    // halo
    var g = x.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
    g.addColorStop(0, "transparent"); g.addColorStop(0.75, C.accent); g.addColorStop(1, "transparent");
    x.globalAlpha = C.light ? 0.06 : 0.09; x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * 1.25, 0, 7); x.fill();
    x.lineWidth = 1; x.strokeStyle = C.accent;
    for (var j = 0; j < G.pairs.length; j++) {
      var A = P[G.pairs[j][0]], B = P[G.pairs[j][1]], d = (A[2] + B[2]) / 2;
      x.globalAlpha = Math.max(0.03, (d + 1) * (C.light ? 0.16 : 0.2));
      x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke();
    }
    for (var m = 0; m < P.length; m++) {
      var q = P[m], dd = (q[2] + 1) / 2;
      x.globalAlpha = 0.2 + dd * 0.8; x.fillStyle = m % 9 === 0 ? C.accent2 : C.accent;
      x.beginPath(); x.arc(q[0], q[1], 0.7 + dd * 1.9, 0, 7); x.fill();
    }
    // travelling signals along random links
    x.fillStyle = C.accent3 || C.accent;
    for (var s2 = 0; s2 < 7; s2++) {
      var pr = G.pairs[(s2 * 97 + Math.floor(t / 1600) * 31) % G.pairs.length], k2 = (t / 1600) % 1;
      var A2 = P[pr[0]], B2 = P[pr[1]];
      x.globalAlpha = 0.9 * Math.sin(k2 * Math.PI) * ((A2[2] + 1) / 2);
      x.beginPath(); x.arc(A2[0] + (B2[0] - A2[0]) * k2, A2[1] + (B2[1] - A2[1]) * k2, 2.6, 0, 7); x.fill();
    }
    // orbit belt
    x.globalAlpha = C.light ? 0.25 : 0.3; x.strokeStyle = C.accent2; x.setLineDash([3, 7]);
    x.beginPath(); x.ellipse(cx, cy, R * 1.28, R * 0.42, -0.35, 0, 7); x.stroke(); x.setLineDash([]);
    x.globalAlpha = 1;
    for (var c = 0; c < G.anchors.length; c++) {
      var an = P[G.anchors[c]], dep = (an[2] + 1) / 2;
      placeChip(c, an[0], an[1], 0.78 + dep * 0.27, dep < 0.3 ? 0.12 : 0.3 + dep * 0.7, an[2] > 0 ? 3 : 1);
      ORBIT.chips[c] && (ORBIT.chips[c].style.pointerEvents = dep < 0.3 ? "none" : "");
    }
  }

  /* --- signal waves: layered sine waves with pulses travelling along them; chips ride the crests --- */
  function waves(t) {
    var mid = H / 2, amp = H * 0.15, cols = [C.accent, C.accent2, C.accent3 || C.accent];
    var wy = function (k, px, tt) { var ph = tt * 0.0011 * (1 + k * 0.18) + k * 1.3; return mid + Math.sin(px / W * Math.PI * (2 + k * 0.45) + ph) * amp * (1 - k * 0.12) * Math.sin(px / W * Math.PI) + Math.sin(px / W * 9 + ph * 1.7) * amp * 0.12; };
    for (var k = 6; k >= 0; k--) {
      x.globalAlpha = (C.light ? 0.5 : 0.62) - k * 0.075; x.strokeStyle = cols[k % 3]; x.lineWidth = k === 0 ? 2.4 : 1.2;
      x.shadowColor = cols[k % 3]; x.shadowBlur = k === 0 ? 14 : 0;
      x.beginPath();
      for (var px = 0; px <= W; px += 6) { var py = wy(k, px, t) + (k - 3) * H * 0.018; if (px === 0) x.moveTo(px, py); else x.lineTo(px, py); }
      x.stroke();
    }
    x.shadowBlur = 0;
    // vertical scan bars (equaliser feel)
    for (var b = 0; b < 26; b++) {
      var bx = (b + 0.5) * W / 26, hgt = (0.25 + 0.75 * Math.abs(Math.sin(t * 0.0016 + b * 0.7))) * H * 0.07;
      x.globalAlpha = C.light ? 0.1 : 0.12; x.fillStyle = C.accent;
      x.fillRect(bx - 1.5, H * 0.88 - hgt, 3, hgt);
    }
    // pulses on the main wave
    for (var p = 0; p < 4; p++) {
      var u = ((t * 0.00012 + p / 4) % 1), qx = u * W, qy = wy(0, qx, t) - 3 * H * 0.018;
      x.globalAlpha = Math.sin(u * Math.PI); x.fillStyle = "#fff"; x.shadowColor = C.accent; x.shadowBlur = 16;
      x.beginPath(); x.arc(qx, qy, 3.2, 0, 7); x.fill();
    }
    x.shadowBlur = 0; x.globalAlpha = 1;
    var XS = [0.12, 0.26, 0.74, 0.88, 0.5, 0.5];
    for (var c = 0; c < 6; c++) {
      var cxp = XS[c] * W, cyp;
      if (c < 4) cyp = wy(0, cxp, t) - 3 * H * 0.018 + (c % 2 ? 1 : -1) * H * 0.15;
      else cyp = c === 4 ? H * 0.2 : H * 0.8;
      placeChip(c, cxp, cyp, 1, 1, 2);
    }
  }

  /* --- cyber shield: hex grid with flickering cells, a glowing shield outline and a scan line --- */
  function shieldPath(cx, cy, s) {
    x.beginPath();
    x.moveTo(cx, cy - s);
    x.bezierCurveTo(cx + s * 0.45, cy - s * 0.78, cx + s * 0.62, cy - s * 0.74, cx + s * 0.78, cy - s * 0.76);
    x.bezierCurveTo(cx + s * 0.8, cy + s * 0.05, cx + s * 0.6, cy + s * 0.62, cx, cy + s);
    x.bezierCurveTo(cx - s * 0.6, cy + s * 0.62, cx - s * 0.8, cy + s * 0.05, cx - s * 0.78, cy - s * 0.76);
    x.bezierCurveTo(cx - s * 0.62, cy - s * 0.74, cx - s * 0.45, cy - s * 0.78, cx, cy - s);
    x.closePath();
  }
  function shield(t) {
    var cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.3, hr = Math.max(9, W / 34);
    if (!G.hex) {
      var cells = [], dx = hr * Math.sqrt(3), dy = hr * 1.5;
      for (var r = 0, yy = 0; yy < H + hr; r++, yy += dy) for (var xx = (r % 2) * dx / 2; xx < W + hr; xx += dx) cells.push([xx, yy, Math.random() * 6.28, 0]);
      G.hex = cells;
      var off = document.createElement("canvas"); off.width = W * dpr; off.height = H * dpr;
      var ox = off.getContext("2d"); ox.setTransform(dpr, 0, 0, dpr, 0, 0); ox.strokeStyle = C.accent; ox.lineWidth = 1;
      var rg = ox.createRadialGradient(cx, cy, 0, cx, cy, W * 0.62); rg.addColorStop(0, "rgba(0,0,0,1)"); rg.addColorStop(1, "rgba(0,0,0,0)");
      cells.forEach(function (c) { ox.globalAlpha = 0.12; hexPath(ox, c[0], c[1], hr * 0.92); ox.stroke(); });
      ox.globalCompositeOperation = "destination-in"; ox.globalAlpha = 1; ox.fillStyle = rg; ox.fillRect(0, 0, W, H);
      G.grid = off;
    }
    x.drawImage(G.grid, 0, 0, W, H);
    // lit cells: a ring wave travelling out from the centre plus random flicker
    var wave = (t * 0.00025) % 1, wr = wave * W * 0.7;
    x.fillStyle = C.accent;
    for (var i = 0; i < G.hex.length; i++) {
      var c2 = G.hex[i], d = Math.hypot(c2[0] - cx, c2[1] - cy), lit = Math.max(0, 1 - Math.abs(d - wr) / (hr * 2.2)) * (1 - wave);
      var fl = Math.max(0, Math.sin(t * 0.0012 + c2[2] * 7) - 0.93) * 8;
      var a = Math.max(lit * 0.32, fl * 0.18) * Math.max(0, 1 - d / (W * 0.62));
      if (a > 0.01) { x.globalAlpha = a; hexPath(x, c2[0], c2[1], hr * 0.88); x.fill(); }
    }
    // shield body
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.002);
    shieldPath(cx, cy, s);
    var fg = x.createLinearGradient(0, cy - s, 0, cy + s); fg.addColorStop(0, C.accent2); fg.addColorStop(1, C.accent);
    x.globalAlpha = C.light ? 0.1 : 0.14; x.fillStyle = fg; x.fill();
    x.globalAlpha = 0.9; x.lineWidth = 2.5; x.strokeStyle = fg; x.shadowColor = C.accent; x.shadowBlur = 12 + pulse * 18; x.stroke();
    x.shadowBlur = 0;
    shieldPath(cx, cy, s * 0.86); x.globalAlpha = 0.35; x.lineWidth = 1; x.setLineDash([4, 6]); x.lineDashOffset = -t * 0.02; x.stroke(); x.setLineDash([]);
    // scan line clipped to the shield
    x.save(); shieldPath(cx, cy, s); x.clip();
    var sy = cy - s + ((t * 0.00035) % 1) * s * 2.1;
    var sg = x.createLinearGradient(0, sy - s * 0.35, 0, sy); sg.addColorStop(0, "transparent"); sg.addColorStop(1, C.accent);
    x.globalAlpha = 0.35; x.fillStyle = sg; x.fillRect(cx - s, sy - s * 0.35, s * 2, s * 0.35);
    x.globalAlpha = 0.9; x.fillRect(cx - s, sy - 1, s * 2, 2);
    x.restore();
    // lock glyph above the number
    x.globalAlpha = 0.85; x.strokeStyle = C.accent; x.lineWidth = 2;
    var ly = cy - s * 0.5, lw = s * 0.13;
    x.beginPath(); x.arc(cx, ly - lw * 0.2, lw * 0.62, Math.PI, 0); x.stroke();
    x.strokeRect(cx - lw, ly - lw * 0.2, lw * 2, lw * 1.4);
    x.globalAlpha = 1;
  }
  function hexPath(c, hx, hy, r) {
    c.beginPath();
    for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i + Math.PI / 6; if (i) c.lineTo(hx + r * Math.cos(a), hy + r * Math.sin(a)); else c.moveTo(hx + r * Math.cos(a), hy + r * Math.sin(a)); }
    c.closePath();
  }

  /* --- threat map: dotted world map with simulated attack arcs between cities --- */
  var LAND = [
    [[-168,65],[-140,70],[-95,72],[-80,63],[-60,55],[-52,47],[-66,44],[-76,35],[-81,25],[-97,26],[-97,18],[-87,15],[-79,8],[-83,9],[-92,15],[-105,20],[-115,30],[-124,40],[-125,48],[-135,58],[-150,60],[-165,60]],
    [[-55,60],[-42,60],[-20,70],[-20,80],[-60,82],[-70,76],[-55,68]],
    [[-80,9],[-60,10],[-50,0],[-35,-6],[-40,-22],[-48,-28],[-58,-38],[-65,-55],[-72,-50],[-73,-40],[-71,-18],[-81,-5]],
    [[-10,36],[-9,43],[-2,44],[-5,48],[3,51],[8,54],[5,58],[10,63],[18,70],[30,71],[40,67],[45,55],[40,45],[28,41],[20,40],[12,38],[3,42]],
    [[-17,15],[-17,21],[-10,30],[-5,36],[10,37],[20,32],[32,31],[35,28],[43,12],[51,12],[40,-2],[40,-15],[33,-26],[20,-35],[17,-28],[12,-15],[13,-5],[9,4],[-8,4],[-15,10]],
    [[28,41],[40,45],[45,55],[40,67],[60,70],[80,73],[110,77],[140,72],[170,70],[180,65],[160,58],[142,52],[135,43],[127,35],[122,30],[121,22],[110,20],[108,12],[104,1],[100,7],[98,16],[92,22],[88,22],[80,8],[77,8],[72,20],[67,25],[57,25],[56,26],[50,30],[48,29],[52,23],[59,22],[55,17],[44,12],[38,20],[35,28],[35,36]],
    [[114,-22],[122,-18],[131,-12],[137,-12],[142,-11],[146,-19],[153,-26],[150,-37],[141,-38],[131,-31],[118,-35],[114,-30]],
    [[130,31],[136,34],[141,38],[142,44],[140,41],[133,35]], [[-5,50],[1,51],[-1,55],[-3,58],[-6,56]],
    [[95,5],[106,-6],[115,-8],[120,-9],[125,-8],[119,-3],[118,2],[109,2],[100,-1]], [[44,-25],[47,-25],[50,-15],[49,-12]], [[172,-34],[178,-38],[171,-46],[167,-46]]
  ];
  var CITIES = [[-122,37.7],[-74,40.7],[-79.4,43.7],[-46.6,-23.5],[-0.1,51.5],[8.7,50.1],[37.6,55.7],[55.3,25.2],[72.8,19],[103.8,1.3],[139.7,35.7],[151.2,-33.9],[3.4,6.5],[28,-26.2],[127,37.5],[-99,19.4]];
  function inPoly(px, py, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function map(t) {
    var mw = W * 0.96, mh = mw * 138 / 360, ox = (W - mw) / 2, oy = (H - mh) / 2;
    var P = function (lon, lat) { return [ox + (lon + 180) / 360 * mw, oy + (80 - lat) / 138 * mh]; };
    if (!G.dots) {
      var dots = [], step = Math.max(5, W / 95);
      for (var y = oy; y < oy + mh; y += step) for (var xx = ox; xx < ox + mw; xx += step) {
        var lon = (xx - ox) / mw * 360 - 180, lat = 80 - (y - oy) / mh * 138;
        for (var k = 0; k < LAND.length; k++) if (inPoly(lon, lat, LAND[k])) { dots.push([xx, y]); break; }
      }
      G.dots = dots; G.atk = []; G.next = 0; G.hits = [];
    }
    x.fillStyle = C.accent;
    x.globalAlpha = C.light ? 0.28 : 0.3;
    for (var d = 0; d < G.dots.length; d++) x.fillRect(G.dots[d][0] - 1, G.dots[d][1] - 1, 2, 2);
    // spawn simulated attacks
    if (t > G.next) {
      var a = CITIES[Math.floor(Math.random() * CITIES.length)], b = a;
      while (b === a) b = CITIES[Math.floor(Math.random() * CITIES.length)];
      G.atk.push({ a: P(a[0], a[1]), b: P(b[0], b[1]), s: t, d: 1500 + Math.random() * 900, c: [C.accent, C.accent2, C.warn || C.accent3][G.atk.length % 3] });
      G.next = t + (reduced ? 0 : 380);
      if (reduced) { for (var r0 = 0; r0 < 6; r0++) G.atk.push({ a: P(CITIES[r0][0], CITIES[r0][1]), b: P(CITIES[r0 + 7][0], CITIES[r0 + 7][1]), s: t - 900, d: 1500, c: C.accent }); }
    }
    x.lineCap = "round";
    G.atk = G.atk.filter(function (k2) {
      var u = (t - k2.s) / k2.d;
      if (u >= 1) { G.hits.push({ p: k2.b, s: t, c: k2.c }); return false; }
      var mx = (k2.a[0] + k2.b[0]) / 2, my = (k2.a[1] + k2.b[1]) / 2 - Math.hypot(k2.b[0] - k2.a[0], k2.b[1] - k2.a[1]) * 0.35;
      var q = function (v) { var w = 1 - v; return [w * w * k2.a[0] + 2 * w * v * mx + v * v * k2.b[0], w * w * k2.a[1] + 2 * w * v * my + v * v * k2.b[1]]; };
      x.strokeStyle = k2.c; x.lineWidth = 1; x.globalAlpha = 0.18;
      x.beginPath(); x.moveTo(k2.a[0], k2.a[1]); x.quadraticCurveTo(mx, my, k2.b[0], k2.b[1]); x.stroke();
      x.lineWidth = 2.2; x.globalAlpha = 0.95; x.shadowColor = k2.c; x.shadowBlur = 10;
      x.beginPath(); var st = Math.max(0, u - 0.22), p0 = q(st); x.moveTo(p0[0], p0[1]);
      for (var v = st; v <= u; v += 0.02) { var pp = q(v); x.lineTo(pp[0], pp[1]); }
      x.stroke();
      var hd = q(u); x.fillStyle = "#fff"; x.beginPath(); x.arc(hd[0], hd[1], 2.4, 0, 7); x.fill();
      x.shadowBlur = 0;
      x.globalAlpha = 0.7; x.fillStyle = k2.c; x.beginPath(); x.arc(k2.a[0], k2.a[1], 2.5, 0, 7); x.fill();
      return true;
    });
    G.hits = G.hits.filter(function (h) {
      var u = (t - h.s) / 900; if (u >= 1) return false;
      x.strokeStyle = h.c; x.lineWidth = 1.6; x.globalAlpha = 1 - u;
      x.beginPath(); x.arc(h.p[0], h.p[1], 3 + u * 16, 0, 7); x.stroke();
      return true;
    });
    // city markers
    x.globalAlpha = 0.9; x.fillStyle = C.text;
    CITIES.forEach(function (c) { var p = P(c[0], c[1]); x.beginPath(); x.arc(p[0], p[1], 1.6, 0, 7); x.fill(); });
    x.globalAlpha = 0.75; x.fillStyle = C.muted; x.font = "600 " + Math.max(9, W / 60) + "px ui-monospace,Menlo,monospace"; x.textAlign = "center";
    x.fillText("SIMULATED ATTACK TRAFFIC · ILLUSTRATIVE", W / 2, oy + mh + Math.max(18, H * 0.05));
    x.globalAlpha = 1;
    var XS = [0.2, 0.5, 0.8];
    for (var c = 0; c < 6; c++) placeChip(c, XS[c % 3] * W, c < 3 ? oy - H * 0.09 - (c === 1 ? H * 0.04 : 0) : oy + mh + H * 0.13 + (c === 4 ? H * 0.04 : 0), 1, 1, 2);
  }

  /* --- network topology: core router, category hubs, devices; packets flow along the links --- */
  function bx(p) { return (p + 6) / 112 * W; }
  function topology(t) {
    var cx = W / 2, cy = H / 2;
    if (!G.nodes) {
      var hubs = [], devs = [], links = [];
      ORBIT_ANGLES.forEach(function (a, i) {
        var r = a * Math.PI / 180;
        hubs.push([bx(50 + 41 * Math.cos(r)), bx(50 + 41 * Math.sin(r))]);
        [-17, 17].forEach(function (o, j) {
          var r2 = (a + o) * Math.PI / 180, dv = [bx(50 + 26 * Math.cos(r2)), bx(50 + 26 * Math.sin(r2)), (i + j) % 3];
          devs.push(dv);
          links.push([[cx, cy], dv, 0]); links.push([dv, hubs[i], 1]);
        });
      });
      for (var i2 = 0; i2 < hubs.length; i2++) links.push([hubs[i2], hubs[(i2 + 1) % hubs.length], 2]);
      G.nodes = { hubs: hubs, devs: devs }; G.links = links;
      G.pk = []; for (var k = 0; k < 16; k++) G.pk.push({ l: Math.floor(Math.random() * links.length), o: Math.random(), sp: 0.00035 + Math.random() * 0.0004, dir: Math.random() < 0.5 ? 1 : -1 });
    }
    // links
    G.links.forEach(function (L) {
      x.strokeStyle = L[2] === 2 ? C.accent2 : C.accent; x.globalAlpha = L[2] === 2 ? 0.22 : 0.3; x.lineWidth = L[2] === 0 ? 1.4 : 1;
      if (L[2] === 2) x.setLineDash([3, 6]);
      x.beginPath(); x.moveTo(L[0][0], L[0][1]); x.lineTo(L[1][0], L[1][1]); x.stroke(); x.setLineDash([]);
    });
    // packets
    G.pk.forEach(function (p, i) {
      var u = (p.o + t * p.sp) % 1; if (p.dir < 0) u = 1 - u;
      var L = G.links[p.l], px = L[0][0] + (L[1][0] - L[0][0]) * u, py = L[0][1] + (L[1][1] - L[0][1]) * u;
      x.globalAlpha = 0.95; x.fillStyle = i % 4 === 0 ? (C.warn || C.accent2) : C.accent; x.shadowColor = x.fillStyle; x.shadowBlur = 10;
      x.beginPath(); x.arc(px, py, 2.6, 0, 7); x.fill(); x.shadowBlur = 0;
      if ((p.o + t * p.sp) % 1 < 0.004) p.l = Math.floor(Math.random() * G.links.length);
    });
    // devices: server / firewall / laptop glyphs
    var s = Math.max(14, W / 30);
    G.nodes.devs.forEach(function (d, i) {
      var glow = 0.5 + 0.5 * Math.sin(t * 0.003 + i);
      x.globalAlpha = 1; x.fillStyle = C.light ? "#fff" : "#0b1220"; x.strokeStyle = C.accent; x.lineWidth = 1.3;
      x.shadowColor = C.accent; x.shadowBlur = 6 + glow * 10;
      x.beginPath(); x.roundRect ? x.roundRect(d[0] - s / 2, d[1] - s / 2, s, s, 4) : x.rect(d[0] - s / 2, d[1] - s / 2, s, s); x.fill(); x.stroke(); x.shadowBlur = 0;
      x.globalAlpha = 0.9; x.beginPath();
      if (d[2] === 0) { for (var r = -1; r <= 1; r++) { x.moveTo(d[0] - s * 0.28, d[1] + r * s * 0.2); x.lineTo(d[0] + s * 0.28, d[1] + r * s * 0.2); } }
      else if (d[2] === 1) { x.moveTo(d[0], d[1] - s * 0.3); x.lineTo(d[0] + s * 0.25, d[1] - s * 0.18); x.lineTo(d[0] + s * 0.2, d[1] + s * 0.12); x.lineTo(d[0], d[1] + s * 0.3); x.lineTo(d[0] - s * 0.2, d[1] + s * 0.12); x.lineTo(d[0] - s * 0.25, d[1] - s * 0.18); x.closePath(); }
      else { x.rect(d[0] - s * 0.28, d[1] - s * 0.22, s * 0.56, s * 0.34); x.moveTo(d[0] - s * 0.34, d[1] + s * 0.24); x.lineTo(d[0] + s * 0.34, d[1] + s * 0.24); }
      x.stroke();
    });
    x.globalAlpha = 1;
    G.nodes.hubs.forEach(function (h, i) { placeChip(i, h[0], h[1], 1, 1, 3); });
  }

  /* --- tool constellation: real tool icons on tilted orbits, linked when close --- */
  function constellation(t) {
    var cx = W / 2, cy = H / 2, stars = ORBIT.stars || [];
    var pos = [];
    stars.forEach(function (st, i) {
      var ring = i % 3, R = [0.42, 0.32, 0.22][ring] * W, tilt = [0.5, 0.62, 0.75][ring], sp = [0.00006, -0.00009, 0.00013][ring];
      var a = st.a + t * sp, px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R * tilt, z = Math.sin(a);
      pos.push([px, py, z]);
      var bxp = toBox(px, py), sc = 0.78 + (z + 1) * 0.16;
      st.el.style.transform = "translate(" + (bxp[0] / 100 * ORBIT.box) + "px," + (bxp[1] / 100 * ORBIT.box) + "px) scale(" + sc.toFixed(3) + ")";
      st.el.style.opacity = (0.45 + (z + 1) * 0.275).toFixed(2);
      st.el.style.zIndex = z > 0 ? 3 : 1;
    });
    [0.42, 0.32, 0.22].forEach(function (r, i) {
      x.globalAlpha = 0.18; x.strokeStyle = i === 1 ? C.accent2 : C.accent; x.lineWidth = 1; x.setLineDash([2, 6]);
      x.beginPath(); x.ellipse(cx, cy, r * W, r * W * [0.5, 0.62, 0.75][i], 0, 0, 7); x.stroke(); x.setLineDash([]);
    });
    x.strokeStyle = C.accent; x.lineWidth = 1;
    for (var i = 0; i < pos.length; i++) for (var j = i + 1; j < pos.length; j++) {
      var dd = Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]);
      if (dd < W * 0.2) { x.globalAlpha = (1 - dd / (W * 0.2)) * 0.45; x.beginPath(); x.moveTo(pos[i][0], pos[i][1]); x.lineTo(pos[j][0], pos[j][1]); x.stroke(); }
    }
    // twinkling background stars
    if (!G.tw) { G.tw = []; for (var k = 0; k < 60; k++) G.tw.push([Math.random() * W, Math.random() * H, Math.random() * 6]); }
    x.fillStyle = C.text;
    G.tw.forEach(function (p) { x.globalAlpha = 0.15 + 0.35 * Math.abs(Math.sin(t * 0.001 + p[2])); x.fillRect(p[0], p[1], 1.5, 1.5); });
    x.globalAlpha = 1;
  }

  var DRAW = { globe: globe, waves: waves, shield: shield, map: map, topology: topology, constellation: constellation };
  function frame(now) {
    raf = 0;
    if (!DRAW[mode]) return;
    if (!t0) t0 = now;
    x.clearRect(0, 0, W, H);
    DRAW[mode](reduced ? 4000 : now - t0);
    if (!reduced && vis) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && DRAW[mode]) raf = requestAnimationFrame(frame); }
  var ro = window.ResizeObserver ? new ResizeObserver(function () { if (DRAW[mode]) { size(); kick(); } }) : null;
  if (ro) ro.observe(cv); else addEventListener("resize", function () { size(); kick(); });
  return {
    start: function (m) {
      if (!x) return;
      mode = m; G = {};
      TERM.stop(); BLIPS.stop(); STARS.clear();
      if (m === "terminal") TERM.start();
      if (m === "radar") BLIPS.start();
      if (m === "constellation") STARS.build();
      if (!DRAW[m]) { resetChips(); x.clearRect(0, 0, W, H); return; }
      readColors(); size(); kick();
    },
    stop: function () { mode = ""; resetChips(); TERM.stop(); BLIPS.stop(); STARS.clear(); },
    visible: function (v) { vis = v; if (v) kick(); TERM.visible(v); BLIPS.visible(v); },
    recolor: function () { if (DRAW[mode]) { readColors(); G = {}; kick(); } },
  };
})();

/* Radar blips: tool names that flash up where the sweep passes. */
var BLIPS = (function () {
  var timer = 0, on = false, vis = true, box = $("oBlips");
  function tick() {
    timer = 0;
    if (!on) return;
    if (vis && DB && DB.items.length && box.childNodes.length < 6) {
      var sw = document.querySelector(".o-sweep"), an = sw && sw.getAnimations ? sw.getAnimations()[0] : null;
      var deg = an && an.currentTime != null ? (an.currentTime % 9000) / 9000 * 360 : Math.random() * 360;
      var a = (deg - 12 - 90) * Math.PI / 180, r = 22 + Math.random() * 18;
      var it = DB.items[Math.floor(Math.random() * DB.items.length)];
      var b = document.createElement("span"); b.className = "o-blip";
      b.style.left = (50 + r * Math.cos(a)) + "%"; b.style.top = (50 + r * Math.sin(a)) + "%";
      var i = document.createElement("i"), em = document.createElement("em"); em.textContent = it.name;
      b.appendChild(i); b.appendChild(em); box.appendChild(b);
      setTimeout(function () { b.remove(); }, 2900);
    }
    timer = setTimeout(tick, 1100);
  }
  return {
    start: function () { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; on = true; if (!timer) timer = setTimeout(tick, 600); },
    stop: function () { on = false; clearTimeout(timer); timer = 0; box.textContent = ""; },
    visible: function (v) { vis = v; },
  };
})();

/* Live terminal: types catalog queries and prints real results; result links filter the list. */
var TERM = (function () {
  var body = $("oTermBody"), timer = 0, on = false, vis = true, queue = [], qi = 0;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function script() {
    var cats = DB.cats.slice().sort(function (a, b) { return b.count - a.count; });
    var free = DB.items.filter(function (i) { return i.free; }).length;
    var lin = DB.items.filter(function (i) { return i.free && i.os.indexOf("Linux") >= 0; }).length;
    var out = [{ cmd: "cst stats", out: [[DB.items.length + " entries · " + DB.cats.length + " categories · " + free + " free/OSS", "ok"]] }];
    cats.slice(0, 10).forEach(function (c, i) {
      var names = DB.items.filter(function (it) { return it.cat === c; }).slice(0, 3).map(function (it) { return it.name; });
      out.push({ cmd: 'cst search --category "' + c.slug + '"', out: [["✓ " + c.count + " results", "ok"], [names.join(", ") + (c.count > 3 ? " …" : ""), "dim"], ["→ ", "p", c]] });
      if (i === 2) out.push({ cmd: "cst search --free --os linux", out: [["✓ " + lin + " free tools run on Linux", "ok"]] });
      if (i === 5) out.push({ cmd: "cst verify --links", out: [["✓ all entries reachable · TLS ok", "ok"], ["! use only on systems you are authorised to test", "wn"]] });
    });
    return out;
  }
  function line(cls) { var d = document.createElement("div"); if (cls) d.className = cls; body.appendChild(d); while (body.childNodes.length > 16) body.removeChild(body.firstChild); return d; }
  function printOut(o) {
    o.out.forEach(function (r) {
      var d = line(r[1]);
      if (r[2]) { d.appendChild(document.createTextNode(r[0])); var b = document.createElement("button"); b.type = "button"; b.dataset.c = r[2].slug; b.textContent = "open " + r[2].title; d.appendChild(b); }
      else d.textContent = r[0];
    });
  }
  function run() {
    timer = 0;
    if (!on) return;
    if (!vis) { timer = setTimeout(run, 500); return; }
    var o = queue[qi % queue.length]; qi++;
    var d = line(), p = document.createElement("span"); p.className = "p"; p.textContent = "$ "; d.appendChild(p);
    var tx = document.createTextNode(""), cur = document.createElement("span"); cur.className = "cur";
    d.appendChild(tx); d.appendChild(cur);
    var k = 0;
    (function type() {
      if (!on) return;
      if (k < o.cmd.length) { tx.data += o.cmd[k++]; timer = setTimeout(type, 28 + Math.random() * 45); return; }
      cur.remove();
      timer = setTimeout(function () { printOut(o); timer = setTimeout(run, 1500); }, 260);
    })();
  }
  body.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-c]"); if (!b) return;
    S.cat = b.dataset.c; S.kind = ""; render();
    scrollTo({ top: results.getBoundingClientRect().top + scrollY - 210 });
  });
  return {
    start: function () {
      if (!DB) return;
      on = true; queue = script(); qi = 0; body.textContent = "";
      line("dim").textContent = "Sajins Cybersecurity Tools · catalog shell";
      var pre = reduced ? 3 : 2;
      queue.slice(0, pre).forEach(function (o) { var d = line(), p = document.createElement("span"); p.className = "p"; p.textContent = "$ "; d.appendChild(p); d.appendChild(document.createTextNode(o.cmd)); printOut(o); });
      qi = pre;
      if (reduced) return;
      timer = setTimeout(run, 700);
    },
    stop: function () { on = false; clearTimeout(timer); timer = 0; },
    visible: function (v) { vis = v; },
  };
})();

/* Tool constellation: icon tiles for a spread of real tools; click searches for the tool. */
var STARS = (function () {
  var box = $("oStars");
  box.addEventListener("click", function (e) {
    var b = e.target.closest(".o-star"); if (!b) return;
    qEl.value = b.dataset.q; S.q = b.dataset.q; render();
    scrollTo({ top: results.getBoundingClientRect().top + scrollY - 210 });
  });
  box.addEventListener("error", function (e) {
    var img = e.target; if (img.tagName !== "IMG") return;
    var b = img.parentNode; img.remove(); b.insertBefore(document.createTextNode(b.dataset.q.charAt(0).toUpperCase()), b.firstChild);
  }, true);
  return {
    build: function () {
      box.textContent = ""; ORBIT.stars = [];
      if (!DB) return;
      var picks = [], seen = {};
      for (var round = 0; picks.length < 18 && round < 6; round++) DB.cats.forEach(function (c) {
        if (picks.length >= 18) return;
        var it = DB.items.filter(function (i) { return i.cat === c && i.host && !seen[i.id]; })[round];
        if (it) { seen[it.id] = 1; picks.push(it); }
      });
      picks.forEach(function (it, i) {
        var b = document.createElement("button"); b.type = "button"; b.className = "o-star"; b.dataset.q = it.name;
        b.setAttribute("aria-label", "Search for " + it.name);
        if (SET.showFavicons !== false) { var img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.src = "https://icons.duckduckgo.com/ip3/" + it.host + ".ico"; b.appendChild(img); }
        else b.appendChild(document.createTextNode(it.name.charAt(0).toUpperCase()));
        var sp = document.createElement("span"); sp.textContent = it.name; b.appendChild(sp);
        box.appendChild(b);
        ORBIT.stars.push({ el: b, a: Math.floor(i / 3) / Math.ceil(picks.length / 3) * Math.PI * 2 + (i % 3) * 0.55 });
      });
    },
    clear: function () { box.textContent = ""; ORBIT.stars = []; },
  };
})();

/* ---------------- footer ---------------- */
var SOCIAL_ICON = { web: "i-globe", github: "i-gh" };
function linkOk(u) { return typeof u === "string" && (/^https?:\/\//i.test(u) || /^mailto:/i.test(u) || /^\/(?!\/)/.test(u) || /^#/.test(u)) ? u : ""; }
function mkLink(label, url, cls) {
  var a = document.createElement("a");
  a.textContent = label || url;
  if (cls) a.className = cls;
  var u = linkOk(url);
  if (u) {
    a.href = u;
    if (/^https?:/i.test(u) && hostOf(u) !== location.hostname) { a.target = "_blank"; a.rel = "noopener"; }
  }
  return a;
}
/** Text with [label](url) links, built with DOM nodes (no HTML injection). */
function richText(el, text) {
  el.textContent = "";
  String(text || "").replace(/\{year\}/g, String(new Date().getFullYear())).split(/(\[[^\]]+\]\([^)\s]+\))/).forEach(function (part) {
    var m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (m && linkOk(m[2])) el.appendChild(mkLink(m[1], m[2]));
    else if (part) el.appendChild(document.createTextNode(m ? m[1] : part));
  });
}
var FOOT = {};
function renderFooter(f) {
  f = f || {};
  FOOT = f;
  var foot = $("siteFoot");
  foot.hidden = f.enabled === false;
  foot.setAttribute("data-style", f.style || "card");
  $("fBrand").textContent = f.brand || "";
  $("fBrand").hidden = !f.brand;
  $("fAbout").textContent = f.about || "";
  $("fAbout").hidden = !f.about;
  var so = $("fSocial"); so.textContent = "";
  (f.social || []).forEach(function (x) {
    if (!linkOk(x.url)) return;
    var a = mkLink("", x.url);
    a.textContent = "";
    var name = x.label || x.type;
    a.setAttribute("aria-label", name); a.title = name;
    a.innerHTML = '<svg aria-hidden="true"><use href="' + ICONS + esc(SOCIAL_ICON[x.type] || "s-" + (x.type || "link")) + '"/></svg>';
    so.appendChild(a);
  });
  so.hidden = !so.childNodes.length;
  var hasBrand = !!(f.brand || f.about || so.childNodes.length);
  var cols = $("fCols"); cols.textContent = "";
  (f.columns || []).forEach(function (c) {
    var links = (c.links || []).filter(function (l) { return l.label || l.url; });
    if (!c.title && !links.length) return;
    var d = document.createElement("div"); d.className = "fcol";
    if (c.title) { var h = document.createElement("h4"); h.textContent = c.title; d.appendChild(h); }
    var ul = document.createElement("ul");
    links.forEach(function (l) { var li = document.createElement("li"); li.appendChild(mkLink(l.label, l.url)); ul.appendChild(li); });
    d.appendChild(ul); cols.appendChild(d);
  });
  cols.hidden = !cols.childNodes.length;
  var sub = f.subscribe || {}, subOn = sub.mode === "local" || (sub.mode === "link" && sub.url);
  var form = $("fSub");
  form.hidden = !subOn;
  $("fSubTitle").textContent = sub.title || ""; $("fSubTitle").hidden = !sub.title;
  $("fSubEmail").placeholder = sub.placeholder || "Your email";
  $("fSubBtn").textContent = sub.button || "Subscribe";
  var grid = $("fGrid");
  grid.hidden = !hasBrand && cols.hidden && !subOn;
  grid.querySelector(".fbrand").hidden = !hasBrand;
  grid.classList.toggle("nosub", !subOn);
  grid.classList.toggle("nocols", cols.hidden);
  richText($("fCopy"), f.copyright); $("fCopy").hidden = !f.copyright;
  richText($("fNote"), f.note); $("fNote").hidden = !f.note;
  $("fDl").hidden = f.showDownloads === false;
  $("synced").hidden = f.showUpdated === false;
  $("fLegend").hidden = f.showLegend === false;
  var bl = $("fLinks"); bl.textContent = "";
  (f.bottomLinks || []).forEach(function (l) { if (l.label || l.url) bl.appendChild(mkLink(l.label, l.url)); });
  bl.hidden = !bl.childNodes.length;
  foot.querySelector(".fbottom").classList.toggle("solo", grid.hidden);
}
function initSubscribe() {
  var form = $("fSub"), msg = $("fSubMsg"), btn = $("fSubBtn"), inp = $("fSubEmail");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var sub = FOOT.subscribe || {}, email = inp.value.trim();
    msg.className = "fsubmsg"; msg.textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.className = "fsubmsg bad"; msg.textContent = "Please enter a valid email address."; inp.focus(); return; }
    if (sub.mode === "link" && linkOk(sub.url)) {
      window.open(sub.url.replace(/\{email\}/g, encodeURIComponent(email)), "_blank", "noopener");
      return;
    }
    if (new URLSearchParams(location.search).has("preview")) { msg.className = "fsubmsg ok"; msg.textContent = sub.success || "Subscribed (preview — nothing was saved)."; return; }
    btn.disabled = true;
    fetch("/api/subscribe", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Requested-With": "cst-admin" }, body: JSON.stringify({ email: email, company: $("fSubHp").value }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (r.ok) { msg.className = "fsubmsg ok"; msg.textContent = sub.success || "Thanks for subscribing!"; inp.value = ""; }
        else { msg.className = "fsubmsg bad"; msg.textContent = (r.d && r.d.error) || "Something went wrong. Please try again."; }
      })
      .catch(function () { msg.className = "fsubmsg bad"; msg.textContent = "Network error. Please try again."; })
      .then(function () { btn.disabled = false; });
  });
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
    ["preview", "theme", "hero"].forEach(function (k) { if (cur.has(k)) p.set(k, cur.get(k)); });
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
  if (typeof HV !== "undefined") setTimeout(HV.recolor, 30);
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
  if (s.footer) renderFooter(s.footer);
  if (s.heroFx) setOrbit(s.heroFx);
  if (e.data.scrollFooter) {
    var n = 0, toEnd = function () { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); if (++n < 4) requestAnimationFrame(toEnd); };
    toEnd();
  }
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
  initSubscribe();
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
