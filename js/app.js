// js/app.js
import {
  auth,
  db,
  googleProvider,
  SUPER_ADMIN_EMAILS,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "./firebase-config.js";

import {
  evaluateCCRASAgni,
  evaluateKoshtha,
  generateSamsarjanaSchedule,
  compressImageToBase64
} from "./ccras-tools.js";

import { runAyurParamSynthesis } from "./ayurparam-ai.js";

// Global App State
let currentUser = null;
let isAdmin = false;
let allCases = [];
let activeCaseId = null;
let activeCaseData = {};
let currentFilter = "ALL";
let selectedScholarFilter = null;
let geminiApiKey = "";
let unsubscribeCases = null;

// DOM Elements Cache
const authScreen = document.getElementById("auth-screen");
const appShell = document.getElementById("app-shell");
const viewDashboard = document.getElementById("view-dashboard");
const viewCaseEditor = document.getElementById("view-case-editor");

// ==================== 1. AUTHENTICATION & ROLE INIT ====================
document.getElementById("btn-google-login").addEventListener("click", async () => {
  const errEl = document.getElementById("auth-status-msg");
  errEl.classList.add("hidden");
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    errEl.textContent = `Login Error: ${err.message}`;
    errEl.classList.remove("hidden");
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

document.getElementById("btn-theme-toggle").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    if (unsubscribeCases) unsubscribeCases();
    authScreen.classList.remove("hidden");
    appShell.classList.add("hidden");
    return;
  }

  currentUser = user;
  const email = (user.email || "").toLowerCase().trim();
  isAdmin = SUPER_ADMIN_EMAILS.includes(email);

  // Update Header UI
  document.getElementById("user-name-display").textContent = user.displayName || "Scholar";
  document.getElementById("user-email-display").textContent = user.email;
  document.getElementById("user-avatar").src =
    user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "U")}&background=059669&color=fff`;

  const roleBadge = document.getElementById("role-badge");
  const adminSettingsBtn = document.getElementById("btn-admin-settings");
  const adminScholarsPanel = document.getElementById("admin-scholars-panel");

  if (isAdmin) {
    roleBadge.textContent = "MAIN DOCTOR / ADMIN";
    roleBadge.className = "px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/40";
    adminSettingsBtn.classList.remove("hidden");
    adminScholarsPanel.classList.remove("hidden");
  } else {
    roleBadge.textContent = "OPD/IPD SCHOLAR";
    roleBadge.className = "px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    adminSettingsBtn.classList.add("hidden");
    adminScholarsPanel.classList.add("hidden");
  }

  // Register Scholar Profile in Firestore
  await setDoc(
    doc(db, "scholars", user.uid),
    {
      uid: user.uid,
      name: user.displayName || "Scholar",
      email: user.email,
      role: isAdmin ? "admin" : "scholar",
      lastActive: serverTimestamp()
    },
    { merge: true }
  );

  // Load Gemini API Key from system_config
  await loadSystemConfig();

  // Start Real-time Cases Listener
  subscribeToCases();

  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
});

async function loadSystemConfig() {
  try {
    const snap = await getDoc(doc(db, "system_config", "ai_settings"));
    if (snap.exists()) {
      geminiApiKey = snap.data().geminiApiKey || "";
      document.getElementById("admin-gemini-key-input").value = geminiApiKey;
    }
  } catch (e) {
    console.warn("Config read warning:", e);
  }
}

// Super Admin Modal Controls
document.getElementById("btn-admin-settings").addEventListener("click", () => {
  document.getElementById("admin-config-modal").classList.remove("hidden");
});
document.getElementById("btn-close-admin-modal").addEventListener("click", () => {
  document.getElementById("admin-config-modal").classList.add("hidden");
});
document.getElementById("btn-save-admin-config").addEventListener("click", async () => {
  const keyVal = document.getElementById("admin-gemini-key-input").value.trim();
  await setDoc(doc(db, "system_config", "ai_settings"), {
    geminiApiKey: keyVal,
    updatedBy: currentUser.email,
    updatedAt: serverTimestamp()
  });
  geminiApiKey = keyVal;
  document.getElementById("admin-config-modal").classList.add("hidden");
  alert("✅ AyurParam AI Config सुरक्षित रूप से सेव हो गई!");
});

// ==================== 2. FIRESTORE REAL-TIME CASES SYNC ====================
function subscribeToCases() {
  if (unsubscribeCases) unsubscribeCases();
  const q = query(collection(db, "panchakarma_cases"), orderBy("updatedAt", "desc"));

  unsubscribeCases = onSnapshot(q, (snapshot) => {
    const rawList = [];
    snapshot.forEach((docSnap) => {
      rawList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Admin sees all cases; Scholars see their own cases
    allCases = isAdmin ? rawList : rawList.filter((c) => c.scholarUid === currentUser.uid);

    updateDashboardKPIs();
    if (isAdmin) renderAdminScholarsMonitor();
    renderPatientGrid();
  });
}

function updateDashboardKPIs() {
  document.getElementById("stat-total-cases").textContent = allCases.length;
  document.getElementById("stat-live-cases").textContent = allCases.filter((c) => c.overallStatus === "LIVE").length;
  document.getElementById("stat-opd-cases").textContent = allCases.filter((c) => c.overallStatus === "OPD").length;
  document.getElementById("stat-completed-cases").textContent = allCases.filter((c) => c.overallStatus === "COMPLETED").length;
}

function renderAdminScholarsMonitor() {
  const container = document.getElementById("scholars-chip-list");
  const scholarMap = {};

  allCases.forEach((c) => {
    const uid = c.scholarUid || "unknown";
    if (!scholarMap[uid]) {
      scholarMap[uid] = {
        uid,
        name: c.scholarName || c.scholarEmail || "Scholar",
        total: 0,
        live: 0
      };
    }
    scholarMap[uid].total += 1;
    if (c.overallStatus === "LIVE") scholarMap[uid].live += 1;
  });

  const scholars = Object.values(scholarMap);
  if (!scholars.length) {
    container.innerHTML = `<span class="text-xs text-slate-400">अभी तक किसी स्टूडेंट ने केस दर्ज नहीं किया है।</span>`;
    return;
  }

  container.innerHTML = scholars
    .map((s) => {
      const activeRing = selectedScholarFilter === s.uid ? "ring-2 ring-amber-400 bg-amber-500/20" : "bg-slate-800/90 hover:bg-slate-800";
      return `
        <button data-scholar-uid="${s.uid}" class="scholar-filter-chip px-3 py-1.5 rounded-xl border border-slate-700 text-xs flex items-center gap-2 transition ${activeRing}">
          <span class="font-bold text-slate-100">${s.name}</span>
          <span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">Total: ${s.total}</span>
          ${s.live > 0 ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold">🟢 ${s.live} LIVE</span>` : ""}
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".scholar-filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-scholar-uid");
      selectedScholarFilter = selectedScholarFilter === uid ? null : uid;
      renderAdminScholarsMonitor();
      renderPatientGrid();
    });
  });
}

document.getElementById("btn-reset-scholar-filter").addEventListener("click", () => {
  selectedScholarFilter = null;
  renderAdminScholarsMonitor();
  renderPatientGrid();
});

// Filters & Search
document.querySelectorAll(".case-filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".case-filter-btn").forEach((b) => {
      b.className = "case-filter-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700";
    });
    btn.className = "case-filter-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white";
    currentFilter = btn.getAttribute("data-filter");
    renderPatientGrid();
  });
});

document.getElementById("search-patient-input").addEventListener("input", renderPatientGrid);

function renderPatientGrid() {
  const grid = document.getElementById("patient-cards-grid");
  const searchTerm = document.getElementById("search-patient-input").value.toLowerCase().trim();

  const filtered = allCases.filter((c) => {
    if (selectedScholarFilter && c.scholarUid !== selectedScholarFilter) return false;
    if (currentFilter !== "ALL" && c.overallStatus !== currentFilter) return false;
    if (searchTerm) {
      const hay = `${c.name} ${c.regNo} ${c.diagnosis} ${c.scholarName}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="col-span-full p-10 text-center rounded-2xl border border-dashed border-slate-700 text-slate-400 text-xs">
        कोई पेशेंट रिकॉर्ड नहीं मिला। ऊपर <strong>"+ नया OPD केस"</strong> पर क्लिक करके शुरुआत करें।
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((c) => {
      const statusBadge =
        c.overallStatus === "LIVE"
          ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot"></span> LIVE IPD</span>`
          : c.overallStatus === "COMPLETED"
          ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-400">✅ COMPLETED</span>`
          : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-400">🟡 OPD / पूर्वकर्म</span>`;

      const activeProcs = [];
      if (c.rukshanaStatus === "LIVE") activeProcs.push("रूक्षण");
      if (c.snehapanaStatus === "LIVE") activeProcs.push("स्नेहपान");
      if (c.swedanaStatus === "LIVE") activeProcs.push("स्वेदन");
      if (c.vamanaStatus === "LIVE") activeProcs.push("वमन");
      if (c.virechanaStatus === "LIVE") activeProcs.push("विरेचन");
      if (c.bastiStatus === "LIVE") activeProcs.push("बस्ति");
      if (c.nasyaStatus === "LIVE") activeProcs.push("नस्य");
      if (c.raktaStatus === "LIVE") activeProcs.push("रक्तमोक्षण");
      if (c.upakarmaStatus === "LIVE") activeProcs.push("उपकर्म");

      return `
        <div data-open-case="${c.id}" class="open-case-card cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition shadow-sm space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-[11px] text-slate-400 font-semibold">${c.regNo || "OPD-NEW"} • ${c.ageSex || ""}</div>
              <h3 class="text-base font-extrabold mt-0.5">${c.name || "Unnamed Patient"}</h3>
            </div>
            ${statusBadge}
          </div>

          <div class="text-xs font-semibold text-emerald-400">${c.diagnosis || "व्याधि विनिश्चय अपूर्ण"}</div>
          <p class="text-xs text-slate-400 line-clamp-2">${c.complaints || ""}</p>

          ${
            activeProcs.length
              ? `<div class="flex flex-wrap gap-1.5 pt-1">${activeProcs
                  .map((p) => `<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">Running: ${p}</span>`)
                  .join("")}</div>`
              : ""
          }

          <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span><i class="fa-solid fa-user-graduate mr-1 text-amber-400"></i> ${c.scholarName || "Scholar"}</span>
            <span class="text-emerald-400 font-bold">खोलें →</span>
          </div>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll(".open-case-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-open-case");
      const found = allCases.find((item) => item.id === id);
      if (found) openCaseEditor(found);
    });
  });
}

// ==================== 3. CASE WORKSPACE & FORM BINDINGS ====================
document.getElementById("btn-new-patient").addEventListener("click", () => {
  const newId = `case_${Date.now()}`;
  openCaseEditor({
    id: newId,
    scholarUid: currentUser.uid,
    scholarName: currentUser.displayName || "Scholar",
    scholarEmail: currentUser.email,
    overallStatus: "OPD",
    snehapanaDays: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, dose: "", time: "", jeerna: "", notes: "" }))
  });
});

document.getElementById("btn-back-dashboard").addEventListener("click", () => {
  viewCaseEditor.classList.add("hidden");
  viewDashboard.classList.remove("hidden");
});

// Workspace Tab Switching
document.querySelectorAll(".workspace-tab").forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    document.querySelectorAll(".workspace-tab").forEach((b) => {
      if (b.getAttribute("data-tab") !== "tab-ayurparam") {
        b.className = "workspace-tab px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0";
      }
    });
    if (tabBtn.getAttribute("data-tab") !== "tab-ayurparam") {
      tabBtn.className = "workspace-tab px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white shrink-0";
    }

    const targetId = tabBtn.getAttribute("data-tab");
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
    document.getElementById(targetId).classList.remove("hidden");
  });
});

// Tap-Tap Chips Interaction Setup
function initTapChips() {
  document.querySelectorAll("[data-single-group]").forEach((group) => {
    group.querySelectorAll(".tap-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        group.querySelectorAll(".tap-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
      });
    });
  });

  ["lifestyle-chips", "rukshana-lakshana-chips", "samyak-snigdha-chips", "upakarma-chips"].forEach((id) => {
    const container = document.getElementById(id);
    if (!container) return;
    container.querySelectorAll(".tap-chip").forEach((chip) => {
      chip.addEventListener("click", () => chip.classList.toggle("active"));
    });
  });

  document.querySelectorAll("[data-multi-group] .tap-chip").forEach((chip) => {
    chip.addEventListener("click", () => chip.classList.toggle("active"));
  });
}
initTapChips();

// CCRAS Agni & Koshtha Live Calculation
function updateCCRASOutputs() {
  const agniRes = evaluateCCRASAgni(
    document.getElementById("agni-q1").value,
    document.getElementById("agni-q2").value,
    document.getElementById("agni-q3").value
  );
  const agniBadge = document.getElementById("ccras-agni-badge");
  agniBadge.textContent = agniRes.label;
  agniBadge.className = `px-3 py-1 rounded-full text-xs font-extrabold ${agniRes.badgeClass}`;
  document.getElementById("agni-clinical-advice").textContent = agniRes.advice;

  const koshthaRes = evaluateKoshtha(
    document.getElementById("koshtha-q1").value,
    document.getElementById("koshtha-q2").value
  );
  document.getElementById("ccras-koshtha-badge").textContent = koshthaRes.label;
  document.getElementById("koshtha-snehapana-guide").textContent = koshthaRes.advice;
}

document.querySelectorAll(".ccras-agni-input, .ccras-koshtha-input").forEach((el) => {
  el.addEventListener("change", updateCCRASOutputs);
});

// Samsarjana Krama Live Update
document.getElementById("samsarjana-shuddhi").addEventListener("change", (e) => {
  document.getElementById("samsarjana-schedule-box").innerHTML = generateSamsarjanaSchedule(e.target.value);
});

// Prescription Photo Compression & Preview
document.getElementById("rx-image-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const compressedBase64 = await compressImageToBase64(file);
    activeCaseData.rxImageBase64 = compressedBase64;
    document.getElementById("rx-preview-img").src = compressedBase64;
    document.getElementById("rx-preview-box").classList.remove("hidden");
  } catch (err) {
    alert("फोटो प्रोसेस करने में त्रुटि: " + err.message);
  }
});

document.getElementById("btn-remove-rx").addEventListener("click", () => {
  activeCaseData.rxImageBase64 = "";
  document.getElementById("rx-preview-box").classList.add("hidden");
});

function renderSnehapanaTable(daysArray = []) {
  const tbody = document.getElementById("snehapana-days-tbody");
  const rows = Array.from({ length: 7 }, (_, i) => daysArray[i] || { day: i + 1, dose: "", time: "", jeerna: "", notes: "" });

  tbody.innerHTML = rows
    .map(
      (r, idx) => `
      <tr>
        <td class="py-2 px-2 font-bold text-emerald-400">Day ${idx + 1}</td>
        <td class="py-2 px-2"><input data-sneha-idx="${idx}" data-field="dose" type="text" value="${r.dose || ""}" placeholder="${(idx + 1) * 30} ml" class="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700" /></td>
        <td class="py-2 px-2"><input data-sneha-idx="${idx}" data-field="time" type="text" value="${r.time || ""}" placeholder="07:00 AM" class="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700" /></td>
        <td class="py-2 px-2"><input data-sneha-idx="${idx}" data-field="jeerna" type="text" value="${r.jeerna || ""}" placeholder="5 Hrs" class="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700" /></td>
        <td class="py-2 px-2"><input data-sneha-idx="${idx}" data-field="notes" type="text" value="${r.notes || ""}" placeholder="क्षुधा, उद्गार, मल प्रवृत्ति..." class="w-full min-w-[180px] px-2 py-1 rounded bg-slate-800 border border-slate-700" /></td>
      </tr>
    `
    )
    .join("");
}

function openCaseEditor(data) {
  activeCaseId = data.id;
  activeCaseData = { ...data };

  document.getElementById("editor-patient-title").textContent = data.name || "नया OPD / IPD पेशेंट";
  document.getElementById("editor-handler-meta").textContent = `Handled by: ${data.scholarName || currentUser.displayName} (${data.scholarEmail || currentUser.email})`;
  document.getElementById("case-overall-status").value = data.overallStatus || "OPD";

  // Populate Tab 1
  document.getElementById("pt-name").value = data.name || "";
  document.getElementById("pt-age-sex").value = data.ageSex || "";
  document.getElementById("pt-reg-no").value = data.regNo || "";
  document.getElementById("pt-diagnosis").value = data.diagnosis || "";
  document.getElementById("pt-complaints").value = data.complaints || "";
  document.getElementById("pt-history-notes").value = data.historyNotes || "";

  const adminRemarkInput = document.getElementById("admin-consultant-remark");
  adminRemarkInput.value = data.consultantRemark || "";
  adminRemarkInput.disabled = !isAdmin;

  if (data.rxImageBase64) {
    document.getElementById("rx-preview-img").src = data.rxImageBase64;
    document.getElementById("rx-preview-box").classList.remove("hidden");
  } else {
    document.getElementById("rx-preview-box").classList.add("hidden");
  }

  // Restore Chip Selections
  setMultiChips("lifestyle-chips", data.lifestyle || []);
  setSingleChip("jihva", data.jihva || "");
  setSingleChip("mala", data.mala || "");
  setSingleChip("nadi", data.nadi || "");
  setMultiGroupChips("ashtavidha_other", data.ashtavidhaOther || []);

  // Populate CCRAS
  document.getElementById("agni-q1").value = data.agniQ1 || "sama";
  document.getElementById("agni-q2").value = data.agniQ2 || "sama";
  document.getElementById("agni-q3").value = data.agniQ3 || "nirama";
  document.getElementById("koshtha-q1").value = data.koshthaQ1 || "madhyama";
  document.getElementById("koshtha-q2").value = data.koshthaQ2 || "madhyama";
  updateCCRASOutputs();

  // Populate Purvakarma
  document.getElementById("rukshana-status").value = data.rukshanaStatus || "NOT_NEEDED";
  document.getElementById("rukshana-indication").value = data.rukshanaIndication || "";
  document.getElementById("rukshana-drug").value = data.rukshanaDrug || "";
  setMultiChips("rukshana-lakshana-chips", data.rukshanaLakshana || []);

  document.getElementById("snehapana-drug").value = data.snehapanaDrug || "";
  document.getElementById("snehapana-status").value = data.snehapanaStatus || "PLANNED";
  renderSnehapanaTable(data.snehapanaDays || []);
  setMultiChips("samyak-snigdha-chips", data.samyakSnigdha || []);

  document.getElementById("swedana-status").value = data.swedanaStatus || "PLANNED";
  document.getElementById("swedana-type").value = data.swedanaType || "";
  document.getElementById("swedana-days").value = data.swedanaDays || "";
  document.getElementById("swedana-notes").value = data.swedanaNotes || "";

  // Populate Pradhan Karma
  document.getElementById("vamana-status").value = data.vamanaStatus || "NOT_PLANNED";
  document.getElementById("vamana-date").value = data.vamanaDate || "";
  document.getElementById("vamana-drug").value = data.vamanaDrug || "";
  document.getElementById("vamana-vegas").value = data.vamanaVegas || "";
  document.getElementById("vamana-antiki").value = data.vamanaAntiki || "पित्तान्त (सम्यक्)";
  document.getElementById("vamana-notes").value = data.vamanaNotes || "";

  document.getElementById("virechana-status").value = data.virechanaStatus || "NOT_PLANNED";
  document.getElementById("virechana-date").value = data.virechanaDate || "";
  document.getElementById("virechana-drug").value = data.virechanaDrug || "";
  document.getElementById("virechana-vegas").value = data.virechanaVegas || "";
  document.getElementById("virechana-antiki").value = data.virechanaAntiki || "कफान्त (सम्यक्)";
  document.getElementById("virechana-notes").value = data.virechanaNotes || "";

  document.getElementById("samsarjana-shuddhi").value = data.samsarjanaShuddhi || "NONE";
  document.getElementById("samsarjana-schedule-box").innerHTML = generateSamsarjanaSchedule(data.samsarjanaShuddhi || "NONE");
  document.getElementById("samsarjana-followup-notes").value = data.samsarjanaFollowupNotes || "";

  // Populate Basti, Nasya, Raktamokshana, Upakarma
  document.getElementById("basti-status").value = data.bastiStatus || "NOT_PLANNED";
  document.getElementById("basti-type").value = data.bastiType || "योग बस्ति (8 दिन)";
  document.getElementById("basti-progress").value = data.bastiProgress || "";
  document.getElementById("basti-niruha-drug").value = data.bastiNiruhaDrug || "";
  document.getElementById("basti-anuvasana-drug").value = data.bastiAnuvasanaDrug || "";
  document.getElementById("basti-daily-log").value = data.bastiDailyLog || "";

  document.getElementById("nasya-status").value = data.nasyaStatus || "NOT_PLANNED";
  document.getElementById("nasya-type").value = data.nasyaType || "विरेचन नस्य (शिरोविरेचन)";
  document.getElementById("nasya-drug").value = data.nasyaDrug || "";
  document.getElementById("nasya-dose").value = data.nasyaDose || "";
  document.getElementById("nasya-lakshana").value = data.nasyaLakshana || "";
  document.getElementById("nasya-notes").value = data.nasyaNotes || "";

  document.getElementById("rakta-status").value = data.raktaStatus || "NOT_PLANNED";
  document.getElementById("rakta-method").value = data.raktaMethod || "जलौकावचारण (Leech Therapy)";
  document.getElementById("rakta-site").value = data.raktaSite || "";
  document.getElementById("rakta-notes").value = data.raktaNotes || "";

  document.getElementById("upakarma-status").value = data.upakarmaStatus || "NOT_PLANNED";
  setMultiChips("upakarma-chips", data.upakarmaList || []);
  document.getElementById("upakarma-notes").value = data.upakarmaNotes || "";

  if (data.lastAyurParamHtml) {
    document.getElementById("ayurparam-ai-output").innerHTML = data.lastAyurParamHtml;
  }

  viewDashboard.classList.add("hidden");
  viewCaseEditor.classList.remove("hidden");
}

// Helper Functions for Chips
function getMultiChips(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .tap-chip.active`)).map((el) => el.getAttribute("data-val"));
}
function setMultiChips(containerId, vals) {
  document.querySelectorAll(`#${containerId} .tap-chip`).forEach((el) => {
    el.classList.toggle("active", vals.includes(el.getAttribute("data-val")));
  });
}
function getSingleChip(groupName) {
  const active = document.querySelector(`[data-single-group="${groupName}"] .tap-chip.active`);
  return active ? active.getAttribute("data-val") : "";
}
function setSingleChip(groupName, val) {
  document.querySelectorAll(`[data-single-group="${groupName}"] .tap-chip`).forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-val") === val);
  });
}
function getMultiGroupChips(groupName) {
  return Array.from(document.querySelectorAll(`[data-multi-group="${groupName}"] .tap-chip.active`)).map((el) => el.getAttribute("data-val"));
}
function setMultiGroupChips(groupName, vals) {
  document.querySelectorAll(`[data-multi-group="${groupName}"] .tap-chip`).forEach((el) => {
    el.classList.toggle("active", vals.includes(el.getAttribute("data-val")));
  });
}

function collectFormPayload() {
  const snehapanaDays = Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    dose: document.querySelector(`[data-sneha-idx="${i}"][data-field="dose"]`)?.value || "",
    time: document.querySelector(`[data-sneha-idx="${i}"][data-field="time"]`)?.value || "",
    jeerna: document.querySelector(`[data-sneha-idx="${i}"][data-field="jeerna"]`)?.value || "",
    notes: document.querySelector(`[data-sneha-idx="${i}"][data-field="notes"]`)?.value || ""
  }));

  return {
    id: activeCaseId,
    scholarUid: activeCaseData.scholarUid || currentUser.uid,
    scholarName: activeCaseData.scholarName || currentUser.displayName || "Scholar",
    scholarEmail: activeCaseData.scholarEmail || currentUser.email,
    overallStatus: document.getElementById("case-overall-status").value,

    name: document.getElementById("pt-name").value.trim(),
    ageSex: document.getElementById("pt-age-sex").value.trim(),
    regNo: document.getElementById("pt-reg-no").value.trim(),
    diagnosis: document.getElementById("pt-diagnosis").value.trim(),
    complaints: document.getElementById("pt-complaints").value.trim(),
    historyNotes: document.getElementById("pt-history-notes").value.trim(),
    rxImageBase64: activeCaseData.rxImageBase64 || "",
    consultantRemark: document.getElementById("admin-consultant-remark").value.trim(),
    lifestyle: getMultiChips("lifestyle-chips"),

    jihva: getSingleChip("jihva"),
    mala: getSingleChip("mala"),
    nadi: getSingleChip("nadi"),
    ashtavidhaOther: getMultiGroupChips("ashtavidha_other"),

    agniQ1: document.getElementById("agni-q1").value,
    agniQ2: document.getElementById("agni-q2").value,
    agniQ3: document.getElementById("agni-q3").value,
    agniResult: document.getElementById("ccras-agni-badge").textContent,
    koshthaQ1: document.getElementById("koshtha-q1").value,
    koshthaQ2: document.getElementById("koshtha-q2").value,
    koshthaResult: document.getElementById("ccras-koshtha-badge").textContent,

    rukshanaStatus: document.getElementById("rukshana-status").value,
    rukshanaIndication: document.getElementById("rukshana-indication").value,
    rukshanaDrug: document.getElementById("rukshana-drug").value,
    rukshanaLakshana: getMultiChips("rukshana-lakshana-chips"),

    snehapanaDrug: document.getElementById("snehapana-drug").value,
    snehapanaStatus: document.getElementById("snehapana-status").value,
    snehapanaDays,
    samyakSnigdha: getMultiChips("samyak-snigdha-chips"),

    swedanaStatus: document.getElementById("swedana-status").value,
    swedanaType: document.getElementById("swedana-type").value,
    swedanaDays: document.getElementById("swedana-days").value,
    swedanaNotes: document.getElementById("swedana-notes").value,

    vamanaStatus: document.getElementById("vamana-status").value,
    vamanaDate: document.getElementById("vamana-date").value,
    vamanaDrug: document.getElementById("vamana-drug").value,
    vamanaVegas: document.getElementById("vamana-vegas").value,
    vamanaAntiki: document.getElementById("vamana-antiki").value,
    vamanaNotes: document.getElementById("vamana-notes").value,

    virechanaStatus: document.getElementById("virechana-status").value,
    virechanaDate: document.getElementById("virechana-date").value,
    virechanaDrug: document.getElementById("virechana-drug").value,
    virechanaVegas: document.getElementById("virechana-vegas").value,
    virechanaAntiki: document.getElementById("virechana-antiki").value,
    virechanaNotes: document.getElementById("virechana-notes").value,

    samsarjanaShuddhi: document.getElementById("samsarjana-shuddhi").value,
    samsarjanaFollowupNotes: document.getElementById("samsarjana-followup-notes").value,

    bastiStatus: document.getElementById("basti-status").value,
    bastiType: document.getElementById("basti-type").value,
    bastiProgress: document.getElementById("basti-progress").value,
    bastiNiruhaDrug: document.getElementById("basti-niruha-drug").value,
    bastiAnuvasanaDrug: document.getElementById("basti-anuvasana-drug").value,
    bastiDailyLog: document.getElementById("basti-daily-log").value,

    nasyaStatus: document.getElementById("nasya-status").value,
    nasyaType: document.getElementById("nasya-type").value,
    nasyaDrug: document.getElementById("nasya-drug").value,
    nasyaDose: document.getElementById("nasya-dose").value,
    nasyaLakshana: document.getElementById("nasya-lakshana").value,
    nasyaNotes: document.getElementById("nasya-notes").value,

    raktaStatus: document.getElementById("rakta-status").value,
    raktaMethod: document.getElementById("rakta-method").value,
    raktaSite: document.getElementById("rakta-site").value,
    raktaNotes: document.getElementById("rakta-notes").value,

    upakarmaStatus: document.getElementById("upakarma-status").value,
    upakarmaList: getMultiChips("upakarma-chips"),
    upakarmaNotes: document.getElementById("upakarma-notes").value,

    lastAyurParamHtml: activeCaseData.lastAyurParamHtml || "",
    updatedAt: serverTimestamp()
  };
}

// Save Case to Firestore
document.getElementById("btn-save-case").addEventListener("click", async () => {
  const payload = collectFormPayload();
  if (!payload.name) {
    alert("कृपया पेशेंट का नाम दर्ज करें।");
    return;
  }
  const btn = document.getElementById("btn-save-case");
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> सेव हो रहा है...`;

  try {
    await setDoc(doc(db, "panchakarma_cases", activeCaseId), payload, { merge: true });
    document.getElementById("editor-patient-title").textContent = payload.name;
    btn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> सेव हो गया!`;
    setTimeout(() => {
      btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-1"></i> सेव करें`;
    }, 1800);
  } catch (err) {
    alert("Save Error: " + err.message);
    btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up mr-1"></i> सेव करें`;
  }
});

// ==================== 4. AYURPARAM 4-SAMHITA RAG AI EXECUTION ====================
document.getElementById("btn-run-ayurparam").addEventListener("click", async () => {
  const payload = collectFormPayload();
  const customQuery = document.getElementById("ayurparam-custom-query").value.trim();
  const outputBox = document.getElementById("ayurparam-ai-output");
  const chunksContainer = document.getElementById("rag-chunks-container");
  const chunksList = document.getElementById("rag-chunks-list");

  outputBox.innerHTML = `<div class="flex items-center gap-2 text-amber-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin"></i> चरक संहिता एवं अष्टांग हृदय कॉर्पस से श्लोक निकालकर संप्राप्ति विश्लेषण हो रहा है...</div>`;

  const result = await runAyurParamSynthesis(payload, customQuery, geminiApiKey);

  if (result.chunks && result.chunks.length) {
    chunksContainer.classList.remove("hidden");
    chunksList.innerHTML = result.chunks
      .map(
        (c) => `
        <div class="p-3 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-1">
          <div class="font-bold text-amber-400">${c.samhita} • ${c.sthana} (${c.adhyaya})</div>
          <div class="text-emerald-300 font-semibold devanagari">"${c.shloka}"</div>
          <div class="text-slate-300">${c.meaning}</div>
        </div>
      `
      )
      .join("");
  }

  outputBox.innerHTML = result.htmlReport;
  activeCaseData.lastAyurParamHtml = result.htmlReport;
});

// ==================== 5. A4 PRINTABLE CASE DOSSIER ====================
document.getElementById("btn-print-dossier").addEventListener("click", () => {
  const c = collectFormPayload();
  const printDiv = document.getElementById("printable-case-dossier");

  printDiv.innerHTML = `
    <div style="font-family: sans-serif; color: #111; line-height: 1.5;">
      <div style="border-bottom: 2px solid #065f46; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between;">
        <div>
          <h1 style="margin: 0; font-size: 18px; color: #065f46;">AYURPARAM PANCHAKARMA OPD / IPD CASE SHEET</h1>
          <div style="font-size: 12px; color: #555;">Integrative Samhita-Grounded Clinical Record</div>
        </div>
        <div style="text-align: right; font-size: 12px;">
          <strong>Reg No:</strong> ${c.regNo || "N/A"}<br/>
          <strong>Status:</strong> ${c.overallStatus}
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px;">
        <tr>
          <td style="border: 1px solid #ccc; padding: 6px;"><strong>Patient:</strong> ${c.name} (${c.ageSex})</td>
          <td style="border: 1px solid #ccc; padding: 6px;"><strong>Scholar:</strong> ${c.scholarName}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 6px;"><strong>Diagnosis:</strong> ${c.diagnosis}</td>
          <td style="border: 1px solid #ccc; padding: 6px;"><strong>Complaints:</strong> ${c.complaints}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 6px;"><strong>CCRAS Agni:</strong> ${c.agniResult}</td>
          <td style="border: 1px solid #ccc; padding: 6px;"><strong>Koshtha:</strong> ${c.koshthaResult}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 6px;"><strong>Ashtavidha:</strong> जिह्वा: ${c.jihva} | मल: ${c.mala} | नाड़ी: ${c.nadi}</td>
          <td style="border: 1px solid #ccc; padding: 6px;"><strong>Nidana:</strong> ${c.lifestyle.join(", ")}</td>
        </tr>
      </table>

      <h3 style="font-size: 14px; color: #065f46; border-bottom: 1px solid #ddd; padding-bottom: 4px;">Panchakarma, Nasya & Upakarma Protocol Summary</h3>
      <ul style="font-size: 12px; padding-left: 18px;">
        <li><strong>रूक्षण:</strong> ${c.rukshanaStatus} — ${c.rukshanaDrug} (${c.rukshanaIndication})</li>
        <li><strong>स्नेहपान:</strong> ${c.snehapanaStatus} — ${c.snehapanaDrug} | सम्यक् लक्षण: ${c.samyakSnigdha.join(", ")}</li>
        <li><strong>स्वेदन:</strong> ${c.swedanaStatus} — ${c.swedanaType} (${c.swedanaDays})</li>
        <li><strong>वमन:</strong> ${c.vamanaStatus} | योग: ${c.vamanaDrug} | वेग: ${c.vamanaVegas} (${c.vamanaAntiki})</li>
        <li><strong>विरेचन:</strong> ${c.virechanaStatus} | योग: ${c.virechanaDrug} | वेग: ${c.virechanaVegas} (${c.virechanaAntiki})</li>
        <li><strong>संसर्जन क्रम:</strong> ${c.samsarjanaShuddhi} — ${c.samsarjanaFollowupNotes}</li>
        <li><strong>बस्ति:</strong> ${c.bastiStatus} | ${c.bastiType} (${c.bastiProgress}) — निरूह: ${c.bastiNiruhaDrug}, अनुवासन: ${c.bastiAnuvasanaDrug}</li>
        <li><strong>नस्य:</strong> ${c.nasyaStatus} | ${c.nasyaType} — ${c.nasyaDrug} (${c.nasyaDose})</li>
        <li><strong>रक्तमोक्षण:</strong> ${c.raktaStatus} | ${c.raktaMethod} (${c.raktaSite})</li>
        <li><strong>उपकर्म:</strong> ${c.upakarmaStatus} | ${c.upakarmaList.join(", ")} — ${c.upakarmaNotes}</li>
      </ul>

      ${c.consultantRemark ? `<div style="margin-top: 10px; padding: 8px; border: 1px solid #d97706; background: #fffbeb; font-size: 12px;"><strong>Consultant / Teacher Remarks:</strong> ${c.consultantRemark}</div>` : ""}

      ${c.lastAyurParamHtml ? `<div style="margin-top: 12px; font-size: 11px; border-top: 1px solid #ccc; padding-top: 8px;"><strong>AyurParam Samhita & Modern Analysis:</strong>${c.lastAyurParamHtml}</div>` : ""}
    </div>
  `;

  printDiv.classList.remove("hidden");
  window.print();
  printDiv.classList.add("hidden");
});