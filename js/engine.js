/* ECONOMY: FROM ZERO — simulation engine
   Pure model. No DOM. UI reads state + consumes returned "changes".
   Relationships are modeled as chains so the game can EXPLAIN every number.
*/
(function (global) {
  "use strict";

  // ---- seeded RNG (mulberry32) ------------------------------------------
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round = (v, d = 2) => { const p = Math.pow(10, d); return Math.round(v * p) / p; };

  // ---- eras -------------------------------------------------------------
  const ERAS = [
    { id: "survival",      name: "SURVIVAL",         icon: "🌱", minGdp: 0 },
    { id: "foundation",    name: "FOUNDATION",       icon: "🏘️", minGdp: 42 },
    { id: "infrastructure",name: "INFRASTRUCTURE",   icon: "🏙️", minGdp: 90 },
    { id: "industrial",    name: "INDUSTRIALIZING",  icon: "🏭", minGdp: 180 },
    { id: "expansion",     name: "EXPANSION",        icon: "🌆", minGdp: 380 },
    { id: "digital",       name: "DIGITALIZATION",   icon: "💻", minGdp: 720 },
    { id: "global",        name: "GLOBAL INTEGRATION",icon: "🌎", minGdp: 1300 },
    { id: "advanced",      name: "ADVANCED ECONOMY", icon: "🛰️", minGdp: 2200 }
  ];

  function eraForGdp(gdp) {
    let e = ERAS[0];
    for (const era of ERAS) if (gdp >= era.minGdp) e = era;
    return e;
  }

  // ---- initial state ----------------------------------------------------
  function newState(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : (Math.floor(Math.random() * 1e9));
    const sandbox = opts.mode === "sandbox";

    const s = {
      version: 1,
      seed,
      rngState: seed >>> 0,
      mode: opts.mode || "campaign",
      challenge: opts.challenge || null,
      year: 1,
      startYear: 2010,
      population: sandbox ? 4_200_000 : 100_000,
      // sectors are output values (₹B)
      sectors: sandbox
        ? { agriculture: 60, mining: 40, manufacturing: 120, services: 90, technology: 40 }
        : { agriculture: 16, mining: 5, manufacturing: 3, services: 1, technology: 0 },
      // development indices 0..100
      humanCapital: sandbox ? 55 : 22,
      productivity: sandbox ? 50 : 20,
      infrastructure: sandbox ? 55 : 12,
      technology: sandbox ? 45 : 8,
      sustainability: sandbox ? 55 : 60,
      inequality: sandbox ? 35 : 28,          // higher = worse
      livingStandards: sandbox ? 55 : 25,
      // government / macro
      treasury: sandbox ? 400 : 10,           // ₹B cash
      debt: sandbox ? 300 : 4,                // ₹B
      taxRate: 0.14,
      interestRate: 0.06,
      inflation: 0.03,
      unemployment: 0.09,
      currency: 1.0,                          // relative value, 1.0 = baseline
      energyImportShare: 0.55,                // fraction of energy imported
      // trackers
      buildings: {},                          // id -> count
      unlocked: {},                           // tech/feature flags
      trade: {},                              // countryId -> {type, good, volume}
      achievements: {},
      history: [],                            // per-year snapshots
      log: [],                                // narrative timeline events
      flags: { missedYears: 0, crisisStreak: 0 },    // misc modifiers (e.g. subsidy years)
      pendingEvent: null,
      lastChanges: [],                        // relationship chain from last tick
      gameOver: null,                         // null | {type, reason}
      // running economic aggregates (filled by recompute)
      gdp: 0, gdpGrowth: 0, revenue: 0, spending: 0, tradeBalance: 0, gdpPerCapita: 0
    };

    // baseline feature unlocks
    s.unlocked.agriculture = true;
    s.unlocked.roads = true;
    s.unlocked.education = true;
    if (sandbox) {
      Object.assign(s.unlocked, {
        industry: true, trade: true, technology: true, budget: true,
        railways: true, electricity: true, macro: true
      });
    }
    recompute(s);
    s.history.push(snapshot(s));
    return s;
  }

  function rng(s) {
    const f = makeRng(s.rngState);
    const v = f();
    // advance stored state deterministically
    s.rngState = (Math.imul(s.rngState ^ 0x9E3779B9, 0x85EBCA77) + 1) >>> 0;
    return v;
  }

  // ---- derived economics (recompute aggregates from state) --------------
  function recompute(s) {
    const sec = s.sectors;
    s.gdp = round(sec.agriculture + sec.mining + sec.manufacturing + sec.services + sec.technology, 2);
    s.gdpPerCapita = s.gdp * 1e9 / Math.max(1, s.population); // ₹ per person
    s.revenue = round(s.gdp * s.taxRate, 2);
    // baseline spending: services & welfare scale with population + debt interest
    s.spending = round(s.gdp * 0.085 + s.debt * s.interestRate + (s.flags.recurringSpend || 0), 2);
    s.era = eraForGdp(s.gdp);
  }

  function snapshot(s) {
    return {
      year: s.year, gdp: s.gdp, gdpGrowth: s.gdpGrowth, inflation: s.inflation,
      unemployment: s.unemployment, debt: s.debt, debtRatio: s.debt / Math.max(1, s.gdp),
      treasury: s.treasury, tradeBalance: s.tradeBalance, technology: s.technology,
      humanCapital: s.humanCapital, productivity: s.productivity,
      infrastructure: s.infrastructure, livingStandards: s.livingStandards,
      inequality: s.inequality, currency: s.currency, population: s.population,
      sectors: Object.assign({}, s.sectors), era: s.era.id
    };
  }

  // ---- change chain helper ---------------------------------------------
  // Records a human-readable cause->effect chain the UI can animate/explain.
  function Chain(title) { return { title, links: [] }; }
  function link(chain, label, deltaText, tone) {
    chain.links.push({ label, delta: deltaText, tone: tone || "neutral" });
  }

  // ---- apply an effect object to state, returning a chain ---------------
  // effect: { sector:{}, dev:{}, treasury, debt, recurring, flags, chain:[...] }
  function applyEffect(s, effect, sourceLabel) {
    const chain = Chain(sourceLabel || "Decision");
    if (effect.treasury) { s.treasury += effect.treasury; link(chain, "Treasury", fmtDelta(effect.treasury, "₹", "B"), effect.treasury >= 0 ? "good" : "warn"); }
    if (effect.debt) { s.debt += effect.debt; link(chain, "Government debt", fmtDelta(effect.debt, "₹", "B"), effect.debt <= 0 ? "good" : "warn"); }
    if (effect.recurring) { s.flags.recurringSpend = (s.flags.recurringSpend || 0) + effect.recurring; link(chain, "Yearly spending", fmtDelta(effect.recurring, "₹", "B/yr"), "warn"); }
    if (effect.dev) for (const k in effect.dev) { s[k] = clampDev(k, s[k] + effect.dev[k]); link(chain, devLabel(k), fmtDelta(effect.dev[k]), effect.dev[k] >= 0 ? (k === "inequality" ? "warn" : "good") : (k === "inequality" ? "good" : "warn")); }
    if (effect.sector) for (const k in effect.sector) { s.sectors[k] = Math.max(0, s.sectors[k] + effect.sector[k]); link(chain, sectorLabel(k) + " output", fmtDelta(effect.sector[k], "₹", "B"), effect.sector[k] >= 0 ? "good" : "warn"); }
    if (effect.energyImportShare != null) { s.energyImportShare = clamp(s.energyImportShare + effect.energyImportShare, 0, 1); link(chain, "Energy imports", fmtDelta(effect.energyImportShare * 100, "", "%"), effect.energyImportShare <= 0 ? "good" : "warn"); }
    if (effect.inflation) { s.inflation = clamp(s.inflation + effect.inflation, -0.05, 0.6); link(chain, "Inflation", fmtDelta(effect.inflation * 100, "", "%"), effect.inflation <= 0 ? "good" : "warn"); }
    if (effect.unemployment) { s.unemployment = clamp(s.unemployment + effect.unemployment, 0.01, 0.6); link(chain, "Unemployment", fmtDelta(effect.unemployment * 100, "", "%"), effect.unemployment <= 0 ? "good" : "warn"); }
    if (effect.currency) { s.currency = clamp(s.currency + effect.currency, 0.2, 3); link(chain, "Currency value", fmtDelta(effect.currency * 100, "", "%"), effect.currency >= 0 ? "good" : "warn"); }
    if (effect.flags) Object.assign(s.flags, effect.flags);
    recompute(s);
    return chain;
  }

  function clampDev(k, v) {
    if (k === "treasury" || k === "debt") return v;
    return clamp(v, 0, 100);
  }

  // ---- the yearly TICK: this is the relationship engine -----------------
  // Produces s.lastChanges (array of chains) explaining the year.
  function endYear(s, opts) {
    opts = opts || {};
    const chains = [];
    const prev = snapshot(s);

    // 0) Engagement drives development — NOT time alone. A neglected economy
    //    doesn't coast, it decays, and the decay compounds the longer you
    //    ignore it. This is the core difficulty lever: skip decisions, and
    //    the numbers turn on you. Crucially, this only fires when the player
    //    COULD have acted (something affordable was available) and didn't —
    //    saving up for an expensive unlock is never punished as neglect.
    if (opts.couldAct) s.flags.missedYears = (s.flags.missedYears || 0) + 1;
    else s.flags.missedYears = Math.max(0, (s.flags.missedYears || 0) - 1);
    const neglect = Math.max(0, s.flags.missedYears - 6); // six free years of grace
    if (neglect > 0) {
      const severity = Math.min(neglect, 14);
      s.humanCapital = clampDev("humanCapital", s.humanCapital - 0.12 * severity);
      s.infrastructure = clampDev("infrastructure", s.infrastructure - 0.16 * severity);
      s.sustainability = clampDev("sustainability", s.sustainability - 0.09 * severity);
      s.inflation = clamp(s.inflation + 0.0026 * severity, -0.05, 0.9);
      s.unemployment = clamp(s.unemployment + 0.0026 * severity, 0.02, 0.85);
      s.treasury -= s.gdp * 0.004 * severity; // status quo still costs money to run
    } else {
      // small baseline, only while actively engaged with the tree/events
      const ls = s.livingStandards / 100;
      s.humanCapital = clampDev("humanCapital", s.humanCapital + 0.16 + 0.32 * ls);
      if (s.unlocked.technology) s.technology = clampDev("technology", s.technology + 0.18 + 0.36 * (s.humanCapital / 100));
    }
    s.infrastructure = clampDev("infrastructure", s.infrastructure - 0.08); // upkeep decay always applies

    // Inequality past a threshold breeds unrest — a slow-burn tax on employment.
    if (s.inequality > 72) s.unemployment = clamp(s.unemployment + 0.003 * (s.inequality - 72), 0.02, 0.85);
    // Sustainability collapse directly damages output, not just optics.
    if (s.sustainability < 10) {
      const dmg = (10 - s.sustainability) * 0.01;
      s.sectors.agriculture = Math.max(0, s.sectors.agriculture * (1 - dmg));
      s.livingStandards = clampDev("livingStandards", s.livingStandards - dmg * 30);
    }

    // 1) Human capital & infrastructure drive productivity.
    const targetProd = clamp(0.55 * s.humanCapital + 0.30 * s.infrastructure + 0.15 * s.technology, 0, 100);
    const prodChain = Chain("Productivity recalculated");
    const prodDelta = (targetProd - s.productivity) * 0.35;
    if (Math.abs(prodDelta) > 0.05) {
      s.productivity = clampDev("productivity", s.productivity + prodDelta);
      link(prodChain, "Human capital", s.humanCapital.toFixed(0), "neutral");
      link(prodChain, "Infrastructure", s.infrastructure.toFixed(0), "neutral");
      link(prodChain, "Productivity", fmtDelta(prodDelta), prodDelta >= 0 ? "good" : "warn");
      chains.push(prodChain);
    }

    // 2) Sector growth. Positive natural baseline; development ADDS on top.
    // (Low development means slow growth, never permanent contraction.)
    const growthChain = Chain("Sectors grew");
    const prod = s.productivity / 100, infra = s.infrastructure / 100;
    const tech = s.technology / 100, hc = s.humanCapital / 100;
    const invest = clamp(s.treasury / Math.max(30, s.gdp), 0, 0.06); // reinvestment capacity (small; hoarding isn't a strategy)
    const sectorRates = {
      agriculture:  0.012 + 0.09 * prod + 0.07 * infra,
      mining:       0.009 + 0.09 * infra + 0.07 * invest,
      manufacturing:0.013 + 0.18 * prod + 0.18 * infra + 0.10 * invest,
      services:     0.013 + 0.18 * prod + 0.14 * hc + 0.07 * invest,
      technology:   0.015 + 0.30 * tech + 0.19 * hc + 0.07 * invest
    };
    // trade demand bonus
    for (const t of Object.values(s.trade)) {
      if (t.type === "export" && sectorRates[t.good] != null) sectorRates[t.good] += 0.03 * t.volume;
    }
    // inflation & currency drag
    const infDrag = Math.max(0, s.inflation - 0.05) * 0.8;
    let grewAny = false;
    for (const k in s.sectors) {
      let r = clamp(sectorRates[k] - infDrag, -0.12, 0.30);
      // tiny sectors can spark once seeded/unlocked
      if (s.sectors[k] < 1 && s.unlocked[k === "technology" ? "technology" : k === "manufacturing" ? "industry" : "agriculture"]) {
        s.sectors[k] = Math.max(s.sectors[k], 0.5);
      }
      const before = s.sectors[k];
      s.sectors[k] = Math.max(0, before * (1 + r));
      if (Math.abs(s.sectors[k] - before) > 0.05) grewAny = true;
    }
    recompute(s);
    const gdpGrowth = (s.gdp - prev.gdp) / Math.max(1, prev.gdp);
    s.gdpGrowth = gdpGrowth;
    if (grewAny) {
      link(growthChain, "Productivity", s.productivity.toFixed(0), "neutral");
      link(growthChain, "Investment capacity", (invest * 100).toFixed(0) + "%", "neutral");
      link(growthChain, "GDP", fmtDelta(gdpGrowth * 100, "", "%"), gdpGrowth >= 0 ? "good" : "warn");
      chains.push(growthChain);
    }

    // 3) Employment: manufacturing+services+tech absorb labor; automation frees it.
    const empChain = Chain("Labor market shifted");
    const automation = clamp((s.technology - 45) / 300, 0, 0.06);
    const laborDemand = 0.9 * Math.max(0, gdpGrowth);
    let unDelta = -laborDemand + automation - 0.004; // structural
    unDelta = clamp(unDelta, -0.05, 0.05);
    s.unemployment = clamp(s.unemployment + unDelta, 0.02, 0.5);
    if (Math.abs(unDelta) > 0.001) {
      if (automation > 0.005) link(empChain, "Automation (tech)", "+" + (automation * 100).toFixed(1) + "%", "warn");
      link(empChain, "GDP growth", fmtDelta(gdpGrowth * 100, "", "%"), gdpGrowth >= 0 ? "good" : "warn");
      link(empChain, "Unemployment", fmtDelta(unDelta * 100, "", "%"), unDelta <= 0 ? "good" : "warn");
      chains.push(empChain);
    }

    // 4) Inflation drifts toward demand pressure; growth + cheap money raise it.
    const inflTarget = 0.02 + 0.5 * Math.max(0, gdpGrowth) + (0.05 - s.interestRate) * 0.4 + (s.energyImportShare - 0.3) * 0.02;
    const inflDelta = (inflTarget - s.inflation) * 0.4;
    s.inflation = clamp(s.inflation + inflDelta, -0.03, 0.6);

    // 5) Trade balance (informational) & currency. Currency tracks real
    //    fundamentals the player can act on — growth vs. inflation, and
    //    energy self-sufficiency — rather than a trade-partner system this
    //    edition doesn't expose. (A phantom always-negative trade balance
    //    would make currency crises inevitable regardless of skill.)
    let exports = 0, imports = 0;
    for (const t of Object.values(s.trade)) {
      if (t.type === "export") exports += t.volume * s.sectors[t.good] * 0.15;
      if (t.type === "import") imports += t.volume * 12;
    }
    imports += s.energyImportShare * s.gdp * 0.04; // energy imports
    s.tradeBalance = round(exports - imports, 2);
    const realGrowthEdge = gdpGrowth - s.inflation;
    const energyDrag = (s.energyImportShare - 0.35) * 0.05;
    const curDelta = clamp(realGrowthEdge * 0.55 - energyDrag - Math.max(0, s.inflation - 0.06) * 0.4, -0.05, 0.05);
    s.currency = clamp(s.currency + curDelta, 0.2, 3);

    // 6) Living standards & inequality.
    s.livingStandards = clampDev("livingStandards",
      s.livingStandards + (gdpGrowth * 20) - (s.inflation - 0.03) * 30 - (s.unemployment - 0.06) * 25);
    // tech-heavy fast growth raises inequality; education/services lower it
    const ineqDelta = (s.technology / 100) * gdpGrowth * 12 - (s.humanCapital / 100) * 0.6 - (s.sectors.services / Math.max(1, s.gdp)) * 2;
    s.inequality = clampDev("inequality", s.inequality + ineqDelta);

    // 7) Government books.
    recompute(s);
    const balance = s.revenue - s.spending;
    s.treasury += balance;
    if (s.treasury < 0) { s.debt += -s.treasury; s.treasury = 0; }
    else if (s.debt > 0 && s.treasury > s.gdp * 0.05) {
      const pay = Math.min(s.debt, s.treasury - s.gdp * 0.05, s.gdp * 0.03);
      s.debt -= pay; s.treasury -= pay;
    }
    // interest rate reacts to inflation AND debt load — lenders demand a real
    // premium once debt gets heavy, which raises interest, which raises next
    // year's spending, which raises debt further. This is a genuine spiral.
    const debtRatioNow = s.debt / Math.max(1, s.gdp);
    const debtPremium = debtRatioNow > 0.75 ? Math.pow(debtRatioNow - 0.75, 1.5) * 0.5 : 0;
    s.interestRate = clamp(0.03 + 0.7 * (s.inflation - 0.02) + debtPremium, 0.01, 0.6);

    // 8) Population growth tied to living standards.
    const popGrowth = clamp(0.006 + (s.livingStandards - 40) / 4000, -0.01, 0.03);
    s.population = Math.round(s.population * (1 + popGrowth));

    // 9) Slow sustainability drift from industry mix.
    const dirty = (s.sectors.manufacturing + s.sectors.mining) / Math.max(1, s.gdp);
    s.sustainability = clampDev("sustainability", s.sustainability - dirty * 2.2 + (s.unlocked.renewables ? 2.4 : 0.8));

    recompute(s);
    s.year += 1;
    s.era = eraForGdp(s.gdp);
    s.lastChanges = chains;

    // check unlock thresholds & crises
    const unlocks = checkUnlocks(s);
    const crisis = checkCrises(s);

    s.history.push(snapshot(s));
    return { chains, prev, now: snapshot(s), unlocks, crisis, growth: gdpGrowth, neglect };
  }

  // ---- progressive unlocks by year/era ---------------------------------
  function checkUnlocks(s) {
    const got = [];
    if (s.treeMode) return got; // skill tree is the sole source of unlocks
    const give = (flag, label) => { if (!s.unlocked[flag]) { s.unlocked[flag] = true; got.push(label); log(s, "unlock", label + " unlocked"); } };
    if (s.year >= 2) give("budget", "Government Budget");
    if (s.year >= 2) give("industry", "Industry");
    if (s.year >= 3 && s.infrastructure >= 20) give("railways", "Railways");
    if (s.year >= 3) give("trade", "International Trade");
    if (s.year >= 4) give("electricity", "Electricity Grid");
    if (s.year >= 5) give("technology", "Technology Sector");
    if (s.year >= 6) give("macro", "Macro Management");
    if (s.gdp >= 160) give("ports", "Ports & Shipping");
    if (s.technology >= 40) give("automation", "Automation");
    if (s.gdp >= 600) give("renewables", "Renewable Energy");
    return got;
  }

  // ---- crises (recoverable, unless they persist) -------------------------
  function checkCrises(s) {
    const debtRatio = s.debt / Math.max(1, s.gdp);
    let c = null;
    if (debtRatio > 1.1) c = { type: "debt", severe: debtRatio > 1.5, msg: "Debt at " + Math.round(debtRatio * 100) + "% of GDP" };
    else if (s.inflation > 0.26) c = { type: "inflation", severe: s.inflation > 0.45, msg: "Runaway inflation at " + (s.inflation * 100).toFixed(0) + "%" };
    else if (s.unemployment > 0.24) c = { type: "unemployment", severe: s.unemployment > 0.38, msg: "Unemployment crisis at " + (s.unemployment * 100).toFixed(0) + "%" };
    else if (s.currency < 0.4) c = { type: "currency", severe: s.currency < 0.28, msg: "Currency collapse" };
    else if (s.gdpGrowth < -0.035) c = { type: "recession", severe: s.gdpGrowth < -0.08, msg: "Recession — GDP shrank " + (s.gdpGrowth * 100).toFixed(1) + "%" };

    // Crises don't just sit there: several consecutive years unresolved
    // forces collapse. Fewer years needed the more severe it is.
    if (c) {
      s.flags.crisisStreak = (s.flags.crisisType === c.type) ? (s.flags.crisisStreak || 0) + 1 : 1;
      s.flags.crisisType = c.type;
      const streakLimit = c.severe ? 7 : 11;
      if (s.flags.crisisStreak >= streakLimit) {
        s.gameOver = { type: "collapse", reason: c.msg + ", unresolved for " + s.flags.crisisStreak + " years" };
        return { type: "collapse", severe: true, msg: c.msg };
      }
      c.streak = s.flags.crisisStreak;
      return c;
    }
    s.flags.crisisStreak = 0; s.flags.crisisType = null;
    // an outright debt catastrophe can still end things immediately
    if (debtRatio > 2.2 && s.treasury <= 0.5) { s.gameOver = { type: "collapse", reason: "Debt spiral — creditors lost confidence" }; return { type: "collapse", severe: true, msg: "Debt spiral" }; }
    return null;
  }

  function log(s, kind, text) {
    s.log.push({ year: s.year, kind, text });
  }

  // ---- formatting helpers exported for UI ------------------------------
  function fmtDelta(v, prefix, suffix) {
    prefix = prefix || ""; suffix = suffix || "";
    const sign = v >= 0 ? "+" : "−";
    return sign + prefix + Math.abs(round(v, 1)) + suffix;
  }
  const SECTOR_LABELS = { agriculture: "Agriculture", mining: "Mining", manufacturing: "Manufacturing", services: "Services", technology: "Technology" };
  const DEV_LABELS = { humanCapital: "Human capital", productivity: "Productivity", infrastructure: "Infrastructure", technology: "Technology", sustainability: "Sustainability", inequality: "Inequality", livingStandards: "Living standards" };
  function sectorLabel(k) { return SECTOR_LABELS[k] || k; }
  function devLabel(k) { return DEV_LABELS[k] || k; }

  function money(v) {
    // ₹ formatting with T/B/M
    const a = Math.abs(v);
    if (a >= 1000) return "₹" + round(v / 1000, 2) + "T";
    if (a >= 1) return "₹" + round(v, 1) + "B";
    return "₹" + round(v * 1000, 0) + "M";
  }
  function moneyPerCap(v) {
    if (v >= 1e6) return "₹" + round(v / 1e6, 2) + "M";
    if (v >= 1e3) return "₹" + round(v / 1e3, 0) + "K";
    return "₹" + Math.round(v);
  }

  global.Engine = {
    newState, endYear, applyEffect, recompute, snapshot, rng, checkUnlocks,
    money, moneyPerCap, fmtDelta, sectorLabel, devLabel, eraForGdp, ERAS,
    clamp, round
  };
})(window);
