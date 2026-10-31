// ESLint for the editors' JavaScript and the JS tests.
//
// The editors are ES modules under static/js/<area>/ (ui, weave, bead):
// every name comes from an import, so no-undef catches typos and
// missing imports (no-restricted-globals does it for the names our
// modules share with DOM built-ins). static/js/*.js are the few
// remaining classic page scripts (confirm.js, loaded on every page).

import js from "@eslint/js";
import globals from "globals";

const STATIC_JS = "src/textileplatform/static/js";

export default [
    { ignores: ["node_modules/", "coverage/", "venv/", "dist/", "build/",
                "docs/", "htmlcov/"] },
    js.configs.recommended,
    {
        files: [`${STATIC_JS}/*.js`],
        languageOptions: {
            sourceType: "script",
            ecmaVersion: 2022,
            globals: globals.browser,
        },
    },
    {
        files: [`${STATIC_JS}/*/**/*.js`],
        languageOptions: {
            sourceType: "module",
            ecmaVersion: 2022,
            globals: globals.browser,
        },
        rules: {
            // Interface-style methods keep their full parameter lists.
            "no-unused-vars": ["error", { args: "none" }],
            // Our ui/selection.js classes share these names with DOM
            // built-ins, so a missing import would silently use the
            // browser's class: require the import.
            "no-restricted-globals": ["error",
                { name: "Selection", message: "Import it from ui/selection.js." },
                { name: "Clipboard", message: "Import it from ui/selection.js." }],
        },
    },
    {
        // `Selection` / `Clipboard` deliberately shadow the DOM's
        // built-ins of the same name.
        files: [`${STATIC_JS}/ui/selection.js`],
        rules: { "no-redeclare": ["error", { builtinGlobals: false }] },
    },
    {
        files: ["tests/js/**/*.js", "*.config.js"],
        languageOptions: {
            sourceType: "module",
            ecmaVersion: 2024,
            globals: globals.node,
        },
    },
];
