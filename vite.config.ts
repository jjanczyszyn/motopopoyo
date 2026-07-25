// vitest/config re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Custom domain (moto.popoyo.co) serves from root. Override via
  // VITE_BASE if you need to deploy under the github.io project subpath
  // (e.g. VITE_BASE=/moto-rental-1/).
  base: process.env.VITE_BASE ?? "/",
  server: { port: 5173, host: true },
  test: {
    // e2e/ is Playwright's; fixtures/ is the slow OCR accuracy harness
    // (`npm run test:ocr`); tests-local/ is gitignored private fixtures.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "e2e/**",
      "fixtures/**",
      "tests-local/**",
    ],
  },
});
