import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/js/**/*.test.js"],
        environment: "node",  // each test builds its own jsdom window
        coverage: {
            provider: "v8",
            include: ["src/textileplatform/static/js/**/*.js"],
            reporter: ["text", "html"],
            reportsDirectory: "coverage/js",
        },
    },
});
