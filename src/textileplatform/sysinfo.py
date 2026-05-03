"""System status probes for the support console.

Each probe is wrapped to never raise — failures yield ``None`` so the
template renders ``—`` instead of 500ing the whole page.
"""
import datetime
import os
import platform
import socket
import sys
import time

import flask
import psutil
import sqlalchemy as sa

from textileplatform.db import db
from textileplatform.models import (
    Membership,
    Message,
    Pattern,
    User,
)


def _safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def humanize_bytes(n):
    if n is None:
        return None
    units = ["B", "KB", "MB", "GB", "TB"]
    f = float(n)
    for u in units:
        if f < 1024 or u == units[-1]:
            return f"{f:.1f} {u}" if u != "B" else f"{int(f)} B"
        f /= 1024


def humanize_duration(seconds):
    if seconds is None:
        return None
    seconds = int(seconds)
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h {minutes}m"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def collect():
    info = {
        "app": _app_info(),
        "host": _host_info(),
        "database": _db_info(),
        "metrics": _app_metrics(),
        "smtp": _smtp_info(),
    }
    return info


def _app_info():
    proc = _safe(psutil.Process)
    startup = getattr(flask.current_app, "startup_time", None)
    now = datetime.datetime.now(datetime.timezone.utc)
    try:
        from importlib.metadata import version
        version_str = version("textileplatform")
    except Exception:
        version_str = "—"
    rss = _safe(lambda: proc.memory_info().rss) if proc else None
    cmdline = _safe(lambda: " ".join(proc.cmdline())) if proc else None
    return {
        "version": version_str,
        "python": sys.version.split()[0],
        "flask": _safe(lambda: flask.__version__) or "—",
        "pid": _safe(os.getpid),
        "cmdline": cmdline,
        "rss": rss,
        "rss_h": humanize_bytes(rss),
        "startup": startup,
        "uptime": (
            humanize_duration((now - startup).total_seconds())
            if startup else None
        ),
    }


def _host_info():
    cpu_count = _safe(psutil.cpu_count)
    load = _safe(os.getloadavg)
    cpu_pct = _safe(lambda: psutil.cpu_percent(interval=0.1))
    mem = _safe(psutil.virtual_memory)
    swap = _safe(psutil.swap_memory)
    disks = []
    seen = set()
    for path in ("/", "/var/lib/postgresql", os.getcwd()):
        try:
            real = os.path.realpath(path)
            mount = _safe(lambda: psutil.disk_usage(real))
            if mount is None:
                continue
            key = (mount.total, mount.used)
            if key in seen:
                continue
            seen.add(key)
            disks.append({
                "path": real,
                "total_h": humanize_bytes(mount.total),
                "used_h": humanize_bytes(mount.used),
                "free_h": humanize_bytes(mount.free),
                "percent": mount.percent,
            })
        except Exception:
            continue
    return {
        "hostname": _safe(socket.gethostname),
        "platform": _safe(platform.platform),
        "cpu_count": cpu_count,
        "cpu_percent": cpu_pct,
        "load_1": load[0] if load else None,
        "load_5": load[1] if load else None,
        "load_15": load[2] if load else None,
        "mem_total_h": humanize_bytes(mem.total) if mem else None,
        "mem_used_h": humanize_bytes(mem.used) if mem else None,
        "mem_avail_h": humanize_bytes(mem.available) if mem else None,
        "mem_percent": mem.percent if mem else None,
        "swap_used_h": humanize_bytes(swap.used) if swap else None,
        "swap_percent": swap.percent if swap else None,
        "disks": disks,
    }


def _db_info():
    info = {
        "ok": False,
        "ping_ms": None,
        "size_h": None,
        "active_connections": None,
        "max_connections": None,
        "longest_query_seconds": None,
    }
    try:
        t0 = time.monotonic()
        db.session.execute(sa.text("SELECT 1"))
        info["ping_ms"] = round((time.monotonic() - t0) * 1000, 1)
        info["ok"] = True
    except Exception:
        return info
    try:
        size = db.session.execute(
            sa.text("SELECT pg_database_size(current_database())")
        ).scalar()
        info["size_h"] = humanize_bytes(size)
    except Exception:
        pass
    try:
        active = db.session.execute(
            sa.text(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE state IS NOT NULL"
            )
        ).scalar()
        info["active_connections"] = active
    except Exception:
        pass
    try:
        max_c = db.session.execute(
            sa.text("SHOW max_connections")
        ).scalar()
        info["max_connections"] = int(max_c) if max_c else None
    except Exception:
        pass
    try:
        longest = db.session.execute(
            sa.text(
                "SELECT EXTRACT(EPOCH FROM (now() - query_start)) "
                "FROM pg_stat_activity "
                "WHERE state = 'active' AND query_start IS NOT NULL "
                "ORDER BY query_start ASC LIMIT 1"
            )
        ).scalar()
        info["longest_query_seconds"] = (
            float(longest) if longest is not None else None
        )
    except Exception:
        pass
    return info


def _app_metrics():
    out = {
        "users_verified": None,
        "users_unverified": None,
        "users_disabled": None,
        "patterns_weave": None,
        "patterns_bead": None,
        "patterns_other": None,
        "investigations": None,
        "pending_invitations": None,
        "messages_24h": None,
    }
    try:
        out["users_verified"] = (
            User.query.filter(User.verified.is_(True)).count()
        )
        out["users_unverified"] = (
            User.query.filter(
                (User.verified.is_(False)) | (User.verified.is_(None))
            ).count()
        )
        out["users_disabled"] = (
            User.query.filter(User.disabled.is_(True)).count()
        )
    except Exception:
        pass
    try:
        rows = (
            db.session.query(Pattern.pattern_type, sa.func.count(Pattern.id))
            .group_by(Pattern.pattern_type)
            .all()
        )
        by_type = {t: n for t, n in rows}
        out["patterns_weave"] = by_type.pop("DB-WEAVE Pattern", 0)
        out["patterns_bead"] = by_type.pop("JBead Pattern", 0)
        out["patterns_other"] = sum(by_type.values())
    except Exception:
        pass
    try:
        out["investigations"] = (
            Pattern.query
            .filter(Pattern.investigation_origin_user_id.isnot(None))
            .count()
        )
    except Exception:
        pass
    try:
        out["pending_invitations"] = (
            Membership.query.filter(Membership.state == "invited").count()
        )
    except Exception:
        pass
    try:
        cutoff = (
            datetime.datetime.now(datetime.timezone.utc)
            - datetime.timedelta(hours=24)
        )
        out["messages_24h"] = (
            Message.query.filter(Message.created >= cutoff).count()
        )
    except Exception:
        pass
    return out


def _smtp_info():
    info = {"reachable": False, "ms": None, "host": "localhost", "port": 25}
    try:
        t0 = time.monotonic()
        with socket.create_connection(("localhost", 25), timeout=1):
            info["ms"] = round((time.monotonic() - t0) * 1000, 1)
            info["reachable"] = True
    except Exception:
        pass
    return info
