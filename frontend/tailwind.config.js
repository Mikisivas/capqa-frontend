/** @type {import('tailwindcss').Config} */
// Tokens mirror src/styles/capqa.css (the design source of truth).
// Swap the brand colour by editing the brand ramp here and in capqa.css (:root --brand-*).
export default {
  content: ["./index.html", "./src/**/*.ts"],
  corePlugins: { preflight: false }, // capqa.css carries its own base styles
  theme: {
    extend: {
      colors: {
        brand: { 50: "#effaf2", 100: "#d7f2df", 200: "#b0e4c0", 300: "#7dce98", 400: "#48b06d", 500: "#25904f", 600: "#1a763f", 700: "#166534", 800: "#134f2b", 900: "#0f3d22" },
        gold: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 600: "#d97706", 700: "#b45309", 800: "#92400e" },
        success: { 50: "#ecfdf3", 200: "#abefc6", 600: "#16a34a", 700: "#15703c" },
        warning: { 50: "#fffaeb", 200: "#fedf89", 600: "#d97706", 800: "#93370d" },
        danger: { 50: "#fef3f2", 200: "#fecdca", 600: "#dc2626", 700: "#b42318" },
        info: { 50: "#eff6ff", 200: "#bfdbfe", 600: "#2563eb", 700: "#1d4ed8" },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { sm: "6px", DEFAULT: "8px", lg: "12px" },
      boxShadow: {
        sm: "0 1px 2px rgba(15,23,42,.06)",
        md: "0 4px 12px -2px rgba(15,23,42,.10),0 2px 4px -2px rgba(15,23,42,.06)",
        lg: "0 24px 48px -12px rgba(15,23,42,.28)",
      },
    },
  },
  plugins: [],
};
