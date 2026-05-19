import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        "bg-elev": "#131316",
        "bg-elev-2": "#1c1c20",
        "bg-elev-3": "#26262c",
        border: "rgba(255,255,255,0.08)",
        "border-strong": "rgba(255,255,255,0.16)",
        text: "#fafafa",
        "text-muted": "#9a9aa3",
        "text-dim": "#6b6b73",
        accent: "#ff3b30",
        "accent-2": "#14b8a6",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#60a5fa",
        brand: {
          purple: "#a855f7",
          pink: "#ec4899",
        },
      },
      fontFamily: {
        display: ["'Bebas Neue'", "sans-serif"],
        sans: [
          "'Poppins'",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px",
        lg: "16px",
        xl: "20px",
      },
      boxShadow: {
        float: "0 8px 24px rgba(0,0,0,0.4)",
        modal: "0 12px 32px rgba(0,0,0,0.5)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
