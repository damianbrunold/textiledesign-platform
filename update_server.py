import subprocess
import sys

# Files deploy_to_server.py copies next to the app.
COPIED = ["migrations", "requirements.txt", "update_server.py"]


def run(step, cmd, cwd=None):
    """Run one step; on failure stop before the app is restarted, so the
    running version keeps serving."""
    print(f"--> {step}", flush=True)
    try:
        subprocess.run(cmd, cwd=cwd, check=True)
    except (subprocess.CalledProcessError, OSError) as exc:
        print(f"\nUPDATE FAILED at step '{step}': {exc}\n"
              "The application was NOT restarted.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    basepath = sys.argv[1]
    wheelname = sys.argv[2]
    print(basepath, wheelname)

    run("fix ownership",
        ["/usr/bin/sudo", "chown", "-R", "webapps:webapps", *COPIED],
        cwd=basepath)
    run("fix permissions",
        ["/usr/bin/sudo", "chmod", "-R", "g+w", *COPIED],
        cwd=basepath)
    run("install packages",
        ["/usr/bin/sudo", "-u", "webapps", "venv/bin/pip", "install",
         "-r", "requirements.txt", f"../dist/{wheelname}"],
        cwd=basepath)
    run("migrate database",
        ["/usr/bin/sudo", "-u", "webapps", "venv/bin/flask", "db", "upgrade"],
        cwd=basepath)
    run("restart application",
        ["/usr/bin/sudo", "/usr/bin/supervisorctl", "restart", "textile"])
    print("Update complete.")
