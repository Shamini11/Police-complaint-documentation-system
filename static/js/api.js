/**
 * api.js - Saved Police Records & History Dashboard Controller
 * Handles database search, categorization tabs, status filtering, KPI analytics,
 * dossier modal inspection, direct PDF downloads, record editing, and printing.
 */

let currentSearchQuery = "";
let currentStatusFilter = "ALL";
let currentCategoryFilter = "ALL";
let searchDebounceTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  initHistoryDashboard();
});

function initSystemClock() {
  const clockEl = document.getElementById("systemClock");
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    const timeStr = now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
    clockEl.textContent = `📅 ${dateStr} • ⏰ ${timeStr}`;
  };
  update();
  setInterval(update, 1000);
}

async function initHistoryDashboard() {
  initSystemClock();
  await loadDashboardStats();
  await loadComplaintsTable();

  // Search input listener with 300ms debounce
  const searchInput = document.getElementById("historySearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentSearchQuery = e.target.value.trim();
        loadComplaintsTable();
      }, 300);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(searchDebounceTimer);
        currentSearchQuery = e.target.value.trim();
        loadComplaintsTable();
      }
    });
  }

  // Category filter dropdown listener
  const catSelect = document.getElementById("historyCategorySelect");
  if (catSelect) {
    catSelect.addEventListener("change", (e) => {
      currentCategoryFilter = e.target.value;
      loadComplaintsTable();
    });
  }
}

async function loadDashboardStats() {
  try {
    const res = await fetch("/api/stats");
    const json = await res.json();
    if (json.success) {
      const data = json.data;
      const elTotal = document.getElementById("kpiTotalComplaints");
      const elToday = document.getElementById("kpiTodayComplaints");
      const elPending = document.getElementById("kpiPendingDrafts");
      const elSaved = document.getElementById("kpiTotalSaved");
      const elApproved = document.getElementById("kpiTotalApproved");
      const elRegistered = document.getElementById("kpiRegisteredApproved");

      if (elTotal) elTotal.textContent = data.total_complaints || 0;
      if (elToday) elToday.textContent = data.today_complaints || 0;
      if (elPending) elPending.textContent = data.pending_drafts || 0;
      if (elSaved) elSaved.textContent = data.total_saved || 0;
      if (elApproved) elApproved.textContent = data.total_approved || 0;
      if (elRegistered) elRegistered.textContent = data.registered_approved || 0;

      // Update Categorization Tab Badges
      const tabAll = document.getElementById("tabBadgeAll");
      const tabDrafts = document.getElementById("tabBadgeDrafts");
      const tabSaved = document.getElementById("tabBadgeSaved");
      const tabApproved = document.getElementById("tabBadgeApproved");

      if (tabAll) tabAll.textContent = data.total_complaints || 0;
      if (tabDrafts) tabDrafts.textContent = data.pending_drafts || 0;
      if (tabSaved) tabSaved.textContent = data.total_saved || 0;
      if (tabApproved) tabApproved.textContent = data.total_approved || 0;
    }
  } catch (err) {
    console.warn("Could not load stats:", err);
  }
}

function switchCategoryTab(status, tabElement) {
  currentStatusFilter = status;

  // Update tab active classes
  const tabs = document.querySelectorAll(".tab-btn, .pill-btn");
  tabs.forEach((t) => t.classList.remove("active"));
  if (tabElement) tabElement.classList.add("active");

  loadComplaintsTable();
}

function resetHistoryFilters() {
  currentSearchQuery = "";
  currentStatusFilter = "ALL";
  currentCategoryFilter = "ALL";

  const searchInput = document.getElementById("historySearchInput");
  if (searchInput) searchInput.value = "";

  const catSelect = document.getElementById("historyCategorySelect");
  if (catSelect) catSelect.value = "ALL";

  const allTab = document.querySelector(".tab-btn[data-status='ALL']") || document.querySelector(".pill-btn");
  if (allTab) {
    const tabs = document.querySelectorAll(".tab-btn, .pill-btn");
    tabs.forEach((t) => t.classList.remove("active"));
    allTab.classList.add("active");
  }

  loadDashboardStats();
  loadComplaintsTable();
}

async function loadComplaintsTable() {
  const tableBody = document.getElementById("complaintsTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align: center; padding: 28px; color: #64748b;">
        <span style="font-size: 1.2rem; display: block; margin-bottom: 6px;">⏳</span>
        <i>Loading Police Records from SQLite Database...</i>
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams();
    if (currentSearchQuery) params.set("query", currentSearchQuery);
    if (currentStatusFilter && currentStatusFilter !== "ALL") params.set("status", currentStatusFilter);
    if (currentCategoryFilter && currentCategoryFilter !== "ALL") params.set("category", currentCategoryFilter);

    const url = `/api/complaints?${params.toString()}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.success) throw new Error(json.error || "Failed to fetch records");

    const records = json.data || [];
    if (records.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 36px 20px; color: #64748b;">
            <div style="font-size: 1.8rem; margin-bottom: 8px;">📂</div>
            <strong style="color: #1e3a8a; font-size: 0.95rem;">No Police Complaint Records Found</strong><br/>
            <span style="font-size: 0.8rem; color: #64748b;">
              ${currentSearchQuery || currentStatusFilter !== "ALL" || currentCategoryFilter !== "ALL"
                ? "No complaints match your current filter/search parameters. Try clearing filters."
                : "No complaints have been saved to the database yet. Click '+ New Complaint Registration' above."}
            </span>
            ${currentSearchQuery || currentStatusFilter !== "ALL" || currentCategoryFilter !== "ALL"
              ? `<div style="margin-top: 12px;"><button type="button" class="btn-table-action" onclick="resetHistoryFilters()">Reset All Filters</button></div>`
              : ""}
          </td>
        </tr>
      `;
      return;
    }

    let html = "";
    records.forEach((r) => {
      // Determine Status Badge Class & Display Label
      let statusClass = "status-saved";
      let statusLabel = r.status || "Saved";
      const up = (r.status || "").toUpperCase();

      if (up === "DRAFT" || up === "DRAFTS" || up === "PENDING") {
        statusClass = "status-draft";
        statusLabel = "Draft";
      } else if (up === "APPROVED" || up === "FINALIZED") {
        statusClass = "status-approved";
        statusLabel = "Approved";
      } else {
        statusClass = "status-saved";
        statusLabel = "Saved";
      }

      // Format Date
      const dateDisplay = r.created_at || "Recent";
      const incidentCat = r.incident_type || "General";
      const locDisplay = r.incident_location && r.incident_location !== "Not mentioned" ? r.incident_location : "Station Jurisdiction";

      html += `
        <tr>
          <td>
            <strong style="color: #1e3a8a; font-family: monospace; font-size: 0.88rem;">${escapeHtml(r.reference_id)}</strong>
            ${r.audio_filename ? `<div style="font-size: 0.7rem; color: #059669; margin-top: 2px;">🎙️ Audio (${escapeHtml(r.audio_duration || 'Archive')})</div>` : ''}
          </td>
          <td>
            <span style="font-size: 0.78rem; color: #334155; font-weight: 500;">${escapeHtml(dateDisplay)}</span>
          </td>
          <td>
            <strong style="color: #0f172a; font-size: 0.86rem;">${escapeHtml(r.complainant_name)}</strong><br/>
            <span style="font-size: 0.74rem; color: #475569;">📞 ${escapeHtml(r.contact_number || "Not provided")}</span>
            ${r.govt_id_masked ? `<br/><span style="font-size: 0.7rem; color: #64748b;">🪪 ${escapeHtml(r.govt_id_masked)}</span>` : ''}
          </td>
          <td>
            <span class="category-badge badge-${getCategorySlug(incidentCat)}">
              ${escapeHtml(incidentCat)}
            </span><br/>
            <span style="font-size: 0.73rem; color: #64748b;">📍 ${escapeHtml(locDisplay)}</span>
          </td>
          <td>
            <span style="font-size: 0.8rem; font-weight: 600; color: #1e293b;">${escapeHtml(r.writer_name)}</span><br/>
            <span style="font-size: 0.72rem; color: #64748b;">Badge: ${escapeHtml(r.writer_id)}</span>
          </td>
          <td>
            <span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
          </td>
          <td style="white-space: nowrap;">
            <div class="row-actions">
              <button type="button" class="btn-table-action btn-view" onclick="viewComplaintDetails('${escapeHtml(r.reference_id)}')" title="Inspect record dossier">
                👁 View
              </button>
              <a href="/?ref=${encodeURIComponent(r.reference_id)}" class="btn-table-action btn-edit" title="Load into Intake Workspace to Edit">
                ✏ View/Edit
              </a>
              <a href="/api/export-pdf/${encodeURIComponent(r.reference_id)}" target="_blank" class="btn-table-action btn-pdf" title="Download Official ReportLab PDF">
                📄 PDF
              </a>
              <button type="button" class="btn-table-action btn-print" onclick="printComplaintRecord('${escapeHtml(r.reference_id)}')" title="Direct Print Record">
                🖨️ Print
              </button>
              <button type="button" class="btn-table-action btn-table-delete" onclick="deleteComplaintRecord('${escapeHtml(r.reference_id)}')" title="Delete record">
                🗑
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;

  } catch (err) {
    console.error("Table Load Error:", err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #dc2626;">
          <strong>Error retrieving records:</strong> ${escapeHtml(err.message)}<br/>
          <button type="button" class="btn-table-action" style="margin-top: 8px;" onclick="loadComplaintsTable()">Retry</button>
        </td>
      </tr>
    `;
  }
}

async function viewComplaintDetails(refOrId) {
  const modal = document.getElementById("detailsModal");
  const content = document.getElementById("detailsModalContent");
  if (!modal || !content) return;

  modal.classList.add("active");
  content.innerHTML = `
    <div style="text-align: center; padding: 24px; color: #64748b;">
      <i>Loading complaint record dossier...</i>
    </div>
  `;

  try {
    const res = await fetch(`/api/complaints/${refOrId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load");

    const c = json.data;
    let sigImg = "<span style='color: #64748b; font-size: 0.75rem;'>No electronic signature</span>";
    if (c.complainant_signature && c.complainant_signature.startsWith("data:image")) {
      sigImg = `<img src="${c.complainant_signature}" style="max-height: 48px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px; background: #fff;" alt="Complainant Signature" />`;
    }

    let writerSigImg = "<span style='color: #64748b; font-size: 0.75rem;'>Officer Signature Attested</span>";
    if (c.writer_signature && c.writer_signature.startsWith("data:image")) {
      writerSigImg = `<img src="${c.writer_signature}" style="max-height: 48px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px; background: #fff;" alt="Writer Signature" />`;
    }

    let audioPlayerHtml = "";
    if (c.audio_filename) {
      const audioUrl = c.audio_path || `/static/uploads/audio/${c.audio_filename}`;
      audioPlayerHtml = `
        <div style="margin-bottom: 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="font-size: 0.8rem; color: #166534;">🎙️ Single Continuous Audio Archive (${c.audio_duration || 'Active'})</strong>
            <span style="font-size: 0.72rem; color: #15803d; font-family: monospace;">${escapeHtml(c.audio_filename)}</span>
          </div>
          <audio controls src="${audioUrl}" style="width: 100%; height: 32px;"></audio>
        </div>
      `;
    }

    content.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
        <div>
          <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">Community Service Register (CSR) Dossier</span>
          <h3 style="font-size: 1.25rem; color: #1e3a8a; margin: 2px 0;">Reference: ${escapeHtml(c.reference_id)}</h3>
          <span style="font-size: 0.78rem; color: #475569;">Lodged: <b>${escapeHtml(c.created_at)}</b> | Current Status: <b style="color: #1e40af;">${escapeHtml(c.status)}</b></span>
        </div>
        <div style="display: flex; gap: 6px;">
          <a href="/?ref=${encodeURIComponent(c.reference_id)}" class="nav-link-btn" style="padding: 6px 12px; font-size: 0.78rem;">
            ✏ Edit Record
          </a>
          <a href="/api/export-pdf/${encodeURIComponent(c.reference_id)}" target="_blank" class="nav-link-btn" style="padding: 6px 12px; font-size: 0.78rem; background: #1e40af;">
            📄 Download PDF
          </a>
          <button type="button" class="nav-link-btn" style="padding: 6px 12px; font-size: 0.78rem; background: #475569;" onclick="printComplaintRecord('${escapeHtml(c.reference_id)}')">
            🖨️ Print
          </button>
        </div>
      </div>

      <!-- Quick Status Switcher Row -->
      <div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px;">
        <span style="font-size: 0.78rem; font-weight: 600; color: #334155;">Record Workflow Status:</span>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn-table-action ${c.status === 'Draft' ? 'active' : ''}" onclick="quickUpdateStatus('${escapeHtml(c.reference_id)}', 'Draft')">📝 Mark as Draft</button>
          <button type="button" class="btn-table-action ${c.status === 'Saved' ? 'active' : ''}" onclick="quickUpdateStatus('${escapeHtml(c.reference_id)}', 'Saved')">💾 Mark as Saved</button>
          <button type="button" class="btn-table-action ${c.status === 'Approved' ? 'active' : ''}" onclick="quickUpdateStatus('${escapeHtml(c.reference_id)}', 'Approved')">✅ Mark as Approved</button>
        </div>
      </div>

      ${audioPlayerHtml}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; font-size: 0.82rem;">
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <strong style="color: #1e3a8a; display: block; margin-bottom: 4px; text-transform: uppercase; font-size: 0.75rem;">Complainant Particulars:</strong>
          <div><strong>Name:</strong> ${escapeHtml(c.complainant_name)}</div>
          <div><strong>Father / Spouse:</strong> ${escapeHtml(c.father_name || "Not stated")}</div>
          <div><strong>Phone:</strong> ${escapeHtml(c.contact_number || "Not provided")}</div>
          <div><strong>Govt ID:</strong> <code>${escapeHtml(c.govt_id_masked || "Verified")}</code></div>
          <div><strong>Address:</strong> ${escapeHtml(c.residential_address || "Not stated")}</div>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <strong style="color: #1e3a8a; display: block; margin-bottom: 4px; text-transform: uppercase; font-size: 0.75rem;">Incident & Station Details:</strong>
          <div><strong>Category:</strong> ${escapeHtml(c.incident_type)}</div>
          <div><strong>Occurrence Timing:</strong> ${escapeHtml(c.incident_date)} at ${escapeHtml(c.incident_time)}</div>
          <div><strong>Scene of Incident:</strong> ${escapeHtml(c.incident_location)}</div>
          <div><strong>Station Writer:</strong> ${escapeHtml(c.writer_name)} (${escapeHtml(c.writer_id)})</div>
          <div><strong>AI Provider:</strong> ${escapeHtml(c.ai_provider_used || "Rule Engine")}</div>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="font-weight: 700; font-size: 0.78rem; text-transform: uppercase; color: #1e3a8a;">Stolen / Involved Property Details:</label>
        <div style="background: #ffffff; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.82rem;">
          ${escapeHtml(c.object_property || "Not mentioned")}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="font-weight: 700; font-size: 0.78rem; text-transform: uppercase; color: #1e3a8a;">Official Legal Complaint Draft (English CSR Format):</label>
        <pre style="background: #f8fafc; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.78rem; white-space: pre-wrap; font-family: inherit; max-height: 200px; overflow-y: auto; line-height: 1.45;">${escapeHtml(c.draft_complaint || "No draft recorded.")}</pre>
      </div>

      <div style="margin-bottom: 14px;">
        <label style="font-weight: 700; font-size: 0.78rem; text-transform: uppercase; color: #1e3a8a;">Original Verbatim Oral Statement Transcript:</label>
        <pre style="background: #f1f5f9; padding: 10px 12px; border-left: 3px solid #1e3a8a; border-radius: 4px; font-size: 0.78rem; white-space: pre-wrap; font-family: inherit; max-height: 120px; overflow-y: auto;">${escapeHtml(c.raw_transcript || "No transcript recorded.")}</pre>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #fafbfc; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Complainant Signature:</span>
          ${sigImg}
        </div>
        <div>
          <span style="font-size: 0.75rem; font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Station Duty Writer Signature:</span>
          ${writerSigImg}
        </div>
      </div>
    `;

  } catch (err) {
    content.innerHTML = `<div style="padding: 20px; color: #dc2626; text-align: center;">Error loading dossier: ${escapeHtml(err.message)}</div>`;
  }
}

function closeDetailsModal() {
  const modal = document.getElementById("detailsModal");
  if (modal) modal.classList.remove("active");
}

async function quickUpdateStatus(refOrId, newStatus) {
  try {
    const res = await fetch(`/api/complaints/${refOrId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Update failed");

    await loadDashboardStats();
    await loadComplaintsTable();
    await viewComplaintDetails(refOrId);
  } catch (err) {
    alert(`Could not update status: ${err.message}`);
  }
}

async function printComplaintRecord(refOrId) {
  try {
    const res = await fetch(`/api/complaints/${refOrId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Record not found");

    const c = json.data;

    let sigImg = "<div style='color: #64748b; font-size: 11px;'>[Signed Electronically]</div>";
    if (c.complainant_signature && c.complainant_signature.startsWith("data:image")) {
      sigImg = `<img src="${c.complainant_signature}" style="max-height: 45px;" />`;
    }

    let writerSigImg = "<div style='color: #64748b; font-size: 11px;'>[Attested by Duty Officer]</div>";
    if (c.writer_signature && c.writer_signature.startsWith("data:image")) {
      writerSigImg = `<img src="${c.writer_signature}" style="max-height: 45px;" />`;
    }

    const printWin = window.open("", "_blank", "width=850,height=950");
    if (!printWin) {
      alert("Please permit popups to print the official police complaint document.");
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Police CSR Record - ${escapeHtml(c.reference_id)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 30px; color: #0f172a; line-height: 1.4; font-size: 13px; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          .header h2 { margin: 0; font-size: 18px; text-transform: uppercase; color: #1e3a8a; }
          .header p { margin: 4px 0; font-size: 12px; color: #475569; }
          .ref-box { display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 14px; background: #f1f5f9; padding: 8px 12px; border-radius: 4px; }
          .section { margin-bottom: 16px; }
          .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 8px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .draft-text { background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-family: inherit; font-size: 12px; }
          .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; padding-top: 14px; border-top: 1px solid #cbd5e1; }
          .sig-box { text-align: center; }
          @media print { body { margin: 15mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>TAMIL NADU POLICE DEPARTMENT</h2>
          <p>COMMUNITY SERVICE REGISTER (CSR) COMPLAINT RECORD</p>
          <p>Central Police Station, Division-I • Law & Order</p>
        </div>

        <div class="ref-box">
          <span>REFERENCE NO: ${escapeHtml(c.reference_id)}</span>
          <span>DATE LODGED: ${escapeHtml(c.created_at)}</span>
          <span>STATUS: ${escapeHtml(c.status)}</span>
        </div>

        <div class="section">
          <div class="section-title">I. Complainant Particulars</div>
          <div class="grid">
            <div>
              <strong>Full Name:</strong> ${escapeHtml(c.complainant_name)}<br/>
              <strong>Father / Spouse:</strong> ${escapeHtml(c.father_name || "Not stated")}<br/>
              <strong>Contact Phone:</strong> ${escapeHtml(c.contact_number || "Not provided")}
            </div>
            <div>
              <strong>Govt ID / Aadhaar:</strong> ${escapeHtml(c.govt_id_masked || "Verified")}<br/>
              <strong>Residential Address:</strong> ${escapeHtml(c.residential_address || "Not stated")}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">II. Occurrence & Incident Parameters</div>
          <div class="grid">
            <div>
              <strong>Incident Category:</strong> ${escapeHtml(c.incident_type)}<br/>
              <strong>Scene of Occurrence:</strong> ${escapeHtml(c.incident_location)}
            </div>
            <div>
              <strong>Date & Time of Occurrence:</strong> ${escapeHtml(c.incident_date)} at ${escapeHtml(c.incident_time)}<br/>
              <strong>Stolen / Involved Property:</strong> ${escapeHtml(c.object_property || "Not mentioned")}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">III. Formal Legal Complaint Narrative</div>
          <div class="draft-text">${escapeHtml(c.draft_complaint || "No draft recorded.")}</div>
        </div>

        <div class="sig-row">
          <div class="sig-box">
            ${sigImg}
            <div style="font-weight: bold; margin-top: 4px;">Signature of Complainant</div>
            <div style="font-size: 11px; color: #64748b;">${escapeHtml(c.complainant_name)}</div>
          </div>
          <div class="sig-box">
            ${writerSigImg}
            <div style="font-weight: bold; margin-top: 4px;">Attested by Duty Writer</div>
            <div style="font-size: 11px; color: #64748b;">${escapeHtml(c.writer_name)} (${escapeHtml(c.writer_id)})</div>
          </div>
        </div>
      </body>
      </html>
    `);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 400);

  } catch (err) {
    alert(`Could not open print document: ${err.message}`);
  }
}

async function deleteComplaintRecord(refOrId) {
  if (!confirm(`Are you sure you want to permanently delete complaint record ${refOrId}? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/complaints/${refOrId}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Delete failed");

    await loadDashboardStats();
    await loadComplaintsTable();
  } catch (err) {
    alert(`Could not delete record: ${err.message}`);
  }
}

function getCategorySlug(cat) {
  const lower = (cat || "").toLowerCase();
  if (lower.includes("theft")) return "theft";
  if (lower.includes("lost") || lower.includes("missing")) return "lost";
  if (lower.includes("snatch")) return "snatch";
  if (lower.includes("assault") || lower.includes("hurt") || lower.includes("hit")) return "assault";
  if (lower.includes("cyber") || lower.includes("fraud") || lower.includes("cheating")) return "cyber";
  if (lower.includes("dispute") || lower.includes("property")) return "dispute";
  if (lower.includes("harass")) return "harass";
  if (lower.includes("accident") || lower.includes("traffic")) return "accident";
  return "general";
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Global window exposure for inline event handlers
window.switchCategoryTab = switchCategoryTab;
window.resetHistoryFilters = resetHistoryFilters;
window.viewComplaintDetails = viewComplaintDetails;
window.closeDetailsModal = closeDetailsModal;
window.quickUpdateStatus = quickUpdateStatus;
window.printComplaintRecord = printComplaintRecord;
window.deleteComplaintRecord = deleteComplaintRecord;
window.loadComplaintsTable = loadComplaintsTable;
