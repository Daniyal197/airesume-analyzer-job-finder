/* ===================== Config ===================== */

// Auto-picks the right backend depending on where the frontend itself is
// running. Local dev (opened via a local server) -> local backend.
// Anywhere else (e.g. deployed on Vercel) -> the deployed Render backend.
// Update RENDER_BACKEND_URL once you've deployed the backend on Render.
const RENDER_BACKEND_URL = "https://YOUR-RENDER-APP-NAME.onrender.com"; // <-- update after deploying
const IS_LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname);
const API_BASE = IS_LOCAL ? "http://127.0.0.1:8000" : RENDER_BACKEND_URL;

/* ===================== State ===================== */

const state = {
  token: localStorage.getItem("resumeDeskToken") || null,
  userEmail: localStorage.getItem("resumeDeskEmail") || null,
  authMode: "login", // "login" | "register"
  analyzeFile: null,
  matchFile: null,
  applications: [],
  currentSection: null,
  previousSection: null,
  lastAnalyzeSummary: null, // { filename, score }
  lastMatchSummary: null,   // { company, score }
  trackerSearchTerm: "",
};

/* ===================== DOM refs ===================== */

const $ = (id) => document.getElementById(id);

const authView = $("authView");
const appView = $("appView");

const SECTIONS = ["dashboard", "analyze", "finder", "match", "tracker"];

const SECTION_LABELS = {
  dashboard: "Dashboard",
  analyze: "Resume analysis",
  finder: "Job finder",
  match: "Job match",
  tracker: "Applications",
};

const SECTION_TITLES = {
  dashboard: "Dashboard — Resume Desk",
  analyze: "Resume Analysis — Resume Desk",
  finder: "Job Finder — Resume Desk",
  match: "Job Match — Resume Desk",
  tracker: "Applications — Resume Desk",
};

/* ===================== Init ===================== */

function init() {
  wireAuthForm();
  wireNav();
  wireBackLink();
  wireModal();
  wireAnalyze();
  wireFinder();
  wireMatch();
  wireTracker();
  wireQuickLinks();

  if (state.token) {
    showAppView();
  } else {
    showAuthView();
  }
}

/* ===================== View switching ===================== */

function showAuthView() {
  authView.hidden = false;
  appView.hidden = true;
  document.title = "Resume Desk";
}

function showAppView() {
  authView.hidden = true;
  appView.hidden = false;
  $("userEmail").textContent = state.userEmail || "";
  switchSection("dashboard");
  loadApplications();
}

function switchSection(name) {
  if (state.currentSection && state.currentSection !== name) {
    state.previousSection = state.currentSection;
  }
  state.currentSection = name;

  SECTIONS.forEach((n) => {
    $(`section-${n}`).hidden = n !== name;
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.section === name);
  });

  document.title = SECTION_TITLES[name] || "Resume Desk";
  updateBackLink();
}

function updateBackLink() {
  const link = $("backLink");
  if (state.previousSection && state.previousSection !== state.currentSection) {
    link.hidden = false;
    link.textContent = `← Back to ${SECTION_LABELS[state.previousSection]}`;
  } else {
    link.hidden = true;
  }
}

function wireBackLink() {
  $("backLink").addEventListener("click", () => {
    if (state.previousSection) switchSection(state.previousSection);
  });
}

function wireNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });
  $("signOutBtn").addEventListener("click", signOut);
}

function wireQuickLinks() {
  document.querySelectorAll(".quick-link-card").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });
}

/* ===================== Auth ===================== */

function wireAuthForm() {
  $("authToggleBtn").addEventListener("click", () => {
    state.authMode = state.authMode === "login" ? "register" : "login";
    const isLogin = state.authMode === "login";
    $("authHeading").textContent = isLogin ? "Sign in" : "Create an account";
    $("authSub").textContent = isLogin
      ? "Pick up where you left off with your applications."
      : "Takes a few seconds — no email verification needed for local use.";
    $("authSubmit").textContent = isLogin ? "Sign in" : "Create account";
    $("authToggleText").textContent = isLogin ? "New here?" : "Already have an account?";
    $("authToggleBtn").textContent = isLogin ? "Create an account" : "Sign in";
    hideError("authError");
  });

  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("authError");

    const email = $("email").value.trim();
    const password = $("password").value;
    const endpoint = state.authMode === "login" ? "/auth/login" : "/auth/register";
    const submitBtn = $("authSubmit");
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = state.authMode === "login" ? "Signing in..." : "Creating account...";

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Something went wrong. Try again.");
      }

      state.token = data.access_token;
      state.userEmail = email;
      localStorage.setItem("resumeDeskToken", state.token);
      localStorage.setItem("resumeDeskEmail", email);

      $("authForm").reset();
      showAppView();
      showToast(state.authMode === "login" ? "Welcome back." : "Account created — you're in.");
    } catch (err) {
      showError("authError", err.message || "Couldn't reach the server. Is the backend running?");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

function signOut() {
  state.token = null;
  state.userEmail = null;
  state.applications = [];
  state.currentSection = null;
  state.previousSection = null;
  state.lastAnalyzeSummary = null;
  state.lastMatchSummary = null;
  localStorage.removeItem("resumeDeskToken");
  localStorage.removeItem("resumeDeskEmail");
  showAuthView();
}

function authHeaders() {
  return { Authorization: `Bearer ${state.token}` };
}

/* ===================== Shared helpers ===================== */

function showError(elId, message) {
  const el = $(elId);
  el.textContent = message;
  el.hidden = false;
}

function hideError(elId) {
  $(elId).hidden = true;
}

function renderChips(containerId, items) {
  const el = $(containerId);
  el.innerHTML = "";
  (items || []).forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    el.appendChild(chip);
  });
}

function renderList(containerId, items) {
  const el = $(containerId);
  el.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  });
}

function setScoreRing(ringId, score) {
  const ring = $(ringId);
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  ring.style.setProperty("--pct", pct);
}

/* ===================== Toasts ===================== */

function showToast(message, variant = "success") {
  const container = $("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${variant}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

/* ===================== Modal ===================== */

function openModal(title, bodyHtml, actionsHtml) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHtml;
  $("modalActions").innerHTML = actionsHtml;
  $("modalOverlay").hidden = false;
}

function closeModal() {
  $("modalOverlay").hidden = true;
}

function wireModal() {
  $("modalOverlay").addEventListener("click", (e) => {
    if (e.target === $("modalOverlay")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("modalOverlay").hidden) closeModal();
  });
}

/* ===================== Dashboard ===================== */

function renderDashboard() {
  const apps = state.applications;
  const counts = { applied: 0, interview: 0, offer: 0, rejected: 0 };
  apps.forEach((a) => {
    if (counts[a.status] !== undefined) counts[a.status] += 1;
  });

  $("statTotal").textContent = apps.length;
  $("statInterview").textContent = counts.interview;
  $("statOffer").textContent = counts.offer;
  $("statRejected").textContent = counts.rejected;

  if (apps.length === 0) {
    $("statBarWrap").hidden = true;
    $("dashboardEmptyState").hidden = false;
  } else {
    $("statBarWrap").hidden = false;
    $("dashboardEmptyState").hidden = true;
    const bar = $("statBar");
    bar.innerHTML = "";
    ["applied", "interview", "offer", "rejected"].forEach((status) => {
      if (counts[status] === 0) return;
      const seg = document.createElement("div");
      seg.className = `stat-bar-segment ${status}`;
      seg.style.width = `${(counts[status] / apps.length) * 100}%`;
      seg.title = `${capitalize(status)}: ${counts[status]}`;
      bar.appendChild(seg);
    });
  }

  if (state.lastAnalyzeSummary) {
    $("lastAnalyzeSummary").textContent =
      `Last: ${state.lastAnalyzeSummary.filename} — ATS score ${state.lastAnalyzeSummary.score}`;
  }
  if (state.lastMatchSummary) {
    $("lastMatchSummary").textContent =
      `Last: ${state.lastMatchSummary.company || "a listing"} — match score ${state.lastMatchSummary.score}`;
  }
}

/* ===================== Resume analysis ===================== */

function wireAnalyze() {
  const fileInput = $("analyzeFile");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    state.analyzeFile = file || null;
    $("analyzeFileName").textContent = file ? file.name : "Choose a resume — PDF or DOCX";
    $("analyzeBtn").disabled = !file;
  });

  $("analyzeBtn").addEventListener("click", analyzeResume);
}

async function analyzeResume() {
  if (!state.analyzeFile) return;

  hideError("analyzeError");
  $("analyzeResults").hidden = true;
  $("analyzeLoading").hidden = false;
  $("analyzeBtn").disabled = true;

  try {
    const formData = new FormData();
    formData.append("file", state.analyzeFile);

    const res = await fetch(`${API_BASE}/analyze-resume`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Couldn't analyze that resume.");
    }

    const a = data.analysis;
    $("atsScore").textContent = a.ats_score;
    setScoreRing("atsScoreRing", a.ats_score);
    $("atsReason").textContent = a.ats_reasoning;
    renderChips("technicalSkills", a.technical_skills);
    renderChips("softSkills", a.soft_skills);
    renderList("strengthsList", a.strengths);
    renderList("suggestionsList", a.improvement_suggestions);
    $("analyzeCachedBadge").hidden = !data.cached;

    $("analyzeResults").hidden = false;

    state.lastAnalyzeSummary = { filename: data.resume.filename, score: a.ats_score };
    renderDashboard();
    showToast(`Resume analyzed — ATS score ${a.ats_score}.`);
  } catch (err) {
    showError("analyzeError", err.message || "Couldn't reach the analysis service. Check that the backend is running, then try again.");
  } finally {
    $("analyzeLoading").hidden = true;
    $("analyzeBtn").disabled = false;
  }
}

/* ===================== Job finder ===================== */

function wireFinder() {
  $("finderForm").addEventListener("submit", (e) => {
    e.preventDefault();
    searchJobs();
  });
}

async function searchJobs() {
  hideError("finderError");
  $("finderNotice").hidden = true;
  $("finderInitialState").hidden = true;
  $("finderEmptyState").hidden = true;
  $("finderLoading").hidden = false;
  $("jobList").innerHTML = "";

  const keyword = $("finderKeyword").value.trim();
  const location = $("finderLocation").value.trim();
  const remoteOnly = $("finderRemote").checked;

  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (location) params.set("location", location);
  if (remoteOnly) params.set("remote_only", "true");

  try {
    const res = await fetch(`${API_BASE}/jobs/search?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Couldn't search jobs right now.");
    }

    if (data.notice) {
      $("finderNotice").textContent = data.notice;
      $("finderNotice").hidden = false;
    }

    renderJobList(data.results);
  } catch (err) {
    showError("finderError", err.message || "Couldn't reach the job search service. Check that the backend is running, then try again.");
  } finally {
    $("finderLoading").hidden = true;
  }
}

function renderJobList(jobs) {
  const list = $("jobList");
  list.innerHTML = "";

  if (!jobs || jobs.length === 0) {
    $("finderEmptyState").hidden = false;
    return;
  }

  jobs.forEach((job) => {
    const card = document.createElement("div");
    card.className = "job-card";

    const metaParts = [job.location || "Location not listed"];
    if (job.remote) metaParts.push("Remote");
    if (job.posted_at) metaParts.push(`Posted ${job.posted_at}`);
    metaParts.push(job.source === "jooble" ? "via Jooble" : "via Arbeitnow");

    const tagsHtml = (job.tags || [])
      .slice(0, 6)
      .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
      .join("");

    card.innerHTML = `
      <div class="job-card-top">
        <div>
          <p class="job-title">${escapeHtml(job.title)}</p>
          <p class="job-company">${escapeHtml(job.company)}</p>
        </div>
        <p class="job-meta">${escapeHtml(metaParts.join(" · "))}</p>
      </div>
      <p class="job-snippet">${escapeHtml(job.snippet)}</p>
      <div class="chips">${tagsHtml}</div>
      <div class="job-card-actions">
        <button type="button" class="btn-primary" data-check-match>Check match</button>
        <button type="button" class="btn-link" data-track>Track application</button>
        <a href="${job.url}" target="_blank" rel="noopener noreferrer">View posting</a>
      </div>
    `;

    card.querySelector("[data-check-match]").addEventListener("click", () => sendToMatcher(job));
    card.querySelector("[data-track]").addEventListener("click", () => trackJobFromFinder(job));
    list.appendChild(card);
  });
}

async function trackJobFromFinder(job) {
  const payload = {
    company: job.company,
    role: job.title,
    status: "applied",
    date_applied: new Date().toISOString().slice(0, 10),
    job_url: job.url,
    source: "job_finder",
  };

  try {
    const res = await fetch(`${API_BASE}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Couldn't add that application.");

    await loadApplications();
    showToast(`Tracking ${job.company} — ${job.title}.`);
    switchSection("tracker");
  } catch (err) {
    showToast(err.message || "Couldn't add that application to your tracker.", "error");
  }
}

function sendToMatcher(job) {
  $("jobDescription").value = job.description;
  updateMatchButtonState();
  switchSection("match");

  if (!state.matchFile) {
    showError("matchError", "Job description loaded — now choose a resume above to check your fit.");
  } else {
    hideError("matchError");
  }
}

/* ===================== Job match ===================== */

function wireMatch() {
  const fileInput = $("matchFile");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    state.matchFile = file || null;
    $("matchFileName").textContent = file ? file.name : "Choose a resume — PDF or DOCX";
    updateMatchButtonState();
  });

  $("jobDescription").addEventListener("input", updateMatchButtonState);
  $("matchBtn").addEventListener("click", matchJob);
}

function updateMatchButtonState() {
  const hasFile = !!state.matchFile;
  const hasJD = $("jobDescription").value.trim().length > 0;
  $("matchBtn").disabled = !(hasFile && hasJD);
}

async function matchJob() {
  if (!state.matchFile) return;

  hideError("matchError");
  $("matchResults").hidden = true;
  $("matchLoading").hidden = false;
  $("matchBtn").disabled = true;

  try {
    const formData = new FormData();
    formData.append("file", state.matchFile);
    formData.append("job_description", $("jobDescription").value.trim());

    const res = await fetch(`${API_BASE}/match-job`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Couldn't compare that resume against the posting.");
    }

    const m = data.match;
    $("matchScore").textContent = m.match_score;
    setScoreRing("matchScoreRing", m.match_score);
    $("matchReason").textContent = m.match_reasoning;
    renderChips("matchedSkills", m.matched_skills);
    renderChips("missingSkills", m.missing_skills);
    renderChips("missingKeywords", m.missing_keywords);
    renderList("tailoringList", m.tailoring_suggestions);
    $("matchCachedBadge").hidden = !data.cached;

    $("matchResults").hidden = false;

    state.lastMatchSummary = { score: m.match_score };
    renderDashboard();
    showToast(`Match checked — score ${m.match_score}.`);
  } catch (err) {
    showError("matchError", err.message || "Couldn't reach the matching service. Check that the backend is running, then try again.");
  } finally {
    $("matchLoading").hidden = true;
    updateMatchButtonState();
  }
}

/* ===================== Applications tracker ===================== */

const SOURCE_LABELS = {
  job_finder: "Job finder",
  linkedin: "LinkedIn",
  referral: "Referral",
  company_site: "Company site",
  other: "Other",
};

function wireTracker() {
  $("appForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("trackerError");

    const payload = {
      company: $("companyInput").value.trim(),
      role: $("roleInput").value.trim(),
      status: "applied",
      date_applied: $("dateInput").value || null,
      notes: $("notesInput").value.trim() || null,
      job_url: $("jobUrlInput").value.trim() || null,
      salary: $("salaryInput").value.trim() || null,
      source: $("sourceInput").value || null,
      priority: $("priorityInput").checked,
    };

    try {
      const res = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Couldn't add that application.");
      }

      $("appForm").reset();
      await loadApplications();
      showToast(`Added ${payload.company}.`);
    } catch (err) {
      showError("trackerError", err.message || "Couldn't reach the tracker. Check that the backend is running, then try again.");
    }
  });

  $("trackerSearch").addEventListener("input", (e) => {
    state.trackerSearchTerm = e.target.value.trim().toLowerCase();
    renderBoard();
  });

  $("trackerStatusFilter").addEventListener("change", (e) => {
    state.trackerStatusFilter = e.target.value;
    renderBoard();
  });

  $("trackerSort").addEventListener("change", (e) => {
    state.trackerSortBy = e.target.value;
    renderBoard();
  });

  $("exportCsvBtn").addEventListener("click", exportApplicationsToCsv);
}

async function loadApplications() {
  hideError("trackerError");
  try {
    const res = await fetch(`${API_BASE}/applications`, { headers: authHeaders() });
    if (res.status === 401) {
      signOut();
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Couldn't load applications.");

    state.applications = data;
    renderBoard();
    renderDashboard();
  } catch (err) {
    showError("trackerError", err.message || "Couldn't reach the tracker. Check that the backend is running, then try again.");
  }
}

function sortApplications(list, sortBy) {
  const copy = [...list];
  switch (sortBy) {
    case "oldest":
      return copy.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    case "company":
      return copy.sort((a, b) => a.company.localeCompare(b.company));
    case "updated":
      return copy.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    case "priority":
      return copy.sort((a, b) => (b.priority === true) - (a.priority === true));
    case "newest":
    default:
      return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

function daysSinceApplied(dateStr) {
  if (!dateStr) return null;
  const applied = new Date(`${dateStr}T00:00:00`);
  if (isNaN(applied)) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((startOfToday - applied) / (1000 * 60 * 60 * 24));
}

function renderDaysBadge(dateStr) {
  const days = daysSinceApplied(dateStr);
  if (days === null || days < 0) return "";
  let cls = "fresh";
  if (days > 21) cls = "stale";
  else if (days > 7) cls = "aging";
  const label = days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return `<span class="days-badge ${cls}">${label}</span>`;
}

function renderBoard() {
  const statuses = ["applied", "interview", "offer", "rejected"];
  statuses.forEach((s) => ($(`col-${s}`).innerHTML = ""));

  const hasAny = state.applications.length > 0;
  $("trackerToolbar").hidden = !hasAny;

  if (!hasAny) {
    $("board").hidden = true;
    $("emptyState").hidden = false;
    $("filterEmptyState").hidden = true;
    return;
  }

  $("emptyState").hidden = true;

  const term = state.trackerSearchTerm;
  let filtered = term
    ? state.applications.filter(
        (a) => a.company.toLowerCase().includes(term) || a.role.toLowerCase().includes(term)
      )
    : state.applications;

  if (state.trackerStatusFilter) {
    filtered = filtered.filter((a) => a.status === state.trackerStatusFilter);
  }

  filtered = sortApplications(filtered, state.trackerSortBy);

  const visibleStatuses = state.trackerStatusFilter ? [state.trackerStatusFilter] : statuses;
  statuses.forEach((s) => {
    document.querySelector(`.board-col[data-status="${s}"]`).hidden = !visibleStatuses.includes(s);
  });

  if (filtered.length === 0) {
    $("board").hidden = true;
    $("filterEmptyState").hidden = false;
    return;
  }

  $("board").hidden = false;
  $("filterEmptyState").hidden = true;

  statuses.forEach((s) => {
    $(`count-${s}`).textContent = filtered.filter((a) => a.status === s).length;
  });

  filtered.forEach((app) => {
    const card = document.createElement("div");
    card.className = app.priority ? "app-card is-priority" : "app-card";
    card.draggable = true;

    const dateLine = app.date_applied ? `Applied ${app.date_applied}` : "No date recorded";
    const notesLine = app.notes ? `<p class="notes">${escapeHtml(app.notes)}</p>` : "";
    const salaryLine = app.salary ? `<p class="salary">${escapeHtml(app.salary)}</p>` : "";
    const sourceChip = app.source
      ? `<span class="chip source-chip">${escapeHtml(SOURCE_LABELS[app.source] || app.source)}</span>`
      : "";
    const jobLink = app.job_url
      ? `<a href="${app.job_url}" target="_blank" rel="noopener noreferrer" class="job-link" data-job-link>View posting ↗</a>`
      : "";

    card.innerHTML = `
      <div class="app-card-top">
        <div class="app-card-top-left">
          <button type="button" class="star-btn ${app.priority ? "is-starred" : ""}" data-star="${app.id}" aria-label="${app.priority ? "Unstar" : "Star"} ${escapeHtml(app.company)}" title="${app.priority ? "Remove priority" : "Mark as priority"}">${app.priority ? "★" : "☆"}</button>
          <p class="company">${escapeHtml(app.company)}</p>
        </div>
        ${renderDaysBadge(app.date_applied)}
      </div>
      <p class="role">${escapeHtml(app.role)}</p>
      <p class="date">${escapeHtml(dateLine)}</p>
      ${salaryLine}
      ${sourceChip}
      ${jobLink}
      ${notesLine}
      <div class="app-card-controls">
        <select data-id="${app.id}" aria-label="Change status for ${escapeHtml(app.company)}">
          ${statuses.map((s) => `<option value="${s}" ${s === app.status ? "selected" : ""}>${capitalize(s)}</option>`).join("")}
        </select>
        <button type="button" class="btn-link" data-remove="${app.id}">Remove</button>
      </div>
    `;

    card.querySelector("select").addEventListener("click", (e) => e.stopPropagation());
    card.querySelector("select").addEventListener("change", (e) => {
      e.stopPropagation();
      updateApplicationStatus(app.id, e.target.value);
    });
    card.querySelector("[data-remove]").addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeleteApplication(app.id, app.company);
    });
    card.querySelector("[data-star]").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleApplicationPriority(app.id, !app.priority);
    });
    const link = card.querySelector("[data-job-link]");
    if (link) link.addEventListener("click", (e) => e.stopPropagation());
    card.addEventListener("click", () => openEditModal(app));

    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer.setData("text/plain", app.id);
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));

    $(`col-${app.status}`).appendChild(card);
  });
}

function wireDragAndDrop() {
  document.querySelectorAll(".board-col").forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const newStatus = col.dataset.status;
      const app = state.applications.find((a) => a.id === id);
      if (app && app.status !== newStatus) {
        updateApplicationStatus(id, newStatus);
      }
    });
  });
}

function exportApplicationsToCsv() {
  const headers = ["Company", "Role", "Status", "Priority", "Date applied", "Salary", "Source", "Job URL", "Notes"];
  const rows = state.applications.map((a) => [
    a.company,
    a.role,
    capitalize(a.status),
    a.priority ? "Yes" : "No",
    a.date_applied || "",
    a.salary || "",
    a.source ? SOURCE_LABELS[a.source] || a.source : "",
    a.job_url || "",
    (a.notes || "").replace(/\r?\n/g, " "),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast("Exported applications to CSV.");
}

async function updateApplication(id, payload, successMessage) {
  hideError("trackerError");
  try {
    const res = await fetch(`${API_BASE}/applications/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Couldn't update that application.");
    }
    await loadApplications();
    if (successMessage) showToast(successMessage);
  } catch (err) {
    showError("trackerError", err.message || "Couldn't reach the tracker. Check that the backend is running, then try again.");
  }
}

function updateApplicationStatus(id, newStatus) {
  return updateApplication(id, { status: newStatus }, `Moved to ${capitalize(newStatus)}.`);
}

function toggleApplicationPriority(id, newPriority) {
  return updateApplication(id, { priority: newPriority }, newPriority ? "Marked as priority." : "Priority removed.");
}

function openEditModal(app) {
  const bodyHtml = `
    <div class="field">
      <label for="editCompany">Company</label>
      <input type="text" id="editCompany" value="${escapeHtml(app.company)}" />
    </div>
    <div class="field">
      <label for="editRole">Role</label>
      <input type="text" id="editRole" value="${escapeHtml(app.role)}" />
    </div>
    <div class="field">
      <label for="editDate">Date applied</label>
      <input type="date" id="editDate" value="${app.date_applied || ""}" />
    </div>
    <div class="field">
      <label for="editJobUrl">Job posting link</label>
      <input type="url" id="editJobUrl" value="${escapeHtml(app.job_url || "")}" placeholder="https://..." />
    </div>
    <div class="field">
      <label for="editSalary">Salary</label>
      <input type="text" id="editSalary" value="${escapeHtml(app.salary || "")}" placeholder="e.g. PKR 150,000/month" />
    </div>
    <div class="field">
      <label for="editSource">Source</label>
      <select id="editSource">
        <option value="" ${!app.source ? "selected" : ""}>Not specified</option>
        ${Object.entries(SOURCE_LABELS)
          .map(([val, label]) => `<option value="${val}" ${app.source === val ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
    </div>
    <div class="field">
      <label for="editNotes">Notes</label>
      <textarea id="editNotes" rows="3">${escapeHtml(app.notes || "")}</textarea>
    </div>
    <div class="field priority-field">
      <label for="editPriority">
        <input type="checkbox" id="editPriority" ${app.priority ? "checked" : ""} />
        Priority — star this one
      </label>
    </div>
  `;

  openModal(
    "Edit application",
    bodyHtml,
    `<button type="button" class="btn-link" id="modalCancelBtn">Cancel</button>
     <button type="button" class="btn-primary" id="modalSaveBtn">Save changes</button>`
  );

  $("modalCancelBtn").addEventListener("click", closeModal);
  $("modalSaveBtn").addEventListener("click", async () => {
    const payload = {
      company: $("editCompany").value.trim(),
      role: $("editRole").value.trim(),
      date_applied: $("editDate").value || null,
      job_url: $("editJobUrl").value.trim() || null,
      salary: $("editSalary").value.trim() || null,
      source: $("editSource").value || null,
      notes: $("editNotes").value.trim() || null,
      priority: $("editPriority").checked,
    };
    closeModal();
    await updateApplication(app.id, payload, "Application updated.");
  });
}

function confirmDeleteApplication(id, company) {
  openModal(
    "Remove application?",
    `<p>This will permanently remove your ${escapeHtml(company)} application. This can't be undone.</p>`,
    `<button type="button" class="btn-link" id="modalCancelBtn">Cancel</button>
     <button type="button" class="btn-primary btn-danger" id="modalConfirmBtn">Remove</button>`
  );

  $("modalCancelBtn").addEventListener("click", closeModal);
  $("modalConfirmBtn").addEventListener("click", async () => {
    closeModal();
    await removeApplication(id, company);
  });
}

async function removeApplication(id, company) {
  hideError("trackerError");
  try {
    const res = await fetch(`${API_BASE}/applications/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok && res.status !== 204) {
      const data = await res.json();
      throw new Error(data.detail || "Couldn't remove that application.");
    }
    await loadApplications();
    showToast(`Removed ${company || "application"}.`, "error");
  } catch (err) {
    showError("trackerError", err.message || "Couldn't reach the tracker. Check that the backend is running, then try again.");
  }
}

/* ===================== Utils ===================== */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ===================== Go ===================== */

init();