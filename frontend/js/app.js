import { api } from "./api/client.js";
import { sidebarHtml } from "./components/sidebar.js";
import { showToast } from "./components/toast.js";
import { renderApiBalancesPage } from "./pages/apiBalancesPage.js";
import { renderDashboardPage } from "./pages/dashboardPage.js";
import { renderLoginPage } from "./pages/loginPage.js";
import { renderRegisterPage } from "./pages/registerPage.js";
import { bindThemeToggleEvents, initializeTheme, syncThemeButtons } from "./theme.js";

const app = document.getElementById("app");
const state = { user: null, bootstrapped: false };

initializeTheme();
bindThemeToggleEvents();

function routeName() {
  const hash = window.location.hash || "#/dashboard";
  return hash.replace(/^#\//, "").split("?")[0] || "dashboard";
}

function go(route) {
  const target = `#/${route}`;
  if (window.location.hash === target) {
    renderRoute();
  } else {
    window.location.hash = target;
  }
}

async function bootstrapAuth() {
  try {
    const result = await api.me();
    state.user = result.user;
  } catch (error) {
    if (error.status !== 401) showToast(error.message, "error");
    state.user = null;
  } finally {
    state.bootstrapped = true;
  }
}

function protectedShell(activeRoute) {
  app.innerHTML = `
    <div class="app-shell">
      ${sidebarHtml(activeRoute, state.user)}
      <main class="main" id="page-root"></main>
    </div>
  `;
  syncThemeButtons(app);

  app.querySelector("[data-logout]")?.addEventListener("click", async () => {
    try { await api.logout(); } catch (_) {}
    state.user = null;
    go("login");
  });

  return document.getElementById("page-root");
}

async function renderRoute() {
  if (!state.bootstrapped) return;
  const route = routeName();

  if (route === "login") {
    if (state.user) return go("dashboard");
    renderLoginPage(app, {
      onSignedIn: (user) => {
        state.user = user;
        go("dashboard");
      },
    });
    syncThemeButtons(app);
    return;
  }

  if (route === "register") {
    if (state.user) return go("dashboard");
    await renderRegisterPage(app, {
      onSignedIn: (user) => {
        state.user = user;
        go("dashboard");
      },
    });
    syncThemeButtons(app);
    return;
  }

  if (!state.user) {
    return go("login");
  }

  const normalized = route === "api-balances" ? "api-balances" : "dashboard";
  const pageRoot = protectedShell(normalized);
  const onUnauthorized = () => {
    state.user = null;
    go("login");
  };

  if (normalized === "api-balances") {
    await renderApiBalancesPage(pageRoot, { onUnauthorized });
  } else {
    renderDashboardPage(pageRoot);
  }
}

window.addEventListener("hashchange", renderRoute);

(async function start() {
  await bootstrapAuth();
  if (!window.location.hash) {
    window.location.hash = state.user ? "#/dashboard" : "#/login";
  } else {
    await renderRoute();
  }
})();
