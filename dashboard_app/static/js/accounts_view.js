import { $, escapeHtml } from "./dom.js";

let _currentFilter = "all";

export function getCurrentFilter() {
  return _currentFilter;
}

export function setCurrentFilter(filter) {
  _currentFilter = filter;
}

export function renderAccounts(state, onSelect) {
  const box = $("account-list");
  const keyword = $("search-input").value.trim().toLowerCase();
  const accounts = state.accounts.filter((item) => {
    if (keyword && !item.email.toLowerCase().includes(keyword)) return false;
    switch (_currentFilter) {
      case "error":
        return !!item.last_error;
      case "no_history":
        return item.no_history && !item.last_error;
      case "cached":
        return item.cached && !item.no_history;
      case "has_mail":
        return (item.last_message_count || 0) > 0;
      default:
        return true;
    }
  });

  // Update filter chip counts
  updateFilterCounts(state);

  // Update account count display
  const totalFiltered = accounts.length;
  const totalAll = state.accounts.filter(a => !keyword || a.email.toLowerCase().includes(keyword)).length;
  if (keyword || _currentFilter !== "all") {
    $("account-sub").textContent = `${totalFiltered} / ${state.accounts.length} 个账号`;
  } else {
    $("account-sub").textContent = `${state.accounts.length} 个账号`;
  }

  if (!accounts.length) {
    box.innerHTML = `<div class="empty">没有匹配的邮箱</div>`;
    return;
  }

  box.innerHTML = "";
  for (const account of accounts) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `account-item ${account.id === state.selectedId ? "active" : ""}`;

    // Status pills
    const pills = [];
    if (account.last_error) {
      pills.push(`<span class="pill fail" title="${escapeHtml(account.last_error)}">异常</span>`);
    }
    if (account.no_history) {
      pills.push(`<span class="pill dim">无历史</span>`);
    } else if (account.cached) {
      const count = account.last_message_count || 0;
      pills.push(`<span class="pill ok">${count} 封</span>`);
    } else if (!account.last_error) {
      pills.push(`<span class="pill">待扫描</span>`);
    }
    if (!account.has_source) {
      pills.push(`<span class="pill fail">缺链接</span>`);
    }

    item.innerHTML = `
      <div class="account-main">
        <div class="account-email" title="${escapeHtml(account.email)}">${escapeHtml(account.email)}</div>
      </div>
      <div class="account-meta">${pills.join("")}</div>
    `;
    item.addEventListener("click", () => onSelect(account.id));
    box.appendChild(item);
  }
}

function updateFilterCounts(state) {
  const chips = document.querySelectorAll("#filter-chips .chip");
  if (!chips.length) return;

  const counts = { all: 0, error: 0, no_history: 0, cached: 0, has_mail: 0 };
  const keyword = $("search-input").value.trim().toLowerCase();
  const filtered = keyword
    ? state.accounts.filter(a => a.email.toLowerCase().includes(keyword))
    : state.accounts;

  for (const a of filtered) {
    counts.all++;
    if (a.last_error) counts.error++;
    if (a.no_history && !a.last_error) counts.no_history++;
    if (a.cached && !a.no_history) counts.cached++;
    if ((a.last_message_count || 0) > 0) counts.has_mail++;
  }

  for (const chip of chips) {
    const filter = chip.dataset.filter;
    const count = counts[filter] || 0;
    let label = chip.textContent.replace(/\s*\d+$/, "");
    chip.textContent = `${label} ${count}`;
  }
}

export function updateStats(stats) {
  $("s-total").textContent = stats.total || 0;
  $("s-source").textContent = stats.with_source || 0;
  $("s-cached").textContent = stats.cached || 0;
  $("s-mails").textContent = stats.messages || 0;
  $("s-errors").textContent = stats.errors || 0;
}
