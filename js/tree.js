/* ECONOMY: FROM ZERO — skill tree renderer
   Nodes laid out by lane (x) and tier (y). Connectors follow prerequisites.
   States: locked / available / unlocked. Click -> onSelect(node).
*/
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const el = (t, a, txt) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; return n; };

  const BRANCH_COLOR = {
    root: "#e7c66a", agri: "#4fae5e", infra: "#38d6ff", human: "#4aa3ff",
    industry: "#c98a52", tech: "#a06bff", adv: "#e0b64b"
  };

  const VB_W = 1040;
  const TIER_Y = t => 54 + t * 104;
  const laneX = x => 70 + x * (VB_W - 140);

  function build(container, nodes, onSelect) {
    container.innerHTML = "";
    const maxTier = Math.max(...nodes.map(n => n.tier));
    const VB_H = TIER_Y(maxTier) + 70;
    const svg = el("svg", { viewBox: `0 0 ${VB_W} ${VB_H}`, class: "tree-svg", preserveAspectRatio: "xMidYMin meet" });
    const defs = el("defs");
    defs.innerHTML = `<filter id="nglow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    svg.appendChild(defs);

    const pos = {}; nodes.forEach(n => pos[n.id] = { x: laneX(n.x), y: TIER_Y(n.tier), node: n });

    const edgeLayer = el("g", {});
    const edges = [];
    nodes.forEach(n => n.req.forEach(r => {
      if (!pos[r]) return;
      const a = pos[r], b = pos[n.id];
      const midY = (a.y + b.y) / 2;
      const d = `M${a.x},${a.y + 26} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y - 26}`;
      const p = el("path", { d, class: "tree-edge", fill: "none", "data-from": r, "data-to": n.id });
      edgeLayer.appendChild(p); edges.push({ p, from: r, to: n.id });
    }));
    svg.appendChild(edgeLayer);

    const nodeLayer = el("g", {});
    const nodeEls = {};
    nodes.forEach(n => {
      const p = pos[n.id];
      const g = el("g", { class: "tree-node", transform: `translate(${p.x},${p.y})`, "data-id": n.id, tabindex: "0" });
      const col = BRANCH_COLOR[n.branch] || "#8a97ad";
      g.appendChild(el("circle", { r: 30, class: "tn-aura", fill: col }));
      g.appendChild(el("circle", { r: 23, class: "tn-ring", fill: "none", stroke: col, "stroke-width": "2" }));
      g.appendChild(el("circle", { r: 21, class: "tn-fill", fill: "#0d1420" }));
      const icon = el("text", { y: 3, "text-anchor": "middle", class: "tn-icon" }, n.icon);
      g.appendChild(icon);
      const label = el("text", { y: 40, "text-anchor": "middle", class: "tn-label" }, n.name);
      g.appendChild(label);
      const cost = el("text", { y: 53, "text-anchor": "middle", class: "tn-cost" }, "");
      g.appendChild(cost);
      g.addEventListener("click", () => onSelect(n));
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n); } });
      nodeLayer.appendChild(g);
      nodeEls[n.id] = { g, cost, node: n, col };
    });
    svg.appendChild(nodeLayer);
    container.appendChild(svg);

    return { svg, nodeEls, edges, container };
  }

  // refresh states from game state. selectedId highlights.
  // moneyFn(node)->{unlocked, available, affordable}
  function refresh(handle, stateFor, selectedId) {
    for (const id in handle.nodeEls) {
      const { g, cost, node } = handle.nodeEls[id];
      const st = stateFor(node);
      g.classList.toggle("unlocked", st.unlocked);
      g.classList.toggle("available", st.available && !st.unlocked);
      g.classList.toggle("affordable", st.available && !st.unlocked && st.affordable);
      g.classList.toggle("locked", !st.available && !st.unlocked);
      g.classList.toggle("selected", id === selectedId);
      cost.textContent = st.unlocked ? "ACTIVE" : (node.cost ? "₹" + node.cost + "B" : "");
    }
    handle.edges.forEach(e => {
      const fromUnlocked = stateFor({ id: e.from, req: [] }).unlocked;
      e.p.classList.toggle("live", fromUnlocked);
    });
  }

  // pulse a node when unlocked
  function pulse(handle, id) {
    const n = handle.nodeEls[id]; if (!n) return;
    n.g.classList.remove("just"); void n.g.offsetWidth; n.g.classList.add("just");
  }

  function scrollToNode(handle, id) {
    const n = handle.nodeEls[id]; if (!n) return;
    n.g.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  global.SkillTree = { build, refresh, pulse, scrollToNode };
})(window);
