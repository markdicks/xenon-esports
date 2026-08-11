import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        carbon: "#090a0f",
        volt: "#d8ff3d",
        ion: "#4fffd8",
        steel: "#aeb7c7",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "var(--font-inter)", "sans-serif"],
      },
      boxShadow: {
        signal: "0 0 48px rgba(79, 255, 216, 0.18)",
        volt: "0 0 42px rgba(216, 255, 61, 0.16)",
      },
      backgroundImage: {
        grid:
          "linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
