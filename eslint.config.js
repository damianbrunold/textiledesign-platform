// ESLint for the editors' classic scripts and the JS tests.
//
// static/js/*.js are plain <script>s sharing one global scope: a
// top-level declaration in one file is used by the files loaded after
// it. Each file therefore sees the other files' top-level names as
// globals, which keeps no-undef useful for real typos.

import fs from "node:fs";
import path from "node:path";
import js from "@eslint/js";
import globals from "globals";

const STATIC_JS = "src/textileplatform/static/js";

function topLevelNames(file) {
    const src = fs.readFileSync(file, "utf8");
    const re = /^(?:const|let|var|class|function\*?|async function)\s+([A-Za-z_$][\w$]*)/gm;
    const names = [...src.matchAll(re)].map((m) => m[1]);
    // window.foo = ... assignments are globals too
    for (const m of src.matchAll(/^window\.([A-Za-z_$][\w$]*)\s*=/gm)) {
        names.push(m[1]);
    }
    return names;
}

const files = fs.readdirSync(STATIC_JS).filter((f) => f.endsWith(".js"));
const declared = Object.fromEntries(
    files.map((f) => [f, topLevelNames(path.join(STATIC_JS, f))]));

// ES modules live in subdirectories (static/js/weave/, ...). Bridge
// modules (globals.js) put some of their classes on `window` for the
// classic scripts: `Object.assign(target, { A, B })`.
function bridgedNames() {
    const names = [];
    for (const entry of fs.readdirSync(STATIC_JS, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const bridge = path.join(STATIC_JS, entry.name, "globals.js");
        if (!fs.existsSync(bridge)) continue;
        const src = fs.readFileSync(bridge, "utf8");
        for (const m of src.matchAll(/Object\.assign\(\s*\w+,\s*\{([^}]*)\}/g)) {
            names.push(...m[1].split(",").map((s) => s.trim()).filter(Boolean));
        }
    }
    return names;
}

const bridged = bridgedNames();

function sharedGlobalsFor(file) {
    const own = new Set(declared[file]);
    const out = {};
    for (const [other, names] of Object.entries(declared)) {
        if (other === file) continue;
        for (const n of names) if (!own.has(n)) out[n] = "writable";
    }
    for (const n of bridged) if (!own.has(n)) out[n] = "readonly";
    return out;
}

export default [
    { ignores: ["node_modules/", "coverage/", "venv/", "dist/", "build/",
                "docs/", "htmlcov/"] },
    js.configs.recommended,
    ...files.map((f) => ({
        files: [`${STATIC_JS}/${f}`],
        languageOptions: {
            sourceType: "script",
            ecmaVersion: 2022,
            globals: { ...globals.browser, ...sharedGlobalsFor(f) },
        },
        rules: {
            // Top-level names are used by the other scripts.
            "no-unused-vars": ["error", {
                vars: "local", args: "none", caughtErrors: "none",
            }],
        },
    })),
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
        },
    },
    {
        // `Selection` / `Clipboard` deliberately shadow the DOM's
        // built-ins of the same name.
        files: [`${STATIC_JS}/selection.js`],
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
