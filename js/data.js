/* ECONOMY: FROM ZERO — game content
   Buildings, decisions, events, trade partners, achievements.
   Effects use the same schema Engine.applyEffect consumes.
*/
(function (global) {
  "use strict";

  // ---- BUILDINGS --------------------------------------------------------
  // req(s) -> bool ; effect applied on build ; each has a mapKind for the map
  const BUILDINGS = [
    { id: "farm", name: "Irrigated Farmland", icon: "🌾", cost: 3, mapKind: "farm",
      req: s => s.unlocked.agriculture, needs: "Agriculture",
      desc: "Irrigation + fertilizer lifts crop yields.",
      effect: { sector: { agriculture: 4 }, dev: { sustainability: -1 }, recurring: 0.2 } },
    { id: "road", name: "Road Network", icon: "🛣️", cost: 4, mapKind: "road",
      req: s => s.unlocked.roads, needs: "Roads",
      desc: "Connectivity cuts logistics costs across every sector.",
      effect: { dev: { infrastructure: 8 }, sector: { manufacturing: 1, agriculture: 1 }, recurring: 0.3 } },
    { id: "school", name: "Primary Schools", icon: "🏫", cost: 5, mapKind: "civic",
      req: s => s.unlocked.education, needs: "Education",
      desc: "Basic literacy — the floor of human capital.",
      effect: { dev: { humanCapital: 6, inequality: -2 }, recurring: 0.4 } },
    { id: "powerplant", name: "Power Plant", icon: "⚡", cost: 12, mapKind: "power",
      req: s => s.unlocked.electricity, needs: "Electricity",
      desc: "Reliable power unlocks heavy industry — but burns imported fuel.",
      effect: { dev: { infrastructure: 10, sustainability: -6 }, energyImportShare: 0.05, recurring: 0.8 } },
    { id: "factory", name: "Factory", icon: "🏭", cost: 15, mapKind: "factory",
      req: s => s.unlocked.industry, needs: "Industry",
      desc: "Mass manufacturing — jobs and exports, higher energy demand.",
      effect: { sector: { manufacturing: 10 }, dev: { infrastructure: 2, sustainability: -4 }, unemployment: -0.02, recurring: 0.6 } },
    { id: "railway", name: "Railway", icon: "🚆", cost: 22, mapKind: "rail",
      req: s => s.unlocked.railways, needs: "Railways",
      desc: "Bulk freight at scale. Trade, industry and mining all climb.",
      effect: { dev: { infrastructure: 14 }, sector: { manufacturing: 5, mining: 4 }, unemployment: -0.01, recurring: 0.9 } },
    { id: "university", name: "University", icon: "🎓", cost: 30, mapKind: "civic",
      req: s => s.unlocked.education && s.population > 140000, needs: "Education + 140K pop",
      desc: "Research and skilled graduates. The engine of a modern economy.",
      effect: { dev: { humanCapital: 10, technology: 4, inequality: -1 }, recurring: 1.4 } },
    { id: "port", name: "Sea Port", icon: "⚓", cost: 40, mapKind: "port",
      req: s => s.unlocked.ports || s.gdp > 300, needs: "GDP > ₹300B",
      desc: "Gateway to world markets. Multiplies export capacity.",
      effect: { dev: { infrastructure: 8 }, sector: { manufacturing: 6, services: 4 }, currency: 0.02, recurring: 1.2 } },
    { id: "techpark", name: "Technology District", icon: "💻", cost: 60, mapKind: "tech",
      req: s => s.unlocked.technology && s.humanCapital > 40, needs: "Technology + HC 40",
      desc: "Software, chips, R&D. High growth — but widens inequality.",
      effect: { sector: { technology: 14, services: 4 }, dev: { technology: 12, inequality: 3 }, recurring: 2.0 } },
    { id: "solar", name: "Renewable Grid", icon: "🔋", cost: 55, mapKind: "power",
      req: s => s.unlocked.renewables || s.gdp > 1200, needs: "Renewables",
      desc: "Energy independence and a cleaner economy.",
      effect: { dev: { sustainability: 14, infrastructure: 6 }, energyImportShare: -0.25, recurring: 1.0 } },
    { id: "airport", name: "International Airport", icon: "✈️", cost: 70, mapKind: "port",
      req: s => s.gdp > 900, needs: "GDP > ₹900B",
      desc: "Global connectivity for services and high-value trade.",
      effect: { dev: { infrastructure: 10 }, sector: { services: 12, technology: 4 }, recurring: 1.6 } },
    { id: "airesearch", name: "AI Research Lab", icon: "🤖", cost: 120, mapKind: "tech",
      req: s => s.unlocked.automation && s.technology > 55, needs: "Automation + Tech 55",
      desc: "Frontier automation. Enormous productivity — real jobs risk.",
      effect: { sector: { technology: 22, services: 6 }, dev: { technology: 16, productivity: 6, inequality: 5 }, unemployment: 0.015, recurring: 3.0 } }
  ];

  // ---- DECISIONS (player-initiated choices offered each year) -----------
  // show(s)->bool. options: label, hint, effect, chainNote
  const DECISIONS = [
    { id: "irrigation", title: "Farmers request irrigation", show: s => s.year <= 6,
      body: "Your farmers say water access is limiting yields.",
      options: [
        { label: "Fund irrigation", hint: "₹4B · Agriculture up", effect: { treasury: -4, sector: { agriculture: 5 }, dev: { livingStandards: 2 } } },
        { label: "Not yet", hint: "Save the money", effect: {} }
      ] },
    { id: "foreignfactory", title: "Foreign company wants to build a factory", show: s => s.unlocked.industry,
      body: "A manufacturer from Auren offers to build locally.",
      options: [
        { label: "Welcome it", hint: "Jobs + output, some profit leaves", effect: { sector: { manufacturing: 8 }, unemployment: -0.02, dev: { infrastructure: 2, inequality: 2 } } },
        { label: "Demand local ownership", hint: "Slower, keeps control", effect: { sector: { manufacturing: 3 }, treasury: -3 } },
        { label: "Decline", hint: "Protect domestic firms", effect: {} }
      ] },
    { id: "educationgap", title: "Education system underfunded", show: s => s.humanCapital < 55 && s.year >= 2,
      body: "Teachers are leaving; classrooms are overcrowded.",
      options: [
        { label: "Raise education spending", hint: "₹6B · Human capital up", effect: { treasury: -6, dev: { humanCapital: 7, inequality: -2 }, recurring: 0.3 } },
        { label: "Small stopgap", hint: "₹2B", effect: { treasury: -2, dev: { humanCapital: 2 } } },
        { label: "Hold budget", hint: "", effect: { dev: { humanCapital: -1, livingStandards: -1 } } }
      ] },
    { id: "taxdebate", title: "Cabinet debates tax policy", show: s => s.unlocked.budget,
      body: "Higher taxes fund investment but slow private activity.",
      options: [
        { label: "Raise taxes 2pts", hint: "Revenue up, growth drag", effect: { flags: {}, chainNote: "tax+" , dev: { livingStandards: -1 } }, apply: s => { s.taxRate = Engine.clamp(s.taxRate + 0.02, 0.05, 0.45); } },
        { label: "Cut taxes 2pts", hint: "Growth up, revenue down", effect: { dev: { livingStandards: 1 } }, apply: s => { s.taxRate = Engine.clamp(s.taxRate - 0.02, 0.05, 0.45); s.sectors.manufacturing *= 1.02; s.sectors.services *= 1.02; } },
        { label: "Keep steady", hint: "", effect: {} }
      ] },
    { id: "researchcentre", title: "Tech firm wants a research centre", show: s => s.unlocked.technology,
      body: "Novara's biggest tech firm will co-fund an R&D hub.",
      options: [
        { label: "Approve", hint: "Tech + productivity", effect: { sector: { technology: 6 }, dev: { technology: 8, productivity: 3, inequality: 2 } } },
        { label: "Approve with training program", hint: "₹8B · softer on inequality", effect: { treasury: -8, sector: { technology: 6 }, dev: { technology: 8, humanCapital: 4, inequality: -1 } } },
        { label: "Pass", hint: "", effect: {} }
      ] },
    { id: "infrabond", title: "Finance minister proposes an infrastructure bond", show: s => s.unlocked.budget && s.infrastructure < 70,
      body: "Borrow now to build roads and grids faster.",
      options: [
        { label: "Issue ₹25B bond", hint: "Debt up, infrastructure up", effect: { treasury: 25, debt: 25, dev: { infrastructure: 10 } } },
        { label: "Modest ₹10B", hint: "", effect: { treasury: 10, debt: 10, dev: { infrastructure: 4 } } },
        { label: "Pay as you go", hint: "No new debt", effect: {} }
      ] },
    { id: "healthcare", title: "Public health investment", show: s => s.year >= 4,
      body: "Better health means a more productive, longer-working population.",
      options: [
        { label: "Build clinics", hint: "₹7B · living standards + HC", effect: { treasury: -7, dev: { livingStandards: 5, humanCapital: 3, inequality: -2 }, recurring: 0.4 } },
        { label: "Later", hint: "", effect: {} }
      ] },
    { id: "miningoffer", title: "Mineral deposit discovered", show: s => s.sectors.mining < 30 && s.year >= 3,
      body: "Geologists confirm a rich deposit. Extraction needs capital.",
      options: [
        { label: "Develop the mine", hint: "₹10B · exports & revenue", effect: { treasury: -10, sector: { mining: 9 }, dev: { sustainability: -6, infrastructure: 2 } } },
        { label: "Lease to Korvan", hint: "Quick cash, less upside", effect: { treasury: 12, sector: { mining: 3 }, dev: { sustainability: -4 } } },
        { label: "Preserve the land", hint: "Sustainability", effect: { dev: { sustainability: 3 } } }
      ] },
    { id: "laborreform", title: "Labor unions demand reform", show: s => s.unemployment > 0.08 && s.year >= 5,
      body: "Workers want protections; industry wants flexibility.",
      options: [
        { label: "Side with workers", hint: "Equality up, growth drag", effect: { dev: { inequality: -4, livingStandards: 3 }, unemployment: 0.01 } },
        { label: "Side with industry", hint: "Jobs up, inequality up", effect: { unemployment: -0.03, dev: { inequality: 3 } } },
        { label: "Broker a compromise", hint: "₹5B", effect: { treasury: -5, dev: { inequality: -1 }, unemployment: -0.01 } }
      ] },
    { id: "greenpush", title: "Environmental council warns on emissions", show: s => s.sustainability < 45,
      body: "Pollution is rising with industry. Act now or pay later.",
      options: [
        { label: "Emissions standards", hint: "Sustainability up, mild cost", effect: { dev: { sustainability: 8 }, sector: { manufacturing: -2 }, recurring: 0.3 } },
        { label: "Voluntary targets", hint: "", effect: { dev: { sustainability: 2 } } },
        { label: "Ignore", hint: "Growth now, risk later", effect: { dev: { sustainability: -2 } } }
      ] },
    { id: "digital", title: "Nationwide internet program", show: s => s.unlocked.technology && !s.flags.internet,
      body: "Fibre and mobile everywhere — the backbone of a digital economy.",
      options: [
        { label: "Full rollout", hint: "₹18B · services & tech", effect: { treasury: -18, sector: { services: 8, technology: 4 }, dev: { infrastructure: 8, humanCapital: 3 }, flags: { internet: true } } },
        { label: "Cities only", hint: "₹8B", effect: { treasury: -8, sector: { services: 3 }, dev: { infrastructure: 3, inequality: 2 }, flags: { internet: true } } },
        { label: "Leave to private market", hint: "", effect: { dev: { inequality: 1 } } }
      ] },
    { id: "sovereignfund", title: "Establish a sovereign wealth fund?", show: s => s.treasury > 60 && s.gdp > 500,
      body: "Park surplus revenue to smooth future shocks.",
      options: [
        { label: "Fund it (₹40B)", hint: "Buffer vs future crises", effect: { treasury: -40, flags: { swf: 40 }, dev: { livingStandards: 1 } } },
        { label: "Invest in economy instead", hint: "", effect: { sector: { manufacturing: 4, technology: 3 }, treasury: -20 } },
        { label: "Not now", hint: "", effect: {} }
      ] }
  ];

  // ---- RANDOM EVENTS ----------------------------------------------------
  const EVENTS = [
    { id: "oilshock", title: "⚠ Global Oil Shock", weight: s => s.energyImportShare > 0.3 ? 3 : 1,
      body: s => "Global oil prices have surged 82%. Your economy imports " + Math.round(s.energyImportShare * 100) + "% of its energy.",
      contextLine: s => s.energyImportShare > 0.5 ? "Your economy is especially vulnerable to this shock." : s.unlocked.renewables ? "Your renewable capacity softens the blow." : null,
      options: [
        { label: "Subsidize fuel", hint: "₹ cost · shields consumers", effect: { treasury: -0.06, inflation: -0.02, debt: 0 }, apply: s => { const c = s.gdp * 0.06; s.treasury -= c; s.debt += Math.max(0, c - s.treasury > 0 ? 0 : 0); }, note: "Inflation held down, debt rises." },
        { label: "Let prices rise", hint: "Protect the budget", effect: { inflation: 0.05, dev: { livingStandards: -4 }, unemployment: 0.01 }, note: "Purchasing power falls." },
        { label: "Accelerate renewables", hint: "Big cost, energy independence", effect: { treasury: -0.10, dev: { sustainability: 8 }, energyImportShare: -0.2, inflation: 0.02 }, apply: s => { s.treasury -= s.gdp * 0.04; s.unlocked.renewables = true; }, note: "Painful now, resilient later." }
      ] },
    { id: "drought", title: "⚠ Severe Drought", weight: s => s.sectors.agriculture > s.gdp * 0.2 ? 3 : 1,
      body: s => "A drought has slashed harvests." + (s.buildings.farm ? " Irrigation limits the damage." : ""),
      options: [
        { label: "Import food", hint: "Costs reserves", effect: { treasury: -6, sector: { agriculture: -3 }, inflation: 0.02 } },
        { label: "Ration & endure", hint: "", effect: { sector: { agriculture: -7 }, dev: { livingStandards: -3 }, unemployment: 0.02 } }
      ] },
    { id: "boom", title: "✦ Foreign Investment Wave", weight: s => 1,
      body: s => "International investors are eager to enter your market.",
      options: [
        { label: "Open capital markets", hint: "Growth now, volatility risk", effect: { sector: { manufacturing: 6, services: 5 }, treasury: 8, dev: { inequality: 2 }, flags: { hotmoney: true } } },
        { label: "Selective approval", hint: "", effect: { sector: { manufacturing: 3 }, treasury: 4 } },
        { label: "Stay closed", hint: "", effect: {} }
      ] },
    { id: "techbreak", title: "✦ Technology Breakthrough", weight: s => s.technology > 25 ? 2 : 0.4,
      body: s => "Your researchers achieve a breakthrough with global demand.",
      options: [
        { label: "Commercialize fast", hint: "Tech exports surge", effect: { sector: { technology: 10 }, dev: { technology: 8, productivity: 4, inequality: 2 } } },
        { label: "License it abroad", hint: "Cash windfall", effect: { treasury: 15, sector: { technology: 3 } } }
      ] },
    { id: "pandemic", title: "⚠ Pandemic", weight: s => s.year > 6 ? 1.2 : 0.3,
      body: s => "A pandemic forces the economy to partially shut down.",
      contextLine: s => s.livingStandards > 55 ? "Strong healthcare cushions the impact." : "Weak public health worsens the toll.",
      options: [
        { label: "Strict lockdown", hint: "Health first, output falls", effect: { sector: { services: -8, manufacturing: -5 }, unemployment: 0.04, dev: { livingStandards: -2 } } },
        { label: "Balanced response", hint: "₹ support", effect: { treasury: -12, sector: { services: -4, manufacturing: -2 }, unemployment: 0.02, debt: 8 } },
        { label: "Stay open", hint: "Output over health", effect: { sector: { services: -2 }, dev: { livingStandards: -6 }, unemployment: 0.01 } }
      ] },
    { id: "tradewar", title: "⚠ Trade War", weight: s => Object.keys(s.trade).length > 0 ? 2 : 0.5,
      body: s => "A major partner imposes tariffs on your exports.",
      options: [
        { label: "Retaliate", hint: "Escalation risk", effect: { sector: { manufacturing: -4 }, inflation: 0.03, currency: -0.03 } },
        { label: "Negotiate", hint: "₹5B diplomacy", effect: { treasury: -5, sector: { manufacturing: -1 } } },
        { label: "Diversify markets", hint: "Slow but resilient", effect: { sector: { services: 3, technology: 2 }, dev: { infrastructure: 1 } } }
      ] },
    { id: "disaster", title: "⚠ Natural Disaster", weight: s => 1,
      body: s => "A flood has damaged infrastructure in the river region.",
      options: [
        { label: "Rebuild better", hint: "₹15B · resilient infra", effect: { treasury: -15, dev: { infrastructure: 5, sustainability: 2 }, debt: 5 } },
        { label: "Basic repairs", hint: "₹6B", effect: { treasury: -6, dev: { infrastructure: -2 } } }
      ] },
    { id: "popboom", title: "✦ Population Boom", weight: s => s.livingStandards > 45 ? 1.5 : 0.5,
      body: s => "Rising living standards drive a baby boom and immigration.",
      options: [
        { label: "Invest in housing & schools", hint: "₹12B", effect: { treasury: -12, dev: { humanCapital: 4, livingStandards: 2 }, flags: { popBonus: 0.02 } } },
        { label: "Let market adjust", hint: "Housing pressure", effect: { dev: { inequality: 3, livingStandards: -2 }, inflation: 0.02 } }
      ] },
    { id: "brain", title: "⚠ Brain Drain", weight: s => s.humanCapital > 50 && s.inequality > 40 ? 2 : 0.4,
      body: s => "Skilled workers are emigrating for better opportunities.",
      options: [
        { label: "Raise research funding", hint: "₹10B · retain talent", effect: { treasury: -10, dev: { humanCapital: 3, technology: 3 } } },
        { label: "Accept the loss", hint: "", effect: { dev: { humanCapital: -5, technology: -3 } } }
      ] },
    { id: "financialcrisis", title: "⚠ Financial Crisis", weight: s => (s.flags.hotmoney || s.debt / Math.max(1, s.gdp) > 0.6) ? 2.5 : 0.4,
      body: s => "A banking panic threatens the financial system.",
      contextLine: s => s.flags.swf ? "Your sovereign fund gives you room to respond." : null,
      options: [
        { label: "Bail out banks", hint: "Costly, restores confidence", effect: { debt: 30, sector: { services: -3 }, unemployment: 0.02 }, apply: s => { if (s.flags.swf) { s.treasury += s.flags.swf; s.flags.swf = 0; } } },
        { label: "Let them fail", hint: "Cleansing but brutal", effect: { sector: { services: -12, manufacturing: -6 }, unemployment: 0.06, dev: { livingStandards: -5 } } },
        { label: "Guarantee deposits only", hint: "Middle path", effect: { debt: 12, sector: { services: -5 }, unemployment: 0.03 } }
      ] },
    { id: "resource", title: "✦ Resource Discovery", weight: s => 1,
      body: s => "Surveyors find valuable minerals in the mountains.",
      options: [
        { label: "Extract now", hint: "Revenue, environmental cost", effect: { sector: { mining: 8 }, treasury: 6, dev: { sustainability: -6 } } },
        { label: "Careful extraction", hint: "₹8B, cleaner", effect: { treasury: -8, sector: { mining: 5 }, dev: { sustainability: -2 } } }
      ] },
    { id: "housing", title: "⚠ Housing Crisis", weight: s => s.inequality > 45 ? 2 : 0.5,
      body: s => "Home prices have outpaced wages; unrest is building.",
      options: [
        { label: "Public housing program", hint: "₹14B", effect: { treasury: -14, dev: { inequality: -5, livingStandards: 4 }, recurring: 0.5 } },
        { label: "Rent controls", hint: "Quick but distorting", effect: { dev: { inequality: -2 }, sector: { services: -2 } } },
        { label: "Do nothing", hint: "", effect: { dev: { livingStandards: -4, inequality: 2 } } }
      ] }
  ];

  // ---- TRADE PARTNERS ---------------------------------------------------
  const COUNTRIES = [
    { id: "novara", name: "NOVARA", tag: "Technology powerhouse", imports: "technology", exports: "technology" },
    { id: "velora", name: "VELORA", tag: "Agricultural powerhouse", imports: "agriculture", exports: "agriculture" },
    { id: "korvan", name: "KORVAN", tag: "Oil exporter", imports: null, exports: "energy" },
    { id: "auren",  name: "AUREN",  tag: "Manufacturing powerhouse", imports: "manufacturing", exports: "manufacturing" }
  ];

  // ---- ACHIEVEMENTS -----------------------------------------------------
  const ACHIEVEMENTS = [
    { id: "farming", name: "Farming Giant", icon: "🌾", test: s => s.sectors.agriculture / Math.max(1, s.gdp) > 0.4 },
    { id: "industrial", name: "Industrial Revolution", icon: "🏭", test: s => s.sectors.manufacturing === Math.max(...Object.values(s.sectors)) && s.sectors.manufacturing > 100 },
    { id: "aination", name: "AI Nation", icon: "🤖", test: s => s.sectors.technology === Math.max(...Object.values(s.sectors)) && s.technology > 70 },
    { id: "debtmaster", name: "Debt Master", icon: "💰", test: s => s._lowDebtStreak >= 10 },
    { id: "green", name: "Green Economy", icon: "🌱", test: s => s.gdp > 700 && s.sustainability > 70 },
    { id: "trade", name: "Open Economy", icon: "🌎", test: s => s.currency > 1.2 && s.gdp > 400 },
    { id: "knowledge", name: "Knowledge Economy", icon: "🔬", test: s => s.humanCapital > 90 },
    { id: "fromzero", name: "From Zero", icon: "🚀", test: s => s.era.id === "advanced" }
  ];

  // ---- SKILL TREE -------------------------------------------------------
  // Central mechanic. Unlock nodes one by one; prerequisites gate them.
  // x = 0..1 horizontal lane, tier = vertical depth. effect uses the same
  // schema Engine.applyEffect consumes (applied once, permanent).
  const B = { agri: "agri", infra: "infra", human: "human", industry: "industry", tech: "tech", adv: "adv" };
  const TREE = [
    { id: "root", name: "Founding Settlement", icon: "🏳️", x: 0.5, tier: 0, req: [], cost: 0, branch: "root",
      purpose: "Where it all begins — a small population, basic farming, little else. Every path branches from here.",
      effect: {} },

    // Agriculture lane
    { id: "irrigation", name: "Irrigation", icon: "💧", x: 0.09, tier: 1, req: ["root"], cost: 6, branch: B.agri,
      purpose: "Water reaches the fields, so harvests grow larger and far steadier year to year.", effect: { sector: { agriculture: 6 }, dev: { livingStandards: 2 } } },
    { id: "fertilizer", name: "Fertilizer", icon: "🧪", x: 0.09, tier: 2, req: ["irrigation"], cost: 15, branch: B.agri,
      purpose: "Nutrient inputs raise yields sharply — but runoff pressures the environment.", effect: { sector: { agriculture: 9 }, dev: { sustainability: -3 } } },
    { id: "farmmech", name: "Farm Machinery", icon: "🚜", x: 0.09, tier: 3, req: ["fertilizer"], cost: 30, branch: B.agri,
      purpose: "Tractors and harvesters lift output per worker and free rural labour for industry.", effect: { sector: { agriculture: 13 }, dev: { productivity: 3 }, unemployment: 0.01 } },
    { id: "agriscience", name: "Agri-Science", icon: "🌾", x: 0.09, tier: 4, req: ["farmmech"], cost: 62, branch: B.agri,
      purpose: "Crop research delivers high yields and resilience to drought and disease.", effect: { sector: { agriculture: 20 }, dev: { technology: 3, sustainability: 4 } } },

    // Infrastructure lane
    { id: "roads", name: "Road Network", icon: "🛣️", x: 0.25, tier: 1, req: ["root"], cost: 7, branch: B.infra,
      purpose: "Connectivity cuts logistics costs for every sector at once — the base multiplier.", effect: { dev: { infrastructure: 10 }, sector: { manufacturing: 1, agriculture: 1 } } },
    { id: "electricity", name: "Electricity Grid", icon: "⚡", x: 0.25, tier: 2, req: ["roads"], cost: 16, branch: B.infra,
      purpose: "Reliable power is the gate to real industry — but early grids burn imported fuel.", effect: { dev: { infrastructure: 10 }, sector: { manufacturing: 2 }, energyImportShare: 0.05 } },
    { id: "railways", name: "Railways", icon: "🚆", x: 0.25, tier: 3, req: ["electricity"], cost: 30, branch: B.infra,
      purpose: "Bulk freight at scale links mines, factories and markets across the nation.", effect: { dev: { infrastructure: 14 }, sector: { manufacturing: 5, mining: 4 } } },
    { id: "ports", name: "Sea Ports", icon: "⚓", x: 0.25, tier: 4, req: ["railways"], cost: 55, branch: B.infra,
      purpose: "The gateway to world markets multiplies export capacity and strengthens the currency.", effect: { dev: { infrastructure: 8 }, sector: { services: 4, manufacturing: 5 }, currency: 0.02 } },
    { id: "airports", name: "Airports", icon: "✈️", x: 0.25, tier: 5, req: ["ports"], cost: 100, branch: B.infra,
      purpose: "Fast global links carry high-value services and time-sensitive trade.", effect: { dev: { infrastructure: 10 }, sector: { services: 12, technology: 4 } } },

    // Human capital lane
    { id: "schools", name: "Primary Schools", icon: "🏫", x: 0.41, tier: 1, req: ["root"], cost: 6, branch: B.human,
      purpose: "Literacy is the floor of human capital — it lifts every future skill.", effect: { dev: { humanCapital: 8, inequality: -2 } } },
    { id: "healthcare", name: "Healthcare", icon: "🏥", x: 0.41, tier: 2, req: ["schools"], cost: 16, branch: B.human,
      purpose: "Healthier people work longer and more productively, and inequality narrows.", effect: { dev: { livingStandards: 6, humanCapital: 3, inequality: -2 } } },
    { id: "universities", name: "Universities", icon: "🎓", x: 0.41, tier: 3, req: ["healthcare"], cost: 32, branch: B.human,
      purpose: "Skilled graduates and a research base — the engine of a modern economy.", effect: { dev: { humanCapital: 12, technology: 4 } } },
    { id: "research", name: "Research Institutes", icon: "🔬", x: 0.41, tier: 4, req: ["universities"], cost: 62, branch: B.human,
      purpose: "Sustained R&D compounds into productivity gains across the whole economy.", effect: { dev: { technology: 10, productivity: 4 } } },

    // Industry lane
    { id: "workshops", name: "Workshops", icon: "🔨", x: 0.57, tier: 1, req: ["root"], cost: 8, branch: B.industry,
      purpose: "Small-scale making creates the first factory jobs and a manufacturing base.", effect: { sector: { manufacturing: 5 }, unemployment: -0.02 } },
    { id: "factories", name: "Factories", icon: "🏭", x: 0.57, tier: 2, req: ["workshops", "electricity"], cost: 18, branch: B.industry,
      purpose: "Mass production drives output and jobs — and a hunger for energy.", effect: { sector: { manufacturing: 12 }, dev: { sustainability: -4 }, unemployment: -0.02 } },
    { id: "steel", name: "Heavy Industry", icon: "🏗️", x: 0.57, tier: 3, req: ["factories", "railways"], cost: 34, branch: B.industry,
      purpose: "Steel and machinery — the backbone that everything else is built on.", effect: { sector: { manufacturing: 10, mining: 6 }, dev: { sustainability: -4 } } },
    { id: "electronics", name: "Electronics", icon: "📱", x: 0.57, tier: 4, req: ["factories", "universities"], cost: 64, branch: B.industry,
      purpose: "High-value manufacturing bridges industry and technology.", effect: { sector: { manufacturing: 8, technology: 8 } } },

    // Technology lane
    { id: "internet", name: "Internet", icon: "🌐", x: 0.73, tier: 3, req: ["electricity", "schools"], cost: 30, branch: B.tech,
      purpose: "The digital backbone — services and technology scale on top of it.", effect: { sector: { services: 8, technology: 4 }, dev: { infrastructure: 6, humanCapital: 2 } } },
    { id: "software", name: "Software", icon: "💻", x: 0.73, tier: 4, req: ["internet", "universities"], cost: 60, branch: B.tech,
      purpose: "Code scales at near-zero marginal cost — a services and tech multiplier.", effect: { sector: { technology: 12, services: 4 }, dev: { technology: 8 } } },
    { id: "automation", name: "Automation", icon: "⚙️", x: 0.73, tier: 5, req: ["software", "factories"], cost: 110, branch: B.tech,
      purpose: "Machines do the routine work: productivity jumps, but low-skill jobs are at risk and inequality rises.", effect: { sector: { technology: 10, manufacturing: 6 }, dev: { productivity: 8, inequality: 4 }, unemployment: 0.02 } },
    { id: "ai", name: "Artificial Intelligence", icon: "🤖", x: 0.73, tier: 6, req: ["automation", "research"], cost: 200, branch: B.tech,
      purpose: "Frontier growth across the board — how the gains are shared decides whether everyone benefits.", effect: { sector: { technology: 24 }, dev: { technology: 16, productivity: 10, inequality: 5 } } },

    // Advanced / trade / energy lane
    { id: "banking", name: "Banking", icon: "🏦", x: 0.89, tier: 2, req: ["roads"], cost: 16, branch: B.adv,
      purpose: "Credit mobilises savings into investment, oiling the whole economy.", effect: { sector: { services: 6 }, dev: { productivity: 2 } } },
    { id: "renewables", name: "Renewable Energy", icon: "🔋", x: 0.89, tier: 3, req: ["electricity", "banking"], cost: 70, branch: B.adv,
      purpose: "Clean, home-grown power ends fuel dependence and heals sustainability.", effect: { dev: { sustainability: 16, infrastructure: 6 }, energyImportShare: -0.3, flags: { renewables: true } } },
    { id: "markets", name: "Global Markets", icon: "📈", x: 0.89, tier: 4, req: ["banking", "ports"], cost: 90, branch: B.adv,
      purpose: "Deep capital markets fund rapid expansion and a stronger currency.", effect: { sector: { services: 10, technology: 3 }, currency: 0.03, dev: { inequality: 2 } } },
    { id: "robotics", name: "Robotics", icon: "🦾", x: 0.89, tier: 5, req: ["automation", "steel"], cost: 180, branch: B.adv,
      purpose: "Lights-out factories push manufacturing productivity to the frontier.", effect: { sector: { manufacturing: 16, technology: 8 }, dev: { productivity: 8 } } },
    { id: "fusion", name: "Fusion Power", icon: "☀️", x: 0.89, tier: 6, req: ["renewables", "ai"], cost: 260, branch: B.adv,
      purpose: "Effectively limitless clean energy — the capstone of an advanced economy.", effect: { dev: { sustainability: 20, infrastructure: 10 }, energyImportShare: -0.4 } }
  ];

  global.GameData = { BUILDINGS, DECISIONS, EVENTS, COUNTRIES, ACHIEVEMENTS, TREE };
})(window);
