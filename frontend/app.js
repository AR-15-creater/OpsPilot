const API_BASE = "https://opspilot-d359.onrender.com";

const state = {
  user: JSON.parse(localStorage.getItem("opspilot_user") || "null"),
  token: localStorage.getItem("opspilot_token"),
  apiBase: (() => {
    const saved = localStorage.getItem("opspilot_api_base");
    return saved && saved.startsWith("https://") && !saved.includes("localhost") && !saved.includes("127.0.0.1")
      ? saved
      : API_BASE;
  })(),
  model: localStorage.getItem("opspilot_model") || "gpt-4o",
  theme: localStorage.getItem("opspilot_theme") || "dark",
  authMode: "login",
  filter: "all",
  search: "",
  priorityFilter: "all",
  statusFilter: "all",
  channelFilter: "all",
  view: "list",
  panel: null,
  running: false,
  items: [],
  selectedItemId: null,
  lastLatency: null,
  polling: null,
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
  applyRole();
  resetLivePanel();
  renderReasoning(false);
  renderActivity();
  updateMetrics();
  startPolling();
  refreshData(true);
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  $("#themeButton").textContent = state.theme === "dark" ? "Light" : "Dark";
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

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  try {
    const response = await fetch(`${state.apiBase}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || "Request failed");
    }

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
  const role = form.get("role") || "operator";

  $("#authMessage").textContent = "Connecting...";

  try {
    if (state.authMode === "join") {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
        }),
      });
    }

    const token = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
      }),
    });

    saveSession(
      {
        full_name: fullName,
        email,
        role,
      },
      token.access_token
    );

    showConsole();
  } catch (error) {
    $("#authMessage").textContent = `${error.message}. Please check backend connection.`;
  }
}

function panelMarkup(panel) {
  if (panel === "profile") {
    const isAdmin = state.user?.role === "admin";

    return `
      <div class="utility-grid">
        <div class="utility-tile"><span>Workspace</span><strong>${state.user?.full_name || "Workspace member"}</strong></div>
        <div class="utility-tile"><span>Role</span><strong>${state.user?.role || "operator"}</strong></div>
        <div class="utility-tile"><span>Session</span><strong>${state.token ? "Active" : "Inactive"}</strong></div>
      </div>

      <div class="about-box">
        <h3>About OpsPilot</h3>
        <p>
          OpsPilot is an AI-powered operations console. Customers submit requests from the public page, then the AI classifies them as tickets, invoices, or general tasks. Staff can review priority, SLA, sentiment, suggestions, and reply drafts before taking action.
        </p>
      </div>

      <div class="profile-actions">
        <button type="button" data-panel-jump="history">History</button>
        ${isAdmin ? `<button type="button" data-panel-jump="settings">Settings</button>` : ""}
        <a href="customer.html">Customer request page</a>
        <button type="button" id="profileLogoutButton">Logout</button>
      </div>
    `;
  }

  if (panel === "history") {
    if (!state.items.length) {
      return `<p class="empty-state">No task history yet.</p>`;
    }

    return `
      <div class="utility-list">
        ${state.items
          .slice(0, 5)
          .map(
            (item) => `
          <div class="utility-row">
            <strong>#${item.id}</strong>
            <div><span>${item.type}</span>${item.title}</div>
            <button class="mini-action" data-replay="${item.id}" type="button">Replay</button>
          </div>
        `
          )
          .join("")}
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
      <label>
        Role
        <select name="role">
          <option value="admin" ${state.user?.role === "admin" ? "selected" : ""}>admin</option>
          <option value="operator" ${state.user?.role !== "admin" ? "selected" : ""}>operator</option>
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

  $$("[data-panel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panel);
  });

  const settingsForm = $("#settingsForm");

  if (settingsForm) {
    settingsForm.addEventListener("submit", saveSettings);
  }

  const logoutButton = $("#profileLogoutButton");

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }
}

function closePanel() {
  const panel = $("#utilityPanel");

  if (!panel) return;

  state.panel = null;
  panel.classList.add("hidden");

  $$("[data-panel]").forEach((button) => {
    button.classList.remove("active");
  });
}

function saveSettings(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);

  state.apiBase = String(form.get("api_base") || API_BASE).trim();
  state.model = String(form.get("model") || "gpt-4o");
  state.user = {
    ...(state.user || {}),
    role: String(form.get("role") || "operator"),
  };

  localStorage.setItem("opspilot_api_base", state.apiBase);
  localStorage.setItem("opspilot_model", state.model);
  localStorage.setItem("opspilot_user", JSON.stringify(state.user));

  $("#modelName").textContent = state.model;
  applyRole();
  $("#utilityBody").insertAdjacentHTML("beforeend", `<p class="form-note">Settings saved.</p>`);
}

function applyRole() {
  const role = state.user?.role === "admin" ? "admin" : "operator";
  $("#roleBadge").textContent = role === "admin" ? "Admin" : "Operator";
  $("#adminAnalytics").classList.toggle("hidden", role !== "admin");
  $$("[data-admin-only]").forEach((element) => {
    element.classList.toggle("hidden", role !== "admin");
  });
}

function logout() {
  localStorage.removeItem("opspilot_user");
  localStorage.removeItem("opspilot_token");
  state.user = null;
  state.token = null;
  state.items = [];
  stopPolling();
  showAuth();
}

function classify(text) {
  const lower = text.toLowerCase();

  if (lower.includes("invoice") || lower.includes("gst") || lower.includes("vendor") || lower.includes("amount")) {
    return {
      type: "invoice",
      team: "Finance",
      category: "invoice_extract",
      priority: "Med",
      sla: "8h",
      confidence: 94,
      status: "New",
      channel: "Console",
      sentiment: getSentiment(text),
      knowledge: getKnowledge(text),
      reasoning: "The text looks like an invoice because it mentions invoice, vendor, amount, or tax details.",
      suggestions: [
        "Verify the extracted amount and invoice number.",
        "Check the due date and approval owner.",
        "Forward the invoice to finance with the original text attached.",
      ],
      reply: "The invoice details have been extracted. Please review the amount, vendor, and due date before processing.",
    };
  }

  if (lower.includes("payment") || lower.includes("login") || lower.includes("failed") || lower.includes("urgent")) {
    return {
      type: "ticket",
      team: lower.includes("login") ? "Support" : "Billing",
      category: lower.includes("login") ? "access_issue" : "payment_issue",
      priority: lower.includes("urgent") ? "High" : "Med",
      sla: lower.includes("urgent") ? "2h" : "6h",
      confidence: 98,
      status: "New",
      channel: "Console",
      sentiment: getSentiment(text),
      knowledge: getKnowledge(text),
      reasoning: lower.includes("login")
        ? "The message mentions login or access failure, so it should go to Support."
        : "The message mentions payment failure or urgency, so it should go to Billing.",
      suggestions: lower.includes("login")
        ? [
            "Check whether the user account is locked or disabled.",
            "Confirm the password reset flow and recent login attempts.",
            "Escalate to Support if the user is blocked from work.",
          ]
        : [
            "Check the payment gateway and transaction status.",
            "Ask the customer for the order ID and deduction timestamp.",
            "Escalate to Billing if money was deducted but the order failed.",
          ],
      reply: "Thanks for reporting this. We have routed your issue to the right team and will review it as a priority.",
    };
  }

  return {
    type: "general",
    team: "Ops",
    category: "operations",
    priority: "Low",
    sla: "24h",
    confidence: 91,
    status: "New",
    channel: "Console",
    sentiment: getSentiment(text),
    knowledge: getKnowledge(text),
    reasoning: "The request does not clearly match a support ticket or invoice, so it was routed to general operations.",
    suggestions: [
      "Add any missing deadline, owner, or business context.",
      "Assign the task to operations for first review.",
      "Convert it to a ticket or invoice if new details appear.",
    ],
    reply: "This has been saved as a general operations task and can be assigned once more context is available.",
  };
}

function getSentiment(text) {
  const lower = text.toLowerCase();

  if (lower.includes("angry") || lower.includes("worst") || lower.includes("fraud") || lower.includes("legal")) {
    return "Angry";
  }

  if (lower.includes("urgent") || lower.includes("failed") || lower.includes("deducted") || lower.includes("blocked")) {
    return "Worried";
  }

  if (lower.includes("thanks") || lower.includes("resolved")) {
    return "Positive";
  }

  return "Neutral";
}

function getKnowledge(text) {
  const lower = text.toLowerCase();

  if (lower.includes("payment") || lower.includes("deducted") || lower.includes("refund")) {
    return ["Payment failed checklist", "Refund and reversal policy", "Gateway transaction verification"];
  }

  if (lower.includes("login") || lower.includes("password") || lower.includes("account")) {
    return ["Password reset guide", "Account lock troubleshooting", "Login security checklist"];
  }

  if (lower.includes("invoice") || lower.includes("gst") || lower.includes("vendor")) {
    return ["Invoice approval process", "GST invoice validation", "Vendor payment checklist"];
  }

  return ["General request handling", "Escalation policy", "Customer communication guide"];
}

function teamFromAnalysis(analysis, fallbackTeam) {
  if (analysis.assigned_team) {
    return analysis.assigned_team;
  }

  if (analysis.task_type === "invoice") {
    return "Finance";
  }

  if (analysis.task_type === "ticket") {
    return fallbackTeam === "Billing" ? "Billing" : "Support";
  }

  return "Ops";
}

function mergeAnalysis(fallback, analysis) {
  const taskType = analysis.task_type || fallback.type;
  const priority = analysis.priority || fallback.priority;
  const team = teamFromAnalysis(analysis, fallback.team);

  return {
    ...fallback,
    type: taskType,
    team,
    category: analysis.category || fallback.category,
    priority: priority ? String(priority) : fallback.priority,
    sla: fallback.sla,
    confidence: analysis.confidence || fallback.confidence,
    status: fallback.status || "New",
    channel: fallback.channel || "Console",
    sentiment: analysis.sentiment || fallback.sentiment,
    knowledge: analysis.knowledge?.length ? analysis.knowledge : fallback.knowledge,
    reasoning: analysis.reasoning || fallback.reasoning,
    suggestions: analysis.suggestions?.length ? analysis.suggestions : fallback.suggestions,
    reply: analysis.reply || fallback.reply,
  };
}

async function runTask() {
  if (state.running) return;

  const text = $("#taskInput").value.trim();

  if (!text) {
    $("#taskInput").focus();
    return;
  }

  const started = performance.now();
  let inferred = classify(text);

  state.running = true;

  setProcessing(true);
  renderReasoning(true);
  updateLive(text, inferred, null);

  let result = null;

  try {
    result = await api("/tasks/", {
      method: "POST",
      body: JSON.stringify({
        title: text.slice(0, 62),
        description: text,
      }),
      timeoutMs: 12000,
    });
  } catch {
    result = null;
  } finally {
    if (result) {
      inferred = mergeAnalysis(inferred, result);
    }

    const elapsed = ((performance.now() - started) / 1000).toFixed(2);

    state.lastLatency = Number(elapsed);

    const item = {
      id: result?.id || nextLocalId(),
      type: result?.task_type || inferred.type,
      title: text.length > 54 ? `${text.slice(0, 54)}...` : text,
      message: text,
      team: inferred.team,
      priority: inferred.priority,
      status: inferred.status || "New",
      sla: inferred.sla,
      channel: inferred.channel || "Console",
      sentiment: inferred.sentiment,
      knowledge: inferred.knowledge,
      reasoning: inferred.reasoning,
      suggestions: inferred.suggestions,
      reply: inferred.reply,
      time: "now",
    };

    state.items.unshift(item);
    state.items = state.items.slice(0, 20);

    updateLive(text, inferred, item.id, elapsed);
    renderReasoning(false, inferred);
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
  $("#suggestionList").innerHTML = "<li>No suggestions yet.</li>";
  $("#replyDraft").textContent = "Run a task to generate a response draft.";
  $("#copyReplyButton").disabled = true;
  $("#sendReplyButton").disabled = true;
}

function updateLive(text, info, id, elapsed = "0.00") {
  $("#taskText").textContent = text;

  if (id) {
    $("#liveTaskId").textContent = `#${id}`;
  }

  $("#processingTime").textContent = `processed ${elapsed}s`;
  $("#outType").textContent = info.type === "ticket" ? "support_ticket" : info.type;
  $("#outCategory").textContent = info.category;
  $("#outPriority").textContent = info.priority.toLowerCase();
  $("#outTeam").textContent = `${info.team.toLowerCase()}_team`;
  $("#outSla").textContent = info.sla;
  $("#confidenceValue").textContent = `${info.confidence}%`;
  $("#suggestionList").innerHTML = (info.suggestions || [])
    .map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`)
    .join("");
  $("#replyDraft").textContent = info.reply || "No reply draft generated.";
  $("#copyReplyButton").disabled = !info.reply;
  $("#sendReplyButton").disabled = !info.reply;

  $(".confidence-ring").style.background = `conic-gradient(var(--green) 0 ${
    info.confidence * 3.6
  }deg, rgba(255,255,255,.18) ${info.confidence * 3.6}deg)`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readField(text, label) {
  const line = String(text || "")
    .split("\n")
    .find((item) => item.toLowerCase().startsWith(`${label.toLowerCase()}:`));

  return line ? line.slice(label.length + 1).trim() : "";
}

function renderReasoning(active, info = null) {
  if (!active && !state.items.length) {
    $("#reasoningList").innerHTML = `<li class="pending"><i></i><span>No task processed yet</span><small></small></li>`;
    return;
  }

  const steps = [
    ["Parse user intent", "", "done"],
    ["Extract entities", "", "done"],
    ["Classify task type", "", "done"],
    ["Route to team", "", active ? "active" : "done"],
    [info?.reasoning || "Persist result", "", active ? "pending" : "done"],
  ];

  $("#reasoningList").innerHTML = steps
    .map(
      ([label, time, status]) => `
    <li class="${status}">
      <i></i>
      <span>${label}</span>
      <small>${time}</small>
    </li>
  `
    )
    .join("");
}

function renderActivity() {
  const visible = getVisibleItems();

  if (!visible.length) {
    $("#activityList").innerHTML = `<div class="empty-state">No activity yet.</div>`;
  } else {
    $("#activityList").innerHTML = visible
      .map(
        (item) => `
      <button class="activity-item ${state.selectedItemId === item.id ? "selected" : ""}" data-ticket-id="${item.id}" type="button">
        <span class="activity-dot ${item.type}"></span>
        <span class="activity-id">#${item.id}</span>
        <strong>${item.title}</strong>
        <span class="tag ${item.type}">${item.team}</span>
        <span class="priority ${item.priority === "High" ? "priority-high" : ""}">${item.priority}</span>
        <span class="activity-time">${item.status || item.time}</span>
      </button>
    `
      )
      .join("");
  }

  if (state.panel === "history") {
    openPanel("history");
  }

  renderKanban();
}

function getVisibleItems() {
  const needle = state.search.trim().toLowerCase();

  return state.items.filter((item) => {
    const haystack = [
      item.id,
      item.title,
      item.message,
      item.customerEmail,
      item.priority,
      item.team,
      item.status,
      item.channel,
      item.type,
    ].join(" ").toLowerCase();

    const typeOk = state.filter === "all" || item.type === state.filter;
    const priorityOk = state.priorityFilter === "all" || item.priority === state.priorityFilter;
    const statusOk = state.statusFilter === "all" || item.status === state.statusFilter;
    const channelOk = state.channelFilter === "all" || item.channel === state.channelFilter;
    const searchOk = !needle || haystack.includes(needle);

    return typeOk && priorityOk && statusOk && channelOk && searchOk;
  });
}

function renderKanban() {
  const columns = ["New", "In Progress", "Waiting Customer", "Resolved"];
  const visible = getVisibleItems();

  $("#kanbanGrid").innerHTML = columns.map((status) => {
    const cards = visible.filter((item) => item.status === status);

    return `
      <div class="kanban-column">
        <h3>${status} <span>${cards.length}</span></h3>
        <div class="kanban-items">
          ${cards.length ? cards.map((item) => `
            <button class="kanban-item" data-ticket-id="${item.id}" type="button">
              <strong>#${item.id} ${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.team)} · ${escapeHtml(item.priority)} · ${escapeHtml(item.channel)}</span>
            </button>
          `).join("") : `<p>No requests</p>`}
        </div>
      </div>
    `;
  }).join("");
}

function openTicketDetail(id) {
  const item = state.items.find((entry) => String(entry.id) === String(id));

  if (!item) return;

  state.selectedItemId = item.id;
  $("#ticketDetail").classList.remove("hidden");
  $("#detailMeta").textContent = `#${item.id} / ${item.type} / ${item.team}`;
  $("#detailTitle").textContent = item.title;
  $("#detailMessage").textContent = item.message || item.title;
  $("#detailStatus").textContent = item.status || "New";
  $("#detailSla").textContent = getSlaText(item);
  $("#detailSentiment").textContent = item.sentiment || "Neutral";
  $("#detailChannel").textContent = item.channel || "Console";
  $("#knowledgeList").innerHTML = (item.knowledge || getKnowledge(item.message || item.title))
    .map((article) => `<li>${escapeHtml(article)}</li>`)
    .join("");

  $$("[data-status]").forEach((button) => {
    button.classList.toggle("active", button.dataset.status === item.status);
  });

  renderTimeline(item);
  renderActivity();
}

function getSlaText(item) {
  const priority = String(item.priority || "").toLowerCase();

  if (item.status === "Resolved") {
    return "Completed";
  }

  if (priority === "high") {
    return "2h remaining";
  }

  if (priority === "med" || priority === "medium") {
    return "8h remaining";
  }

  return "24h remaining";
}

async function updateSelectedStatus(status) {
  const item = state.items.find((entry) => String(entry.id) === String(state.selectedItemId));

  if (!item) return;

  item.status = status;
  saveLocalStatus(item.id, status);
  addTimeline(item.id, `Status changed to ${status}`);

  if (Number(item.id)) {
    try {
      await api(`/tasks/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      showNotification("Status saved to PostgreSQL.");
    } catch {
      showNotification("Status changed locally. Backend save failed.");
    }
  }

  openTicketDetail(item.id);
  updateMetrics();
}

function saveLocalStatus(id, status) {
  const statuses = JSON.parse(localStorage.getItem("opspilot_statuses") || "{}");
  statuses[id] = status;
  localStorage.setItem("opspilot_statuses", JSON.stringify(statuses));
}

function getLocalStatus(id) {
  const statuses = JSON.parse(localStorage.getItem("opspilot_statuses") || "{}");
  return statuses[id];
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
  updateAnalytics(counts);
  drawCharts();
}

function updateAnalytics(counts) {
  const highPriority = state.items.filter((item) => String(item.priority).toLowerCase() === "high").length;
  const tickets = state.items.filter((item) => item.type === "ticket").length;
  const invoices = state.items.filter((item) => item.type === "invoice").length;
  const topTeam = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  $("#analyticsHigh").textContent = highPriority;
  $("#analyticsTickets").textContent = tickets;
  $("#analyticsInvoices").textContent = invoices;
  $("#analyticsTopTeam").textContent = topTeam && topTeam[1] ? topTeam[0] : "--";
  $("#analyticsSummary").textContent = state.items.length
    ? `${state.items.length} total requests, ${highPriority} urgent`
    : "No requests yet";
}

function generateSummary() {
  const total = state.items.length;
  const high = state.items.filter((item) => item.priority === "High").length;
  const tickets = state.items.filter((item) => item.type === "ticket").length;
  const invoices = state.items.filter((item) => item.type === "invoice").length;
  const resolved = state.items.filter((item) => item.status === "Resolved").length;
  const channels = state.items.reduce((acc, item) => {
    acc[item.channel] = (acc[item.channel] || 0) + 1;
    return acc;
  }, {});
  const topChannel = Object.entries(channels).sort((a, b) => b[1] - a[1])[0]?.[0] || "none";
  const counts = teamCounts();
  const topTeam = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "none";

  $("#summaryText").textContent = total
    ? `Today OpsPilot handled ${total} requests. ${tickets} are support tickets and ${invoices} are invoices. ${high} requests are high priority, ${resolved} are resolved, ${topTeam} has the highest workload, and ${topChannel} is the most active channel. Recommended action: focus on high priority unresolved requests first.`
    : "No requests are available yet. Submit a customer request or refresh data to generate a useful summary.";
  $("#summaryCard").classList.remove("hidden");
}

function teamCounts() {
  return state.items.reduce(
    (counts, item) => {
      counts[item.team] = (counts[item.team] || 0) + 1;
      return counts;
    },
    {
      Billing: 0,
      Finance: 0,
      Support: 0,
      Ops: 0,
    }
  );
}

function updateWorkloadBars(counts) {
  const total = Math.max(1, counts.Billing + counts.Finance + counts.Support + counts.Ops);

  $("#billingBar").style.setProperty("--w", `${(counts.Billing / total) * 100}%`);
  $("#financeBar").style.setProperty("--w", `${(counts.Finance / total) * 100}%`);
  $("#supportBar").style.setProperty("--w", `${(counts.Support / total) * 100}%`);
  $("#opsBar").style.setProperty("--w", `${(counts.Ops / total) * 100}%`);
}

async function refreshData(silent = false) {
  $("#refreshButton").textContent = "Refreshing...";
  const previousMaxId = state.items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);

  try {
    const [tasks, tickets, invoices] = await Promise.all([
      api("/tasks/"),
      api("/tickets/"),
      api("/invoices/"),
    ]);

    state.items = tasks.map((task) => makeItemFromTask(task));

    const latestMaxId = state.items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);

    if (previousMaxId && latestMaxId > previousMaxId) {
      showNotification(`${latestMaxId - previousMaxId} new customer request received.`);
    } else if (state.items.length && !silent) {
      showNotification("Data refreshed. Latest customer requests are loaded.");
    }

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

function makeItemFromTask(task) {
  const status = task.status === "completed" ? "New" : task.status;
  const message = task.description || "";
  const channel = readField(message, "Channel") || (message.includes("Customer:") ? "Website Form" : "Console");

  return {
    id: task.id,
    type: task.task_type,
    title: task.title,
    message,
    customerEmail: readField(message, "Email"),
    team: task.task_type === "invoice" ? "Finance" : task.task_type === "ticket" ? "Support" : "Ops",
    priority: task.priority || (task.task_type === "ticket" ? "High" : "Med"),
    status: getLocalStatus(task.id) || status,
    sla: task.task_type === "ticket" ? "2h" : task.task_type === "invoice" ? "8h" : "24h",
    channel,
    sentiment: getSentiment(`${task.title} ${message}`),
    knowledge: getKnowledge(`${task.title} ${message}`),
    suggestions: task.suggestions || [],
    reply: task.reply,
    time: "db",
  };
}

function addTimeline(id, text) {
  const timelines = JSON.parse(localStorage.getItem("opspilot_timelines") || "{}");
  timelines[id] = timelines[id] || [];
  timelines[id].unshift({
    text,
    time: new Date().toLocaleString(),
  });
  localStorage.setItem("opspilot_timelines", JSON.stringify(timelines));
}

function getTimeline(id) {
  const timelines = JSON.parse(localStorage.getItem("opspilot_timelines") || "{}");
  return timelines[id] || [];
}

function addNote(id, text) {
  const notes = JSON.parse(localStorage.getItem("opspilot_notes") || "{}");
  notes[id] = notes[id] || [];
  notes[id].unshift({
    text,
    time: new Date().toLocaleString(),
  });
  localStorage.setItem("opspilot_notes", JSON.stringify(notes));
}

function getNotes(id) {
  const notes = JSON.parse(localStorage.getItem("opspilot_notes") || "{}");
  return notes[id] || [];
}

function renderTimeline(item) {
  const notes = getNotes(item.id).map((note) => ({
    text: `Note: ${note.text}`,
    time: note.time,
  }));
  const timeline = [
    { text: "Request loaded in OpsPilot", time: item.time || "db" },
    ...getTimeline(item.id),
    ...notes,
  ];

  $("#timelineList").innerHTML = timeline.length
    ? timeline.map((entry) => `<li><strong>${escapeHtml(entry.text)}</strong><span>${escapeHtml(entry.time)}</span></li>`).join("")
    : `<li>No timeline yet.</li>`;
}

function exportCsv() {
  const rows = [
    ["id", "title", "type", "priority", "team", "status", "channel", "email"],
    ...getVisibleItems().map((item) => [
      item.id,
      item.title,
      item.type,
      item.priority,
      item.team,
      item.status,
      item.channel,
      item.customerEmail || "",
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "opspilot-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function startPolling() {
  if (state.polling) return;

  state.polling = window.setInterval(() => {
    if (state.user && !state.running) {
      refreshData(true);
    }
  }, 20000);
}

function stopPolling() {
  window.clearInterval(state.polling);
  state.polling = null;
}

function showNotification(text) {
  const banner = $("#notificationBanner");
  banner.textContent = text;
  banner.classList.remove("hidden");
  window.clearTimeout(showNotification.timer);
  showNotification.timer = window.setTimeout(() => {
    banner.classList.add("hidden");
  }, 4200);
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
    const width = (canvas.width = canvas.offsetWidth * devicePixelRatio);
    const height = (canvas.height = canvas.offsetHeight * devicePixelRatio);
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

  $$("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authTab));
  });

  $("#runTaskButton").addEventListener("click", runTask);

  $("#taskInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      runTask();
    }
  });

  $("#clearButton").addEventListener("click", () => {
    $("#taskInput").value = "";
    $("#taskInput").focus();
  });

  $("#refreshButton").addEventListener("click", () => refreshData(false));
  $("#summaryButton").addEventListener("click", generateSummary);
  $("#summaryClose").addEventListener("click", () => $("#summaryCard").classList.add("hidden"));
  $("#exportButton").addEventListener("click", exportCsv);
  $("#copyReplyButton").addEventListener("click", copyReplyDraft);
  $("#sendReplyButton").addEventListener("click", sendReplyEmail);
  $("#themeButton").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("opspilot_theme", state.theme);
    applyTheme();
  });
  $("#searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderActivity();
  });
  $("#priorityFilter").addEventListener("change", (event) => {
    state.priorityFilter = event.target.value;
    renderActivity();
  });
  $("#statusFilter").addEventListener("change", (event) => {
    state.statusFilter = event.target.value;
    renderActivity();
  });
  $("#channelFilter").addEventListener("change", (event) => {
    state.channelFilter = event.target.value;
    renderActivity();
  });
  $("#viewToggle").addEventListener("click", () => {
    state.view = state.view === "list" ? "kanban" : "list";
    $("#activityList").classList.toggle("hidden", state.view !== "list");
    $("#kanbanCard").classList.toggle("hidden", state.view !== "kanban");
    $("#viewToggle").textContent = state.view === "list" ? "Kanban view" : "List view";
    renderActivity();
  });
  $("#detailClose").addEventListener("click", () => {
    state.selectedItemId = null;
    $("#ticketDetail").classList.add("hidden");
    renderActivity();
  });

  $$("[data-status]").forEach((button) => {
    button.addEventListener("click", () => updateSelectedStatus(button.dataset.status));
  });

  $("#noteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const item = state.items.find((entry) => String(entry.id) === String(state.selectedItemId));
    const text = $("#noteInput").value.trim();

    if (!item || !text) return;

    addNote(item.id, text);
    $("#noteInput").value = "";
    renderTimeline(item);
    showNotification("Internal note added.");
  });

  $("#escalateButton").addEventListener("click", () => {
    const item = state.items.find((entry) => String(entry.id) === String(state.selectedItemId));

    if (!item) return;

    item.priority = "High";
    updateSelectedStatus("In Progress");
    showNotification("Ticket escalated to high priority.");
    openTicketDetail(item.id);
    updateMetrics();
  });

  $("#modelButton").addEventListener("click", () => {
    state.model = state.model === "gpt-4o" ? "gpt-4o-mini" : "gpt-4o";
    localStorage.setItem("opspilot_model", state.model);
    $("#modelName").textContent = state.model;
  });

  $$("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.panel));
  });

  $("#panelClose").addEventListener("click", closePanel);

  document.addEventListener("click", (event) => {
    const panelJump = event.target.closest("[data-panel-jump]");

    if (panelJump) {
      openPanel(panelJump.dataset.panelJump);
      return;
    }

    const replayButton = event.target.closest("[data-replay]");

    if (!replayButton) {
      const ticketButton = event.target.closest("[data-ticket-id]");

      if (ticketButton) {
        openTicketDetail(ticketButton.dataset.ticketId);
      }

      return;
    }

    const item = state.items.find((entry) => String(entry.id) === replayButton.dataset.replay);

    if (!item) return;

    $("#taskInput").value = item.title;
    closePanel();
    runTask();
  });

  $$(".filters button").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;

      $$(".filters button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      renderActivity();
    });
  });

  const dropZone = $("#dropZone");

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove("dragging"));
  });

  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();

    const file = event.dataTransfer.files[0];

    if (!file) return;

    $("#taskInput").value = await file.text();
    runTask();
  });
}

async function copyReplyDraft() {
  const text = $("#replyDraft").textContent.trim();

  if (!text || text === "Run a task to generate a response draft.") {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    $("#copyReplyButton").textContent = "Copied";
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    $("#copyReplyButton").textContent = "Copied";
  }

  window.setTimeout(() => {
    $("#copyReplyButton").textContent = "Copy";
  }, 1400);
}

function sendReplyEmail() {
  const item = state.items.find((entry) => String(entry.id) === String(state.selectedItemId));
  const reply = $("#replyDraft").textContent.trim();
  const email = item?.customerEmail || readField(item?.message || "", "Email");

  if (!email) {
    showNotification("Customer email not found for this request.");
    return;
  }

  if (!reply || reply === "Run a task to generate a response draft.") {
    showNotification("Reply draft is empty.");
    return;
  }

  const subject = encodeURIComponent(`Update on OpsPilot request #${item.id}`);
  const body = encodeURIComponent(reply);
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

wireEvents();
setAuthMode("login");
applyTheme();

if (state.user) {
  showConsole();
} else {
  showAuth();
}
