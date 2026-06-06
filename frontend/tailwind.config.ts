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
        // Legacy aliases for existing pages
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
        // New design system
        vs: {
          bg:              "#07070a",
          surface:         "#0d0d12",
          card:            "#131318",
          raised:          "#18181e",
          border:          "#1e1e26",
          "border-2":      "#282832",
          accent:          "#9db4c6",
          "accent-dim":    "#6e8a9e",
          "accent-bright": "#c2d6e6",
          text:            "#e2e2ea",
          "text-2":        "#8e8e9e",
          muted:           "#52525f",
          gold:            "#c4a564",
          success:         "#4ade80",
          danger:          "#f87171",
          warning:         "#f59e0b",
          teal:            "#5eead4",
          sidebar:         "#09090e",
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
