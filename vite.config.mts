import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  root: "src",
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true },
  server: { host: "127.0.0.1" },
});
