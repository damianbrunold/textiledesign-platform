import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/js/**/*.test.js"],
        // Plain Node; a test file that needs a DOM opts in with a
        // `// @vitest-environment jsdom` comment.
        environment: "node",
        coverage: {
            provider: "v8",
            include: ["src/textileplatform/static/js/**/*.js"],
            reporter: ["text", "html"],
            reportsDirectory: "coverage/js",
        },
    },
});
