import { api } from "../api/client.js";
import { openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { usageRangeSummaryHtml } from "../components/usageRangeSummary.js";
import { providerSymbols } from "../config/providerUi.js";
import {
  escapeHtml,
  formatBalance,
  formatDateShort,
  inputNumber,
  localIsoDate,
  numberValue,
  parseNumberInput,
} from "../utils/format.js";


// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function valueMap(entry) {
  return Object.fromEntries((entry?.values || []).map((value) => [value.provider_key, value]));
}

function entryUsedUsd(entry) {
  return (entry?.values || [])
    .filter((value) => value.unit === "USD")
    .reduce((sum, value) => sum + numberValue(value.used_balance), 0);
}

function buildNewBalanceDraft(overview) {
  const latest = valueMap(overview.latest);
  const draft = {};

  for (const provider of overview.providers) {
    const currentLeft = numberValue(latest[provider.provider_key]?.left_balance, 0);
    draft[provider.provider_key] = {
      total: currentLeft,
      used: 0,
      left: currentLeft,
      lastEdited: "used",
    };
  }

  return draft;
}

function buildEditDraft(entry) {
  const draft = {};
  for (const value of entry.values) {
    draft[value.provider_key] = {
      total: numberValue(value.total_balance),
      used: numberValue(value.used_balance),
      left: numberValue(value.left_balance),
      lastEdited: "used",
    };
  }
  return draft;
}

function buildAddBalanceDraft(overview) {
  const latest = valueMap(overview.latest);
  const draft = {};

  for (const provider of overview.providers) {
    const current = numberValue(latest[provider.provider_key]?.left_balance, 0);
    draft[provider.provider_key] = {
      current,
      add: 0,
      total: current,
    };
  }

  return draft;
}

function draftPayload(draft) {
  return Object.fromEntries(Object.entries(draft).map(([key, row]) => [
    key,
    { total: row.total, used: row.used, left: row.left },
  ]));
}

function additionsPayload(draft) {
  return Object.fromEntries(Object.entries(draft).map(([key, row]) => [key, row.add || 0]));
}

// ---------------------------------------------------------------------------
// Summary and current-balance UI
// ---------------------------------------------------------------------------

function currentCardsHtml(overview) {
  const latest = valueMap(overview.latest);

  return overview.providers.map((provider) => {
    const value = latest[provider.provider_key];
    const left = value?.left_balance ?? 0;
    return `
      <div class="provider-mini">
        <div class="provider-badge">${providerSymbols[provider.provider_key] || provider.display_name.slice(0, 1)}</div>
        <div style="min-width:0">
          <div class="provider-mini-name">${escapeHtml(provider.display_name)}</div>
          <div class="provider-mini-value">${formatBalance(left, provider.unit)}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ---------------------------------------------------------------------------
// Balance History + pagination
// ---------------------------------------------------------------------------

function visiblePageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage]);
  for (let offset = -2; offset <= 2; offset += 1) {
    const page = currentPage + offset;
    if (page >= 1 && page <= totalPages) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function paginationHtml(pagination) {
  const page = pagination?.page || 1;
  const totalPages = pagination?.total_pages || 1;
  const pageSize = pagination?.page_size || 5;
  const totalItems = pagination?.total_items || 0;
  const pages = visiblePageNumbers(page, totalPages);

  let previousNumber = null;
  const pageButtons = pages.map((pageNumber) => {
    const gap = previousNumber !== null && pageNumber - previousNumber > 1
      ? `<span class="pagination-gap">…</span>`
      : "";
    previousNumber = pageNumber;
    return `${gap}<button class="page-btn ${pageNumber === page ? "active" : ""}" type="button" data-history-page="${pageNumber}">${pageNumber}</button>`;
  }).join("");

  return `
    <div class="pagination-bar">
      <div class="pagination-info">${totalItems} saved ${totalItems === 1 ? "entry" : "entries"}</div>
      <div class="pagination-controls">
        <button class="page-btn" type="button" data-history-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""}>‹</button>
        ${pageButtons}
        <button class="page-btn" type="button" data-history-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? "disabled" : ""}>›</button>
      </div>
      <label class="page-size-control">
        <span>Rows</span>
        <select class="page-size-select" data-history-page-size>
          ${[5, 10, 20, 50].map((size) => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function historyTableHtml(overview) {
  if (!overview.history.length) {
    return `
      <div class="empty-state">No saved balance history yet.</div>
      ${paginationHtml(overview.pagination)}
    `;
  }

  const providerHeaders = overview.providers.map((provider) => `
    <th colspan="2">${escapeHtml(provider.display_name)}<span class="subhead">Used &nbsp;&nbsp;&nbsp;&nbsp; Left</span></th>
  `).join("");

  const rows = overview.history.map((entry) => {
    const values = valueMap(entry);
    const cells = overview.providers.map((provider) => {
      const item = values[provider.provider_key];
      return `
        <td>${formatBalance(item?.used_balance ?? 0, provider.unit)}</td>
        <td>${formatBalance(item?.left_balance ?? 0, provider.unit)}</td>
      `;
    }).join("");

    return `
      <tr>
        <td>${formatDateShort(entry.entry_date)}</td>
        ${cells}
        <td class="history-total">${formatBalance(entryUsedUsd(entry), "USD")}</td>
        <td class="history-actions">
          <div class="history-action-buttons">
            <button class="btn btn-soft btn-small" type="button" data-edit-entry="${entry.id}">✎ Edit</button>
            <button class="btn btn-danger-soft btn-small" type="button" data-delete-entry="${entry.id}" data-entry-date="${escapeHtml(entry.entry_date)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            ${providerHeaders}
            <th>Total Used<span class="subhead">USD only</span></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${paginationHtml(overview.pagination)}
  `;
}

// ---------------------------------------------------------------------------
// New Balance form
// ---------------------------------------------------------------------------

function balanceFormRowsHtml(providers, draft, { totalReadonly = false } = {}) {
  return providers.map((provider) => {
    const row = draft[provider.provider_key];
    return `
      <tr data-balance-row="${provider.provider_key}" data-unit="${provider.unit}">
        <td><strong>${escapeHtml(provider.display_name)}</strong></td>
        <td>
          <input class="input table-input" type="number" min="0" step="any" inputmode="decimal"
            data-field="total" value="${inputNumber(row.total)}" ${totalReadonly ? "readonly" : ""} />
        </td>
        <td>
          <input class="input table-input" type="number" min="0" step="any" inputmode="decimal"
            data-field="used" value="${inputNumber(row.used)}" />
        </td>
        <td class="calc-arrow">⇄</td>
        <td>
          <input class="input table-input" type="number" min="0" step="any" inputmode="decimal"
            data-field="left" value="${inputNumber(row.left)}" />
        </td>
        <td class="unit-cell">${escapeHtml(provider.unit)}</td>
      </tr>
    `;
  }).join("");
}

function usagePanelHtml(providers, draft) {
  const usdTotal = providers
    .filter((provider) => provider.unit === "USD")
    .reduce((sum, provider) => sum + Math.max(0, numberValue(draft[provider.provider_key]?.used)), 0);

  const rows = providers.map((provider) => `
    <div class="total-panel-row">
      <span>${escapeHtml(provider.display_name)}</span>
      <strong>${formatBalance(Math.max(0, numberValue(draft[provider.provider_key]?.used)), provider.unit)}</strong>
    </div>
  `).join("");

  return `
    <div class="total-panel-head">
      <div class="label">Used in this entry (USD)</div>
      <div class="value">${formatBalance(usdTotal, "USD")}</div>
    </div>
    <div class="total-panel-list">${rows}</div>
  `;
}

function isBalanceRowValid(row) {
  if (![row.total, row.used, row.left].every((value) => Number.isFinite(value))) return false;
  if (row.total < 0 || row.used < 0 || row.left < 0) return false;
  return Math.abs((row.used + row.left) - row.total) <= 1e-8;
}

function validateBalanceDraft(providers, draft) {
  for (const provider of providers) {
    const row = draft[provider.provider_key];
    if (!isBalanceRowValid(row)) {
      return `${provider.display_name}: Total, Used and Left must be valid non-negative numbers, and Used + Left must equal Total.`;
    }
  }
  return "";
}

function syncBalanceRow(rowEl, draftRow, field) {
  const totalInput = rowEl.querySelector('[data-field="total"]');
  const usedInput = rowEl.querySelector('[data-field="used"]');
  const leftInput = rowEl.querySelector('[data-field="left"]');
  const activeInput = rowEl.querySelector(`[data-field="${field}"]`);
  const parsed = parseNumberInput(activeInput.value);

  if (parsed === null) {
    draftRow[field] = Number.NaN;
    rowEl.classList.add("row-invalid");
    return;
  }

  draftRow[field] = parsed;

  if (field === "used") {
    draftRow.lastEdited = "used";
    draftRow.left = draftRow.total - draftRow.used;
    leftInput.value = inputNumber(draftRow.left);
  } else if (field === "left") {
    draftRow.lastEdited = "left";
    draftRow.used = draftRow.total - draftRow.left;
    usedInput.value = inputNumber(draftRow.used);
  } else if (field === "total") {
    if (draftRow.lastEdited === "left") {
      draftRow.used = draftRow.total - draftRow.left;
      usedInput.value = inputNumber(draftRow.used);
    } else {
      draftRow.left = draftRow.total - draftRow.used;
      leftInput.value = inputNumber(draftRow.left);
    }
  }

  // IMPORTANT: do not rewrite activeInput.value here. That was the cause of
  // the old cursor-jump bug and the apparent two-decimal input limit.
  rowEl.classList.toggle("row-invalid", !isBalanceRowValid(draftRow));

  if (field !== "total" && totalInput.readOnly) {
    totalInput.value = inputNumber(draftRow.total);
  }
}

function attachBalanceDraftListeners(root, providers, draft, onChange) {
  root.querySelectorAll("[data-balance-row]").forEach((rowEl) => {
    const key = rowEl.dataset.balanceRow;
    const draftRow = draft[key];

    rowEl.querySelectorAll("[data-field]").forEach((input) => {
      if (input.readOnly) return;

      input.addEventListener("input", () => {
        syncBalanceRow(rowEl, draftRow, input.dataset.field);
        onChange?.();
      });

      input.addEventListener("blur", () => {
        const value = parseNumberInput(input.value);
        if (value !== null) input.value = inputNumber(value);
      });
    });
  });
}

function newBalanceSectionHtml(overview, draft, entryDate) {
  return `
    <section class="card section-card editor-section" id="new-balance-section">
      <div class="section-head">
        <div>
          <h2>New Balance Entry</h2>
          <div class="help">Record the new usage or remaining balance for each API key.</div>
        </div>
        <div class="section-actions">
          <button class="btn" type="button" data-reset-new>↻ Reset</button>
          <button class="btn" type="button" data-close-editor>Cancel</button>
          <button class="btn btn-primary" type="button" data-save-history>Save to History</button>
        </div>
      </div>
      <div class="balance-form-wrap">
        <div class="info-strip">
          Enter either <strong>Used</strong> or <strong>Left</strong>. The other field is calculated automatically. You can use more than two decimal places. Total Balance is the latest available balance; use <strong>Add Balance</strong> when you top up an API account. Saving without changing values saves the latest balances again with 0 new usage.
        </div>
        <div class="field entry-date-field">
          <label for="new-entry-date">Date</label>
          <input class="input" id="new-entry-date" type="date" value="${escapeHtml(entryDate)}" />
        </div>
        <div class="balance-form-layout">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>API Key</th><th>Total Balance</th><th>Used (Input)</th><th></th><th>Left (Input)</th><th>Unit</th></tr>
              </thead>
              <tbody>${balanceFormRowsHtml(overview.providers, draft, { totalReadonly: true })}</tbody>
            </table>
          </div>
          <aside class="total-panel" data-usage-panel>${usagePanelHtml(overview.providers, draft)}</aside>
        </div>
        <div class="error-text" data-save-error></div>
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Add Balance form
// ---------------------------------------------------------------------------

function addBalanceRowsHtml(providers, draft) {
  return providers.map((provider) => {
    const row = draft[provider.provider_key];
    return `
      <tr data-add-row="${provider.provider_key}">
        <td><strong>${escapeHtml(provider.display_name)}</strong></td>
        <td>${formatBalance(row.current, provider.unit)}</td>
        <td>
          <input class="input table-input" type="number" min="0" step="any" inputmode="decimal"
            data-add-input placeholder="0" value="" />
        </td>
        <td class="calc-arrow">＋</td>
        <td data-add-total><strong>${formatBalance(row.total, provider.unit)}</strong></td>
        <td class="unit-cell">${escapeHtml(provider.unit)}</td>
      </tr>
    `;
  }).join("");
}

function addBalanceSummaryHtml(providers, draft) {
  const groups = new Map();
  for (const provider of providers) {
    const amount = Math.max(0, numberValue(draft[provider.provider_key]?.add));
    groups.set(provider.unit, (groups.get(provider.unit) || 0) + amount);
  }

  const byProvider = providers.map((provider) => `
    <div class="total-panel-row">
      <span>${escapeHtml(provider.display_name)}</span>
      <strong>${formatBalance(Math.max(0, numberValue(draft[provider.provider_key]?.add)), provider.unit)}</strong>
    </div>
  `).join("");

  const totals = [...groups.entries()].map(([unit, value]) => `${formatBalance(value, unit)}`).join(" • ");

  return `
    <div class="total-panel-head">
      <div class="label">Balance being added</div>
      <div class="add-summary-units">${totals}</div>
    </div>
    <div class="total-panel-list">${byProvider}</div>
  `;
}

function attachAddBalanceListeners(root, providers, draft, onChange) {
  const providerMap = Object.fromEntries(providers.map((provider) => [provider.provider_key, provider]));

  root.querySelectorAll("[data-add-row]").forEach((rowEl) => {
    const key = rowEl.dataset.addRow;
    const provider = providerMap[key];
    const input = rowEl.querySelector("[data-add-input]");
    const totalEl = rowEl.querySelector("[data-add-total]");

    input.addEventListener("input", () => {
      const parsed = parseNumberInput(input.value);
      const amount = parsed === null ? 0 : parsed;
      draft[key].add = amount;
      draft[key].total = draft[key].current + amount;
      rowEl.classList.toggle("row-invalid", amount < 0);
      totalEl.innerHTML = `<strong>${formatBalance(draft[key].total, provider.unit)}</strong>`;
      onChange?.();
    });

    input.addEventListener("blur", () => {
      const parsed = parseNumberInput(input.value);
      if (parsed !== null) input.value = inputNumber(parsed);
    });
  });
}

function addBalanceSectionHtml(overview, draft, entryDate) {
  return `
    <section class="card section-card editor-section" id="add-balance-section">
      <div class="section-head">
        <div>
          <h2>Add Balance</h2>
          <div class="help">Use this when you buy or top up API credits/funds.</div>
        </div>
        <div class="section-actions">
          <button class="btn" type="button" data-close-editor>Cancel</button>
          <button class="btn btn-primary" type="button" data-save-added-balance>Save Added Balance</button>
        </div>
      </div>
      <div class="balance-form-wrap">
        <div class="info-strip">
          Type only the amount you added. <strong>New Total Balance = Current Balance + Added Balance</strong>. Added funds are saved as a new history snapshot and are not counted as usage.
        </div>
        <div class="field entry-date-field">
          <label for="add-entry-date">Date</label>
          <input class="input" id="add-entry-date" type="date" value="${escapeHtml(entryDate)}" />
        </div>
        <div class="balance-form-layout">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>API Key</th><th>Current Balance</th><th>Add Balance (Input)</th><th></th><th>New Total Balance</th><th>Unit</th></tr>
              </thead>
              <tbody>${addBalanceRowsHtml(overview.providers, draft)}</tbody>
            </table>
          </div>
          <aside class="total-panel" data-add-summary>${addBalanceSummaryHtml(overview.providers, draft)}</aside>
        </div>
        <div class="error-text" data-add-error></div>
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Edit / Delete saved history
// ---------------------------------------------------------------------------

async function showEditModal(entryId, overview, refreshPage) {
  let entry;
  try {
    entry = await api.getHistoryEntry(entryId);
  } catch (error) {
    showToast(error.message, "error");
    return;
  }

  const draft = buildEditDraft(entry);
  const bodyHtml = `
    <div class="edit-form-grid">
      <div class="field edit-date-row">
        <label for="edit-entry-date">History date</label>
        <input id="edit-entry-date" class="input" type="date" value="${escapeHtml(entry.entry_date)}" />
      </div>
      <div class="info-strip">
        Correct any saved value here. Used and Left recalculate each other, and values may contain more than two decimal places.
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>API Key</th><th>Total Balance</th><th>Used</th><th></th><th>Left</th><th>Unit</th></tr>
          </thead>
          <tbody>${balanceFormRowsHtml(overview.providers, draft)}</tbody>
        </table>
      </div>
      <div class="error-text" data-edit-error></div>
    </div>
  `;

  const footerHtml = `
    <button class="btn" type="button" data-modal-close>Cancel</button>
    <button class="btn btn-primary" type="button" data-save-edit>Save changes</button>
  `;

  openModal({
    title: `Edit saved balances — ${formatDateShort(entry.entry_date)}`,
    bodyHtml,
    footerHtml,
    onReady: ({ root, close }) => {
      attachBalanceDraftListeners(root, overview.providers, draft);
      const saveButton = root.querySelector("[data-save-edit]");
      const errorEl = root.querySelector("[data-edit-error]");

      saveButton.addEventListener("click", async () => {
        const validationError = validateBalanceDraft(overview.providers, draft);
        if (validationError) {
          errorEl.textContent = validationError;
          return;
        }

        saveButton.disabled = true;
        errorEl.textContent = "";
        try {
          const entryDate = root.querySelector("#edit-entry-date").value;
          await api.updateHistory(entryId, {
            entry_date: entryDate,
            values: draftPayload(draft),
          });
          close();
          showToast("Saved history entry updated.", "success");
          await refreshPage({ resetDrafts: true });
        } catch (error) {
          errorEl.textContent = error.message;
        } finally {
          saveButton.disabled = false;
        }
      });
    },
  });
}

function showDeleteModal(entryId, entryDate, refreshPage) {
  const bodyHtml = `
    <div class="delete-warning">
      <strong>Delete the saved entry for ${formatDateShort(entryDate)}?</strong>
      <p>This removes the history row and its usage from the totals. This action cannot be undone.</p>
    </div>
  `;

  const footerHtml = `
    <button class="btn" type="button" data-modal-close>Cancel</button>
    <button class="btn btn-danger" type="button" data-confirm-delete>Delete entry</button>
  `;

  openModal({
    title: "Delete balance history entry",
    bodyHtml,
    footerHtml,
    onReady: ({ root, close }) => {
      const button = root.querySelector("[data-confirm-delete]");
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await api.deleteHistory(entryId);
          close();
          showToast("Balance history entry deleted.", "success");
          await refreshPage({ resetDrafts: true });
        } catch (error) {
          showToast(error.message, "error");
          button.disabled = false;
        }
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function renderApiBalancesPage(container, { onUnauthorized }) {
  container.innerHTML = `<div class="loading-row">Loading API key balances…</div>`;

  let overview;
  let historyPage = 1;
  let pageSize = 5;
  let activeEditor = null; // null | "new" | "add"
  let newDraft = null;
  let addDraft = null;
  let newEntryDate = localIsoDate();
  let addEntryDate = localIsoDate();

  // Usage-range state is separate from Balance History pagination so users can
  // inspect 1 day / 1 week / 1 month / custom ranges independently.
  let usageSummary = null;
  let usagePeriod = "all";
  let usageLoading = false;
  let usageError = "";
  let showCustomRange = false;
  let customUsageStart = "";
  let customUsageEnd = "";

  const loadOverview = async () => {
    overview = await api.getOverview(historyPage, pageSize);
    historyPage = overview.pagination?.page || historyPage;
    pageSize = overview.pagination?.page_size || pageSize;
  };

  const loadUsageSummary = async () => {
    usageSummary = await api.getUsageSummary({
      period: usagePeriod,
      startDate: usagePeriod === "custom" ? customUsageStart : "",
      endDate: usagePeriod === "custom" ? customUsageEnd : "",
    });

    // Give the custom calendar useful defaults the first time it is opened.
    if (!customUsageStart && usageSummary?.start_date) customUsageStart = usageSummary.start_date;
    if (!customUsageEnd && usageSummary?.end_date) customUsageEnd = usageSummary.end_date;
  };

  try {
    await loadOverview();
    await loadUsageSummary();
  } catch (error) {
    if (error.status === 401) {
      onUnauthorized?.();
      return;
    }
    container.innerHTML = `<div class="card empty-state">${escapeHtml(error.message)}</div>`;
    return;
  }

  const refreshPage = async ({ resetDrafts = false } = {}) => {
    try {
      await loadOverview();
      await loadUsageSummary();
      if (resetDrafts) {
        newDraft = buildNewBalanceDraft(overview);
        addDraft = buildAddBalanceDraft(overview);
        activeEditor = null;
        newEntryDate = localIsoDate();
        addEntryDate = localIsoDate();
      }
      render();
    } catch (error) {
      if (error.status === 401) onUnauthorized?.();
      else showToast(error.message, "error");
    }
  };

  const render = () => {
    const usdTotal = numberValue(overview.summary?.by_unit?.USD, 0);
    const creditsTotal = numberValue(overview.summary?.by_unit?.credits, 0);
    const chutesTotal = numberValue(overview.summary?.by_unit?.t, 0);
    const latestDate = overview.latest?.entry_date || "—";

    const editorHtml = activeEditor === "new"
      ? newBalanceSectionHtml(overview, newDraft, newEntryDate)
      : activeEditor === "add"
        ? addBalanceSectionHtml(overview, addDraft, addEntryDate)
        : "";

    container.innerHTML = `
      <div class="page-heading">
        <div>
          <h1>API keys balances</h1>
        </div>
        <div class="page-heading-actions">
          <button class="btn btn-soft" type="button" data-open-add>＋ Add Balance</button>
          <button class="btn btn-primary" type="button" data-open-new>＋ New Balance</button>
        </div>
      </div>

      <div class="summary-grid">
        <section class="card used-summary">
          <div class="summary-icon">▥</div>
          <div>
            <div class="summary-label">TOTAL USED BALANCE (USD)</div>
            <div class="summary-value">${formatBalance(usdTotal, "USD")}</div>
          </div>
          <div class="summary-note">
            Cumulative USD usage across all saved history.<br />Credits used: ${formatBalance(creditsTotal, "credits")} • Chutes used: ${formatBalance(chutesTotal, "t")}<br />Latest entry: ${formatDateShort(latestDate)}
          </div>
        </section>

        <section class="card current-card">
          <div class="current-card-head">
            <h2>Current API Key Balances <span class="help">(Latest: ${formatDateShort(latestDate)})</span></h2>
          </div>
          <div class="provider-cards">${currentCardsHtml(overview)}</div>
        </section>
      </div>

      ${usageRangeSummaryHtml({
        summary: usageSummary,
        activePeriod: usagePeriod,
        showCustomRange,
        customStart: customUsageStart,
        customEnd: customUsageEnd,
        loading: usageLoading,
        error: usageError,
      })}

      ${editorHtml}

      <section class="card section-card">
        <div class="section-head">
          <div>
            <h2>Balance History</h2>
            <div class="help">Edit a saved row if a value was wrong, or delete a row you do not want to keep.</div>
          </div>
          <div class="help">${overview.pagination?.total_items || 0} entries • ${overview.providers.length} providers</div>
        </div>
        <div class="section-body">${historyTableHtml(overview)}</div>
      </section>
    `;

    // Usage range controls. Preset ranges end on the latest saved history date.
    const selectUsagePeriod = async (period) => {
      usagePeriod = period;
      showCustomRange = false;
      usageLoading = true;
      usageError = "";
      render();

      try {
        await loadUsageSummary();
      } catch (error) {
        if (error.status === 401) {
          onUnauthorized?.();
          return;
        }
        usageError = error.message;
      } finally {
        usageLoading = false;
        render();
      }
    };

    container.querySelectorAll("[data-usage-period]").forEach((button) => {
      button.addEventListener("click", () => selectUsagePeriod(button.dataset.usagePeriod));
    });

    container.querySelector("[data-open-custom-range]")?.addEventListener("click", () => {
      if (!customUsageStart) customUsageStart = usageSummary?.start_date || localIsoDate();
      if (!customUsageEnd) customUsageEnd = usageSummary?.end_date || localIsoDate();
      showCustomRange = true;
      usageError = "";
      render();
    });

    container.querySelector("[data-usage-start]")?.addEventListener("change", (event) => {
      customUsageStart = event.target.value;
      usageError = "";
    });

    container.querySelector("[data-usage-end]")?.addEventListener("change", (event) => {
      customUsageEnd = event.target.value;
      usageError = "";
    });

    container.querySelector("[data-close-custom-range]")?.addEventListener("click", () => {
      showCustomRange = false;
      usageError = "";
      render();
    });

    container.querySelector("[data-apply-custom-range]")?.addEventListener("click", async () => {
      if (!customUsageStart || !customUsageEnd) {
        usageError = "Choose both From and To dates.";
        render();
        return;
      }
      if (customUsageStart > customUsageEnd) {
        usageError = "From date cannot be after To date.";
        render();
        return;
      }

      usagePeriod = "custom";
      usageLoading = true;
      usageError = "";
      render();

      try {
        await loadUsageSummary();
        showCustomRange = true;
      } catch (error) {
        if (error.status === 401) {
          onUnauthorized?.();
          return;
        }
        usageError = error.message;
      } finally {
        usageLoading = false;
        render();
      }
    });

    // Top actions: editor sections are not rendered until the user asks for them.
    container.querySelector("[data-open-new]").addEventListener("click", () => {
      newDraft = buildNewBalanceDraft(overview);
      newEntryDate = localIsoDate();
      activeEditor = "new";
      render();
      document.getElementById("new-balance-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    container.querySelector("[data-open-add]").addEventListener("click", () => {
      addDraft = buildAddBalanceDraft(overview);
      addEntryDate = localIsoDate();
      activeEditor = "add";
      render();
      document.getElementById("add-balance-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    container.querySelectorAll("[data-close-editor]").forEach((button) => {
      button.addEventListener("click", () => {
        activeEditor = null;
        render();
      });
    });

    // New Balance editor.
    if (activeEditor === "new") {
      const usagePanel = container.querySelector("[data-usage-panel]");
      const errorEl = container.querySelector("[data-save-error]");
      const dateInput = container.querySelector("#new-entry-date");

      dateInput.addEventListener("change", () => { newEntryDate = dateInput.value; });

      attachBalanceDraftListeners(container, overview.providers, newDraft, () => {
        usagePanel.innerHTML = usagePanelHtml(overview.providers, newDraft);
        errorEl.textContent = "";
      });

      container.querySelector("[data-reset-new]").addEventListener("click", () => {
        newDraft = buildNewBalanceDraft(overview);
        newEntryDate = localIsoDate();
        render();
        document.getElementById("new-balance-section")?.scrollIntoView({ block: "start" });
      });

      container.querySelector("[data-save-history]").addEventListener("click", async (event) => {
        const validationError = validateBalanceDraft(overview.providers, newDraft);
        if (validationError) {
          errorEl.textContent = validationError;
          return;
        }

        const button = event.currentTarget;
        button.disabled = true;
        errorEl.textContent = "";
        try {
          await api.createHistory({
            entry_date: newEntryDate,
            values: draftPayload(newDraft),
          });
          showToast("Balance entry saved to history.", "success");
          historyPage = 1;
          await refreshPage({ resetDrafts: true });
        } catch (error) {
          if (error.status === 401) {
            onUnauthorized?.();
            return;
          }
          errorEl.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });
    }

    // Add Balance editor.
    if (activeEditor === "add") {
      const summary = container.querySelector("[data-add-summary]");
      const errorEl = container.querySelector("[data-add-error]");
      const dateInput = container.querySelector("#add-entry-date");

      dateInput.addEventListener("change", () => { addEntryDate = dateInput.value; });

      attachAddBalanceListeners(container, overview.providers, addDraft, () => {
        summary.innerHTML = addBalanceSummaryHtml(overview.providers, addDraft);
        errorEl.textContent = "";
      });

      container.querySelector("[data-save-added-balance]").addEventListener("click", async (event) => {
        const hasPositiveAmount = Object.values(addDraft).some((row) => numberValue(row.add) > 0);
        if (!hasPositiveAmount) {
          errorEl.textContent = "Enter an amount greater than 0 for at least one API key.";
          return;
        }

        const hasNegativeAmount = Object.values(addDraft).some((row) => numberValue(row.add) < 0);
        if (hasNegativeAmount) {
          errorEl.textContent = "Added balance cannot be negative.";
          return;
        }

        const button = event.currentTarget;
        button.disabled = true;
        errorEl.textContent = "";
        try {
          await api.addBalances({
            entry_date: addEntryDate,
            additions: additionsPayload(addDraft),
          });
          showToast("Added balance saved. Current totals were updated.", "success");
          historyPage = 1;
          await refreshPage({ resetDrafts: true });
        } catch (error) {
          if (error.status === 401) {
            onUnauthorized?.();
            return;
          }
          errorEl.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });
    }

    // History edit/delete actions.
    container.querySelectorAll("[data-edit-entry]").forEach((button) => {
      button.addEventListener("click", () => showEditModal(Number(button.dataset.editEntry), overview, refreshPage));
    });

    container.querySelectorAll("[data-delete-entry]").forEach((button) => {
      button.addEventListener("click", () => {
        showDeleteModal(Number(button.dataset.deleteEntry), button.dataset.entryDate, refreshPage);
      });
    });

    // Pagination.
    container.querySelectorAll("[data-history-page]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        historyPage = Number(button.dataset.historyPage) || 1;
        await refreshPage();
        container.querySelector(".section-card:last-child")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    container.querySelector("[data-history-page-size]")?.addEventListener("change", async (event) => {
      pageSize = Number(event.target.value) || 5;
      historyPage = 1;
      await refreshPage();
    });
  };

  newDraft = buildNewBalanceDraft(overview);
  addDraft = buildAddBalanceDraft(overview);
  render();
}
