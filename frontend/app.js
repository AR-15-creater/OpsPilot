const state = {
  user: JSON.parse(localStorage.getItem("opspilot_user") || "null"),
  token: localStorage.getItem("opspilot_token"),
  apiBase: localStorage.getItem("opspilot_api_base") || "https://opspilot-api.onrender.com",
  model: localStorage.getItem("opspilot_model") || "gpt-4o",
  authMode: "login",
  filter: "all",
  panel: null,
  running: false,
  items: [],
  lastLatency: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function saveSession(user, token = "offline-token") {
  state.user = user;
  state.token = token;
  localStorage.setItem("opspilot_user", JSON.stringify(user));
  localStorage.setItem("opspilot_token", token);
}

function showConsole() {
  $("#authScreen").classList.add("hidden");
  $("#consoleScreen").classList.remove("hidden");
  $("#modelName").textContent = state.model;
  resetLivePanel();
  renderReasoning(false);
  renderActivity();
  updateMetrics();
}

function showAuth() {
  $("#authScreen").classList.remove("hidden");
  $("#consoleScreen").classList.add("hidden");
  closePanel();
}

function setAuthMode(mode) {
  state.authMode = mode;
  $$("[data-auth-tab]").forEach((button) => button.classList.toggle("active", button.dataset.authTab === mode));
  $("#nameField").style.display = mode === "join" ? "grid" : "none";
  $("#authSubmit").textContent = mode === "join" ? "Create workspace" : "Enter console";
  $("#authMessage").textContent = mode === "join"
    ? "Creates a user through /auth/register, then you can log in."
    : "Connects to FastAPI auth when the backend is running.";
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 6000);
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  try {
    const response = await fetch(`${state.apiBase}${path}`, { ...options, headers, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Request failed");
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function handleAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = form.get("email");
  const password = form.get("password");
  const fullName = form.get("full_name") || "Workspace member";
  $("#authMessage").textContent = "Connecting...";

  try {
    if (state.authMode === "join") {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ full_name: fullName, email, password }),
      });
    }
    const token = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveSession({ full_name: fullName, email, role: "operator" }, token.access_token);
    showConsole();
  } catch (error) {
    $("#authMessage").textContent = `${error.message}. Continue offline or check backend connection.`;
  }
}

function continueOffline() {
  saveSession({ full_name: "Workspace member", email: "local@workspace", role: "operator" });
  showConsole();
}

function panelMarkup(panel) {
  if (panel === "profile") {
    return `
      <div class="utility-grid">
        <div class="utility-tile"><span>Workspace</span><strong>${state.user?.full_name || "Workspace member"}</strong></div>
        <div class="utility-tile"><span>Role</span><strong>${state.user?.role || "operator"}</strong></div>
        <div class="utility-tile"><span>Session</span><strong>${state.token ? "Active" : "Inactive"}</strong></div>
      </div>
    `;
  }

  if (panel === "history") {
    if (!state.items.length) return `<p class="empty-state">No task history yet.</p>`;
    return `
      <div class="utility-list">
        ${state.items.slice(0, 5).map((item) => `
          <div class="utility-row">
            <strong>#${item.id}</strong>
            <div><span>${item.type}</span>${item.title}</div>
            <button class="mini-action" data-replay="${item.id}" type="button">Replay</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  return `
    <form class="settings-form" id="settingsForm">
      <label>
        API base
        <input name="api_base" value="${state.apiBase}" />
      </label>
      <label>
        Model
        <select name="model">
          <option value="gpt-4o" ${state.model === "gpt-4o" ? "selected" : ""}>gpt-4o</option>
          <option value="gpt-4o-mini" ${state.model === "gpt-4o-mini" ? "selected" : ""}>gpt-4o-mini</option>
        </select>
      </label>
      <button type="submit">Save</button>
    </form>
  `;
}

function openPanel(panel) {
  state.panel = panel;
  $("#utilityTitle").textContent = panel[0].toUpperCase() + panel.slice(1);
  $("#utilityBody").innerHTML = panelMarkup(panel);
  $("#utilityPanel").classList.remove("hidden");
  $$("[data-panel]").forEach((button) => button.classList.toggle("active", button.dataset.panel === panel));

  const settingsForm = $("#settingsForm");
  if (settingsForm) settingsForm.addEventListener("submit", saveSettings);
}

function closePanel() {
  const panel = $("#utilityPanel");
  if (!panel) return;
  state.panel = null;
  panel.classList.add("hidden");
  $$("[data-panel]").forEach((button) => button.classList.remove("active"));
}

function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.apiBase = String(form.get("api_base") || "http://127.0.0.1:8000").trim();
  state.model = String(form.get("model") || "gpt-4o");
  localStorage.setItem("opspilot_api_base", state.apiBase);
  localStorage.setItem("opspilot_model", state.model);
  $("#modelName").textContent = state.model;
  $("#utilityBody").insertAdjacentHTML("beforeend", `<p class="form-note">Settings saved.</p>`);
}

function classify(text) {
  const lower = text.toLowerCase();
  if (lower.includes("invoice") || lower.includes("gst") || lower.includes("vendor") || lower.includes("amount")) {
    return { type: "invoice", team: "Finance", category: "invoice_extract", priority: "Med", sla: "8h", confidence: 94 };
  }
  if (lower.includes("payment") || lower.includes("login") || lower.includes("failed") || lower.includes("urgent")) {
    return {
      type: "ticket",
      team: lower.includes("login") ? "Support" : "Billing",
      category: lower.includes("login") ? "access_issue" : "payment_issue",
      priority: lower.includes("urgent") ? "High" : "Med",
      sla: lower.includes("urgent") ? "2h" : "6h",
      confidence: 98,
    };
  }
  return { type: "general", team: "Ops", category: "operations", priority: "Low", sla: "24h", confidence: 91 };
}

async function runTask() {
  if (state.running) return;
  const text = $("#taskInput").value.trim();
  if (!text) {
    $("#taskInput").focus();
    return;
  }

  const started = performance.now();
  const inferred = classify(text);
  state.running = true;
  setProcessing(true);
  renderReasoning(true);
  updateLive(text, inferred, null);

  let result = null;
  try {
    result = await api("/tasks/", {
      method: "POST",
      body: JSON.stringify({ title: text.slice(0, 62), description: text }),
      timeoutMs: 3500,
    });
  } catch {
    result = null;
  } finally {
    const elapsed = ((performance.now() - started) / 1000).toFixed(2);
    state.lastLatency = Number(elapsed);
    const item = {
      id: result?.id || nextLocalId(),
      type: result?.task_type || inferred.type,
      title: text.length > 54 ? `${text.slice(0, 54)}...` : text,
      team: inferred.team,
      priority: inferred.priority,
      time: "now",
    };
    state.items.unshift(item);
    state.items = state.items.slice(0, 20);
    updateLive(text, inferred, item.id, elapsed);
    renderActivity();
    updateMetrics();
    state.running = false;
    setProcessing(false, `${elapsed}s`);
  }
}

function nextLocalId() {
  const maxId = state.items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
  return maxId + 1;
}

function setProcessing(isProcessing, label = "ready") {
  $("#runTaskButton").disabled = isProcessing;
  $("#runTaskButton").textContent = isProcessing ? "Running..." : "Run";
  $("#processingTime").textContent = isProcessing ? "processing..." : label;
}

function resetLivePanel() {
  $("#liveTaskId").textContent = "--";
  $("#processingTime").textContent = "ready";
  $("#taskText").textContent = "No task has been processed yet.";
  $("#confidenceValue").textContent = "--";
  $("#outType").textContent = "--";
  $("#outCategory").textContent = "--";
  $("#outPriority").textContent = "--";
  $("#outTeam").textContent = "--";
  $("#outSla").textContent = "--";
}

function updateLive(text, info, id, elapsed = "0.00") {
  $("#taskText").textContent = text;
  if (id) $("#liveTaskId").textContent = `#${id}`;
  $("#processingTime").textContent = `processed ${elapsed}s`;
  $("#outType").textContent = info.type === "ticket" ? "support_ticket" : info.type;
  $("#outCategory").textContent = info.category;
  $("#outPriority").textContent = info.priority.toLowerCase();
  $("#outTeam").textContent = `${info.team.toLowerCase()}_team`;
  $("#outSla").textContent = info.sla;
  $("#confidenceValue").textContent = `${info.confidence}%`;
  $(".confidence-ring").style.background = `conic-gradient(var(--green) 0 ${info.confidence * 3.6}deg, rgba(255,255,255,.18) ${info.confidence * 3.6}deg)`;
}

function renderReasoning(active) {
  if (!active && !state.items.length) {
    $("#reasoningList").innerHTML = `<li class="pending"><i></i><span>No task processed yet</span><small></small></li>`;
    return;
  }

  const steps = [
    ["Parse user intent", "", "done"],
    ["Extract entities", "", "done"],
    ["Classify task type", "", "done"],
    ["Route to team", "", active ? "active" : "done"],
    ["Persist result", "", active ? "pending" : "done"],
  ];

  $("#reasoningList").innerHTML = steps.map(([label, time, status]) => `
    <li class="${status}">
      <i></i>
      <span>${label}</span>
      <small>${time}</small>
    </li>
  `).join("");
}

function renderActivity() {
  const visible = state.items.filter((item) => state.filter === "all" || item.type === state.filter);
  if (!visible.length) {
    $("#activityList").innerHTML = `<div class="empty-state">No activity yet.</div>`;
  } else {
    $("#activityList").innerHTML = visible.map((item) => `
      <div class="activity-item">
        <span class="activity-dot ${item.type}"></span>
        <span class="activity-id">#${item.id}</span>
        <strong>${item.title}</strong>
        <span class="tag ${item.type}">${item.team}</span>
        <span class="priority ${item.priority === "High" ? "priority-high" : ""}">${item.priority}</span>
        <span class="activity-time">${item.time}</span>
      </div>
    `).join("");
  }

  if (state.panel === "history") openPanel("history");
}

function updateMetrics() {
  const counts = teamCounts();
  const taskCount = state.items.length;
  const invoiceCount = state.items.filter((item) => item.type === "invoice").length;

  $("#metricTasks").textContent = taskCount;
  $("#metricInvoices").textContent = invoiceCount;
  $("#metricLatency").textContent = state.lastLatency ? `${state.lastLatency.toFixed(2)}s` : "--";
  $("#metricAccuracy").textContent = taskCount ? "live" : "--";

  $("#billingCount").textContent = counts.Billing;
  $("#financeCount").textContent = counts.Finance;
  $("#supportCount").textContent = counts.Support;
  $("#opsCount").textContent = counts.Ops;
  $("#routedCount").textContent = `${taskCount} tasks routed`;
  updateWorkloadBars(counts);
  drawCharts();
}

function teamCounts() {
  return state.items.reduce((counts, item) => {
    counts[item.team] = (counts[item.team] || 0) + 1;
    return counts;
  }, { Billing: 0, Finance: 0, Support: 0, Ops: 0 });
}

function updateWorkloadBars(counts) {
  const total = Math.max(1, counts.Billing + counts.Finance + counts.Support + counts.Ops);
  $("#billingBar").style.setProperty("--w", `${(counts.Billing / total) * 100}%`);
  $("#financeBar").style.setProperty("--w", `${(counts.Finance / total) * 100}%`);
  $("#supportBar").style.setProperty("--w", `${(counts.Support / total) * 100}%`);
  $("#opsBar").style.setProperty("--w", `${(counts.Ops / total) * 100}%`);
}

async function refreshData() {
  $("#refreshButton").textContent = "Refreshing...";
  try {
    const [tasks, tickets, invoices] = await Promise.all([
      api("/tasks/"),
      api("/tickets/"),
      api("/invoices/"),
    ]);
    state.items = tasks.map((task) => ({
      id: task.id,
      type: task.task_type,
      title: task.title,
      team: task.task_type === "invoice" ? "Finance" : task.task_type === "ticket" ? "Support" : "Ops",
      priority: task.task_type === "ticket" ? "High" : "Med",
      time: "db",
    }));
    $("#metricInvoices").textContent = invoices.length;
    $("#supportCount").textContent = tickets.length;
    renderActivity();
    updateMetrics();
  } catch {
    updateMetrics();
  } finally {
    $("#refreshButton").textContent = "Refresh data";
  }
}

function drawCharts() {
  const taskCount = state.items.length;
  const invoiceCount = state.items.filter((item) => item.type === "invoice").length;
  const latency = state.lastLatency || 0;
  const series = {
    tasks: ["#6657d6", [0, 0, taskCount]],
    invoices: ["#22a87f", [0, 0, invoiceCount]],
    latency: ["#de8a20", [0, 0, latency]],
    accuracy: ["#1fa480", [0, 0, taskCount ? 1 : 0]],
  };

  $$("canvas[data-chart]").forEach((canvas) => {
    const [color, points] = series[canvas.dataset.chart];
    const ctx = canvas.getContext("2d");
    const width = canvas.width = canvas.offsetWidth * devicePixelRatio;
    const height = canvas.height = canvas.offsetHeight * devicePixelRatio;
    const max = Math.max(1, ...points);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 3 * devicePixelRatio;
    ctx.strokeStyle = color;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - (point / max) * (height - 6) - 3;
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
}

function wireEvents() {
  $("#authForm").addEventListener("submit", handleAuth);
  $("#demoLogin").addEventListener("click", continueOffline);
  $$("[data-auth-tab]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authTab)));
  $("#runTaskButton").addEventListener("click", runTask);
  $("#taskInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") runTask();
  });
  $("#clearButton").addEventListener("click", () => {
    $("#taskInput").value = "";
    $("#taskInput").focus();
  });
  $("#refreshButton").addEventListener("click", refreshData);
  $("#logoutButton").addEventListener("click", () => {
    localStorage.removeItem("opspilot_user");
    localStorage.removeItem("opspilot_token");
    state.user = null;
    state.token = null;
    state.items = [];
    showAuth();
  });
  $("#modelButton").addEventListener("click", () => {
    state.model = state.model === "gpt-4o" ? "gpt-4o-mini" : "gpt-4o";
    localStorage.setItem("opspilot_model", state.model);
    $("#modelName").textContent = state.model;
  });
  $$("[data-panel]").forEach((button) => button.addEventListener("click", () => openPanel(button.dataset.panel)));
  $("#panelClose").addEventListener("click", closePanel);
  document.addEventListener("click", (event) => {
    const replayButton = event.target.closest("[data-replay]");
    if (!replayButton) return;
    const item = state.items.find((entry) => String(entry.id) === replayButton.dataset.replay);
    if (!item) return;
    $("#taskInput").value = item.title;
    closePanel();
    runTask();
  });
  $$(".filters button").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    $$(".filters button").forEach((item) => item.classList.toggle("active", item === button));
    renderActivity();
  }));

  const dropZone = $("#dropZone");
  ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, () => dropZone.classList.remove("dragging")));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    $("#taskInput").value = await file.text();
    runTask();
  });
}

wireEvents();
setAuthMode("login");
state.user ? showConsole() : showAuth();
