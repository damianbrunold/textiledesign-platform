import platform
import shutil
import subprocess
import sys
import tomllib


def get_cmd(tool):
    if platform.system() == "Windows":
        return f"venv/Scripts/{tool}.exe"
    else:
        return f"venv/bin/{tool}"


def get_project():
    with open("pyproject.toml", "rb") as infile:
        return tomllib.load(infile)["project"]


def run(step, cmd):
    """Run one deploy step; stop the whole deploy if it fails."""
    print(f"==> {step}", flush=True)
    try:
        subprocess.run(cmd, check=True)
    except (subprocess.CalledProcessError, OSError) as exc:
        print(f"\nDEPLOY FAILED at step '{step}': {exc}", file=sys.stderr)
        sys.exit(1)


def tool(name):
    path = shutil.which(name)
    if path is None:
        print(f"DEPLOY FAILED: '{name}' not found on PATH", file=sys.stderr)
        sys.exit(1)
    return path


def deploy_to_server(dest):
    basepath = "/home/webapps/textile"
    project = get_project()
    wheelname = f"{project['name']}-{project['version']}-py3-none-any.whl"
    shutil.rmtree("build", ignore_errors=True)
    run("build wheel", [get_cmd("python"), "-m", "build"])
    run("copy wheel", [
        tool("scp"), f"dist/{wheelname}", f"{dest}:/home/webapps/dist/",
    ])
    run("copy migrations and requirements", [
        tool("scp"), "-r",
        "migrations", "requirements.txt", "update_server.py",
        f"{dest}:{basepath}/",
    ])
    # update_server.py exits non-zero on failure, which ssh passes on.
    run("update server", [
        tool("ssh"), dest,
        "/usr/bin/sudo -u webapps "
        f"python {basepath}/update_server.py {basepath} {wheelname}",
    ])
    print(f"\nDeployed {wheelname} to {dest}.")


if __name__ == "__main__":
    if len(sys.argv) < 2 or not sys.argv[1]:
        print("python deploy_to_server.py <user@server>")
        sys.exit(1)
    print("deploy to", sys.argv[1])
    deploy_to_server(sys.argv[1])
