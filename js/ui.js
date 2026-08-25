/* ECONOMY: FROM ZERO — UI helpers
   Number animation, ripple/chain rendering, Economic Web graph.
*/
(function (global) {
  "use strict";

  // animate a number in an element from its current data-val to target
  function animateNumber(elm, target, format, dur) {
    dur = dur || 700;
    const start = parseFloat(elm.dataset.val || "0");
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = start + (target - start) * e;
      elm.textContent = format(v);
      if (p < 1) requestAnimationFrame(step);
      else { elm.textContent = format(target); elm.dataset.val = target; }
    }
    requestAnimationFrame(step);
  }

  // render a cause->effect chain into a container as animated nodes
  function renderChain(container, chain, opts) {
    opts = opts || {};
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "chain";
    const title = document.createElement("div");
    title.className = "chain-title";
    title.textContent = chain.title;
    wrap.appendChild(title);
    chain.links.forEach((lk, i) => {
      const node = document.createElement("div");
      node.className = "chain-node tone-" + (lk.tone || "neutral");
      node.style.animationDelay = (i * 160) + "ms";
      node.innerHTML = `<span class="cn-label">${lk.label}</span><span class="cn-delta">${lk.delta}</span>`;
      wrap.appendChild(node);
      if (i < chain.links.length - 1) {
        const arrow = document.createElement("div");
        arrow.className = "chain-arrow";
        arrow.style.animationDelay = (i * 160 + 80) + "ms";
        arrow.textContent = "↓";
        wrap.appendChild(arrow);
      }
    });
    container.appendChild(wrap);
  }

  // ---- Economic Web -----------------------------------------------------
  const WEB_NODES = [
    { id: "economy", label: "ECONOMY", x: 50, y: 50, big: true },
    { id: "gdp", label: "GDP", x: 50, y: 18 },
    { id: "employment", label: "Employment", x: 78, y: 26 },
    { id: "inflation", label: "Inflation", x: 88, y: 52 },
    { id: "trade", label: "Trade", x: 80, y: 78 },
    { id: "investment", label: "Investment", x: 58, y: 88 },
    { id: "consumption", label: "Consumption", x: 40, y: 90 },
    { id: "government", label: "Government", x: 20, y: 80 },
    { id: "humanCapital", label: "Human Capital", x: 12, y: 52 },
    { id: "technology", label: "Technology", x: 20, y: 24 },
    { id: "productivity", label: "Productivity", x: 34, y: 14 },
  ];
  // directed relationships (from -> to), sign for tone
  const WEB_EDGES = [
    ["humanCapital", "productivity", 1], ["technology", "productivity", 1],
    ["productivity", "gdp", 1], ["investment", "gdp", 1], ["consumption", "gdp", 1],
    ["gdp", "government", 1], ["government", "investment", 1],
    ["technology", "trade", 1], ["trade", "gdp", 1],
    ["gdp", "employment", 1], ["technology", "employment", -1],
    ["gdp", "consumption", 1], ["employment", "consumption", 1],
    ["government", "humanCapital", 1], ["investment", "technology", 1],
    ["gdp", "inflation", 1], ["inflation", "consumption", -1],
    ["productivity", "gdp", 1]
  ];

  function buildWeb(container, onSelect) {
    container.innerHTML = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "web-svg");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const mk = (t, a) => { const n = document.createElementNS("http://www.w3.org/2000/svg", t); for (const k in a) n.setAttribute(k, a[k]); return n; };
    const pos = {}; WEB_NODES.forEach(n => pos[n.id] = n);

    const edgeLayer = mk("g", {});
    const edgeEls = [];
    WEB_EDGES.forEach(([a, b, sign]) => {
      const p1 = pos[a], p2 = pos[b];
      const line = mk("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: "web-edge", "data-from": a, "data-to": b, "data-sign": sign });
      edgeLayer.appendChild(line); edgeEls.push(line);
    });
    svg.appendChild(edgeLayer);

    const nodeEls = {};
    WEB_NODES.forEach(n => {
      const g = mk("g", { class: "web-node" + (n.big ? " big" : ""), transform: `translate(${n.x},${n.y})`, "data-id": n.id });
      g.appendChild(mk("circle", { r: n.big ? 7 : 4.2, class: "web-dot" }));
      const t = mk("text", { y: n.big ? 0.8 : -6, "text-anchor": "middle", class: "web-label" });
      t.textContent = n.label; t.setAttribute("font-size", n.big ? "3.2" : "2.6");
      g.appendChild(t);
      g.addEventListener("click", () => { highlight(n.id); onSelect && onSelect(n.id); });
      g.addEventListener("mouseenter", () => highlight(n.id));
      svg.appendChild(g); nodeEls[n.id] = g;
    });

    function highlight(id) {
      const related = new Set([id]);
      edgeEls.forEach(e => {
        const from = e.dataset.from, to = e.dataset.to;
        const on = from === id || to === id;
        e.classList.toggle("active", on);
        e.classList.toggle("dim", !on);
        e.classList.toggle("neg", e.dataset.sign === "-1" && on);
        if (on) { related.add(from); related.add(to); }
      });
      for (const nid in nodeEls) {
        nodeEls[nid].classList.toggle("active", related.has(nid));
        nodeEls[nid].classList.toggle("dim", !related.has(nid));
      }
    }
    function clear() {
      edgeEls.forEach(e => e.classList.remove("active", "dim", "neg"));
      for (const nid in nodeEls) nodeEls[nid].classList.remove("active", "dim");
    }
    container.appendChild(svg);
    return { highlight, clear };
  }

  global.UI = { animateNumber, renderChain, buildWeb };
})(window);
