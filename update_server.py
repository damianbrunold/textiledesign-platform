import subprocess
import shutil
import sys

if __name__ == "__main__":
    basepath = sys.argv[1]
    wheelname = sys.argv[2]
    print(basepath, wheelname)

    subprocess.run(
        [
            "/usr/bin/sudo",
            "chown",
            "-R",
            "webapps:webapps",
            "migrations",
            "requirements.txt",
            "update_server.py",
        ],
        cwd=basepath,
    )
    subprocess.run(
        [
            "/usr/bin/sudo",
            "chmod",
            "-R",
            "g+w",
            "migrations",
            "requirements.txt",
            "update_server.py",
        ],
        cwd=basepath,
    )
    subprocess.run(
        [
            "/usr/bin/sudo",
            "-u",
            "webapps",
            "venv/bin/pip",
            "install",
            "-r",
            "requirements.txt",
            f"../dist/{wheelname}",
        ],
        cwd=basepath,
    )
    subprocess.run(
        [
            "/usr/bin/sudo",
            "-u",
            "webapps",
            "venv/bin/flask",
            "db",
            "upgrade",
        ],
        cwd=basepath,
    )
    subprocess.run([
        "/usr/bin/sudo",
        "/usr/bin/supervisorctl",
        "restart",
        "textile",
    ])
