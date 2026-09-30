import { escapeHtml } from "../utils/format.js";

export function sidebarHtml(activeRoute, user) {
  return `
    <aside class="sidebar">
      <div class="brand">RSG</div>
      <nav class="nav">
        <a class="nav-link ${activeRoute === "dashboard" ? "active" : ""}" href="#/dashboard">
          <span class="nav-icon">⌂</span><span>Dashboard</span>
        </a>
        <a class="nav-link ${activeRoute === "api-balances" ? "active" : ""}" href="#/api-balances">
          <span class="nav-icon">⚿</span><span>API keys balances</span>
        </a>
      </nav>
      <div class="sidebar-user">
        <div class="sidebar-user-name">${escapeHtml(user?.username || "")}</div>
        <button class="sidebar-logout" type="button" data-logout>Sign out</button>
      </div>
    </aside>
  `;
}
