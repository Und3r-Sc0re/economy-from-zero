/* ECONOMY: FROM ZERO — skill tree renderer
   Nodes laid out by lane (x) and tier (y). Connectors follow prerequisites.
   States: locked / available / unlocked. Click -> onSelect(node).
   Pannable + zoomable: drag to move, wheel/buttons to zoom.
*/
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const el = (t, a, txt) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (txt != null) n.textContent = txt; return n; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const BRANCH_COLOR = {
    root: "#e7c66a", agri: "#4fae5e", infra: "#38d6ff", human: "#4aa3ff",
    industry: "#c98a52", tech: "#a06bff", adv: "#e0b64b"
  };

  const VB_W = 1040;
  const TIER_Y = t => 54 + t * 104;
  const laneX = x => 70 + x * (VB_W - 140);

  const K_MIN = 0.85;   // zoomed all the way out (see the whole tree + margin)
  const K_MAX = 4.5;    // zoomed all the way in
  const K_INIT = 2.1;   // starting zoom — closer than "fit all"

  function build(container, nodes, onSelect) {
    container.innerHTML = "";
    const maxTier = Math.max(...nodes.map(n => n.tier));
    const contentH = TIER_Y(maxTier) + 70;
    const svg = el("svg", { class: "tree-svg" });
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
      g.addEventListener("click", e => { if (handle._suppressClick) { handle._suppressClick = false; return; } onSelect(n); });
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n); } });
      nodeLayer.appendChild(g);
      nodeEls[n.id] = { g, cost, node: n, col, x: p.x, y: p.y };
    });
    svg.appendChild(nodeLayer);
    container.appendChild(svg);

    const handle = {
      svg, nodeEls, edges, container, contentW: VB_W, contentH,
      view: { x: 0, y: 0, w: VB_W, h: contentH }, _suppressClick: false
    };
    centerOn(handle, laneX(0.5), TIER_Y(0.5), K_INIT, false);
    wirePanZoom(handle);
    return handle;
  }

  // ---------------------------------------------------------------- pan/zoom
  function applyView(handle) {
    const v = handle.view;
    handle.svg.setAttribute("viewBox", `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
  }

  function clampPan(handle) {
    const v = handle.view;
    const marginX = v.w * 0.35, marginY = v.h * 0.35;
    v.x = clamp(v.x, -marginX, handle.contentW - v.w + marginX);
    v.y = clamp(v.y, -marginY, handle.contentH - v.h + marginY);
  }

  // center the viewport on a content-space point at a given zoom level k
  function centerOn(handle, cx, cy, k, animate) {
    const rect = handle.container.getBoundingClientRect();
    handle.aspect = (rect.height && rect.width) ? (rect.height / rect.width) : (handle.contentH / VB_W);
    const w = clamp(VB_W / k, VB_W / K_MAX, VB_W / K_MIN);
    const h = w * handle.aspect;
    const target = { x: cx - w / 2, y: cy - h / 2, w, h };
    if (!animate) { handle.view = target; clampPan(handle); applyView(handle); return; }
    animateView(handle, target);
  }

  function animateView(handle, target) {
    const start = Object.assign({}, handle.view);
    const t0 = performance.now(), dur = 420;
    function step(t) {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      handle.view = {
        x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e,
        w: start.w + (target.w - start.w) * e, h: start.h + (target.h - start.h) * e
      };
      clampPan(handle); applyView(handle);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function screenToSvg(handle, clientX, clientY) {
    const rect = handle.container.getBoundingClientRect();
    const v = handle.view;
    const px = (clientX - rect.left) / rect.width, py = (clientY - rect.top) / rect.height;
    return { x: v.x + px * v.w, y: v.y + py * v.h };
  }

  // factor > 1 shows MORE content (zoom out); factor < 1 shows LESS (zoom in).
  function zoomAt(handle, factor, clientX, clientY) {
    const focal = (clientX != null) ? screenToSvg(handle, clientX, clientY)
      : { x: handle.view.x + handle.view.w / 2, y: handle.view.y + handle.view.h / 2 };
    const v = handle.view;
    const newW = clamp(v.w * factor, VB_W / K_MAX, VB_W / K_MIN);
    const actual = newW / v.w;
    // derive height from the fixed aspect ratio directly — never compound
    // incremental multiplications, which is what let it drift to near-zero.
    const newH = newW * (handle.aspect || (v.h / v.w));
    v.x = focal.x - (focal.x - v.x) * actual;
    v.y = focal.y - (focal.y - v.y) * actual;
    v.w = newW; v.h = newH;
    clampPan(handle);
    applyView(handle);
  }

  function wirePanZoom(handle) {
    const { svg, container } = handle;
    container.style.touchAction = "none";

    // wheel to zoom, centered on cursor. deltaY>0 (scroll down) = zoom out.
    container.addEventListener("wheel", e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 0.88 : 0.88;
      zoomAt(handle, factor, e.clientX, e.clientY);
    }, { passive: false });

    // drag to pan (mouse)
    let dragging = false, moved = 0, lastX = 0, lastY = 0;
    container.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
      container.classList.add("dragging");
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const dx = (e.clientX - lastX) * (handle.view.w / rect.width);
      const dy = (e.clientY - lastY) * (handle.view.h / rect.height);
      moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
      handle.view.x -= dx; handle.view.y -= dy;
      lastX = e.clientX; lastY = e.clientY;
      clampPan(handle); applyView(handle);
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false; container.classList.remove("dragging");
      if (moved > 4) handle._suppressClick = true;
    });

    // touch: single-finger pan, two-finger pinch zoom
    let touchState = null;
    container.addEventListener("touchstart", e => {
      if (e.touches.length === 1) {
        touchState = { mode: "pan", x: e.touches[0].clientX, y: e.touches[0].clientY, moved: 0 };
      } else if (e.touches.length === 2) {
        const [a, b] = e.touches;
        touchState = { mode: "pinch", dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
      }
    }, { passive: true });
    container.addEventListener("touchmove", e => {
      if (!touchState) return;
      e.preventDefault();
      if (touchState.mode === "pan" && e.touches.length === 1) {
        const rect = container.getBoundingClientRect();
        const t = e.touches[0];
        const dx = (t.clientX - touchState.x) * (handle.view.w / rect.width);
        const dy = (t.clientY - touchState.y) * (handle.view.h / rect.height);
        touchState.moved += Math.abs(t.clientX - touchState.x) + Math.abs(t.clientY - touchState.y);
        handle.view.x -= dx; handle.view.y -= dy;
        touchState.x = t.clientX; touchState.y = t.clientY;
        clampPan(handle); applyView(handle);
      } else if (touchState.mode === "pinch" && e.touches.length === 2) {
        const [a, b] = e.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const factor = dist / touchState.dist;
        zoomAt(handle, factor, touchState.cx, touchState.cy);
        touchState.dist = dist;
      }
    }, { passive: false });
    container.addEventListener("touchend", () => {
      if (touchState && touchState.mode === "pan" && touchState.moved > 4) handle._suppressClick = true;
      touchState = null;
    }, { passive: true });

    // recompute aspect on resize, keeping current width and center fixed
    window.addEventListener("resize", () => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      handle.aspect = rect.height / rect.width;
      const cx = handle.view.x + handle.view.w / 2, cy = handle.view.y + handle.view.h / 2;
      handle.view.h = handle.view.w * handle.aspect;
      handle.view.y = cy - handle.view.h / 2;
      clampPan(handle); applyView(handle);
    });
  }

  function zoomIn(handle) { zoomAt(handle, 1 / 1.35, null, null); }
  function zoomOut(handle) { zoomAt(handle, 1.35, null, null); }
  function zoomReset(handle) { centerOn(handle, laneX(0.5), TIER_Y(0.5), K_INIT, true); }
  function zoomFit(handle) { centerOn(handle, VB_W / 2, handle.contentH / 2, K_MIN, true); }

  // ------------------------------------------------------------------ state
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

  function pulse(handle, id) {
    const n = handle.nodeEls[id]; if (!n) return;
    n.g.classList.remove("just"); void n.g.offsetWidth; n.g.classList.add("just");
  }

  function focusNode(handle, id) {
    const n = handle.nodeEls[id]; if (!n) return;
    centerOn(handle, n.x, n.y, Math.max(2.4, VB_W / handle.view.w), true);
  }

  global.SkillTree = { build, refresh, pulse, focusNode, zoomIn, zoomOut, zoomReset, zoomFit };
})(window);
