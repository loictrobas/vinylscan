import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy aliases kept for backwards compat
        vinyl: {
          black:  "#07070a",
          dark:   "#0d0d12",
          card:   "#131318",
          border: "#1e1e26",
          accent: "#9db4c6",
          gold:   "#c4a564",
          muted:  "#52525f",
          text:   "#e2e2ea",
        },
        // Design system — all backed by CSS vars for light/dark switching
        vs: {
          bg:              "rgb(var(--vs-bg) / <alpha-value>)",
          surface:         "rgb(var(--vs-surface) / <alpha-value>)",
          card:            "rgb(var(--vs-card) / <alpha-value>)",
          raised:          "rgb(var(--vs-raised) / <alpha-value>)",
          border:          "rgb(var(--vs-border) / <alpha-value>)",
          "border-2":      "rgb(var(--vs-border-2) / <alpha-value>)",
          accent:          "rgb(var(--vs-accent) / <alpha-value>)",
          "accent-dim":    "rgb(var(--vs-accent-dim) / <alpha-value>)",
          "accent-bright": "rgb(var(--vs-accent-bright) / <alpha-value>)",
          text:            "rgb(var(--vs-text) / <alpha-value>)",
          "text-2":        "rgb(var(--vs-text-2) / <alpha-value>)",
          muted:           "rgb(var(--vs-muted) / <alpha-value>)",
          gold:            "rgb(var(--vs-gold) / <alpha-value>)",
          success:         "rgb(var(--vs-success) / <alpha-value>)",
          danger:          "rgb(var(--vs-danger) / <alpha-value>)",
          warning:         "rgb(var(--vs-warning) / <alpha-value>)",
          teal:            "rgb(var(--vs-teal) / <alpha-value>)",
          sidebar:         "rgb(var(--vs-sidebar) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
