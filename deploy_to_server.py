import os
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


def get_version():
    with open("pyproject.toml", "rb") as infile:
        data = tomllib.load(infile)
        return data["project"]["version"]


def get_name():
    with open("pyproject.toml", "rb") as infile:
        data = tomllib.load(infile)
        return data["project"]["name"]


def deploy_to_server(dest):
    basepath = "/home/webapps/textile"
    shutil.rmtree("build", ignore_errors=True)
    subprocess.run([get_cmd("python"), "-m", "build"])
    version = get_version()
    name = get_name()
    wheelname = f"{name}-{version}-py3-none-any.whl"
    wheel = f"dist/{wheelname}"
    subprocess.run([
        shutil.which("scp"),
        wheel,
        f"{dest}:/home/webapps/dist/",
    ])
    subprocess.run([
        shutil.which("scp"),
        "-r",
        "migrations",
        "requirements.txt",
        "update_server.py",
        f"{dest}:{basepath}/",
    ])
    subprocess.run([
        shutil.which("ssh"),
        dest,
        "/usr/bin/sudo -u webapps "
        f"python {basepath}/update_server.py {basepath} {wheelname}",
    ])


if __name__ == "__main__":
    if len(sys.argv) < 1 or not sys.argv[1]:
        print("python deploy_to_server.py <user@server>")
        exit(1)
    print("deploy to", sys.argv[1])
    deploy_to_server(sys.argv[1])
