export type ThemeOption = { id: string; label: string };

export type ThemeSpec = ThemeOption & {
  group: "dark" | "light";
  swatches: string[]; // preview swatches (bg + semantic colors)
};

export const THEME_SPECS: ThemeSpec[] = [
  // Dark (grouped by similarity)
  { id: "dark", label: "Dark (Abstract)", group: "dark", swatches: ["#1a1a2e", "#16213e", "#0f3460", "#e94560", "#60a5fa", "#27ae60"] },

  { id: "catppuccin-mocha", label: "Catppuccin Mocha", group: "dark", swatches: ["#1e1e2e", "#181825", "#313244", "#cba6f7", "#89b4fa", "#a6e3a1"] },
  { id: "catppuccin-macchiato", label: "Catppuccin Macchiato", group: "dark", swatches: ["#24273a", "#1e2030", "#363a4f", "#c6a0f6", "#8aadf4", "#a6da95"] },
  { id: "catppuccin-frappe", label: "Catppuccin Frappe", group: "dark", swatches: ["#303446", "#292c3c", "#414559", "#ca9ee6", "#8caaee", "#a6d189"] },

  { id: "rose-pine", label: "Rose Pine", group: "dark", swatches: ["#191724", "#1f1d2e", "#26233a", "#c4a7e7", "#31748f", "#9ccfd8"] },
  { id: "rose-pine-moon", label: "Rose Pine Moon", group: "dark", swatches: ["#232136", "#2a273f", "#393552", "#c4a7e7", "#3e8fb0", "#9ccfd8"] },

  { id: "tokyo-night", label: "Tokyo Night", group: "dark", swatches: ["#1a1b26", "#24283b", "#414868", "#7aa2f7", "#2ac3de", "#9ece6a"] },
  { id: "nord", label: "Nord", group: "dark", swatches: ["#2e3440", "#3b4252", "#434c5e", "#88c0d0", "#5e81ac", "#a3be8c"] },
  { id: "one-dark", label: "One Dark", group: "dark", swatches: ["#282c34", "#21252b", "#3a3f4b", "#61afef", "#c678dd", "#98c379"] },

  { id: "dracula", label: "Dracula", group: "dark", swatches: ["#282a36", "#343746", "#44475a", "#ff79c6", "#8be9fd", "#50fa7b"] },
  { id: "monokai", label: "Monokai", group: "dark", swatches: ["#272822", "#2d2e27", "#3e3d32", "#66d9ef", "#a1efe4", "#a6e22e"] },
  { id: "gruvbox", label: "Gruvbox", group: "dark", swatches: ["#282828", "#3c3836", "#504945", "#fe8019", "#83a598", "#b8bb26"] },
  { id: "solarized-dark", label: "Solarized Dark", group: "dark", swatches: ["#002b36", "#073642", "#0b4b5a", "#268bd2", "#2aa198", "#859900"] },
  { id: "everforest-dark", label: "Everforest Dark", group: "dark", swatches: ["#2b3339", "#323c41", "#3a464c", "#a7c080", "#7fbbb3", "#a7c080"] },

  // Light (grouped by similarity)
  { id: "catppuccin-latte", label: "Catppuccin Latte", group: "light", swatches: ["#eff1f5", "#e6e9ef", "#ccd0da", "#8839ef", "#1e66f5", "#40a02b"] },
  { id: "rose-pine-dawn", label: "Rose Pine Dawn", group: "light", swatches: ["#faf4ed", "#fffaf3", "#f2e9e1", "#907aa9", "#56949f", "#286983"] },
  { id: "one-light", label: "One Light", group: "light", swatches: ["#fafafa", "#ffffff", "#e5e5e6", "#4078f2", "#a626a4", "#50a14f"] },
  { id: "everforest-light", label: "Everforest Light", group: "light", swatches: ["#fdf6e3", "#fffbef", "#e8e0cc", "#4f8f5a", "#3a94c5", "#4f8f5a"] },
  { id: "solarized-light", label: "Solarized Light", group: "light", swatches: ["#fdf6e3", "#eee8d5", "#e3ddc9", "#268bd2", "#2aa198", "#859900"] },
  { id: "light", label: "Light", group: "light", swatches: ["#f7f7fb", "#ffffff", "#e6e8f0", "#e94560", "#2563eb", "#16a34a"] },
];

export const THEMES: ThemeOption[] = THEME_SPECS.map((t) => ({ id: t.id, label: t.label }));

export function getThemeSpec(theme_id: string): ThemeSpec | undefined {
  const id = String(theme_id || "").trim();
  return THEME_SPECS.find((t) => t.id === id);
}

export function themeClassName(theme_id: string): string {
  const id = String(theme_id || "").trim() || "dark";
  return `theme-${id}`;
}

export function applyTheme(theme_id: string): void {
  try {
    const root = document.documentElement;
    const current = Array.from(root.classList).filter((c) => c.startsWith("theme-"));
    for (const c of current) root.classList.remove(c);
    root.classList.add(themeClassName(theme_id));
  } catch {
    // ignore
  }
}
