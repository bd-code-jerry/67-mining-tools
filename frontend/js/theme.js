const THEME_STORAGE_KEY = "bd-dashboard-theme";

function getStorage() {
  try {
    return globalThis.localStorage;
  } catch (_) {
    return null;
  }
}

function applyTheme(root, theme) {
  root.dataset.theme = theme;
  if (root.style) root.style.colorScheme = theme;
}

export function initializeTheme({ root = globalThis.document?.documentElement, storage = getStorage() } = {}) {
  if (!root) throw new Error("A document root is required to initialize the theme.");

  let theme = "light";
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") theme = saved;
  } catch (_) {
    // Keep the default light theme when browser storage is unavailable.
  }

  applyTheme(root, theme);
  return theme;
}

export function toggleTheme({ root = globalThis.document?.documentElement, storage = getStorage() } = {}) {
  if (!root) throw new Error("A document root is required to toggle the theme.");

  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(root, theme);
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {
    // The current page still changes theme if browser storage is unavailable.
  }
  return theme;
}

export function syncThemeButtons(scope = globalThis.document, root = globalThis.document?.documentElement) {
  if (!scope?.querySelectorAll) return;
  const dark = root?.dataset.theme === "dark";
  for (const button of scope.querySelectorAll("[data-theme-toggle]")) {
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
    const label = button.querySelector("[data-theme-label]");
    if (label) label.textContent = `${dark ? "Light" : "Dark"} mode`;
    const icon = button.querySelector("[data-theme-icon]");
    if (icon) icon.textContent = dark ? "☀" : "☾";
  }
}

export function bindThemeToggleEvents({
  container = globalThis.document,
  root = globalThis.document?.documentElement,
  storage = getStorage(),
} = {}) {
  if (!container?.addEventListener) return;
  container.addEventListener("click", (event) => {
    if (!event.target?.closest?.("[data-theme-toggle]")) return;
    toggleTheme({ root, storage });
    syncThemeButtons(container, root);
  });
}
