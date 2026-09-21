import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f6f8",
          100: "#d9dee6",
          400: "#8b95a7",
          700: "#2a3140",
          800: "#161b24",
          900: "#0b0d12",
        },
        accent: {
          DEFAULT: "#c8f542",
          dim: "#9bc22c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
