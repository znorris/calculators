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
      },
    },
  },
});
