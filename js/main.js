/* ECONOMY: FROM ZERO — controller (real-time skill-tree edition) */
(function () {
  "use strict";
  const E = window.Engine, D = window.GameData, U = window.UI, T = window.SkillTree, C = window.Charts;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const SAVE_KEY = "efz_save_v2";
  const YEAR_CAP = 60;

  let S = null, tree = null, selected = null;
  let charts = {};                 // chart update fns
  let loopTimer = null, paused = false, speedMult = 2, presenting = false;
  const BASE_MS = 1000;            // 1 year per second at 1×

  // ------------------------------------------------------------- boot
  function init() {
    $("#btn-new").onclick = () => startGame({ mode: "campaign" });
    $("#btn-sandbox").onclick = () => startGame({ mode: "sandbox" });
    $("#btn-challenges").onclick = showChallenges;
    $("#btn-continue").onclick = () => { const raw = localStorage.getItem(SAVE_KEY); if (raw) { S = revive(JSON.parse(raw)); enterGame(); } };
    $("#btn-continue").disabled = !localStorage.getItem(SAVE_KEY);

    $("#btn-menu").onclick = () => { save(); stopLoop(); goMenu(); };
    $("#btn-save").onclick = () => { save(); toast("Saved"); };
    $("#btn-present").onclick = togglePresent;
    $("#btn-play").onclick = togglePause;
    $("#overlay-close").onclick = closeOverlay;
    $$(".tp-speed").forEach(b => b.onclick = () => setSpeed(+b.dataset.mult, b));
    $$(".mini").forEach(m => m.onclick = () => explainStat(m.dataset.stat));
    $("#tree-zoom-in").onclick = () => tree && T.zoomIn(tree);
    $("#tree-zoom-out").onclick = () => tree && T.zoomOut(tree);
    $("#tree-zoom-fit").onclick = () => tree && T.zoomFit(tree);
    $("#tree-zoom-reset").onclick = () => tree && T.zoomReset(tree);

    document.addEventListener("keydown", e => {
      if ($("#screen-game").classList.contains("hidden")) return;
      if (e.code === "Space" && !overlayOpen()) { e.preventDefault(); togglePause(); }
      if (e.key.toLowerCase() === "p") togglePresent();
      if (e.key === "Escape" && overlayOpen()) closeOverlay();
    });
  }

  function revive(o) { E.recompute(o); o.era = E.eraForGdp(o.gdp); return o; }

  // ------------------------------------------------------------- screens
  function goMenu() {
    $("#screen-game").classList.add("hidden");
    $("#screen-menu").classList.remove("hidden");
    $("#btn-continue").disabled = !localStorage.getItem(SAVE_KEY);
  }
  function startGame(opts) {
    S = E.newState(opts);
    S.treeMode = true;
    S.unlocked = { agriculture: true };   // tree drives everything else
    S.treeUnlocked = { root: true };
    S.log = [];
    enterGame();
    if (opts.mode === "campaign") intro();
  }
  function enterGame() {
    $("#screen-menu").classList.add("hidden");
    $("#screen-game").classList.remove("hidden");
    S.treeUnlocked = S.treeUnlocked || { root: true };
    buildCharts();
    tree = T.build($("#tree-container"), D.TREE, onNodeClick);
    refreshTree();
    renderHUD(); updateCharts();
    paused = false; presenting = false;
    document.body.classList.remove("presenting");
    $("#btn-present").textContent = "▶ PRESENT";
    setSpeed(speedMult, $(`.tp-speed[data-mult="${speedMult}"]`));
    startLoop();
    feed("Economy online. Year " + S.year + ".", "sys");
  }

  function intro() {
    overlay(`<div class="cine">
      <div class="cine-year">YEAR 01</div>
      <h1 class="cine-title">A TINY ECONOMY.</h1>
      <p class="cine-line">Time runs on its own. Your job is not to wait —<br/>it is to <b>unlock the right things in the right order</b>.</p>
      <div class="cine-stats">
        <div><span>${E.money(S.gdp)}</span><label>GDP</label></div>
        <div><span>${fmtPop(S.population)}</span><label>Population</label></div>
        <div><span>${E.money(S.treasury)}</span><label>Treasury</label></div>
      </div>
      <button class="btn primary big" id="cine-go">BEGIN</button>
    </div>`, { bare: true });
    // pause while intro up
    paused = true; syncPlayBtn();
    $("#cine-go").onclick = () => { closeOverlay(); paused = false; syncPlayBtn(); toast("Tip: unlock Roads, Schools or Irrigation first"); };
  }

  // ------------------------------------------------------------- real-time loop
  // interval is throttled to ~1s in background tabs, so we ALSO advance
  // multiple years per tick when fast/presenting — guarantees a visible
  // speed-up regardless of the browser's timer clamping.
  function startLoop() { stopLoop(); loopTimer = setInterval(tick, Math.round(BASE_MS / speedMult)); }
  function stopLoop() { if (loopTimer) clearInterval(loopTimer); loopTimer = null; }
  function stepsPerTick() { return presenting ? 5 : (speedMult >= 4 ? 2 : 1); }
  function restartLoop() { if (loopTimer) startLoop(); }

  function tick() {
    if (paused || overlayOpen() || (S && S.gameOver)) return;
    let result = null, ev = null;
    const steps = stepsPerTick();
    for (let i = 0; i < steps; i++) {
      const couldAct = D.TREE.some(n => { const st = stateFor(n); return !st.unlocked && st.available && st.affordable; });
      result = E.endYear(S, { couldAct });
      if (S.debt / Math.max(1, S.gdp) < 0.3) S._lowDebtStreak = (S._lowDebtStreak || 0) + 1; else S._lowDebtStreak = 0;
      milestones(); checkAchievements();
      if (result.crisis) {
        const streakTxt = result.crisis.streak ? ` (unresolved ${result.crisis.streak}yr)` : "";
        feed("⚠ " + result.crisis.msg + streakTxt, result.crisis.severe ? "bad" : "warn");
        flashMood(result.crisis);
      }
      if (result.neglect === 1) feed("Nothing unlocked in a while — the economy is starting to drift.", "warn");
      else if (result.neglect === 4) feed("⚠ Prolonged neglect — decay is accelerating.", "bad");
      ev = maybeEvent();
      if (ev || S.gameOver || S.year > YEAR_CAP) break; // stop the batch on anything that needs attention
    }
    renderHUD(); updateCharts(); refreshTree();
    if (result && !result.crisis) document.body.classList.remove("mood-inflation", "mood-recession", "mood-unemp");
    if (ev) { showEvent(ev); }
    if (S.gameOver) { stopLoop(); showEndGame(true); return; }
    if (S.year > YEAR_CAP) { stopLoop(); showEndGame(false); }
  }

  function togglePause() { paused = !paused; syncPlayBtn(); if (!paused) toast("Running"); else toast("Paused"); }
  function syncPlayBtn() { $("#btn-play").textContent = paused ? "▶" : "⏸"; document.body.classList.toggle("is-paused", paused); }
  function setSpeed(mult, btn) {
    speedMult = mult;
    $$(".tp-speed").forEach(b => b.classList.toggle("active", b === btn));
    restartLoop();
  }

  // ------------------------------------------------------------- HUD + charts
  function renderHUD() {
    $("#hud-year").textContent = "YEAR " + String(S.year).padStart(2, "0");
    $("#hud-era").innerHTML = `${S.era.icon} ${S.era.name}`;
    U.animateNumber($("#hud-treasury"), S.treasury, v => E.money(v), 500);
    U.animateNumber($("#g-gdp"), S.gdp, v => E.money(v), 500);
    const gr = (S.gdpGrowth || 0) * 100;
    const ge = $("#g-growth"); ge.textContent = (gr >= 0 ? "+" : "") + gr.toFixed(1) + "%";
    ge.className = "growth " + (gr >= 0 ? "pos" : "neg");
    setMini("inflation", (S.inflation * 100).toFixed(1) + "%");
    setMini("unemployment", (S.unemployment * 100).toFixed(1) + "%");
    setMini("debt", ((S.debt / Math.max(1, S.gdp)) * 100).toFixed(0) + "%");
    setMini("humanCapital", S.humanCapital.toFixed(0));
    setMini("technology", S.technology.toFixed(0));
    setMini("sustainability", S.sustainability.toFixed(0));
  }
  function setMini(id, txt) { const e = $("#m-" + id); if (e) e.textContent = txt; }

  function buildCharts() {
    charts.gdp = C.areaChart($("#chart-gdp"), { color: "#38d6ff", zeroBase: true });
    charts.inflation = C.sparkline($("#sp-inflation"), "#ffc24b");
    charts.unemployment = C.sparkline($("#sp-unemployment"), "#ff5c72");
    charts.debt = C.sparkline($("#sp-debt"), "#ff8f5c");
    charts.humanCapital = C.sparkline($("#sp-humanCapital"), "#4aa3ff");
    charts.technology = C.sparkline($("#sp-technology"), "#a06bff");
    charts.sustainability = C.sparkline($("#sp-sustainability"), "#3fe08a");
    charts.sector = C.sectorBar($("#secbar"));
  }
  function updateCharts() {
    const h = S.history.slice(-40);
    charts.gdp(h.map(x => x.gdp));
    charts.inflation(h.map(x => x.inflation * 100));
    charts.unemployment(h.map(x => x.unemployment * 100));
    charts.debt(h.map(x => x.debtRatio * 100));
    charts.humanCapital(h.map(x => x.humanCapital));
    charts.technology(h.map(x => x.technology));
    charts.sustainability(h.map(x => x.sustainability));
    charts.sector(S.sectors);
  }

  // ------------------------------------------------------------- skill tree
  function stateFor(node) {
    const unlocked = !!S.treeUnlocked[node.id];
    const available = (node.req || []).every(r => S.treeUnlocked[r]);
    const affordable = S.treasury >= node.cost;
    return { unlocked, available, affordable };
  }
  function refreshTree() { if (tree) T.refresh(tree, stateFor, selected && selected.id); }

  function onNodeClick(node) {
    selected = node;
    refreshTree();
    showAnalysis(node);
  }

  function showAnalysis(node) {
    const st = stateFor(node);
    const eff = effectRows(node.effect);
    const reqNames = (node.req || []).filter(r => r !== "root").map(r => {
      const n = D.TREE.find(x => x.id === r); const ok = S.treeUnlocked[r];
      return `<span class="req-chip ${ok ? "ok" : "no"}">${ok ? "✓" : "🔒"} ${n ? n.name : r}</span>`;
    }).join("");
    let action = "";
    if (st.unlocked) action = `<div class="an-status active">✓ ACTIVE — contributing to your economy</div>`;
    else if (!st.available) action = `<div class="an-status locked">🔒 Locked — unlock the prerequisites first</div>`;
    else action = `<button class="btn ${st.affordable ? "primary" : "disabled"} an-unlock" id="do-unlock" ${st.affordable ? "" : "disabled"}>
        ${st.affordable ? "UNLOCK · " + E.money(node.cost) : "NEED " + E.money(node.cost - S.treasury) + " MORE"}</button>`;

    $("#analysis").innerHTML = `
      <div class="an-node">
        <div class="an-icon br-${node.branch}">${node.icon}</div>
        <div><div class="an-name">${node.name}</div><div class="an-branch">${branchName(node.branch)} · TIER ${node.tier}</div></div>
      </div>
      <p class="an-purpose">${node.purpose}</p>
      ${reqNames ? `<div class="an-sec"><label>REQUIRES</label><div class="req-list">${reqNames}</div></div>` : ""}
      <div class="an-sec"><label>PROJECTED EFFECTS</label><div class="eff-list">${eff || '<span class="muted">—</span>'}</div></div>
      ${action}`;
    const b = $("#do-unlock"); if (b) b.onclick = () => unlockNode(node);
  }

  function unlockNode(node) {
    const st = stateFor(node);
    if (st.unlocked || !st.available || !st.affordable) return;
    S.treasury -= node.cost;
    S.treeUnlocked[node.id] = true;
    S.flags.missedYears = 0;
    // feature flags so the engine seeds/permits the right sectors
    S.unlocked[node.id] = true;
    const e = node.effect || {};
    if (node.branch === "industry" || (e.sector && e.sector.manufacturing)) S.unlocked.industry = true;
    if (node.branch === "tech" || node.branch === "adv" || (e.sector && e.sector.technology)) S.unlocked.technology = true;
    const chain = E.applyEffect(S, e, "Unlocked " + node.name);
    chain.links.unshift({ label: node.name, delta: "−" + E.money(node.cost), tone: "warn" });
    E.recompute(S);
    log("unlock", "Unlocked " + node.name);
    feed("🔓 " + node.name + " unlocked", "good");
    banner("UNLOCKED", node.icon + " " + node.name);
    T.pulse(tree, node.id);
    refreshTree(); renderHUD(); updateCharts();
    showAnalysis(node);
    if (chain.links.length > 1) ripple(chain);
  }

  function effectRows(eff) {
    if (!eff) return "";
    const rows = [];
    if (eff.sector) for (const k in eff.sector) rows.push(chip(E.sectorLabel(k) + " output", eff.sector[k], eff.sector[k] > 0));
    if (eff.dev) for (const k in eff.dev) rows.push(chip(E.devLabel(k), eff.dev[k], k === "inequality" ? eff.dev[k] < 0 : eff.dev[k] > 0));
    if (eff.energyImportShare) rows.push(chip("Energy imports", eff.energyImportShare * 100, eff.energyImportShare < 0, "%"));
    if (eff.currency) rows.push(chip("Currency", eff.currency * 100, eff.currency > 0, "%"));
    if (eff.unemployment) rows.push(chip("Unemployment", eff.unemployment * 100, eff.unemployment < 0, "%"));
    return rows.join("");
  }
  function chip(label, v, good, suffix) {
    suffix = suffix || ""; const sign = v >= 0 ? "+" : "−";
    return `<span class="chip ${good ? "good" : "warn"}">${label} ${sign}${Math.abs(E.round(v, 1))}${suffix}</span>`;
  }
  function branchName(b) { return ({ root: "Foundation", agri: "Agriculture", infra: "Infrastructure", human: "Human Capital", industry: "Industry", tech: "Technology", adv: "Advanced" })[b] || b; }

  // ------------------------------------------------------------- events
  function maybeEvent() {
    if (S.year < 6) return null;
    if (S.year - (S.flags.lastEventYear || -99) < 4) return null; // cooldown between shocks
    if (E.rng(S) > 0.14) return null;   // rarer in real-time
    S.flags.lastEventYear = S.year;
    const pool = D.EVENTS.map(e => ({ e, w: Math.max(0, e.weight(S)) })).filter(x => x.w > 0);
    const total = pool.reduce((a, b) => a + b.w, 0); if (!total) return null;
    let r = E.rng(S) * total;
    for (const x of pool) { r -= x.w; if (r <= 0) return x.e; }
    return null;
  }
  function showEvent(ev) {
    paused = true; syncPlayBtn();
    const ctx = ev.contextLine && ev.contextLine(S);
    overlay(`
      <div class="event-badge">${ev.title.startsWith("⚠") ? "EVENT · ALERT" : "EVENT · OPPORTUNITY"}</div>
      <h2 class="ov-h event-h">${ev.title}</h2><div class="ev-year">Year ${S.year}</div>
      <p class="ov-sub">${ev.body(S)}</p>
      ${ctx ? `<div class="ev-ctx">${ctx}</div>` : ""}
      <div class="opt-list">${ev.options.map((o, i) => `<button class="opt" data-i="${i}"><div class="opt-label">${o.label}</div><div class="opt-hint">${o.hint || ""}</div></button>`).join("")}</div>`,
      { danger: ev.title.startsWith("⚠") });
    feed("Event: " + ev.title.replace(/^[⚠✦]\s*/, ""), "warn");
    $$(".opt").forEach(btn => btn.onclick = () => {
      const o = ev.options[+btn.dataset.i];
      closeOverlay();
      S.flags.missedYears = 0;
      if (o.apply) o.apply(S);
      const chain = E.applyEffect(S, o.effect || {}, ev.title.replace(/^[⚠✦]\s*/, ""));
      E.recompute(S); renderHUD(); updateCharts(); refreshTree();
      if (chain.links.length) ripple(chain);
      paused = false; syncPlayBtn();
    });
  }

  // ------------------------------------------------------------- milestones / achievements
  function milestones() {
    const marks = [[100, "GDP passed ₹100B"], [500, "GDP passed ₹500B"], [1000, "GDP passed ₹1 Trillion"]];
    S.flags._ms = S.flags._ms || {};
    for (const [th, msg] of marks) if (S.gdp >= th && !S.flags._ms[th]) { S.flags._ms[th] = true; banner("MILESTONE", msg); feed("★ " + msg, "good"); }
  }
  function checkAchievements() {
    D.ACHIEVEMENTS.forEach(a => {
      if (S.achievements[a.id]) return;
      let ok = false; try { ok = a.test(S); } catch (e) {}
      if (ok) { S.achievements[a.id] = S.year; banner("🏆 ACHIEVEMENT", a.icon + " " + a.name); feed("🏆 " + a.name, "good"); }
    });
  }

  // ------------------------------------------------------------- feed / mood
  function feed(text, kind) {
    const f = $("#feed");
    const row = document.createElement("div");
    row.className = "feed-row " + (kind || "sys");
    row.innerHTML = `<span class="fr-year">Y${S.year}</span><span class="fr-text">${text}</span>`;
    f.prepend(row);
    while (f.children.length > 40) f.removeChild(f.lastChild);
  }
  function flashMood(crisis) {
    const b = document.body;
    b.classList.remove("mood-inflation", "mood-recession", "mood-unemp");
    if (crisis.type === "inflation") b.classList.add("mood-inflation");
    else if (crisis.type === "recession") b.classList.add("mood-recession");
    else if (crisis.type === "unemployment") b.classList.add("mood-unemp");
  }

  // ------------------------------------------------------------- explain stat
  function explainStat(id) {
    const map = {
      inflation: { t: "Why this inflation?", links: [
        { label: "Interest rate", delta: (S.interestRate * 100).toFixed(1) + "%", tone: "neutral" },
        { label: "Energy imports", delta: (S.energyImportShare * 100).toFixed(0) + "%", tone: S.energyImportShare > 0.4 ? "warn" : "good" },
        { label: "Inflation", delta: (S.inflation * 100).toFixed(1) + "%", tone: S.inflation > 0.06 ? "warn" : "good" }] },
      unemployment: { t: "Why this unemployment?", links: [
        { label: "GDP growth", delta: ((S.gdpGrowth || 0) * 100).toFixed(1) + "%", tone: S.gdpGrowth >= 0 ? "good" : "warn" },
        { label: "Automation", delta: S.technology.toFixed(0), tone: S.technology > 50 ? "warn" : "neutral" },
        { label: "Unemployment", delta: (S.unemployment * 100).toFixed(1) + "%", tone: S.unemployment < 0.08 ? "good" : "warn" }] },
      debt: { t: "Why this debt?", links: [
        { label: "Revenue", delta: E.money(S.revenue), tone: "good" },
        { label: "Spending", delta: E.money(S.spending), tone: "warn" },
        { label: "Debt / GDP", delta: ((S.debt / S.gdp) * 100).toFixed(0) + "%", tone: S.debt / S.gdp > 0.6 ? "warn" : "good" }] },
      humanCapital: { t: "Human capital drives...", links: [
        { label: "Human capital", delta: S.humanCapital.toFixed(0), tone: "neutral" },
        { label: "Productivity", delta: S.productivity.toFixed(0), tone: "good" },
        { label: "GDP", delta: E.money(S.gdp), tone: "good" }] },
      technology: { t: "Technology drives...", links: [
        { label: "Technology", delta: S.technology.toFixed(0), tone: "neutral" },
        { label: "Productivity + exports", delta: "▲", tone: "good" },
        { label: "Inequality", delta: S.inequality.toFixed(0), tone: S.inequality > 45 ? "warn" : "neutral" }] },
      sustainability: { t: "Sustainability", links: [
        { label: "Industry & mining", delta: "pressure", tone: "warn" },
        { label: "Renewables", delta: S.unlocked.renewables ? "active" : "none", tone: S.unlocked.renewables ? "good" : "warn" },
        { label: "Sustainability", delta: S.sustainability.toFixed(0), tone: S.sustainability > 55 ? "good" : "warn" }] }
    };
    const ch = map[id]; if (!ch) return;
    const box = document.createElement("div"); U.renderChain(box, { title: ch.t, links: ch.links });
    overlay(`<h2 class="ov-h">${ch.t}</h2><div id="why-body"></div>`, { title: "WHY?" });
    $("#why-body").appendChild(box);
  }

  // ------------------------------------------------------------- ripple
  function ripple(chain) {
    if (!chain || chain.links.length < 2) return;
    const layer = $("#ripple-layer");
    const box = document.createElement("div"); box.className = "ripple-box"; U.renderChain(box, chain);
    layer.innerHTML = ""; layer.appendChild(box); layer.classList.remove("hidden");
    const total = chain.links.length * 150 + 600;
    setTimeout(() => { layer.classList.add("hidden"); layer.innerHTML = ""; }, total);
  }

  // ------------------------------------------------------------- present
  function togglePresent() {
    presenting = !presenting;
    document.body.classList.toggle("presenting", presenting);
    $("#btn-present").textContent = presenting ? "◼ EXIT PRESENT" : "▶ PRESENT";
    toast(presenting ? "Presentation mode — accelerated" : "Normal mode");
    if (presenting) paused = false, syncPlayBtn();
    restartLoop();
  }

  // ------------------------------------------------------------- challenges
  function showChallenges() {
    const list = [
      { id: "tech", name: "Silicon Sprint", desc: "Make technology your largest sector.", mode: "campaign" },
      { id: "green", name: "Green Giant", desc: "Reach ₹700B GDP with sustainability above 70.", mode: "campaign" },
      { id: "balance", name: "Fair Growth", desc: "Reach an advanced economy with inequality under 30.", mode: "campaign" }
    ];
    overlay(`<h2 class="ov-h">CHALLENGES</h2><div class="chal-list">${list.map(c => `<button class="chal" data-mode="${c.mode}"><div class="chal-name">${c.name}</div><div class="chal-desc">${c.desc}</div></button>`).join("")}</div>`, { title: "CHALLENGES" });
    $$(".chal").forEach(c => c.onclick = () => { closeOverlay(); startGame({ mode: c.dataset.mode }); });
  }

  // ------------------------------------------------------------- end game
  function showEndGame(collapsed) {
    const first = S.history[0];
    const identity = economicIdentity(), best = greatestSuccess(), mistake = biggestMistake();
    const unlockedCount = Object.keys(S.treeUnlocked).length - 1;
    overlay(`<div class="end-wrap ${collapsed ? "collapse" : ""}">
      <div class="end-tag">${collapsed ? "ECONOMIC COLLAPSE" : "YOUR ECONOMY"}</div>
      <div class="end-year">${S.startYear} → ${S.startYear + S.year - 1} · ${unlockedCount} technologies unlocked</div>
      <div class="end-grid">
        ${endCell("GDP", E.money(first.gdp), E.money(S.gdp))}
        ${endCell("GDP / CAPITA", E.moneyPerCap(first.gdp * 1e9 / first.population), E.moneyPerCap(S.gdpPerCapita))}
        ${endCell("TECHNOLOGY", first.technology.toFixed(0), S.technology.toFixed(0))}
        ${endCell("HUMAN CAPITAL", first.humanCapital.toFixed(0), S.humanCapital.toFixed(0))}
      </div>
      <div class="end-identity"><label>YOUR ECONOMIC IDENTITY</label><div class="ei">${identity}</div></div>
      <div class="end-facts">
        <div><label>GREATEST SUCCESS</label><span>${best}</span></div>
        <div><label>BIGGEST MISTAKE</label><span>${mistake}</span></div>
      </div>
      <div class="end-big">${collapsed ? "LEARN AND REBUILD" : "FROM ZERO → " + S.era.name}</div>
      <div class="ys-actions"><button class="btn primary" id="end-newgame">NEW ECONOMY</button></div>
    </div>`, { bare: true });
    $("#end-newgame").onclick = () => { localStorage.removeItem(SAVE_KEY); closeOverlay(); goMenu(); };
  }
  function endCell(l, a, b) { return `<div class="end-cell"><label>${l}</label><div class="ec-vals"><span class="ec-from">${a}</span><span class="ec-arrow">→</span><span class="ec-to">${b}</span></div></div>`; }
  function biggestSector() { let k = "agriculture", v = -1; for (const s in S.sectors) if (S.sectors[s] > v) { v = S.sectors[s]; k = s; } return E.sectorLabel(k); }
  function economicIdentity() { return ({ Technology: "THE TECHNOLOGY EXPORTER", Manufacturing: "THE INDUSTRIAL POWER", Agriculture: "THE AGRICULTURAL NATION", Services: "THE SERVICE ECONOMY", Mining: "THE RESOURCE STATE" })[biggestSector()] || "THE BALANCED ECONOMY"; }
  function greatestSuccess() { const c = [[S.humanCapital, "Human capital investment"], [S.technology, "Technology development"], [S.infrastructure, "Infrastructure buildout"], [100 - S.inequality, "Reducing inequality"], [S.sustainability, "Sustainable growth"]]; c.sort((a, b) => b[0] - a[0]); return c[0][1]; }
  function biggestMistake() { if (S.debt / Math.max(1, S.gdp) > 0.7) return "Excessive borrowing"; if (S.inequality > 55) return "Letting inequality grow"; if (S.sustainability < 35) return "Ignoring the environment"; if (S.humanCapital < 40) return "Underinvesting in people"; return "Occasional short-term thinking"; }

  // ------------------------------------------------------------- overlay / toast / banner
  function overlay(html, opts) {
    opts = opts || {};
    const ov = $("#overlay");
    $("#overlay-title").textContent = opts.title || "";
    $("#overlay-title").style.display = opts.title ? "" : "none";
    const body = $("#overlay-body"); body.className = "overlay-body" + (opts.bare ? " bare" : ""); body.innerHTML = html;
    ov.classList.remove("hidden", "danger"); if (opts.danger) ov.classList.add("danger");
    $("#overlay-close").style.display = opts.bare ? "none" : "";
  }
  function overlayOpen() { return !$("#overlay").classList.contains("hidden"); }
  function closeOverlay() { $("#overlay").classList.add("hidden"); }
  let toastT; function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1600); }
  function banner(kind, msg) {
    const b = document.createElement("div"); b.className = "banner";
    b.innerHTML = `<span class="banner-kind">${kind}</span><span class="banner-msg">${msg}</span>`;
    $("#banner-stack").appendChild(b);
    setTimeout(() => b.classList.add("show"), 20);
    setTimeout(() => { b.classList.remove("show"); setTimeout(() => b.remove(), 400); }, 2800);
  }

  // ------------------------------------------------------------- helpers
  function log(kind, text) { S.log.push({ year: S.year, kind, text }); }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
  function fmtPop(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : (n / 1e3).toFixed(0) + "K"; }

  document.addEventListener("DOMContentLoaded", init);
})();
