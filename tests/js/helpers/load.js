// Loads the editors' classic scripts (static/js/*.js) into a fresh jsdom
// window the way the editor templates do: in order, as scripts sharing
// one global scope, so top-level `let` / `const` / `class` declarations
// of one file are visible to the next. Nothing in static/js is changed
// for testing.
//
//   const win = loadScripts(["commands.js"]);
//   const bus = win.run("new CommandBus()");
//
//   const ed = loadEditor("dbweave");   // every script of the template
//
// Top-level `let` / `const` / `class` bindings live in the global
// lexical scope, not on `window`, so tests reach them through
// `win.run(expression)`; `win.window` / `win.document` are the jsdom
// objects themselves.
//
// `load` / `DOMContentLoaded` listeners (the editors' startup) are held
// back; `win.fireLoad()` runs them once a test has set up the page.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.resolve(here, "../../../src/textileplatform");
export const STATIC_JS = path.join(PACKAGE, "static/js");

const compiled = new Map();

function script(name) {
    let s = compiled.get(name);
    if (!s) {
        const file = path.join(STATIC_JS, name);
        // The file URL lets V8 coverage attribute the code to the file.
        s = new vm.Script(fs.readFileSync(file, "utf8"), {
            filename: pathToFileURL(file).href,
        });
        compiled.set(name, s);
    }
    return s;
}

// The scripts an editor template includes, in order.
export function templateScripts(editor) {
    const html = fs.readFileSync(
        path.join(PACKAGE, `templates/edit_${editor}_pattern.html`), "utf8");
    const re = /url_for\('static',\s*filename='js\/([^']+\.js)'\)/g;
    return [...html.matchAll(re)].map((m) => m[1]);
}

const DEFERRED_EVENTS = new Set(["load", "DOMContentLoaded"]);

export function loadScripts(names, { html = "", url, setup } = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
        runScripts: "outside-only",
        pretendToBeVisual: true,
        url: url || "https://textile.test/",
    });
    const { window } = dom;
    const context = dom.getInternalVMContext();
    const run = (code) => vm.runInContext(code, context);

    const deferred = [];
    const addEventListener = window.addEventListener.bind(window);
    window.addEventListener = (type, fn, opts) => {
        if (DEFERRED_EVENTS.has(type)) deferred.push([type, fn]);
        else addEventListener(type, fn, opts);
    };
    const fireLoad = () => {
        window.addEventListener = addEventListener;
        for (const type of ["DOMContentLoaded", "load"]) {
            for (const [t, fn] of deferred) {
                if (t === type) fn.call(window, new window.Event(type));
            }
        }
    };

    if (setup) setup(window, run);
    for (const name of names) script(name).runInContext(context);
    return { dom, window, document: window.document, run, fireLoad };
}

// The ES modules an editor template loads (module_url('...')).
export function templateModules(editor) {
    const html = fs.readFileSync(
        path.join(PACKAGE, `templates/edit_${editor}_pattern.html`), "utf8");
    const re = /module_url\('([^']+\.js)'\)/g;
    return [...html.matchAll(re)].map((m) => m[1]);
}

// Every script and module of the editor template. The bridge modules
// (weave/globals.js, ...) export install(window); here they install
// into the jsdom window, as they do into the browser's.
export async function loadEditor(editor, options = {}) {
    const modules = await Promise.all(templateModules(editor).map(
        (name) => import(pathToFileURL(path.join(STATIC_JS, name)).href)));
    return loadScripts(templateScripts(editor), {
        ...options,
        setup(window, run) {
            for (const mod of modules) {
                if (typeof mod.install === "function") mod.install(window);
            }
            if (options.setup) options.setup(window, run);
        },
    });
}
