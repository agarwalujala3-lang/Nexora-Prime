const REPORTS_KEY = "nexora-community-reports";
const THEME_KEY = "nexora-theme";
const SHOWCASE_KEY = "nexora-showcase-state";
const ASSISTANT_CONTEXT_KEY = "nexora-assistant-context";

const resourceNodes = [
  { id: "R1", name: "Metro General Hospital", type: "medical", district: "Metro Core", capacity: 38, eta: 14, phone: "+91-90000-1101" },
  { id: "R2", name: "Harbor Rescue Unit", type: "rescue", district: "Harbor Point", capacity: 22, eta: 18, phone: "+91-90000-1102" },
  { id: "R3", name: "North Grid Response", type: "utility", district: "North Transit", capacity: 16, eta: 20, phone: "+91-90000-1103" },
  { id: "R4", name: "Riverside Shelter A", type: "shelter", district: "Riverside", capacity: 140, eta: 12, phone: "+91-90000-1104" },
  { id: "R5", name: "Medical Cluster Rapid Care", type: "medical", district: "Medical Cluster", capacity: 24, eta: 10, phone: "+91-90000-1105" },
  { id: "R6", name: "Canal Logistics Depot", type: "logistics", district: "Canal Edge", capacity: 44, eta: 19, phone: "+91-90000-1106" },
  { id: "R7", name: "University Volunteer Corps", type: "volunteer", district: "University Loop", capacity: 60, eta: 16, phone: "+91-90000-1107" },
  { id: "R8", name: "South Gardens Shelter B", type: "shelter", district: "South Gardens", capacity: 120, eta: 17, phone: "+91-90000-1108" },
  { id: "R9", name: "West Belt Fire Support", type: "rescue", district: "West Belt", capacity: 18, eta: 21, phone: "+91-90000-1109" },
  { id: "R10", name: "Freight Yard Supply Core", type: "logistics", district: "Freight Yard", capacity: 56, eta: 23, phone: "+91-90000-1110" }
];

const hazardActions = {
  flood: [
    "Move people to elevated safe points immediately.",
    "Shut electricity in affected zone before rescue entry.",
    "Dispatch boats/high-clearance vehicles for first extraction."
  ],
  fire: [
    "Create 300m exclusion perimeter and evacuate non-responders.",
    "Prioritize smoke inhalation triage for children/elderly first.",
    "Coordinate utility shutdown before interior response."
  ],
  health: [
    "Set up rapid triage queue and isolate high-risk patients.",
    "Route telemedicine support for non-critical crowd segments.",
    "Track oxygen, fluids, and bed availability every 15 minutes."
  ],
  safety: [
    "Move victim to nearest safe zone and avoid direct confrontation.",
    "Call 112 and route nearest police/women safety patrol.",
    "Share redacted nearby alert for safe public witness support."
  ],
  outage: [
    "Activate backup power for hospitals and water pumps first.",
    "Mark dark zones needing traffic and public safety teams.",
    "Deploy utility crews with battery comms kits."
  ],
  transit: [
    "Open emergency traffic corridors for responders.",
    "Split crowd movement into directional lanes with marshals.",
    "Provide shuttle diversion route updates every 10 minutes."
  ],
  weather: [
    "Broadcast weather alert and indoor safety instructions.",
    "Close vulnerable routes and bridges until clearance.",
    "Stand up district check-ins for isolated communities."
  ]
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
    // Ignore storage write failures silently.
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Ignore storage remove failures silently.
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
  safeWrite(REPORTS_KEY, JSON.stringify(reports.slice(0, 120)));
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

function mapIncidentToNetworkType(type) {
  const map = {
    fire: "rescue",
    flood: "rescue",
    accident: "medical",
    health: "medical",
    safety: "rescue",
    outage: "utility",
    transit: "logistics",
    weather: "rescue"
  };
  return map[type] || "all";
}

function mapIncidentToCommunityType(type) {
  const map = {
    accident: "transit",
    health: "health",
    safety: "transit",
    fire: "fire",
    flood: "flood",
    outage: "outage",
    transit: "transit",
    weather: "weather"
  };
  return map[type] || "weather";
}

function urgencyScore(report) {
  const urgencyBase = { low: 1, medium: 2, high: 3, critical: 4 };
  const people = Number(report.people || 0);
  return urgencyBase[report.urgency] * 14 + Math.min(36, Math.round(people / 50));
}

function formatReportTime(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setOnlineIndicator() {
  const node = document.getElementById("portalOnlineStatus");
  if (!node) {
    return;
  }
  if (navigator.onLine) {
    node.className = "status-pill";
    node.textContent = "Network online and synced";
  } else {
    node.className = "status-pill warn";
    node.textContent = "Network offline - local mode active";
  }
}

function applyTheme(mode, toggleButton) {
  const isLight = mode === "light";
  document.body.classList.toggle("theme-light", isLight);
  document.documentElement.dataset.theme = isLight ? "light" : "dark";
  safeWrite(THEME_KEY, isLight ? "light" : "nebula");
  if (toggleButton) {
    toggleButton.textContent = isLight ? "Nebula" : "Light";
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", isLight ? "#f4f8ff" : "#08111f");
  }
}

function initializeThemeToggle() {
  const btn = document.getElementById("globalThemeToggle");
  const saved = safeRead(THEME_KEY, "nebula");
  applyTheme(saved === "light" ? "light" : "nebula", btn);

  if (!btn) {
    return;
  }

  btn.addEventListener("click", () => {
    const isLight = document.body.classList.contains("theme-light");
    applyTheme(isLight ? "nebula" : "light", btn);
  });
}

function initializePortalNav() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  const pageMap = {
    "network.html": "Network Hub",
    "community.html": "Citizen Portal",
    "coordination.html": "Coordination",
    "index.html": "Command Center",
    "": "Command Center"
  };
  const activeLabel = pageMap[page];
  if (!activeLabel) {
    return;
  }

  const links = document.querySelectorAll(".site-nav a");
  links.forEach(link => {
    const label = link.textContent.trim();
    link.classList.toggle("active", label === activeLabel);
  });
}

function initializeServiceWorkerPortal() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Ignore registration errors.
    });
  });
}

function initializeNetworkPage() {
  if (document.body.dataset.page !== "network") {
    return;
  }

  const districtFilter = document.getElementById("networkDistrictFilter");
  const typeFilter = document.getElementById("networkTypeFilter");
  const searchInput = document.getElementById("networkSearch");
  const capacityFilter = document.getElementById("networkCapacityFilter");
  const tableBody = document.getElementById("networkTableBody");
  const recommendationOutput = document.getElementById("networkRecommendation");
  const recommendBtn = document.getElementById("generateNetworkRecommendation");
  const kpiNodes = {
    active: document.getElementById("networkKpiActive"),
    capacity: document.getElementById("networkKpiCapacity"),
    eta: document.getElementById("networkKpiEta"),
    reports: document.getElementById("networkKpiReports")
  };

  function filteredResources() {
    return resourceNodes.filter(node => {
      if (districtFilter.value !== "all" && node.district !== districtFilter.value) {
        return false;
      }
      if (typeFilter.value !== "all" && node.type !== typeFilter.value) {
        return false;
      }
      if (capacityFilter.value !== "all") {
        const threshold = Number(capacityFilter.value);
        if (Number.isFinite(threshold) && node.capacity < threshold) {
          return false;
        }
      }
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        return true;
      }
      return (
        node.name.toLowerCase().includes(query) ||
        node.district.toLowerCase().includes(query) ||
        node.type.toLowerCase().includes(query)
      );
    });
  }

  function renderResources() {
    const list = filteredResources();
    tableBody.innerHTML = "";
    list.forEach(node => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${node.name}</td>
        <td>${node.type}</td>
        <td>${node.district}</td>
        <td>${node.capacity}</td>
        <td>${node.eta} min</td>
        <td>${node.phone}</td>
      `;
      tableBody.appendChild(tr);
    });

    const reports = readReports().filter(report => !report.resolved);
    const totalCapacity = list.reduce((sum, node) => sum + node.capacity, 0);
    const avgEta = list.length ? Math.round(list.reduce((sum, node) => sum + node.eta, 0) / list.length) : 0;

    kpiNodes.active.textContent = String(list.length);
    kpiNodes.capacity.textContent = String(totalCapacity);
    kpiNodes.eta.textContent = `${avgEta} min`;
    kpiNodes.reports.textContent = String(reports.length);
  }

  function generateRecommendation() {
    const reports = readReports().filter(report => !report.resolved);
    if (!reports.length) {
      recommendationOutput.textContent =
        "No active citizen reports in queue. Network is in standby mode with preventive monitoring.";
      return;
    }
    const top = [...reports].sort((a, b) => urgencyScore(b) - urgencyScore(a))[0];
    const candidates = resourceNodes
      .filter(node => node.capacity > 0)
      .sort((a, b) => {
        const districtBoostA = a.district === top.district ? -8 : 0;
        const districtBoostB = b.district === top.district ? -8 : 0;
        return (a.eta + districtBoostA) - (b.eta + districtBoostB);
      })
      .slice(0, 3);

    recommendationOutput.textContent =
      `Priority report ${top.id} (${top.type}) in ${top.district} with ${top.people} people. ` +
      `Recommended response chain: ${candidates.map(node => `${node.name} (${node.eta} min)`).join(" -> ")}.`;
  }

  [districtFilter, typeFilter, capacityFilter, searchInput].forEach(control => {
    control.addEventListener("input", renderResources);
    control.addEventListener("change", renderResources);
  });
  recommendBtn.addEventListener("click", generateRecommendation);

  renderResources();
  generateRecommendation();
}

function initializeCommunityPage() {
  if (document.body.dataset.page !== "community") {
    return;
  }

  const form = document.getElementById("communityReportForm");
  const output = document.getElementById("communityGuidance");
  const reportList = document.getElementById("communityReportList");
  const clearBtn = document.getElementById("communityClearResolved");

  function renderReports() {
    const reports = readReports().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    reportList.innerHTML = "";
    reports.slice(0, 15).forEach(report => {
      const item = document.createElement("li");
      item.className = "report-item";
      item.innerHTML = `
        <strong>${report.id} • ${report.type} • ${report.district}</strong>
        <span>${report.people} people | urgency ${report.urgency} | ${formatReportTime(report.timestamp)}</span>
        <span>${report.notes || "No extra note provided."}</span>
      `;
      reportList.appendChild(item);
    });
  }

  function buildGuidance(report) {
    const base = hazardActions[report.type] || hazardActions.weather;
    const urgencyLine =
      report.urgency === "critical"
        ? "Escalate to district control room and call nearest hospital/fire channel now."
        : report.urgency === "high"
          ? "Keep responders on priority lane and issue public alert immediately."
          : "Maintain local monitoring and publish safety advisory updates.";

    return [
      `Incident ${report.id} logged for ${report.district}.`,
      `People affected: ${report.people}.`,
      "",
      "Immediate actions:",
      ...base.map(step => `- ${step}`),
      `- ${urgencyLine}`,
      "",
      "Data has been synced to Network Hub and Coordination Center."
    ].join("\n");
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const payload = {
      id: `CR-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}`,
      district: document.getElementById("communityDistrict").value,
      type: document.getElementById("communityType").value,
      people: Number(document.getElementById("communityPeople").value || 0),
      urgency: document.getElementById("communityUrgency").value,
      notes: document.getElementById("communityNotes").value.trim(),
      timestamp: new Date().toISOString(),
      resolved: false
    };

    const reports = readReports();
    reports.unshift(payload);
    writeReports(reports);
    output.textContent = buildGuidance(payload);
    form.reset();
    renderReports();
  });

  clearBtn.addEventListener("click", () => {
    const reports = readReports().map(report => ({ ...report, resolved: true }));
    writeReports(reports);
    renderReports();
    output.textContent = "All reports marked as resolved. New reports will continue syncing automatically.";
  });

  renderReports();
}

function initializeCoordinationPage() {
  if (document.body.dataset.page !== "coordination") {
    return;
  }

  const columns = {
    critical: document.getElementById("coordCritical"),
    high: document.getElementById("coordHigh"),
    medium: document.getElementById("coordMedium")
  };
  const allocationOutput = document.getElementById("coordAllocationOutput");
  const runBtn = document.getElementById("coordRunAllocation");
  const waterInput = document.getElementById("coordWaterUnits");
  const medInput = document.getElementById("coordMedicalUnits");
  const volunteerInput = document.getElementById("coordVolunteerUnits");
  const refreshBtn = document.getElementById("coordRefresh");

  function categorizedReports() {
    const reports = readReports().filter(report => !report.resolved);
    return reports.reduce(
      (acc, report) => {
        const score = urgencyScore(report);
        if (score >= 48) {
          acc.critical.push(report);
        } else if (score >= 30) {
          acc.high.push(report);
        } else {
          acc.medium.push(report);
        }
        return acc;
      },
      { critical: [], high: [], medium: [] }
    );
  }

  function renderColumns() {
    const buckets = categorizedReports();
    Object.entries(columns).forEach(([bucket, listNode]) => {
      listNode.innerHTML = "";
      buckets[bucket].slice(0, 8).forEach(report => {
        const li = document.createElement("li");
        li.className = "coord-item";
        li.innerHTML = `
          <strong>${report.id} • ${report.district}</strong>
          <span>${report.type} | ${report.people} people | ${report.urgency}</span>
        `;
        listNode.appendChild(li);
      });
      if (!listNode.children.length) {
        const li = document.createElement("li");
        li.className = "coord-item";
        li.innerHTML = "<strong>No active cases</strong><span>Queue is clear in this priority lane.</span>";
        listNode.appendChild(li);
      }
    });
  }

  function runAllocation() {
    const buckets = categorizedReports();
    const water = Number(waterInput.value || 0);
    const medical = Number(medInput.value || 0);
    const volunteers = Number(volunteerInput.value || 0);
    const criticalNeed = buckets.critical.length * 40;
    const highNeed = buckets.high.length * 20;
    const mediumNeed = buckets.medium.length * 10;
    const totalNeed = criticalNeed + highNeed + mediumNeed;

    const waterCoverage = totalNeed ? Math.round((water / totalNeed) * 100) : 100;
    const medCoverage = totalNeed ? Math.round((medical / totalNeed) * 100) : 100;
    const volunteerCoverage = totalNeed ? Math.round((volunteers / totalNeed) * 100) : 100;
    const weakest = Math.min(waterCoverage, medCoverage, volunteerCoverage);

    allocationOutput.textContent =
      `Resource coverage - Water: ${waterCoverage}% | Medical kits: ${medCoverage}% | Volunteers: ${volunteerCoverage}%. ` +
      `Critical queue: ${buckets.critical.length}, High: ${buckets.high.length}, Medium: ${buckets.medium.length}. ` +
      `Operational readiness score: ${Math.max(0, weakest)}%.`;
  }

  runBtn.addEventListener("click", runAllocation);
  refreshBtn.addEventListener("click", () => {
    renderColumns();
    runAllocation();
  });

  renderColumns();
  runAllocation();
}

function submitCommunityShowcaseReport() {
  const form = document.getElementById("communityReportForm");
  if (!form) {
    return false;
  }
  document.getElementById("communityDistrict").value = "Riverside";
  document.getElementById("communityType").value = "transit";
  document.getElementById("communityUrgency").value = "high";
  document.getElementById("communityPeople").value = "18";
  document.getElementById("communityNotes").value = "Showcase demo: major road collision near bridge entry.";
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
  } else {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
  return true;
}

function initializeShowcaseGuide() {
  const page = document.body.dataset.page;
  if (!["network", "community", "coordination"].includes(page)) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const shouldShow = params.get("showcase") === "1";
  const state = readShowcaseState();
  if (!shouldShow && !state.active) {
    return;
  }

  const flow = {
    network: {
      step: "Step 1/3",
      title: "Network Hub Demo",
      message: "Click Run Demo Action to generate dispatch recommendation, then continue to Citizen Portal.",
      actionLabel: "Run Demo Action",
      onAction: () => {
        document.getElementById("generateNetworkRecommendation")?.click();
        return "Dispatch recommendation refreshed for active case.";
      },
      nextHref: "community.html?showcase=1",
      nextStep: "community",
      nextLabel: "Next: Citizen Portal"
    },
    community: {
      step: "Step 2/3",
      title: "Citizen Portal Demo",
      message: "Submit a sample citizen incident in one click, then continue to Coordination Center.",
      actionLabel: "Submit Demo Report",
      onAction: () => (
        submitCommunityShowcaseReport()
          ? "Demo report submitted and synced to all modules."
          : "Community form not available."
      ),
      nextHref: "coordination.html?showcase=1",
      nextStep: "coordination",
      nextLabel: "Next: Coordination Center"
    },
    coordination: {
      step: "Step 3/3",
      title: "Coordination Demo",
      message: "Run queue refresh and allocation, then finish showcase on Home.",
      actionLabel: "Run Allocation Demo",
      onAction: () => {
        document.getElementById("coordRefresh")?.click();
        document.getElementById("coordRunAllocation")?.click();
        return "Allocation recalculated from latest queue.";
      },
      nextHref: "index.html?showcase=done",
      nextStep: null,
      nextLabel: "Finish on Home"
    }
  };

  const config = flow[page];
  if (!config) {
    return;
  }

  writeShowcaseState({
    active: true,
    step: page,
    updatedAt: new Date().toISOString()
  });

  const host = document.querySelector("main");
  if (!host) {
    return;
  }

  const banner = document.createElement("section");
  banner.className = "showcase-banner";
  banner.innerHTML = `
    <span class="showcase-chip">Showcase Mode | ${config.step}</span>
    <h3>${config.title}</h3>
    <p>${config.message}</p>
    <div class="showcase-actions">
      <button id="showcaseActionBtn" class="btn primary" type="button">${config.actionLabel}</button>
      <a id="showcaseNextBtn" class="btn secondary" href="${config.nextHref}">${config.nextLabel}</a>
      <button id="showcaseStopBtn" class="btn secondary" type="button">Stop Showcase</button>
    </div>
    <p id="showcaseActionStatus" class="status">Guide ready. Run action and continue.</p>
  `;
  host.insertBefore(banner, host.firstChild);

  const actionStatus = banner.querySelector("#showcaseActionStatus");
  const actionButton = banner.querySelector("#showcaseActionBtn");
  const nextButton = banner.querySelector("#showcaseNextBtn");
  const stopButton = banner.querySelector("#showcaseStopBtn");

  actionButton?.addEventListener("click", () => {
    const result = config.onAction();
    actionStatus.className = "status good";
    actionStatus.textContent = result;
  });

  nextButton?.addEventListener("click", () => {
    if (config.nextStep) {
      writeShowcaseState({
        active: true,
        step: config.nextStep,
        updatedAt: new Date().toISOString()
      });
    } else {
      safeRemove(SHOWCASE_KEY);
    }
  });

  stopButton?.addEventListener("click", () => {
    safeRemove(SHOWCASE_KEY);
    window.location.href = "index.html?showcase=done";
  });
}

function initializeAssistantContextBridge() {
  const params = new URLSearchParams(window.location.search);
  const fromAssistant = params.get("assistant") === "1";
  const context = readAssistantContext();
  if (!context || !fromAssistant) {
    return;
  }

  const page = document.body.dataset.page;
  if (page === "network") {
    const districtFilter = document.getElementById("networkDistrictFilter");
    const typeFilter = document.getElementById("networkTypeFilter");
    const capacityFilter = document.getElementById("networkCapacityFilter");
    const searchInput = document.getElementById("networkSearch");
    const recommendationOutput = document.getElementById("networkRecommendation");
    const recommendBtn = document.getElementById("generateNetworkRecommendation");

    if (districtFilter?.querySelector(`option[value="${context.district}"]`)) {
      districtFilter.value = context.district;
    }
    const mappedType = mapIncidentToNetworkType(context.type);
    if (typeFilter?.querySelector(`option[value="${mappedType}"]`)) {
      typeFilter.value = mappedType;
    }
    if (capacityFilter) {
      capacityFilter.value = context.urgency === "critical" ? "60" : context.urgency === "high" ? "40" : "20";
    }
    if (searchInput) {
      searchInput.value = `${context.type} ${context.district}`;
    }

    [districtFilter, typeFilter, capacityFilter, searchInput].forEach(node => {
      node?.dispatchEvent(new Event("input", { bubbles: true }));
      node?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    recommendBtn?.click();
    if (recommendationOutput) {
      recommendationOutput.textContent =
        `Assistant handoff loaded: ${context.type} incident in ${context.district}, urgency ${context.urgency}, risk ${context.riskScore || "n/a"}. ` +
        recommendationOutput.textContent;
    }
  }

  if (page === "community") {
    const district = document.getElementById("communityDistrict");
    const type = document.getElementById("communityType");
    const urgency = document.getElementById("communityUrgency");
    const people = document.getElementById("communityPeople");
    const notes = document.getElementById("communityNotes");
    const guidance = document.getElementById("communityGuidance");

    if (district?.querySelector(`option[value="${context.district}"]`)) {
      district.value = context.district;
    }
    const mappedType = mapIncidentToCommunityType(context.type);
    if (type?.querySelector(`option[value="${mappedType}"]`)) {
      type.value = mappedType;
    }
    if (urgency?.querySelector(`option[value="${context.urgency}"]`)) {
      urgency.value = context.urgency;
    }
    if (people) {
      people.value = String(context.people || 20);
    }
    if (notes) {
      notes.value = `Assistant handoff | Risk ${context.riskScore || "n/a"} | Query: ${context.rawQuery || ""}`;
    }
    if (guidance) {
      guidance.textContent =
        "Assistant context applied to this form. Submit now to sync the incident to Network and Coordination.";
    }
  }

  if (page === "coordination") {
    const waterInput = document.getElementById("coordWaterUnits");
    const medInput = document.getElementById("coordMedicalUnits");
    const volunteerInput = document.getElementById("coordVolunteerUnits");
    const refreshBtn = document.getElementById("coordRefresh");
    const runBtn = document.getElementById("coordRunAllocation");
    const output = document.getElementById("coordAllocationOutput");

    if (waterInput && medInput && volunteerInput) {
      if (context.urgency === "critical") {
        waterInput.value = "680";
        medInput.value = "560";
        volunteerInput.value = "380";
      } else if (context.urgency === "high") {
        waterInput.value = "560";
        medInput.value = "440";
        volunteerInput.value = "300";
      } else {
        waterInput.value = "460";
        medInput.value = "360";
        volunteerInput.value = "240";
      }
    }
    refreshBtn?.click();
    runBtn?.click();
    if (output) {
      output.textContent =
        `Assistant handoff loaded for ${context.type} in ${context.district}. ` +
        `Urgency ${context.urgency}, estimated people ${context.people}. ` +
        output.textContent;
    }
  }
}

function initializePortal() {
  initializeThemeToggle();
  initializePortalNav();
  initializeServiceWorkerPortal();
  setOnlineIndicator();
  window.addEventListener("online", setOnlineIndicator);
  window.addEventListener("offline", setOnlineIndicator);
  initializeNetworkPage();
  initializeCommunityPage();
  initializeCoordinationPage();
  initializeAssistantContextBridge();
  initializeShowcaseGuide();
}

initializePortal();
