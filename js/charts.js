/* ECONOMY: FROM ZERO — live charts (real-time economy readouts)
   Lightweight SVG line/area/sparkline + stacked sector bar. Redrawn each tick.
*/
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const el = (t, a, txt) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; return n; };

  // build an area/line chart shell; returns update(series) fn
  function areaChart(container, opts) {
    opts = opts || {};
    const W = 100, H = 42;
    container.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", preserveAspectRatio: "none" });
    const defs = el("defs");
    const gid = "ag_" + Math.random().toString(36).slice(2, 7);
    defs.innerHTML = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${opts.color || '#38d6ff'}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${opts.color || '#38d6ff'}" stop-opacity="0"/></linearGradient>`;
    svg.appendChild(defs);
    const area = el("path", { fill: `url(#${gid})`, stroke: "none" });
    const line = el("path", { fill: "none", stroke: opts.color || "#38d6ff", "stroke-width": "1.1", "stroke-linejoin": "round", "stroke-linecap": "round", class: "chart-line" });
    const dot = el("circle", { r: "1.4", fill: opts.color || "#38d6ff", class: "chart-dot" });
    svg.appendChild(area); svg.appendChild(line); svg.appendChild(dot);
    container.appendChild(svg);
    return function update(series) {
      if (!series || series.length < 2) return;
      const n = series.length;
      let lo = Math.min(...series), hi = Math.max(...series);
      if (opts.zeroBase) lo = Math.min(lo, 0);
      if (hi - lo < 1e-6) hi = lo + 1;
      const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
      const xs = i => (i / (n - 1)) * W;
      const ys = v => H - ((v - lo) / (hi - lo)) * H;
      let d = "";
      series.forEach((v, i) => { d += (i ? "L" : "M") + xs(i).toFixed(2) + "," + ys(v).toFixed(2); });
      line.setAttribute("d", d);
      area.setAttribute("d", d + `L${W},${H}L0,${H}Z`);
      dot.setAttribute("cx", W); dot.setAttribute("cy", ys(series[n - 1]).toFixed(2));
    };
  }

  // tiny sparkline (no fill)
  function sparkline(container, color) {
    const W = 100, H = 26;
    container.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "spark-svg", preserveAspectRatio: "none" });
    const line = el("path", { fill: "none", stroke: color || "#8a97ad", "stroke-width": "1.4", "stroke-linejoin": "round", "stroke-linecap": "round" });
    svg.appendChild(line); container.appendChild(svg);
    return function (series) {
      if (!series || series.length < 2) { line.setAttribute("d", ""); return; }
      const n = series.length; let lo = Math.min(...series), hi = Math.max(...series);
      if (hi - lo < 1e-6) hi = lo + 1;
      let d = ""; series.forEach((v, i) => { const x = (i / (n - 1)) * W, y = H - ((v - lo) / (hi - lo)) * H; d += (i ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2); });
      line.setAttribute("d", d);
    };
  }

  // stacked horizontal sector-composition bar
  function sectorBar(container) {
    container.innerHTML = "";
    const svg = el("svg", { viewBox: "0 0 100 12", class: "secbar-svg", preserveAspectRatio: "none" });
    container.appendChild(svg);
    const COLORS = { agriculture: "#4fae5e", mining: "#c9a24b", manufacturing: "#c98a52", services: "#4aa3ff", technology: "#a06bff" };
    return function (sectors) {
      svg.innerHTML = "";
      const total = Object.values(sectors).reduce((a, b) => a + b, 0) || 1;
      let x = 0;
      for (const k of ["agriculture", "mining", "manufacturing", "services", "technology"]) {
        const w = (sectors[k] / total) * 100;
        if (w <= 0) continue;
        svg.appendChild(el("rect", { x: x.toFixed(2), y: 0, width: Math.max(0, w - 0.4).toFixed(2), height: 12, rx: 1.5, fill: COLORS[k], opacity: "0.9" }));
        x += w;
      }
    };
  }

  global.Charts = { areaChart, sparkline, sectorBar };
})(window);
