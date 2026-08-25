/* ECONOMY: FROM ZERO — stylized fictional country map (SVG)
   Top-down "economic command map": clean terrain, organized DISTRICTS,
   glowing flow-roads. Buildings fill tidy grids per district so the map
   reads as a coherent, growing nation — not scattered noise.
*/
(function (global) {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, txt) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (txt != null) n.textContent = txt;
    return n;
  };
  const VB_W = 1000, VB_H = 640;

  // Districts: each kind of building drops into an organized grid cluster.
  // ox,oy = top-left of the grid; cols; dx,dy = tile spacing.
  const DISTRICTS = {
    farm:   { ox: 150, oy: 430, cols: 5, dx: 46, dy: 40, label: "AGRICULTURAL BELT", lx: 210, ly: 585 },
    civic:  { ox: 430, oy: 300, cols: 4, dx: 44, dy: 42, label: "CIVIC CENTER",      lx: 470, ly: 270 },
    factory:{ ox: 610, oy: 400, cols: 4, dx: 46, dy: 42, label: "INDUSTRIAL ZONE",   lx: 660, ly: 500 },
    power:  { ox: 780, oy: 470, cols: 3, dx: 44, dy: 42 },
    tech:   { ox: 640, oy: 200, cols: 4, dx: 46, dy: 42, label: "TECH DISTRICT",     lx: 700, ly: 175 },
    port:   { ox: 890, oy: 320, cols: 2, dx: 42, dy: 46, label: "PORT",              lx: 905, ly: 300 },
    road:   null, // roads handled separately
    rail:   null
  };
  const CENTER = { x: 470, y: 340 }; // the founding settlement / hub

  function build(container) {
    container.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${VB_W} ${VB_H}`, class: "map-svg", preserveAspectRatio: "xMidYMid meet" });

    const defs = el("defs");
    defs.innerHTML = `
      <radialGradient id="bgGlow" cx="46%" cy="40%" r="75%">
        <stop offset="0%" stop-color="#101c2b"/><stop offset="60%" stop-color="#0a121d"/><stop offset="100%" stop-color="#070c14"/>
      </radialGradient>
      <linearGradient id="landG" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="#16241c"/><stop offset="55%" stop-color="#101d18"/><stop offset="100%" stop-color="#0c1712"/>
      </linearGradient>
      <linearGradient id="seaG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0d2c44"/><stop offset="100%" stop-color="#081a2a"/>
      </linearGradient>
      <linearGradient id="hillG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a3a4f"/><stop offset="100%" stop-color="#141f2c"/>
      </linearGradient>
      <radialGradient id="riverGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#4fb8ff" stop-opacity="0.5"/><stop offset="100%" stop-color="#4fb8ff" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
      <filter id="glow2" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="vig" cx="50%" cy="46%" r="62%">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="78%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
      </radialGradient>`;
    svg.appendChild(defs);

    svg.appendChild(el("rect", { x: 0, y: 0, width: VB_W, height: VB_H, fill: "url(#bgGlow)" }));
    svg.appendChild(el("rect", { x: 0, y: 0, width: VB_W, height: VB_H, fill: "url(#seaG)", opacity: "0.9" }));

    // faint contour grid (isolines) for a "surveyed terrain" feel
    const grid = el("g", { opacity: "0.05", stroke: "#4aa3ff", "stroke-width": "1", fill: "none" });
    for (let r = 60; r < 900; r += 70) grid.appendChild(el("circle", { cx: CENTER.x, cy: CENTER.y, r }));
    svg.appendChild(grid);

    // landmass with a soft shadow for elevation
    const landPath = "M120,150 C220,90 360,110 470,120 C600,95 720,120 830,170 C905,215 930,300 905,395 C875,505 760,560 620,565 C470,575 300,560 200,505 C110,455 95,360 100,275 C104,220 108,185 120,150 Z";
    svg.appendChild(el("path", { d: landPath, fill: "#050a10", opacity: "0.6", transform: "translate(6,10)", filter: "url(#soft)" }));
    svg.appendChild(el("path", { d: landPath, fill: "url(#landG)", stroke: "#20402f", "stroke-width": "2" }));
    // subtle coastline inner glow
    svg.appendChild(el("path", { d: landPath, fill: "none", stroke: "#2f6d9c", "stroke-width": "1", opacity: "0.35" }));

    // hills / mountains (upper inland) — stacked, shaded
    const hills = el("g", {});
    [[560, 165, 60], [615, 150, 74], [675, 170, 58], [520, 175, 46]].forEach(([x, y, w]) => {
      hills.appendChild(el("path", { d: `M${x - w / 2},${y + w * 0.55} Q${x - w * 0.15},${y - w * 0.5} ${x},${y - w * 0.55} Q${x + w * 0.2},${y - w * 0.5} ${x + w / 2},${y + w * 0.55} Z`, fill: "url(#hillG)", stroke: "#33465e", "stroke-width": "1" }));
      hills.appendChild(el("path", { d: `M${x},${y - w * 0.55} Q${x + w * 0.2},${y - w * 0.5} ${x + w / 2},${y + w * 0.55} L${x},${y + w * 0.2} Z`, fill: "#0f1826", opacity: "0.5" }));
    });
    svg.appendChild(hills);

    // river with glow, flowing from hills to coast
    const riverD = "M600,150 C560,230 520,270 500,330 C480,390 430,430 360,470 C300,505 250,520 200,520";
    svg.appendChild(el("path", { d: riverD, fill: "none", stroke: "url(#riverGlow)", "stroke-width": "16", opacity: "0.6" }));
    svg.appendChild(el("path", { d: riverD, fill: "none", stroke: "#3f8fc4", "stroke-width": "5", "stroke-linecap": "round", opacity: "0.75" }));
    svg.appendChild(el("path", { d: riverD, fill: "none", stroke: "#7fd1ff", "stroke-width": "1.5", "stroke-linecap": "round", opacity: "0.5" }));

    // forest — clustered stylized canopy blobs (organized, not scattered noise)
    const forest = el("g", {});
    [[250, 380], [285, 400], [220, 405], [255, 425], [300, 385]].forEach(([x, y], i) => {
      forest.appendChild(el("circle", { cx: x, cy: y, r: 15 + (i % 3) * 3, fill: "#183726", opacity: "0.75" }));
      forest.appendChild(el("circle", { cx: x - 4, cy: y - 4, r: 6, fill: "#1f4a31", opacity: "0.6" }));
    });
    svg.appendChild(forest);

    // mineral deposits near hills
    const min = el("g", {});
    [[590, 200], [630, 210], [610, 225]].forEach(([x, y]) => {
      min.appendChild(el("circle", { cx: x, cy: y, r: 4, fill: "#d8b048", opacity: "0.85", filter: "url(#glow2)" }));
    });
    svg.appendChild(min);

    // layers (draw order matters)
    const roadsLayer = el("g", { class: "layer-roads" });
    const flowLayer = el("g", { class: "layer-flow" });     // glowing traffic flow
    const labelLayer = el("g", { class: "layer-labels" });
    const bldgLayer = el("g", { class: "layer-bldg" });
    const lightsLayer = el("g", { class: "layer-lights" });
    svg.appendChild(roadsLayer); svg.appendChild(flowLayer);
    svg.appendChild(labelLayer); svg.appendChild(bldgLayer); svg.appendChild(lightsLayer);

    // founding settlement hub — a glowing node
    const hub = el("g", { transform: `translate(${CENTER.x},${CENTER.y})` });
    hub.appendChild(el("circle", { r: 26, fill: "#e7c66a", opacity: "0.10", filter: "url(#soft)" }));
    hub.appendChild(el("circle", { r: 9, fill: "none", stroke: "#e7c66a", "stroke-width": "1.5", opacity: "0.7" }));
    hub.appendChild(el("circle", { r: 4, fill: "#f0d488", filter: "url(#glow2)" }));
    bldgLayer.appendChild(hub);

    // vignette on top
    svg.appendChild(el("rect", { x: 0, y: 0, width: VB_W, height: VB_H, fill: "url(#vig)", "pointer-events": "none" }));

    container.appendChild(svg);
    return { svg, roadsLayer, flowLayer, labelLayer, bldgLayer, lightsLayer, counts: {}, _built: {}, shownLabels: {} };
  }

  // building visual palette (top-down glowing tiles)
  const STYLE = {
    farm:   { c: "#4fae5e", c2: "#2f7d3f", glyph: "🌾", h: 3 },
    civic:  { c: "#4aa3ff", c2: "#2166b8", glyph: "🎓", h: 8 },
    factory:{ c: "#c98a52", c2: "#8a5a32", glyph: "🏭", h: 7 },
    power:  { c: "#e0b64b", c2: "#a07f2b", glyph: "⚡", h: 6 },
    tech:   { c: "#a06bff", c2: "#6b3fc0", glyph: "◈", h: 10 },
    port:   { c: "#2fd6a6", c2: "#1c8a6c", glyph: "⚓", h: 6 },
  };

  function tilePos(m, kind) {
    const d = DISTRICTS[kind];
    const i = m.counts[kind] || 0;
    m.counts[kind] = i + 1;
    const col = i % d.cols;
    const row = Math.floor(i / d.cols);
    return { x: d.ox + col * d.dx, y: d.oy + row * d.dy, i };
  }

  function districtLabel(m, kind) {
    const d = DISTRICTS[kind];
    if (!d || !d.label || m.shownLabels[kind]) return;
    m.shownLabels[kind] = true;
    const g = el("g", { class: "dist-label", opacity: "0" });
    g.appendChild(el("text", { x: d.lx, y: d.ly, "text-anchor": "middle", class: "dist-label-t" }, d.label));
    m.labelLayer.appendChild(g);
    requestAnimationFrame(() => g.setAttribute("opacity", "1"));
  }

  function addBuilding(m, kind, animate) {
    if (kind === "road") return drawRoad(m, animate);
    if (kind === "rail") return drawRail(m, animate);
    const style = STYLE[kind] || STYLE.civic;
    const { x, y } = tilePos(m, kind);
    districtLabel(m, kind);

    const g = el("g", { transform: `translate(${x},${y})`, class: "tile" + (animate ? " pop" : "") });
    // ground shadow
    g.appendChild(el("ellipse", { cx: 2, cy: 8, rx: 15, ry: 6, fill: "#000", opacity: "0.35", filter: "url(#soft)" }));
    // base plate
    g.appendChild(el("rect", { x: -14, y: -14, width: 28, height: 28, rx: 7, fill: style.c2, opacity: "0.9" }));
    // top face (slightly inset, brighter)
    g.appendChild(el("rect", { x: -11, y: -14 - style.h, width: 22, height: 22, rx: 5, fill: style.c, opacity: "0.96" }));
    // side face for depth
    g.appendChild(el("path", { d: `M-11,${8 - style.h} L-11,8 L11,8 L11,${8 - style.h} Z`, fill: style.c2, opacity: "0.7" }));
    // top highlight
    g.appendChild(el("rect", { x: -11, y: -14 - style.h, width: 22, height: 6, rx: 3, fill: "#fff", opacity: "0.14" }));
    // glyph
    const t = el("text", { x: 0, y: -1 - style.h, "text-anchor": "middle", class: "tile-glyph" }, style.glyph);
    g.appendChild(t);
    // glow aura
    g.appendChild(el("circle", { cx: 0, cy: -3 - style.h, r: 3, fill: style.c, filter: "url(#glow2)", opacity: "0.9" }));
    m.bldgLayer.appendChild(g);

    // connector road from hub to this district (once per district)
    connectDistrict(m, kind);
    // city light
    m.lightsLayer.appendChild(el("circle", { cx: x, cy: y - style.h, r: 1.6, fill: "#ffe9a8", opacity: "0.55", class: "citylight" }));
  }

  function connectDistrict(m, kind) {
    const d = DISTRICTS[kind];
    if (!d || m["_conn_" + kind]) return;
    m["_conn_" + kind] = true;
    const tx = d.ox + (d.cols - 1) * d.dx / 2, ty = d.oy;
    const dpath = `M${CENTER.x},${CENTER.y} C${(CENTER.x + tx) / 2},${CENTER.y} ${(CENTER.x + tx) / 2},${ty} ${tx},${ty}`;
    m.roadsLayer.appendChild(el("path", { d: dpath, fill: "none", stroke: "#33445c", "stroke-width": "3", "stroke-linecap": "round", opacity: "0.5", class: "road-base" }));
    // glowing flow line (animated dash)
    m.flowLayer.appendChild(el("path", { d: dpath, fill: "none", stroke: "#4fb8ff", "stroke-width": "2", "stroke-linecap": "round", opacity: "0.55", class: "road-flow", "stroke-dasharray": "3 16" }));
  }

  function drawRoad(m, animate) {
    // roads upgrade every existing connector: brighten + add a second flow lane
    m.roadsLayer.querySelectorAll(".road-base").forEach(p => { p.setAttribute("stroke", "#48607e"); p.setAttribute("stroke-width", "4"); p.setAttribute("opacity", "0.7"); });
    m.flowLayer.querySelectorAll(".road-flow").forEach(p => p.setAttribute("opacity", "0.85"));
    // small counter so build tracking is happy
    m.counts.road = (m.counts.road || 0) + 1;
  }
  function drawRail(m, animate) {
    m.counts.rail = (m.counts.rail || 0) + 1;
    // a rail spine from agricultural belt through center to industrial zone
    if (m._rail) return;
    m._rail = true;
    const d = "M200,520 C320,470 400,430 470,340 C540,410 590,400 660,400";
    m.roadsLayer.appendChild(el("path", { d, fill: "none", stroke: "#8a97a8", "stroke-width": "2.2", "stroke-dasharray": "2 5", opacity: "0.7" }));
    m.flowLayer.appendChild(el("path", { d, fill: "none", stroke: "#dfe8f2", "stroke-width": "2.4", "stroke-linecap": "round", opacity: "0.8", class: "rail-flow", "stroke-dasharray": "10 30" }));
  }

  // rebuild map to match full inventory (load / restore)
  function sync(m, buildings, buildingDefs) {
    for (const b of buildingDefs) {
      const n = buildings[b.id] || 0;
      const have = m._built[b.id] || 0;
      for (let k = have; k < n; k++) addBuilding(m, b.mapKind, false);
    }
    m._built = Object.assign({}, buildings);
  }

  global.GameMap = { build, addBuilding, sync };
})(window);
