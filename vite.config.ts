import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import netlify from "@netlify/vite-plugin-tanstack-start";

export default defineConfig({
  preset: "netlify",
  vite: {
    plugins: [netlify()]
  }
});
