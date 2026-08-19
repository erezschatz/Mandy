const ThemeManager = (function () {
  const STORAGE_KEY = "marky-theme";
  const THEME_ATTR = "data-theme";
  const LIGHT = "light";
  const DARK = "dark";

  let systemMediaQuery = null;

  function getSystemPreference() {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return DARK;
    }
    return LIGHT;
  }

  function hasExplicitPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch (e) {
      return false;
    }
  }

  function getCurrentTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === LIGHT || stored === DARK) {
        return stored;
      }
    } catch (e) {
      // localStorage unavailable
    }
    return getSystemPreference();
  }

  function applyTheme(theme) {
    if (theme !== LIGHT && theme !== DARK) {
      theme = LIGHT;
    }
    document.documentElement.setAttribute(THEME_ATTR, theme);
  }

  function setTheme(theme) {
    if (theme !== LIGHT && theme !== DARK) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // localStorage unavailable, continue anyway
    }
    applyTheme(theme);
    updateToggleButton(theme);
  }

  function toggle() {
    const current = getCurrentTheme();
    const newTheme = current === LIGHT ? DARK : LIGHT;
    setTheme(newTheme);
    // Re-render mermaid diagrams with new theme
    if (typeof reRenderMermaidWithTheme === "function") {
      reRenderMermaidWithTheme(newTheme);
    }
  }

  function updateToggleButton(theme) {
    const toggle = document.getElementById("themeToggle");
    if (!toggle) return;

    toggle.setAttribute("data-theme", theme);
    toggle.setAttribute(
      "aria-checked",
      theme === DARK ? "true" : "false"
    );

    if (theme === DARK) {
      toggle.setAttribute("aria-label", "Switch to light mode");
    } else {
      toggle.setAttribute("aria-label", "Switch to dark mode");
    }
  }

  function watchSystemChanges() {
    if (!window.matchMedia) return;

    systemMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handler = (e) => {
      if (!hasExplicitPreference()) {
        const newTheme = e.matches ? DARK : LIGHT;
        applyTheme(newTheme);
        updateToggleButton(newTheme);
      }
    };

    if (systemMediaQuery.addEventListener) {
      systemMediaQuery.addEventListener("change", handler);
    } else if (systemMediaQuery.addListener) {
      systemMediaQuery.addListener(handler);
    }
  }

  function init() {
    const theme = getCurrentTheme();
    applyTheme(theme);
    updateToggleButton(theme);
    watchSystemChanges();

    const toggleButton = document.getElementById("themeToggle");
    if (toggleButton) {
      toggleButton.addEventListener("click", toggle);
      toggleButton.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    }
  }

  // Everything else in here is internal; only these two are ever called
  // from outside the module.
  return { init, toggle };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ThemeManager.init);
} else {
  ThemeManager.init();
}
