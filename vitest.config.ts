// Configuración de Vitest: tests de la lógica pura en tests/*.test.ts.
// El alias "@/" replica el paths de tsconfig para importar lib/ y data/.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
