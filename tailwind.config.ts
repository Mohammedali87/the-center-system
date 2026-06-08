import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101218",
        muted: "#667085",
        line: "#e7e9ee",
        panel: "#fbfcfd",
        brand: "#2563eb",
        success: "#16845b",
        warning: "#b56a04",
        danger: "#c93737"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(16, 18, 24, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
