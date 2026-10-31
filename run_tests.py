"""Run every check locally: lint and tests, Python and JavaScript.

    python run_tests.py            everything (lint, pytest incl. browser
                                   tests, vitest)
    python run_tests.py --fast     skip the browser (e2e) tests
    python run_tests.py --cov      with coverage reports (htmlcov/,
                                   coverage/js/)
    python run_tests.py py         only the Python checks
    python run_tests.py js         only the JavaScript checks

Run it with the project's virtualenv Python (it uses the interpreter it
was started with for ruff and pytest). Node.js must be installed and
`npm install` done once; on Windows a Node.js in "C:\\Program Files\\nodejs"
is found even when it is not on the PATH. Extra pytest arguments go
after `--`, e.g. `python run_tests.py py -- -k drafts -x`.
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def find_node():
    node = shutil.which("node")
    if node:
        return node
    candidate = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"),
                     "nodejs", "node.exe")
    return str(candidate) if candidate.exists() else None


def main():
    parser = argparse.ArgumentParser(
        description="Run lint and tests (Python and JavaScript).")
    parser.add_argument("only", nargs="?", choices=["py", "js"],
                        help="run only the Python or JavaScript checks")
    parser.add_argument("--fast", action="store_true",
                        help="skip the browser (e2e) tests")
    parser.add_argument("--cov", action="store_true",
                        help="collect coverage")
    args, pytest_extra = parser.parse_known_args()
    if pytest_extra[:1] == ["--"]:
        pytest_extra = pytest_extra[1:]

    steps = []
    if args.only in (None, "py"):
        steps.append(("ruff", [sys.executable, "-m", "ruff", "check", "."]))
        pytest = [sys.executable, "-m", "pytest", "-q"]
        if args.fast:
            pytest += ["-m", "not e2e"]
        if args.cov:
            pytest += ["--cov", "--cov-report=term", "--cov-report=html"]
        steps.append(("pytest", pytest + pytest_extra))
    if args.only in (None, "js"):
        node = find_node()
        if node is None:
            print("Node.js not found: install it, or run "
                  "`python run_tests.py py`.")
            return 1
        if not (ROOT / "node_modules").exists():
            print("node_modules missing: run `npm install` once.")
            return 1
        steps.append(("eslint", [node, "node_modules/eslint/bin/eslint.js",
                                 "."]))
        vitest = [node, "node_modules/vitest/vitest.mjs", "run"]
        if args.cov:
            vitest.append("--coverage")
        steps.append(("vitest", vitest))

    results = []
    for name, cmd in steps:
        print(f"\n=== {name} " + "=" * (60 - len(name)), flush=True)
        start = time.monotonic()
        code = subprocess.call(cmd, cwd=ROOT)
        results.append((name, code, time.monotonic() - start))

    print("\n=== summary " + "=" * 52)
    for name, code, seconds in results:
        status = "ok" if code == 0 else f"FAILED (exit {code})"
        print(f"  {name:<8} {status:<20} {seconds:6.1f}s")
    return 0 if all(code == 0 for _, code, _ in results) else 1


if __name__ == "__main__":
    sys.exit(main())
