const REPORTS_KEY = "nexora-community-reports";
const THEME_KEY = "nexora-theme";
const SHOWCASE_KEY = "nexora-showcase-state";
const ASSISTANT_VIEW_KEY = "nexora-assistant-view";
const ASSISTANT_DEPTH_KEY = "nexora-assistant-depth";
const ASSISTANT_CONTEXT_KEY = "nexora-assistant-context";
const TRUSTED_CONTACTS_KEY = "nexora-trusted-contacts";
const LAST_SOS_PAYLOAD_KEY = "nexora-last-sos-payload";
const EMERGENCY_NUMBERS_IN = {
  primary: { number: "112", label: "ERSS National Emergency" },
  roadHighway: { number: "1033", label: "NHAI Highway Helpline" },
  ambulance: { number: "108", label: "Ambulance Service" },
  womenSafety: { number: "1091", label: "Women Helpline" }
};
const HIGHWAY_KEYWORDS = ["highway", "expressway", "nh", "toll", "flyover", "bypass", "ring road"];

const showcaseRoutes = {
  network: "network.html?showcase=1",
  community: "community.html?showcase=1",
  coordination: "coordination.html?showcase=1"
};

const showcaseLabels = {
  network: "Step 1/3 - Network Hub",
  community: "Step 2/3 - Citizen Portal",
  coordination: "Step 3/3 - Coordination Center"
};

const knownDistricts = [
  "Metro Core",
  "Harbor Point",
  "North Transit",
  "Riverside",
  "Medical Cluster",
  "Canal Edge",
  "University Loop",
  "South Gardens",
  "West Belt",
  "Freight Yard"
];

const responderNodes = [
  { name: "Metro Fire Unit 7", type: "fire", district: "Metro Core", eta: 7, contact: "+91-90000-2101" },
  { name: "Harbor Water Rescue", type: "flood", district: "Harbor Point", eta: 9, contact: "+91-90000-2102" },
  { name: "Riverside Trauma Ambulance", type: "accident", district: "Riverside", eta: 8, contact: "+91-90000-2103" },
  { name: "North Transit Medical Rapid Team", type: "health", district: "North Transit", eta: 10, contact: "+91-90000-2104" },
  { name: "City Police Rapid Patrol", type: "safety", district: "Metro Core", eta: 6, contact: "+91-90000-2108" },
  { name: "Women Safety Response Cell", type: "safety", district: "University Loop", eta: 8, contact: "+91-90000-2109" },
  { name: "Grid Utility Emergency Squad", type: "outage", district: "West Belt", eta: 12, contact: "+91-90000-2105" },
  { name: "City Weather Response Unit", type: "weather", district: "Medical Cluster", eta: 11, contact: "+91-90000-2106" },
  { name: "Canal Logistics Lift Team", type: "flood", district: "Canal Edge", eta: 13, contact: "+91-90000-2107" }
];

const playbooks = {
  fire: [
    "Create a 300m safety perimeter and keep public away from smoke direction.",
    "Dispatch nearest fire unit plus ambulance in parallel.",
    "Shut nearby gas and high-voltage lines before interior response."
  ],
  flood: [
    "Move affected people to elevated safe points first.",
    "Open water rescue channels and mark blocked roads.",
    "Prioritize children, elderly, and bedridden evacuations."
  ],
  accident: [
    "Protect crash zone to prevent secondary collisions.",
    "Route nearest trauma ambulance and traffic control unit.",
    "Keep airway clear and avoid moving severe injuries unless unsafe."
  ],
  health: [
    "Set triage lane by severity and isolate critical patients.",
    "Dispatch ambulance and nearest rapid care center.",
    "Track oxygen and critical consumables every 10 minutes."
  ],
  safety: [
    "Mark victim-safe route and avoid direct confrontation with attacker.",
    "Alert police control room and nearest patrol with live coordinates.",
    "Send redacted public nearby alert so safe bystanders can assist quickly."
  ],
  outage: [
    "Prioritize power restore for hospitals and water systems.",
    "Deploy utility crews with backup communication kits.",
    "Issue public advisory for dark/high-risk zones."
  ],
  weather: [
    "Release weather safety alert with simple public instructions.",
    "Close vulnerable routes and bridges until verified safe.",
    "Prepare shelters and district check-ins for stranded groups."
  ],
  transit: [
    "Open emergency lane for responders immediately.",
    "Route crowd into directional zones to avoid choke points.",
    "Publish diversion routes every 10 minutes."
  ]
};

const assistantRiskWeights = {
  fire: 28,
  flood: 24,
  accident: 22,
  health: 23,
  safety: 31,
  outage: 18,
  weather: 20,
  transit: 19
};

const urgencyWeights = {
  low: 10,
  medium: 18,
  high: 28,
  critical: 40
};

const advisoryTemplates = {
  fire: "Stay upwind, avoid elevators, and keep stair access clear for responders.",
  flood: "Move to elevated ground and avoid all fast-moving water crossings.",
  accident: "Slow traffic around the scene and keep one clear lane for ambulances.",
  health: "Separate critical and non-critical patients and avoid crowding treatment zones.",
  safety: "Move to a safer nearby spot, contact 112, and share only redacted location publicly.",
  outage: "Avoid dark high-risk routes and preserve battery power for emergency calls.",
  weather: "Stay indoors where possible and avoid exposed roads until official updates clear them.",
  transit: "Follow controlled diversion routes and avoid gathering at choke points."
};

const assistantHistory = [];
const emergencyScenarioProfiles = {
  road_accident: {
    label: "Road Accident",
    hintType: "accident",
    minimumUrgency: "high",
    defaultDetails: "Road traffic collision. Immediate rescue and medical support needed.",
    teams: ["Traffic Police", "Ambulance Control", "Nearest Fire Rescue"],
    publicTemplate: "Road accident nearby. If you are close and safe, assist and call 112."
  },
  attack: {
    label: "Attack / Assault",
    hintType: "safety",
    minimumUrgency: "critical",
    defaultDetails: "Victim in direct danger. Police intervention needed immediately.",
    teams: ["Police Control Room", "Women Safety Cell", "Nearest Patrol Unit"],
    publicTemplate: "Possible assault nearby. Stay alert, call 112, and support safely from a secure position."
  },
  cab_risk: {
    label: "Unsafe Cab / Lock Risk",
    hintType: "safety",
    minimumUrgency: "critical",
    defaultDetails: "Cab route/lock risk. Vehicle interception and victim safety support required.",
    teams: ["Police Control Room", "Highway Patrol", "Women Safety Cell"],
    publicTemplate: "Possible unsafe cab situation nearby. Share route details with 112 and help only if safe."
  }
};

const urgencyRank = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const emergencyRuntime = {
  liveWatchId: null,
  liveTrackingEndsAt: 0,
  liveRelayAt: 0
};
const DISPATCH_LOG_KEY = "nexora-dispatch-log";

const emergencyRelayNetwork = [
  { id: "H-MC-1", name: "Metro Core Trauma Hospital", role: "hospital", trustTier: "official", district: "Metro Core", eta: 7, phone: "+91-90000-3001" },
  { id: "H-NT-1", name: "North Transit Civil Hospital", role: "hospital", trustTier: "official", district: "North Transit", eta: 10, phone: "+91-90000-3002" },
  { id: "H-RS-1", name: "Riverside Emergency Hospital", role: "hospital", trustTier: "official", district: "Riverside", eta: 8, phone: "+91-90000-3003" },
  { id: "H-MD-1", name: "Medical Cluster Critical Care", role: "hospital", trustTier: "official", district: "Medical Cluster", eta: 6, phone: "+91-90000-3004" },
  { id: "H-WB-1", name: "West Belt District Hospital", role: "hospital", trustTier: "official", district: "West Belt", eta: 11, phone: "+91-90000-3005" },

  { id: "A-MC-1", name: "Metro Core Ambulance Fleet", role: "ambulance", trustTier: "official", district: "Metro Core", eta: 5, phone: "+91-90000-3011" },
  { id: "A-RS-1", name: "Riverside Ambulance Dispatch", role: "ambulance", trustTier: "official", district: "Riverside", eta: 6, phone: "+91-90000-3012" },
  { id: "A-MD-1", name: "Medical Cluster Ambulance Grid", role: "ambulance", trustTier: "official", district: "Medical Cluster", eta: 6, phone: "+91-90000-3013" },
  { id: "A-HP-1", name: "Harbor Point Emergency Ambulance", role: "ambulance", trustTier: "official", district: "Harbor Point", eta: 8, phone: "+91-90000-3014" },

  { id: "P-MC-1", name: "Metro Core Police Control", role: "police", trustTier: "official", district: "Metro Core", eta: 5, phone: "+91-90000-3021" },
  { id: "P-NT-1", name: "North Transit Police Station", role: "police", trustTier: "official", district: "North Transit", eta: 7, phone: "+91-90000-3022" },
  { id: "P-RS-1", name: "Riverside Police Station", role: "police", trustTier: "official", district: "Riverside", eta: 6, phone: "+91-90000-3023" },
  { id: "P-WB-1", name: "West Belt Police Control", role: "police", trustTier: "official", district: "West Belt", eta: 8, phone: "+91-90000-3024" },
  { id: "P-FY-1", name: "Freight Yard Highway Patrol", role: "police", trustTier: "official", district: "Freight Yard", eta: 9, phone: "+91-90000-3025" },

  { id: "W-MC-1", name: "Metro Women Safety Cell", role: "women_safety", trustTier: "official", district: "Metro Core", eta: 6, phone: "+91-90000-3031" },
  { id: "W-UL-1", name: "University Loop Women Desk", role: "women_safety", trustTier: "official", district: "University Loop", eta: 7, phone: "+91-90000-3032" },
  { id: "W-RS-1", name: "Riverside Women Protection Unit", role: "women_safety", trustTier: "official", district: "Riverside", eta: 8, phone: "+91-90000-3033" },

  { id: "G-MC-1", name: "Metro Shield Fitness Safe Point", role: "safe_gym", trustTier: "verified_partner", district: "Metro Core", eta: 4, phone: "+91-90000-3041" },
  { id: "G-NT-1", name: "North Guardian Gym Safe Point", role: "safe_gym", trustTier: "verified_partner", district: "North Transit", eta: 5, phone: "+91-90000-3042" },
  { id: "G-RS-1", name: "Riverside Safety Fitness Hub", role: "safe_gym", trustTier: "verified_partner", district: "Riverside", eta: 5, phone: "+91-90000-3043" },
  { id: "G-SG-1", name: "South Gardens Safe Fitness Node", role: "safe_gym", trustTier: "verified_partner", district: "South Gardens", eta: 6, phone: "+91-90000-3044" },

  { id: "N-MC-1", name: "City Rapid NGO Responders", role: "ngo_responder", trustTier: "verified_partner", district: "Metro Core", eta: 7, phone: "+91-90000-3051" },
  { id: "N-UL-1", name: "University Volunteer Rescue", role: "ngo_responder", trustTier: "verified_partner", district: "University Loop", eta: 8, phone: "+91-90000-3052" },
  { id: "N-CE-1", name: "Canal Edge Civil Rescue NGO", role: "ngo_responder", trustTier: "verified_partner", district: "Canal Edge", eta: 9, phone: "+91-90000-3053" }
];

const scenarioDispatchBlueprints = {
  road_accident: {
    exact: { hospital: 3, ambulance: 2, police: 2 },
    redacted: { ngo_responder: 2, safe_gym: 1 }
  },
  attack: {
    exact: { police: 3, women_safety: 2, ambulance: 1, hospital: 1 },
    redacted: { safe_gym: 3, ngo_responder: 2 }
  },
  cab_risk: {
    exact: { police: 3, women_safety: 2, ambulance: 1 },
    redacted: { safe_gym: 3, ngo_responder: 2 }
  }
};

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch (error) {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Ignore storage write failures.
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Ignore storage remove failures.
  }
}

function readReports() {
  const raw = safeRead(REPORTS_KEY, "[]");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeReports(reports) {
  safeWrite(REPORTS_KEY, JSON.stringify(reports.slice(0, 150)));
}

function readShowcaseState() {
  const raw = safeRead(SHOWCASE_KEY, "{}");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeShowcaseState(state) {
  safeWrite(SHOWCASE_KEY, JSON.stringify(state));
}

function readAssistantContext() {
  const raw = safeRead(ASSISTANT_CONTEXT_KEY, "");
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function createShowcaseSeedReport() {
  const reports = readReports();
  if (reports.some(report => !report.resolved)) {
    return null;
  }
  const seeded = {
    id: `SC-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}`,
    district: "Metro Core",
    type: "fire",
    urgency: "critical",
    people: 64,
    notes: "Showcase scenario: multi-floor fire with active evacuation.",
    timestamp: new Date().toISOString(),
    resolved: false
  };
  reports.unshift(seeded);
  writeReports(reports);
  return seeded;
}

function applyTheme(mode) {
  const isLight = mode === "light";
  document.body.classList.toggle("theme-light", isLight);
  document.documentElement.dataset.theme = isLight ? "light" : "dark";

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.textContent = isLight ? "Nebula" : "Light";
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", isLight ? "#f4f8ff" : "#08111f");
  }

  safeWrite(THEME_KEY, isLight ? "light" : "nebula");
}

function initializeTheme() {
  const saved = safeRead(THEME_KEY, "nebula");
  applyTheme(saved === "light" ? "light" : "nebula");

  const toggle = document.getElementById("themeToggle");
  if (!toggle) {
    return;
  }
  toggle.addEventListener("click", () => {
    const isLight = document.body.classList.contains("theme-light");
    applyTheme(isLight ? "nebula" : "light");
  });
}

function initializeNavState() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  const pageMap = {
    "index.html": "home",
    "": "home",
    "network.html": "network",
    "community.html": "community",
    "coordination.html": "coordination"
  };
  const key = pageMap[page] || "home";

  document.querySelectorAll("[data-nav]").forEach(link => {
    link.classList.toggle("active", link.dataset.nav === key);
  });
}

function animateCounter(node, target) {
  const duration = 1200;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const value = Math.round(target * (1 - Math.pow(1 - progress, 3)));
    node.textContent = `${value}%`;
    if (progress < 1) {
      window.requestAnimationFrame(tick);
    }
  }

  window.requestAnimationFrame(tick);
}

function initializeCounters() {
  const counters = Array.from(document.querySelectorAll("[data-counter]"));
  if (!counters.length) {
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) {
        return;
      }
      const node = entry.target;
      const target = Number(node.dataset.counter || 0);
      if (!Number.isFinite(target) || node.dataset.animated === "true") {
        return;
      }
      node.dataset.animated = "true";
      animateCounter(node, target);
      observer.unobserve(node);
    });
  }, { threshold: 0.45 });

  counters.forEach(node => observer.observe(node));
}

function detectType(message) {
  const query = message.toLowerCase();
  if (query.includes("attack") || query.includes("assault") || query.includes("harass") || query.includes("kidnap") || query.includes("abduct") || query.includes("stalk")) return "safety";
  if (query.includes("unsafe cab") || query.includes("cab") || query.includes("driver lock") || query.includes("door lock")) return "safety";
  if (query.includes("fire")) return "fire";
  if (query.includes("flood") || query.includes("water")) return "flood";
  if (query.includes("accident") || query.includes("crash")) return "accident";
  if (query.includes("medical") || query.includes("health") || query.includes("injury")) return "health";
  if (query.includes("power") || query.includes("outage")) return "outage";
  if (query.includes("storm") || query.includes("weather") || query.includes("rain")) return "weather";
  if (query.includes("traffic") || query.includes("transit")) return "transit";
  return "weather";
}

function detectUrgency(message) {
  const query = message.toLowerCase();
  if (query.includes("attack") || query.includes("assault") || query.includes("kidnap") || query.includes("abduct") || query.includes("not safe")) return "critical";
  if (query.includes("cab") || query.includes("door lock") || query.includes("driver lock")) return "critical";
  if (query.includes("critical") || query.includes("major")) return "critical";
  if (query.includes("high") || query.includes("urgent")) return "high";
  if (query.includes("low")) return "low";
  return "medium";
}

function detectDistrict(message) {
  const query = message.toLowerCase();
  const found = knownDistricts.find(district => query.includes(district.toLowerCase()));
  return found || "Metro Core";
}

function bestResponder(type, district) {
  const sorted = [...responderNodes].sort((a, b) => {
    const typeBoostA = a.type === type ? -4 : 0;
    const typeBoostB = b.type === type ? -4 : 0;
    const districtBoostA = a.district === district ? -3 : 0;
    const districtBoostB = b.district === district ? -3 : 0;
    return (a.eta + typeBoostA + districtBoostA) - (b.eta + typeBoostB + districtBoostB);
  });
  return sorted.slice(0, 3);
}

function extractPeopleCount(message) {
  const query = message.toLowerCase();
  const numeric = query.match(/\b(\d{1,5})\b/);
  if (numeric) {
    return Math.max(1, Number(numeric[1]));
  }
  if (query.includes("mass") || query.includes("crowd") || query.includes("hundred")) {
    return 160;
  }
  if (query.includes("few")) {
    return 8;
  }
  return 20;
}

function detectSignals(message) {
  const query = message.toLowerCase();
  const rules = [
    { tokens: ["trapped", "stuck"], label: "People trapped", weight: 14 },
    { tokens: ["explosion", "blast"], label: "Explosion risk", weight: 15 },
    { tokens: ["smoke", "toxic", "gas"], label: "Air toxicity risk", weight: 12 },
    { tokens: ["child", "children", "school"], label: "Children exposed", weight: 8 },
    { tokens: ["elderly", "hospital", "icu"], label: "High vulnerability group", weight: 9 },
    { tokens: ["night", "dark"], label: "Low visibility", weight: 6 },
    { tokens: ["rain", "storm", "wind"], label: "Adverse weather", weight: 7 },
    { tokens: ["bridge", "highway", "tunnel"], label: "Complex access route", weight: 8 }
  ];

  return rules.filter(rule => rule.tokens.some(token => query.includes(token)));
}

function calculateRiskScore(type, urgency, people, signals, message) {
  const base = (assistantRiskWeights[type] || 20) + (urgencyWeights[urgency] || 18);
  const peopleFactor = Math.min(24, Math.round(Math.max(people - 10, 0) / 8));
  const signalFactor = Math.min(30, signals.reduce((sum, signal) => sum + signal.weight, 0));
  const criticalHint = /mass casualty|multiple injured|uncontrolled|rapid spread|collapse/i.test(message) ? 8 : 0;
  return Math.min(99, base + peopleFactor + signalFactor + criticalHint);
}

function riskBand(score) {
  if (score >= 85) return "SEVERE CRITICAL";
  if (score >= 70) return "VERY HIGH";
  if (score >= 55) return "HIGH";
  if (score >= 40) return "MODERATE";
  return "CONTROLLED";
}

function objectiveByType(type) {
  const map = {
    fire: "Life safety, smoke control, and perimeter containment.",
    flood: "Rapid evacuation, route integrity, and shelter continuity.",
    accident: "Golden-hour trauma care and traffic hazard isolation.",
    health: "Fast triage, critical treatment priority, and surge control.",
    safety: "Immediate victim safety, police interception, and secure public witness support.",
    outage: "Critical infrastructure continuity and public risk reduction.",
    weather: "Preventive mobility control and district safety coverage.",
    transit: "Access corridor recovery and responder route protection."
  };
  return map[type] || map.weather;
}

function recurrenceInsight(type, district) {
  const now = Date.now();
  const recent = assistantHistory.find(
    record =>
      record.type === type &&
      record.district === district &&
      now - record.timestamp < 45 * 60 * 1000
  );
  return recent
    ? "Pattern note: Similar incident analyzed in this zone recently. Escalate verification and route control sooner."
    : "Pattern note: No matching incident spike in the recent analysis window.";
}

function buildAnalysisContext(query) {
  const type = detectType(query);
  const urgency = detectUrgency(query);
  const district = detectDistrict(query);
  const people = extractPeopleCount(query);
  const signals = detectSignals(query);
  const riskScore = calculateRiskScore(type, urgency, people, signals, query);
  const band = riskBand(riskScore);
  const recommendations = bestResponder(type, district);
  const steps = playbooks[type] || playbooks.weather;
  const objective = objectiveByType(type);

  assistantHistory.unshift({
    type,
    district,
    riskScore,
    timestamp: Date.now()
  });
  if (assistantHistory.length > 16) {
    assistantHistory.length = 16;
  }

  return {
    rawQuery: query,
    type,
    urgency,
    district,
    people,
    signals,
    riskScore,
    band,
    recommendations,
    steps,
    objective
  };
}

function buildQuickAssistantResponse(context) {
  const escalation =
    context.urgency === "critical"
      ? "Critical level: alert control room, hospital desk, and field command together."
      : context.urgency === "high"
        ? "High level: push priority dispatch and issue public caution update."
        : "Medium/low level: monitor closely and keep local teams pre-positioned.";

  return [
    "Rex Quick Plan",
    `Situation: ${context.type.toUpperCase()} | District: ${context.district} | Urgency: ${context.urgency.toUpperCase()} | People: ${context.people}`,
    `Risk: ${context.riskScore}/99 (${context.band})`,
    "",
    "Immediate actions:",
    ...context.steps.map(step => `- ${step}`),
    `- ${escalation}`,
    "",
    "Primary dispatch:",
    ...context.recommendations.map(node => `- ${node.name} | ETA ${node.eta} min`)
  ].join("\n");
}

function buildDeepAssistantResponse(context) {
  const signalLine = context.signals.length
    ? context.signals.map(signal => signal.label).join(", ")
    : "No special signal keywords detected";

  return [
    "Rex Deep Strategic Brief",
    `Situation: ${context.type.toUpperCase()} | District: ${context.district} | Urgency: ${context.urgency.toUpperCase()} | Estimated people: ${context.people}`,
    `Risk score: ${context.riskScore}/99 (${context.band})`,
    `Core objective: ${context.objective}`,
    "",
    "Signal interpretation:",
    `- ${signalLine}`,
    `- ${recurrenceInsight(context.type, context.district)}`,
    "",
    "Action plan - First 3 minutes:",
    `- ${context.steps[0] || "Secure scene and establish command perimeter."}`,
    `- Alert incident command and lock one clear responder lane immediately.`,
    "",
    "Action plan - Next 15 minutes:",
    `- ${context.steps[1] || "Deploy nearest specialized response units."}`,
    `- ${context.steps[2] || "Stabilize risk growth and verify vulnerable groups."}`,
    "",
    "Dispatch matrix:",
    ...context.recommendations.map(node => `- ${node.name} | ETA ${node.eta} min | Contact ${node.contact}`),
    "",
    "Fallback if situation worsens:",
    `- Pre-stage secondary units in adjacent district to avoid queue collapse.`,
    `- Activate public advisory: ${advisoryTemplates[context.type] || advisoryTemplates.weather}`,
    `- Re-evaluate risk score every 5 minutes and escalate if trend rises.`,
    "",
    "Data to confirm now:",
    "- Exact hazard spread boundary",
    "- Number of critical injuries vs stable cases",
    "- Any blocked responder access points"
  ].join("\n");
}

function fillQuickReportFromContext(context, submitCase) {
  const form = document.getElementById("quickReportForm");
  const districtField = document.getElementById("quickDistrict");
  const typeField = document.getElementById("quickType");
  const urgencyField = document.getElementById("quickUrgency");
  const peopleField = document.getElementById("quickPeople");
  const notesField = document.getElementById("quickNotes");
  if (!form || !districtField || !typeField || !urgencyField || !peopleField || !notesField) {
    return { ok: false, message: "Command form is not available on this page." };
  }

  districtField.value = context.district;
  typeField.value = context.type;
  urgencyField.value = context.urgency;
  peopleField.value = String(context.people);
  const signals = context.signals.length ? context.signals.map(signal => signal.label).join(", ") : "No extra signals";
  notesField.value =
    `AI analysis | Risk ${context.riskScore}/99 (${context.band}) | Signals: ${signals} | Query: ${context.rawQuery}`;

  if (submitCase) {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
    return { ok: true, message: "Emergency case created from Rex analysis and synced." };
  }

  return { ok: true, message: "Command form filled from Rex analysis. Review and submit when ready." };
}

function copyTextToClipboard(text) {
  if (!text) {
    return Promise.resolve(false);
  }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.top = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return Promise.resolve(ok);
  } catch (error) {
    return Promise.resolve(false);
  }
}

function getScenarioProfile(scenarioKey) {
  return emergencyScenarioProfiles[scenarioKey] || emergencyScenarioProfiles.road_accident;
}

function strongestUrgency(left, right) {
  const leftValue = urgencyRank[left] || urgencyRank.medium;
  const rightValue = urgencyRank[right] || urgencyRank.medium;
  return leftValue >= rightValue ? left : right;
}

function normalizePhoneNumber(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }
  const startsWithPlus = value.startsWith("+");
  let digits = value.replace(/\D/g, "");
  if (!startsWithPlus && digits.length === 10) {
    digits = `91${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) {
    return "";
  }
  return `+${digits}`;
}

function uniqueList(items) {
  const seen = new Set();
  const result = [];
  items.forEach(item => {
    if (!item || seen.has(item)) {
      return;
    }
    seen.add(item);
    result.push(item);
  });
  return result;
}

function readTrustedContacts() {
  const raw = safeRead(TRUSTED_CONTACTS_KEY, "[]");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return uniqueList(parsed.map(normalizePhoneNumber).filter(Boolean)).slice(0, 3);
  } catch (error) {
    return [];
  }
}

function writeTrustedContacts(contacts) {
  const sanitized = uniqueList((contacts || []).map(normalizePhoneNumber).filter(Boolean)).slice(0, 3);
  safeWrite(TRUSTED_CONTACTS_KEY, JSON.stringify(sanitized));
  return sanitized;
}

function readLastSosPayload() {
  const raw = safeRead(LAST_SOS_PAYLOAD_KEY, "");
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function writeLastSosPayload(payload) {
  if (!payload) {
    return;
  }
  safeWrite(LAST_SOS_PAYLOAD_KEY, JSON.stringify(payload));
}

function readDispatchLog() {
  const raw = safeRead(DISPATCH_LOG_KEY, "[]");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeDispatchLog(entries) {
  safeWrite(DISPATCH_LOG_KEY, JSON.stringify((entries || []).slice(0, 300)));
}

function districtReachScore(targetDistrict, incidentDistrict) {
  const targetIndex = knownDistricts.indexOf(targetDistrict);
  const incidentIndex = knownDistricts.indexOf(incidentDistrict);
  if (targetIndex === -1 || incidentIndex === -1) {
    return 9;
  }
  const direct = Math.abs(targetIndex - incidentIndex);
  const wrap = knownDistricts.length - direct;
  const hops = Math.min(direct, wrap);
  if (hops === 0) return 28;
  if (hops === 1) return 21;
  if (hops === 2) return 14;
  return 8;
}

function rolePriorityForScenario(scenarioKey, role) {
  const matrix = {
    road_accident: {
      hospital: 100,
      ambulance: 98,
      police: 92,
      women_safety: 70,
      ngo_responder: 64,
      safe_gym: 52
    },
    attack: {
      police: 100,
      women_safety: 98,
      ambulance: 80,
      hospital: 74,
      safe_gym: 88,
      ngo_responder: 84
    },
    cab_risk: {
      police: 100,
      women_safety: 97,
      ambulance: 77,
      hospital: 70,
      safe_gym: 90,
      ngo_responder: 86
    }
  };
  const scenarioMap = matrix[scenarioKey] || matrix.road_accident;
  return scenarioMap[role] || 40;
}

function scoreDispatchCandidate(node, scenarioKey, district) {
  const roleScore = rolePriorityForScenario(scenarioKey, node.role);
  const districtScore = districtReachScore(node.district, district);
  const etaScore = Math.max(0, 24 - Math.max(1, Number(node.eta || 12)));
  return roleScore + districtScore + etaScore;
}

function createDispatchTarget(node, shareScope) {
  return {
    id: node.id,
    name: node.name,
    role: node.role,
    trustTier: node.trustTier,
    district: node.district,
    eta: Number(node.eta || 0),
    phone: node.phone,
    shareScope
  };
}

function pickTargetsByRole(scoredNodes, role, limit, selectedIds, shareScope) {
  if (!limit) {
    return [];
  }
  const chosen = [];
  scoredNodes
    .filter(node => node.role === role && !selectedIds.has(node.id))
    .slice(0, Math.max(0, Number(limit)))
    .forEach(node => {
      selectedIds.add(node.id);
      chosen.push(createDispatchTarget(node, shareScope));
    });
  return chosen;
}

function buildAutoDispatchPlan(scenarioKey, context) {
  const blueprint = scenarioDispatchBlueprints[scenarioKey] || scenarioDispatchBlueprints.road_accident;
  const scored = emergencyRelayNetwork
    .map(node => ({
      ...node,
      score: scoreDispatchCandidate(node, scenarioKey, context.district)
    }))
    .sort((a, b) => b.score - a.score || a.eta - b.eta);

  const selectedIds = new Set();
  const exactTargets = [];
  Object.entries(blueprint.exact || {}).forEach(([role, limit]) => {
    exactTargets.push(...pickTargetsByRole(scored, role, limit, selectedIds, "exact"));
  });

  const redactedTargets = [];
  Object.entries(blueprint.redacted || {}).forEach(([role, limit]) => {
    redactedTargets.push(...pickTargetsByRole(scored, role, limit, selectedIds, "redacted"));
  });

  return {
    exactTargets,
    redactedTargets,
    totalTargets: exactTargets.length + redactedTargets.length
  };
}

function summarizeDispatchPlan(plan) {
  if (!plan) {
    return "No automatic dispatch plan available.";
  }
  const exact = plan.exactTargets?.length || 0;
  const redacted = plan.redactedTargets?.length || 0;
  const byRole = {};
  [...(plan.exactTargets || []), ...(plan.redactedTargets || [])].forEach(target => {
    byRole[target.role] = (byRole[target.role] || 0) + 1;
  });
  const roleLine = Object.keys(byRole).length
    ? Object.entries(byRole).map(([role, count]) => `${count} ${role}`).join(", ")
    : "none";
  return `Auto dispatch: ${exact} exact + ${redacted} redacted targets (${roleLine}).`;
}

function formatCoordinate(value, precision = 5) {
  return Number.isFinite(value) ? Number(value).toFixed(precision) : "--";
}

function buildMapLink(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "";
  }
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

function resolveLiveLocation(timeoutMs = 9000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve({ ok: false, error: "Geolocation not supported in this browser." });
      return;
    }
    let settled = false;
    const finish = payload => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(payload);
    };

    const timeoutId = window.setTimeout(() => {
      finish({ ok: false, error: "Location request timed out." });
    }, timeoutMs + 250);

    navigator.geolocation.getCurrentPosition(
      position => {
        window.clearTimeout(timeoutId);
        finish({
          ok: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy || 0),
          timestamp: position.timestamp || Date.now()
        });
      },
      error => {
        window.clearTimeout(timeoutId);
        finish({
          ok: false,
          error: error?.message || "Unable to access location."
        });
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0
      }
    );
  });
}

function buildEmergencyContextFromScenario(scenarioKey, detailsText) {
  const profile = getScenarioProfile(scenarioKey);
  const query = `${profile.label} ${detailsText || profile.defaultDetails}`;
  const context = buildAnalysisContext(query);
  context.type = profile.hintType || context.type;
  context.urgency = strongestUrgency(context.urgency, profile.minimumUrgency);
  context.steps = playbooks[context.type] || playbooks.weather;
  context.objective = objectiveByType(context.type);
  context.recommendations = bestResponder(context.type, context.district);
  if (context.type === "safety") {
    context.riskScore = Math.max(context.riskScore, 84);
    context.band = riskBand(context.riskScore);
  }
  return context;
}

function routingPolicyForScenario(scenarioKey, urgency) {
  const base = {
    officialTargets: ["112 Control Room"],
    publicBroadcast: true,
    publicPrecision: 3,
    rationale: "Only verified responders get exact coordinates. Public gets redacted location."
  };
  if (scenarioKey === "attack") {
    return {
      ...base,
      officialTargets: ["112 Control Room", "Police Dispatch", "Women Safety Cell"],
      publicBroadcast: true
    };
  }
  if (scenarioKey === "cab_risk") {
    return {
      ...base,
      officialTargets: ["112 Control Room", "Police Dispatch", "Highway Patrol"],
      publicBroadcast: true
    };
  }
  if (scenarioKey === "road_accident") {
    return {
      ...base,
      officialTargets: ["112 Control Room", "Ambulance Dispatch", "Traffic Police"],
      publicBroadcast: (urgencyRank[urgency] || 2) >= 3
    };
  }
  return base;
}

function isLikelyHighwayIncident(details = "") {
  const lowered = String(details || "").toLowerCase();
  return HIGHWAY_KEYWORDS.some(keyword => lowered.includes(keyword));
}

function buildHotlinePlan({ scenarioKey, details }) {
  const channels = [EMERGENCY_NUMBERS_IN.primary];
  const highwayCase = scenarioKey === "road_accident" && isLikelyHighwayIncident(details);

  if (scenarioKey === "road_accident") {
    channels.push(highwayCase ? EMERGENCY_NUMBERS_IN.roadHighway : EMERGENCY_NUMBERS_IN.ambulance);
  }
  if (scenarioKey === "attack" || scenarioKey === "cab_risk") {
    channels.push(EMERGENCY_NUMBERS_IN.womenSafety);
  }

  const uniqueChannels = uniqueList(channels.map(channel => channel.number)).map(number =>
    channels.find(channel => channel.number === number)
  );
  return {
    primaryNumber: uniqueChannels[0]?.number || "112",
    channels: uniqueChannels,
    highwayCase,
    summary: uniqueChannels.map(channel => `${channel.number} (${channel.label})`).join(" -> ")
  };
}

function buildSosPayload({ scenarioKey, detailsText, context, location, contacts, triggerSource }) {
  const profile = getScenarioProfile(scenarioKey);
  const now = new Date();
  const id = `SOS-${Math.floor(now.getTime() / 1000).toString(36).toUpperCase()}`;
  const hasLocation = Boolean(location?.ok);
  const latitude = hasLocation ? Number(location.latitude) : null;
  const longitude = hasLocation ? Number(location.longitude) : null;
  const policy = routingPolicyForScenario(scenarioKey, context.urgency);
  const hotlinePlan = buildHotlinePlan({
    scenarioKey,
    details: detailsText || profile.defaultDetails
  });
  const dispatchPlan = buildAutoDispatchPlan(scenarioKey, context);
  const officialTargets = uniqueList([
    ...policy.officialTargets,
    ...(dispatchPlan.exactTargets || []).map(target => target.name)
  ]);
  const verifiedTargets = uniqueList((dispatchPlan.redactedTargets || []).map(target => target.name));

  const payload = {
    id,
    createdAt: now.toISOString(),
    triggerSource,
    scenarioKey,
    scenarioLabel: profile.label,
    details: detailsText || profile.defaultDetails,
    contextType: context.type,
    urgency: context.urgency,
    riskScore: context.riskScore,
    riskBand: context.band,
    district: context.district,
    teams: profile.teams,
    officialTargets,
    hotlinePlan,
    verifiedTargets,
    routingRationale: policy.rationale,
    dispatchPlan,
    dispatchSummary: summarizeDispatchPlan(dispatchPlan),
    contacts: contacts || [],
    locationAvailable: hasLocation,
    latitude,
    longitude,
    accuracy: hasLocation ? Number(location.accuracy || 0) : 0,
    mapLink: hasLocation ? buildMapLink(latitude, longitude) : "",
    locationPrecise: hasLocation
      ? `${formatCoordinate(latitude, 5)}, ${formatCoordinate(longitude, 5)} (±${Math.max(1, Math.round(location.accuracy || 0))}m)`
      : "Location unavailable",
    locationPublic: hasLocation
      ? `${formatCoordinate(latitude, policy.publicPrecision)}, ${formatCoordinate(longitude, policy.publicPrecision)}`
      : "Location unavailable",
    publicBroadcast: policy.publicBroadcast
  };

  payload.privateMessage = buildPrivateSosMessage(payload);
  payload.publicMessage = buildPublicSosMessage(payload);
  return payload;
}

function buildPrivateSosMessage(payload) {
  const exactTargets = payload.dispatchPlan?.exactTargets || [];
  const redactedTargets = payload.dispatchPlan?.redactedTargets || [];
  const exactLine = exactTargets.length
    ? exactTargets.map(target => `${target.name} (${target.phone})`).join(", ")
    : "none";
  const redactedLine = redactedTargets.length
    ? redactedTargets.map(target => `${target.name} (${target.role})`).join(", ")
    : "none";
  return [
    `SOS ${payload.id}`,
    `Scenario: ${payload.scenarioLabel} | Urgency: ${payload.urgency.toUpperCase()} | Risk: ${payload.riskScore}/99 (${payload.riskBand})`,
    `Official call order: ${payload.hotlinePlan?.summary || "112 (ERSS National Emergency)"}`,
    `Dispatch targets: ${payload.officialTargets.join(", ")}`,
    payload.dispatchSummary,
    `Exact-location dispatch: ${exactLine}`,
    `Redacted-support dispatch: ${redactedLine}`,
    `Live location: ${payload.mapLink || "Unavailable"}`,
    `Coordinates: ${payload.locationPrecise}`,
    `Details: ${payload.details}`,
    `Time: ${new Date(payload.createdAt).toLocaleString()}`
  ].join("\n");
}

function buildPublicSosMessage(payload) {
  const profile = getScenarioProfile(payload.scenarioKey);
  return [
    `Nearby alert: ${payload.scenarioLabel}`,
    profile.publicTemplate,
    `Verified local support alerted: ${(payload.dispatchPlan?.redactedTargets || []).length}`,
    `Approx location: ${payload.locationPublic}`,
    `Map area: ${payload.mapLink || "Location unavailable"}`,
    "If you are nearby and safe, call 112 immediately and assist only from a secure position.",
    `Ref ID: ${payload.id}`
  ].join("\n");
}

function appendEmergencyReport(payload) {
  const reports = readReports();
  const report = {
    id: payload.id,
    district: payload.district || "Metro Core",
    type: payload.contextType || "accident",
    urgency: payload.urgency || "high",
    people: payload.scenarioKey === "road_accident" ? 4 : 1,
    notes:
      `${payload.scenarioLabel}: ${payload.details} | Targets: ${payload.officialTargets.join(", ")} | ` +
      `${payload.dispatchSummary} | Map: ${payload.mapLink || "Unavailable"}`,
    timestamp: payload.createdAt,
    resolved: false
  };
  reports.unshift(report);
  writeReports(reports);
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomNonce(size = 16) {
  const bytes = new Uint8Array(size);
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  if (!(window.crypto && window.crypto.subtle)) {
    return "";
  }
  const encoded = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(digest);
}

async function hmacSha256Hex(secret, message) {
  if (!(window.crypto && window.crypto.subtle)) {
    return "";
  }
  const keyData = new TextEncoder().encode(secret);
  const key = await window.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await window.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToHex(signature);
}

async function buildRelaySecurityHeaders(endpoint, bodyText) {
  const config = typeof window.NEXORA_RELAY_SECURITY === "object" && window.NEXORA_RELAY_SECURITY
    ? window.NEXORA_RELAY_SECURITY
    : {};

  const token = String(config.bearerToken || window.NEXORA_RELAY_BEARER_TOKEN || "").trim();
  const keyId = String(config.keyId || window.NEXORA_RELAY_KEY_ID || "").trim();
  const signingSecret = String(config.signingSecret || window.NEXORA_RELAY_SIGNING_SECRET || "").trim();
  const algorithm = String(config.algorithm || "HMAC-SHA256");

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const canSign =
    keyId &&
    signingSecret &&
    window.crypto &&
    window.crypto.subtle &&
    typeof window.crypto.subtle.importKey === "function";

  if (!canSign) {
    return { headers, signed: false };
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomNonce(16);
  const path = new URL(endpoint, window.location.origin).pathname;
  const bodyHash = await sha256Hex(bodyText);
  const canonical = ["POST", path, timestamp, nonce, bodyHash].join("\n");
  const signature = await hmacSha256Hex(signingSecret, canonical);

  headers["X-Nexora-Key-Id"] = keyId;
  headers["X-Nexora-Timestamp"] = timestamp;
  headers["X-Nexora-Nonce"] = nonce;
  headers["X-Nexora-Body-SHA256"] = bodyHash;
  headers["X-Nexora-Signature"] = signature;
  headers["X-Nexora-Alg"] = algorithm;
  return { headers, signed: true };
}

async function sendOfficialRelay(payload) {
  const endpoint = typeof window.NEXORA_RELAY_ENDPOINT === "string" ? window.NEXORA_RELAY_ENDPOINT.trim() : "";
  if (!endpoint) {
    return Promise.resolve({ ok: false, skipped: true });
  }

  try {
    const bodyText = JSON.stringify(payload);
    const security = await buildRelaySecurityHeaders(endpoint, bodyText);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...security.headers
      },
      body: bodyText
    });
    return { ok: response.ok, status: response.status, signed: security.signed };
  } catch (error) {
    return { ok: false, status: 0, signed: false };
  }
}

async function relayAutoDispatchPlan(payload) {
  const plan = payload?.dispatchPlan;
  const exactTargets = plan?.exactTargets || [];
  const redactedTargets = plan?.redactedTargets || [];
  const total = exactTargets.length + redactedTargets.length;

  if (!total) {
    return { ok: false, skipped: true, total: 0, relayed: 0, queued: 0 };
  }

  const relayResult = await sendOfficialRelay({
    event: "auto_dispatch_batch",
    payload: {
      id: payload.id,
      createdAt: payload.createdAt,
      scenarioKey: payload.scenarioKey,
      district: payload.district,
      urgency: payload.urgency,
      exactLocationTargets: exactTargets.map(target => ({
        id: target.id,
        name: target.name,
        role: target.role,
        district: target.district,
        phone: target.phone
      })),
      redactedLocationTargets: redactedTargets.map(target => ({
        id: target.id,
        name: target.name,
        role: target.role,
        district: target.district,
        phone: target.phone
      })),
      location: payload.locationAvailable
        ? {
            latitude: payload.latitude,
            longitude: payload.longitude,
            accuracy: payload.accuracy,
            mapLink: payload.mapLink
          }
        : null,
      redactedLocation: payload.locationPublic,
      details: payload.details
    }
  });

  const status = relayResult.ok ? "relayed" : relayResult.skipped ? "queued_local" : "relay_failed_queued";
  const dispatchEntry = {
    id: payload.id,
    timestamp: new Date().toISOString(),
    scenario: payload.scenarioKey,
    district: payload.district,
    status,
    exactTargets: exactTargets.map(target => ({ ...target, status })),
    redactedTargets: redactedTargets.map(target => ({ ...target, status }))
  };
  const log = readDispatchLog();
  log.unshift(dispatchEntry);
  writeDispatchLog(log);

  return {
    ok: relayResult.ok,
    skipped: Boolean(relayResult.skipped),
    status,
    total,
    relayed: relayResult.ok ? total : 0,
    queued: relayResult.ok ? 0 : total
  };
}

function tryOpenSmsDraft(contacts, text) {
  if (!contacts || !contacts.length) {
    return { ok: false, reason: "No trusted contacts saved." };
  }
  try {
    const recipients = contacts.join(",");
    window.location.href = `sms:${recipients}?body=${encodeURIComponent(text)}`;
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "Unable to open SMS app in this browser." };
  }
}

function tryCallEmergencyNumber(number = "112") {
  const clean = String(number || "").replace(/[^\d+]/g, "");
  if (!clean) {
    return false;
  }
  try {
    window.location.href = `tel:${clean}`;
    return true;
  } catch (error) {
    return false;
  }
}

async function trySharePublicAlert(text, interactive = true) {
  if (!text) {
    return { ok: false, mode: "empty" };
  }

  if (!interactive) {
    const copied = await copyTextToClipboard(text);
    return copied ? { ok: true, mode: "copied" } : { ok: false, mode: "manual" };
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Nearby Emergency Alert",
        text
      });
      return { ok: true, mode: "share_sheet" };
    } catch (error) {
      // Continue to fallback.
    }
  }

  try {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) {
      return { ok: true, mode: "whatsapp" };
    }
  } catch (error) {
    // Continue to clipboard fallback.
  }
  const copied = await copyTextToClipboard(text);
  return copied ? { ok: true, mode: "copied" } : { ok: false, mode: "manual" };
}

function stopLiveLocationWatch() {
  if (emergencyRuntime.liveWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(emergencyRuntime.liveWatchId);
  }
  emergencyRuntime.liveWatchId = null;
  emergencyRuntime.liveTrackingEndsAt = 0;
  emergencyRuntime.liveRelayAt = 0;
}

function startLiveLocationWatch(payload, onUpdate, onNotice) {
  if (!navigator.geolocation) {
    return false;
  }
  stopLiveLocationWatch();
  emergencyRuntime.liveTrackingEndsAt = Date.now() + 15 * 60 * 1000;

  emergencyRuntime.liveWatchId = navigator.geolocation.watchPosition(
    position => {
      if (Date.now() > emergencyRuntime.liveTrackingEndsAt) {
        stopLiveLocationWatch();
        onNotice?.("Live tracking auto-stopped after 15 minutes.");
        return;
      }

      payload.locationAvailable = true;
      payload.latitude = Number(position.coords.latitude);
      payload.longitude = Number(position.coords.longitude);
      payload.accuracy = Math.round(position.coords.accuracy || 0);
      payload.mapLink = buildMapLink(payload.latitude, payload.longitude);
      payload.locationPrecise =
        `${formatCoordinate(payload.latitude, 5)}, ${formatCoordinate(payload.longitude, 5)} ` +
        `(±${Math.max(1, payload.accuracy)}m)`;
      payload.locationPublic = `${formatCoordinate(payload.latitude, 3)}, ${formatCoordinate(payload.longitude, 3)}`;
      payload.privateMessage = buildPrivateSosMessage(payload);
      payload.publicMessage = buildPublicSosMessage(payload);
      writeLastSosPayload(payload);
      onUpdate?.(payload);

      const shouldRelay = Date.now() - emergencyRuntime.liveRelayAt > 18000;
      if (shouldRelay) {
        emergencyRuntime.liveRelayAt = Date.now();
        sendOfficialRelay({
          event: "live_location_update",
          payload: {
            id: payload.id,
            updatedAt: new Date().toISOString(),
            latitude: payload.latitude,
            longitude: payload.longitude,
            accuracy: payload.accuracy,
            scenarioKey: payload.scenarioKey,
            exactTargetIds: (payload.dispatchPlan?.exactTargets || []).map(target => target.id),
            redactedTargetIds: (payload.dispatchPlan?.redactedTargets || []).map(target => target.id),
            redactedLocation: payload.locationPublic
          }
        });
      }
    },
    error => {
      onNotice?.(`Live tracking paused: ${error?.message || "location update failed"}.`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 9000
    }
  );
  return true;
}

function initializeEmergencyConsole() {
  const root = document.getElementById("realEmergency");
  if (!root) {
    return;
  }

  const scenarioButtons = Array.from(document.querySelectorAll(".emergency-scenario-btn"));
  const detailsField = document.getElementById("emergencyDetails");
  const runButton = document.getElementById("emergencyRunBtn");
  const callButton = document.getElementById("emergencyCallBtn");
  const callRoadButton = document.getElementById("emergencyCallRoadBtn");
  const callMedicalButton = document.getElementById("emergencyCallMedicalBtn");
  const nearbyHelpButton = document.getElementById("emergencyNearbyHelpBtn");
  const officialBlastButton = document.getElementById("emergencyOfficialBlastBtn");
  const smsButton = document.getElementById("emergencySmsBtn");
  const copyButton = document.getElementById("emergencyCopyBtn");
  const statusNode = document.getElementById("emergencyStatus");
  const officialPlanNode = document.getElementById("emergencyOfficialPlan");
  const previewNode = document.getElementById("emergencyPayloadPreview");

  const contactInputs = [
    document.getElementById("trustedContact1"),
    document.getElementById("trustedContact2"),
    document.getElementById("trustedContact3")
  ];
  const saveContactsButton = document.getElementById("saveContactsBtn");
  const tripGuardMinutes = document.getElementById("tripGuardMinutes");
  const tripGuardStartButton = document.getElementById("tripGuardStartBtn");
  const tripGuardSafeButton = document.getElementById("tripGuardSafeBtn");
  const tripGuardStopButton = document.getElementById("tripGuardStopBtn");
  const voiceSosToggle = document.getElementById("voiceSosToggle");
  const tripGuardStatus = document.getElementById("tripGuardStatus");
  const tripGuardCountdown = document.getElementById("tripGuardCountdown");

  if (!detailsField || !runButton || !statusNode || !previewNode || !callButton || !smsButton || !copyButton) {
    return;
  }

  let selectedScenario = safeRead("nexora-selected-scenario", "cab_risk");
  if (!emergencyScenarioProfiles[selectedScenario]) {
    selectedScenario = "cab_risk";
  }
  let latestPayload = readLastSosPayload();
  let sosInFlight = false;

  let tripGuardTicker = null;
  let tripGuardDeadline = 0;
  let tripGuardIntervalMs = 2 * 60 * 1000;
  let tripGuardActive = false;
  let tripGuardEscalating = false;

  let voiceRecognizer = null;
  let voiceEnabled = false;
  let lastWakeTriggerAt = 0;

  const setStatus = (message, level = "neutral") => {
    statusNode.className =
      level === "critical" ? "status critical" : level === "warn" ? "status warn" : level === "good" ? "status good" : "status";
    statusNode.textContent = message;
  };

  const setTripGuardStatus = (message, level = "neutral") => {
    if (!tripGuardStatus) {
      return;
    }
    tripGuardStatus.className =
      level === "critical" ? "status critical" : level === "warn" ? "status warn" : level === "good" ? "status good" : "status";
    tripGuardStatus.textContent = message;
  };

  const renderOfficialPlan = payload => {
    if (!officialPlanNode) {
      return;
    }
    const plan = payload?.hotlinePlan || buildHotlinePlan({
      scenarioKey: selectedScenario,
      details: detailsField.value || getScenarioProfile(selectedScenario).defaultDetails
    });
    const note = plan.highwayCase
      ? "Highway pattern detected: prioritize 1033 after 112."
      : "Use 112 first, then medical/police support channel.";
    officialPlanNode.textContent = `Official call order: ${plan.summary}. ${note}`;
  };

  const renderPayloadPreview = payload => {
    if (!payload) {
      previewNode.textContent = "No SOS payload generated yet.";
      return;
    }
    const exactTargets = (payload.dispatchPlan?.exactTargets || [])
      .map(target => `${target.name} (${target.role}, ETA ${target.eta}m)`)
      .join(" | ");
    const redactedTargets = (payload.dispatchPlan?.redactedTargets || [])
      .map(target => `${target.name} (${target.role})`)
      .join(" | ");

    previewNode.textContent = [
      `SOS ID: ${payload.id}`,
      `Scenario: ${payload.scenarioLabel} | Trigger: ${payload.triggerSource}`,
      `Urgency: ${payload.urgency.toUpperCase()} | Risk: ${payload.riskScore}/99 (${payload.riskBand})`,
      `Official call order: ${payload.hotlinePlan?.summary || "112 (ERSS National Emergency)"}`,
      `Official routing: ${payload.officialTargets.join(" -> ")}`,
      `Dispatch summary: ${payload.dispatchSummary}`,
      `Exact responders: ${exactTargets || "none"}`,
      `Verified helper points (redacted): ${redactedTargets || "none"}`,
      `Private location: ${payload.locationPrecise}`,
      `Public redacted location: ${payload.locationPublic}`,
      `Map: ${payload.mapLink || "Unavailable"}`,
      "",
      "Private SOS message:",
      payload.privateMessage,
      "",
      "Public nearby alert (redacted):",
      payload.publicMessage
    ].join("\n");
  };

  const readContactsFromInputs = () =>
    uniqueList(contactInputs.map(input => normalizePhoneNumber(input?.value || "")).filter(Boolean)).slice(0, 3);

  const loadContactsToInputs = () => {
    const saved = readTrustedContacts();
    contactInputs.forEach((input, index) => {
      if (!input) {
        return;
      }
      input.value = saved[index] || "";
    });
  };

  const saveContactsFromInputs = () => {
    const contacts = writeTrustedContacts(readContactsFromInputs());
    contactInputs.forEach((input, index) => {
      if (!input) {
        return;
      }
      input.value = contacts[index] || "";
    });
    return contacts;
  };

  const updateEmergencyActionLabels = () => {
    if (callRoadButton) {
      const roadPlan = buildHotlinePlan({
        scenarioKey: "road_accident",
        details: detailsField.value || ""
      });
      callRoadButton.textContent = roadPlan.highwayCase ? "Call 1033 Highway" : "Call 108 Ambulance";
    }
    if (callButton) {
      callButton.textContent = "Call 112 Now";
    }
  };

  const openNearbyResponderSearch = async () => {
    setStatus("Fetching location for nearby responders...", "warn");
    const location = await resolveLiveLocation(7000);
    const query =
      selectedScenario === "road_accident"
        ? "trauma hospital ambulance police station near me"
        : "police station women help desk hospital near me";

    let mapUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    if (location?.ok) {
      mapUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${location.latitude},${location.longitude},15z`;
    }
    try {
      const popup = window.open(mapUrl, "_blank", "noopener,noreferrer");
      if (popup) {
        setStatus("Opened nearby responder map search.", "good");
      } else {
        setStatus("Popup blocked. Open Google Maps manually and search nearby responders.", "warn");
      }
    } catch (error) {
      setStatus("Unable to open map here. Search nearby hospitals/police in Maps.", "warn");
    }
  };

  const selectScenario = scenarioKey => {
    if (!emergencyScenarioProfiles[scenarioKey]) {
      return;
    }
    selectedScenario = scenarioKey;
    safeWrite("nexora-selected-scenario", selectedScenario);
    scenarioButtons.forEach(button => {
      button.classList.toggle("is-selected", button.dataset.sosScenario === selectedScenario);
    });
    updateEmergencyActionLabels();
    renderOfficialPlan(null);
  };

  const formatCountdown = ms => {
    if (ms <= 0) {
      return "00:00";
    }
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const updateTripGuardCountdown = () => {
    if (!tripGuardCountdown) {
      return;
    }
    if (!tripGuardActive || !tripGuardDeadline) {
      tripGuardCountdown.textContent = "Countdown: --";
      return;
    }
    const remaining = Math.max(0, tripGuardDeadline - Date.now());
    tripGuardCountdown.textContent = `Countdown: ${formatCountdown(remaining)}`;
  };

  const stopTripGuard = message => {
    tripGuardActive = false;
    tripGuardDeadline = 0;
    if (tripGuardTicker) {
      window.clearInterval(tripGuardTicker);
      tripGuardTicker = null;
    }
    updateTripGuardCountdown();
    setTripGuardStatus(message || "Trip Guard is inactive.", "neutral");
  };

  const resetTripGuard = () => {
    tripGuardDeadline = Date.now() + tripGuardIntervalMs;
    updateTripGuardCountdown();
    setTripGuardStatus("Trip Guard active. Safety check-in timer reset.", "good");
  };

  const runSosFlow = async (triggerSource, options = {}) => {
    if (sosInFlight) {
      setStatus("SOS flow already running. Please wait a few seconds.", "warn");
      return latestPayload;
    }
    sosInFlight = true;
    try {
      const scenarioKey = options.scenarioKey || selectedScenario;
      const profile = getScenarioProfile(scenarioKey);
      const detailsText = (options.detailsText || detailsField.value || "").trim() || profile.defaultDetails;
      const contacts = saveContactsFromInputs();

      setStatus("Fetching live location and creating secure SOS payload...", "warn");
      const location = await resolveLiveLocation(8500);
      const context = buildEmergencyContextFromScenario(scenarioKey, detailsText);
      const payload = buildSosPayload({
        scenarioKey,
        detailsText,
        context,
        location,
        contacts,
        triggerSource
      });

      writeLastSosPayload(payload);
      appendEmergencyReport(payload);
      latestPayload = payload;
      renderPayloadPreview(payload);
      renderOfficialPlan(payload);

      const relayResult = await sendOfficialRelay({
        event: "sos_created",
        payload
      });
      const dispatchResult = await relayAutoDispatchPlan(payload);
      const publicResult = payload.publicBroadcast
        ? await trySharePublicAlert(payload.publicMessage, triggerSource !== "trip_guard_timeout")
        : { ok: false, mode: "disabled" };
      const copied = await copyTextToClipboard(payload.privateMessage);
      const shouldAutoDial = Boolean(options.autoDial);
      const dialTarget = payload.hotlinePlan?.primaryNumber || "112";
      const dialed = shouldAutoDial ? tryCallEmergencyNumber(dialTarget) : false;

      const trackingStarted = startLiveLocationWatch(
        payload,
        updatedPayload => {
          latestPayload = updatedPayload;
          renderPayloadPreview(updatedPayload);
        },
        notice => {
          setStatus(notice, "warn");
        }
      );

      const parts = [];
      parts.push(`${payload.id} active`);
      parts.push(payload.locationAvailable ? "live location locked" : "location unavailable");
      parts.push(relayResult.ok ? "official relay sent" : relayResult.skipped ? "official relay not configured" : "official relay failed");
      if (dispatchResult.total > 0) {
        parts.push(
          dispatchResult.ok
            ? `auto dispatch relayed to ${dispatchResult.relayed} teams`
            : `auto dispatch queued for ${dispatchResult.queued} teams`
        );
      }
      parts.push(payload.publicBroadcast ? `public alert ${publicResult.mode}` : "public alert skipped");
      parts.push(copied ? "private message copied" : "copy unavailable");
      parts.push(`call order ${payload.hotlinePlan?.summary || "112"}`);
      if (shouldAutoDial) {
        parts.push(dialed ? `dialing ${dialTarget}` : `manual dial needed (${dialTarget})`);
      }
      if (trackingStarted) {
        parts.push("continuous tracking started");
      }
      setStatus(parts.join(" | "), payload.urgency === "critical" ? "critical" : "good");
      return payload;
    } finally {
      sosInFlight = false;
    }
  };

  const handleTripGuardTick = async () => {
    if (!tripGuardActive) {
      return;
    }
    updateTripGuardCountdown();
    const remaining = tripGuardDeadline - Date.now();
    if (remaining > 0 || tripGuardEscalating) {
      return;
    }
    tripGuardEscalating = true;
    setTripGuardStatus("Trip Guard check-in missed. Triggering automatic SOS now.", "critical");
    await runSosFlow("trip_guard_timeout", {
      scenarioKey: "cab_risk",
      detailsText: "Trip Guard missed safety check-in. Potential distress during travel."
    });
    stopTripGuard("Trip Guard auto-SOS sent. Restart if travel continues.");
    tripGuardEscalating = false;
  };

  const startTripGuard = () => {
    const minutes = Math.max(1, Number(tripGuardMinutes?.value || 2));
    tripGuardIntervalMs = minutes * 60 * 1000;
    tripGuardActive = true;
    resetTripGuard();
    if (!tripGuardTicker) {
      tripGuardTicker = window.setInterval(() => {
        handleTripGuardTick();
      }, 1000);
    }
    setTripGuardStatus(`Trip Guard started (${minutes} minute interval).`, "good");
  };

  const updateVoiceToggleUi = () => {
    if (!voiceSosToggle) {
      return;
    }
    voiceSosToggle.textContent = voiceEnabled ? "Voice SOS: On" : "Voice SOS: Off";
    voiceSosToggle.setAttribute("aria-pressed", voiceEnabled ? "true" : "false");
  };

  const stopVoiceSos = () => {
    voiceEnabled = false;
    if (voiceRecognizer) {
      try {
        voiceRecognizer.stop();
      } catch (error) {
        // Ignore speech stop errors.
      }
    }
    updateVoiceToggleUi();
    setStatus("Voice SOS stopped.", "neutral");
  };

  const startVoiceSos = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceSosToggle.disabled = true;
      voiceSosToggle.textContent = "Voice SOS: Unsupported";
      setStatus("Voice SOS is not supported in this browser.", "warn");
      return;
    }

    if (!voiceRecognizer) {
      voiceRecognizer = new SpeechRecognition();
      voiceRecognizer.continuous = true;
      voiceRecognizer.interimResults = false;
      voiceRecognizer.lang = "en-IN";

      voiceRecognizer.addEventListener("result", event => {
        const transcript = Array.from(event.results)
          .slice(event.resultIndex)
          .map(result => result[0]?.transcript || "")
          .join(" ")
          .toLowerCase();
        if (!transcript.includes("wake up rex")) {
          return;
        }
        const now = Date.now();
        if (now - lastWakeTriggerAt < 15000) {
          return;
        }
        lastWakeTriggerAt = now;
        setStatus('Voice wake phrase detected: "wake up rex". Triggering SOS.', "critical");
        runSosFlow("voice", {
          scenarioKey: "cab_risk",
          detailsText: "Voice wake phrase detected. User may be in immediate danger."
        });
      });

      voiceRecognizer.addEventListener("end", () => {
        if (!voiceEnabled) {
          return;
        }
        try {
          voiceRecognizer.start();
        } catch (error) {
          voiceEnabled = false;
          updateVoiceToggleUi();
          setStatus("Voice SOS restarted failed. Tap toggle to retry.", "warn");
        }
      });

      voiceRecognizer.addEventListener("error", () => {
        if (!voiceEnabled) {
          return;
        }
        setStatus("Voice SOS had a microphone error. Retrying.", "warn");
      });
    }

    voiceEnabled = true;
    updateVoiceToggleUi();
    setStatus('Voice SOS armed. Say "wake up rex" for emergency trigger.', "good");
    try {
      voiceRecognizer.start();
    } catch (error) {
      voiceEnabled = false;
      updateVoiceToggleUi();
      setStatus("Voice SOS could not start. Check microphone permission.", "warn");
    }
  };

  scenarioButtons.forEach(button => {
    button.addEventListener("click", () => {
      selectScenario(button.dataset.sosScenario);
      const plan = buildHotlinePlan({
        scenarioKey: selectedScenario,
        details: detailsField.value || ""
      });
      setStatus(`${getScenarioProfile(selectedScenario).label} selected. Call order: ${plan.summary}.`, "good");
    });
  });

  detailsField.addEventListener("input", () => {
    updateEmergencyActionLabels();
    renderOfficialPlan(null);
  });

  saveContactsButton?.addEventListener("click", () => {
    const contacts = saveContactsFromInputs();
    if (!contacts.length) {
      setStatus("No valid trusted contacts saved. Add 10-digit or +country numbers.", "warn");
      return;
    }
    setStatus(`Trusted contacts saved: ${contacts.join(", ")}`, "good");
  });

  runButton.addEventListener("click", () => {
    runSosFlow("manual");
  });

  officialBlastButton?.addEventListener("click", () => {
    runSosFlow("manual", { autoDial: true });
  });

  callButton.addEventListener("click", () => {
    const ok = tryCallEmergencyNumber("112");
    setStatus(ok ? "Dialing 112 now..." : "Unable to open dialer here. Manually call 112.", ok ? "critical" : "warn");
  });

  callRoadButton?.addEventListener("click", () => {
    const roadPlan = buildHotlinePlan({
      scenarioKey: "road_accident",
      details: detailsField.value || ""
    });
    const target = roadPlan.highwayCase ? "1033" : "108";
    const ok = tryCallEmergencyNumber(target);
    setStatus(
      ok
        ? `Dialing ${target} now (${roadPlan.highwayCase ? "NHAI highway" : "ambulance"}).`
        : `Unable to open dialer. Manually call ${target}.`,
      ok ? "critical" : "warn"
    );
  });

  callMedicalButton?.addEventListener("click", () => {
    const ok = tryCallEmergencyNumber("108");
    setStatus(ok ? "Dialing 108 ambulance now..." : "Unable to open dialer. Manually call 108.", ok ? "critical" : "warn");
  });

  nearbyHelpButton?.addEventListener("click", () => {
    openNearbyResponderSearch();
  });

  smsButton.addEventListener("click", async () => {
    const contacts = saveContactsFromInputs();
    const payload = latestPayload || (await runSosFlow("manual"));
    if (!payload) {
      return;
    }
    const result = tryOpenSmsDraft(contacts, payload.privateMessage);
    setStatus(result.ok ? "Opening SMS draft to trusted contacts." : result.reason, result.ok ? "good" : "warn");
  });

  copyButton.addEventListener("click", async () => {
    const payload = latestPayload || readLastSosPayload();
    if (!payload) {
      setStatus("No SOS payload yet. Tap Trigger SOS Flow first.", "warn");
      return;
    }
    const copied = await copyTextToClipboard(payload.privateMessage);
    setStatus(copied ? "SOS message copied." : "Copy failed in this browser.", copied ? "good" : "warn");
  });

  tripGuardStartButton?.addEventListener("click", startTripGuard);
  tripGuardSafeButton?.addEventListener("click", () => {
    if (!tripGuardActive) {
      setTripGuardStatus("Trip Guard is not active. Tap Start Trip Guard first.", "warn");
      return;
    }
    resetTripGuard();
  });
  tripGuardStopButton?.addEventListener("click", () => {
    stopTripGuard("Trip Guard stopped.");
  });

  voiceSosToggle?.addEventListener("click", () => {
    if (voiceEnabled) {
      stopVoiceSos();
    } else {
      startVoiceSos();
    }
  });

  window.addEventListener("beforeunload", () => {
    stopTripGuard();
    stopVoiceSos();
    stopLiveLocationWatch();
  });

  selectScenario(selectedScenario);
  loadContactsToInputs();
  updateTripGuardCountdown();
  updateVoiceToggleUi();
  updateEmergencyActionLabels();
  renderOfficialPlan(latestPayload || null);
  if (latestPayload) {
    renderPayloadPreview(latestPayload);
    setStatus(`Last SOS loaded (${latestPayload.id}). Ready for instant trigger.`, "good");
  }
}

function initializeAssistant() {
  const dock = document.getElementById("assistantDock");
  const modeText = document.getElementById("assistantModeText");
  const toggleView = document.getElementById("assistantToggleView");
  const depthToggle = document.getElementById("assistantDepthToggle");
  const applyForm = document.getElementById("assistantApplyForm");
  const createCase = document.getElementById("assistantCreateCase");
  const openNetwork = document.getElementById("assistantOpenNetwork");
  const openCoordination = document.getElementById("assistantOpenCoordination");
  const copyPlan = document.getElementById("assistantCopyPlan");
  const actionStatus = document.getElementById("assistantActionStatus");
  const input = document.getElementById("assistantInput");
  const output = document.getElementById("assistantOutput");
  const send = document.getElementById("assistantSend");
  const quickButtons = document.querySelectorAll(".quick-prompt");

  if (!dock || !modeText || !toggleView || !input || !output || !send) {
    return;
  }

  let deepMode = safeRead(ASSISTANT_DEPTH_KEY, "on") !== "off";
  let lastContext = null;
  let lastPlanText = "";

  const setDockView = view => {
    const expanded = view === "expanded";
    dock.classList.toggle("is-expanded", expanded);
    dock.classList.toggle("is-compact", !expanded);
    toggleView.textContent = expanded ? "Compact" : "Expand";
    toggleView.setAttribute("aria-expanded", expanded ? "true" : "false");
    modeText.textContent = expanded
      ? "Vast mode active. Rex is ready for deep strategic guidance."
      : "Compact mode active. Expand for deep response planner.";
    safeWrite(ASSISTANT_VIEW_KEY, expanded ? "expanded" : "compact");
  };

  const setActionStatus = (message, level = "neutral") => {
    if (!actionStatus) {
      return;
    }
    actionStatus.textContent = message;
    actionStatus.style.color =
      level === "good"
        ? "var(--ok)"
        : level === "warn"
          ? "var(--warn)"
          : level === "critical"
            ? "var(--danger)"
            : "var(--muted)";
  };

  const applyDepthState = () => {
    if (!depthToggle) {
      return;
    }
    depthToggle.textContent = deepMode ? "Deep Mode: On" : "Deep Mode: Off";
    depthToggle.setAttribute("aria-pressed", deepMode ? "true" : "false");
  };

  const savedView = safeRead(ASSISTANT_VIEW_KEY, "compact");
  setDockView(savedView === "expanded" ? "expanded" : "compact");
  applyDepthState();

  const persistedContext = readAssistantContext();
  if (persistedContext) {
    lastContext = persistedContext;
    setActionStatus(
      `Previous analysis ready: ${persistedContext.type?.toUpperCase?.() || "INCIDENT"} in ${persistedContext.district || "district"}.`,
      "good"
    );
  }

  toggleView.addEventListener("click", () => {
    const isExpanded = dock.classList.contains("is-expanded");
    setDockView(isExpanded ? "compact" : "expanded");
    if (dock.classList.contains("is-expanded")) {
      window.setTimeout(() => input.focus(), 0);
    }
  });

  depthToggle?.addEventListener("click", () => {
    deepMode = !deepMode;
    safeWrite(ASSISTANT_DEPTH_KEY, deepMode ? "on" : "off");
    applyDepthState();
  });

  const run = () => {
    const query = input.value.trim();
    if (!query) {
      output.textContent = "Type a situation first, for example: fire in Metro Core 40 people critical.";
      setActionStatus("Add incident details first, then run Analyze.", "warn");
      return;
    }

    const context = buildAnalysisContext(query);
    const plan = deepMode ? buildDeepAssistantResponse(context) : buildQuickAssistantResponse(context);
    lastContext = context;
    lastPlanText = plan;
    safeWrite(
      ASSISTANT_CONTEXT_KEY,
      JSON.stringify({
        ...context,
        generatedAt: new Date().toISOString()
      })
    );

    if (deepMode) {
      setDockView("expanded");
    }

    output.textContent = plan;
    setActionStatus(
      `Analyzed: ${context.type.toUpperCase()} in ${context.district} (${context.urgency.toUpperCase()}, risk ${context.riskScore}/99). Use action buttons now.`,
      context.riskScore >= 75 ? "critical" : context.riskScore >= 55 ? "warn" : "good"
    );
  };

  send.addEventListener("click", run);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && dock.classList.contains("is-expanded")) {
      setDockView("compact");
      toggleView.focus();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && document.activeElement === input) {
      event.preventDefault();
      run();
    }
  });

  quickButtons.forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.prompt || "";
      run();
    });
  });

  applyForm?.addEventListener("click", () => {
    if (!lastContext) {
      setActionStatus("Run Analyze first to generate an incident context.", "warn");
      return;
    }
    const result = fillQuickReportFromContext(lastContext, false);
    setActionStatus(result.message, result.ok ? "good" : "warn");
  });

  createCase?.addEventListener("click", () => {
    if (!lastContext) {
      setActionStatus("Run Analyze first to generate an incident context.", "warn");
      return;
    }
    const result = fillQuickReportFromContext(lastContext, true);
    setActionStatus(result.message, result.ok ? "good" : "critical");
  });

  openNetwork?.addEventListener("click", () => {
    if (!lastContext) {
      setActionStatus("Run Analyze first, then open Network with context.", "warn");
      return;
    }
    safeWrite(ASSISTANT_CONTEXT_KEY, JSON.stringify({ ...lastContext, generatedAt: new Date().toISOString() }));
    window.location.href = "network.html?assistant=1";
  });

  openCoordination?.addEventListener("click", () => {
    if (!lastContext) {
      setActionStatus("Run Analyze first, then open Coordination with context.", "warn");
      return;
    }
    safeWrite(ASSISTANT_CONTEXT_KEY, JSON.stringify({ ...lastContext, generatedAt: new Date().toISOString() }));
    window.location.href = "coordination.html?assistant=1";
  });

  copyPlan?.addEventListener("click", async () => {
    if (!lastPlanText) {
      setActionStatus("No plan to copy yet. Run Analyze first.", "warn");
      return;
    }
    const copied = await copyTextToClipboard(lastPlanText);
    setActionStatus(copied ? "Plan copied to clipboard." : "Copy failed in this browser. Try manually selecting text.", copied ? "good" : "warn");
  });
}

function initializeQuickReport() {
  const form = document.getElementById("quickReportForm");
  const status = document.getElementById("quickReportStatus");
  if (!form || !status) {
    return;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();

    const payload = {
      id: `CR-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}`,
      district: document.getElementById("quickDistrict").value,
      type: document.getElementById("quickType").value,
      urgency: document.getElementById("quickUrgency").value,
      people: Number(document.getElementById("quickPeople").value || 0),
      notes: document.getElementById("quickNotes").value.trim(),
      timestamp: new Date().toISOString(),
      resolved: false
    };

    const reports = readReports();
    reports.unshift(payload);
    writeReports(reports);

    status.className = payload.urgency === "critical" ? "status critical" : payload.urgency === "high" ? "status warn" : "status good";
    status.textContent =
      `Created ${payload.id} for ${payload.district} (${payload.type}, ${payload.urgency}). ` +
      "It is now synced to Network Hub and Coordination Center.";

    form.reset();
    document.getElementById("quickPeople").value = "20";
  });
}

function initializeShowcaseMode() {
  const startButton = document.getElementById("showcaseStartBtn");
  const statusNode = document.getElementById("showcaseStatus");
  if (!startButton || !statusNode) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const done = params.get("showcase") === "done";
  if (done) {
    safeRemove(SHOWCASE_KEY);
    statusNode.className = "status good";
    statusNode.textContent = "Showcase completed. Great run. Click again anytime to restart.";
    if (window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState({}, document.title, "index.html");
    }
  }

  const state = readShowcaseState();
  if (state.active) {
    const label = showcaseLabels[state.step] || "Step 1/3 - Network Hub";
    startButton.textContent = "Resume Showcase Mode";
    statusNode.className = "status warn";
    statusNode.textContent = `Showcase in progress. Current stage: ${label}.`;
  }

  startButton.addEventListener("click", () => {
    const current = readShowcaseState();
    if (current.active && showcaseRoutes[current.step]) {
      window.location.href = showcaseRoutes[current.step];
      return;
    }

    const seeded = createShowcaseSeedReport();
    writeShowcaseState({
      active: true,
      step: "network",
      startedAt: new Date().toISOString()
    });

    statusNode.className = "status good";
    statusNode.textContent = seeded
      ? `Showcase started with demo report ${seeded.id}. Redirecting to Network Hub...`
      : "Showcase started. Existing live reports detected. Redirecting to Network Hub...";
    startButton.disabled = true;
    window.setTimeout(() => {
      window.location.href = showcaseRoutes.network;
    }, 280);
  });
}

function initializeBootSplash() {
  const splash = document.getElementById("bootSplash");
  if (!splash) {
    return;
  }

  window.addEventListener("load", () => {
    window.setTimeout(() => {
      splash.classList.add("hidden");
    }, 700);
  });
}

function initializeServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Ignore registration errors.
    });
  });
}

function initializeApp() {
  initializeTheme();
  initializeNavState();
  initializeCounters();
  initializeEmergencyConsole();
  initializeAssistant();
  initializeQuickReport();
  initializeShowcaseMode();
  initializeBootSplash();
  initializeServiceWorker();
}

initializeApp();
