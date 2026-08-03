import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/calculators/",
  build: {
    rolldownOptions: {
      input: {
        main: "index.html",
        "mortgage-strategy-comparison": "mortgage-strategy-comparison/index.html",
        "home-purchase-comparison": "home-purchase-comparison/index.html",
        "compensation-comparison": "compensation-comparison/index.html",
        "compensation-assumptions": "compensation-comparison/assumptions/index.html",
        "energy-system-comparison": "energy-system-comparison/index.html",
        "energy-assumptions": "energy-system-comparison/assumptions/index.html",
      },
    },
  },
});
