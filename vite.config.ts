import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    // Retained React scene and editor sources are outside the native project's checks.
    ignorePatterns: ["src/**/*.tsx", "src/hooks/**", "src/dev/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  build: {
    chunkSizeWarningLimit: 4200,
  },
});
