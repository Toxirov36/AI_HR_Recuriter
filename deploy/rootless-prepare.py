#!/usr/bin/env python3
"""Prepare private PostgreSQL and Redis services without root privileges.

Run on the target host after extracting the Ubuntu packages under
~/hr-recruiter/runtime/apt-root. Credentials come from ~/hr-recruiter/.env.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import unquote, urlparse


BASE = Path.home() / "hr-recruiter"
APT = BASE / "runtime" / "apt-root"
DATA = BASE / "data"
UNITS = Path.home() / ".config" / "systemd" / "user"
PGBIN = APT / "usr" / "lib" / "postgresql" / "14" / "bin"
REDISBIN = APT / "usr" / "bin"
LIB = ":".join((str(APT / "usr/lib/x86_64-linux-gnu"), str(APT / "usr/lib/postgresql/14/lib")))


def run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=True, text=True, env=env, capture_output=True)


def read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (BASE / ".env").read_text().splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        values[key] = value.strip().strip('"').strip("'")
    return values


def write_private(path: Path, content: str) -> None:
    path.write_text(content)
    path.chmod(0o600)


def main() -> None:
    values = read_env()
    db = urlparse(values["DATABASE_URL"])
    redis = urlparse(values["REDIS_URL"])
    assert db.hostname in ("127.0.0.1", "localhost") and db.port == 5432
    assert redis.hostname in ("127.0.0.1", "localhost") and redis.port == 6379
    assert db.username and db.password and db.path != "/"
    db_user, db_password, db_name = unquote(db.username), unquote(db.password), unquote(db.path.lstrip("/"))
    redis_password = unquote(redis.password or "")
    DATA.mkdir(mode=0o700, exist_ok=True)
    UNITS.mkdir(parents=True, exist_ok=True)
    (DATA / "redis").mkdir(mode=0o700, exist_ok=True)
    (DATA / "pgsocket").mkdir(mode=0o700, exist_ok=True)
    pgdata = DATA / "postgres"
    pwfile = DATA / ".postgres-init-password"
    pg_env = dict(os.environ, LD_LIBRARY_PATH=LIB)
    if not (pgdata / "PG_VERSION").exists():
        write_private(pwfile, db_password + "\n")
        try:
            run(str(PGBIN / "initdb"), "-D", str(pgdata), "-U", db_user,
                "-A", "scram-sha-256", "--pwfile", str(pwfile),
                "--no-instructions", env=pg_env)
        finally:
            pwfile.unlink(missing_ok=True)
    redis_lines = [
        "bind 127.0.0.1", "port 6379", "protected-mode yes",
        "daemonize no", "appendonly yes", f"dir {DATA / 'redis'}",
    ]
    if redis_password:
        redis_lines.append(f"requirepass {json.dumps(redis_password)}")
    write_private(DATA / "redis.conf", "\n".join((*redis_lines, "")))
    (UNITS / "hr-recruiter-postgres.service").write_text(
        "[Unit]\nDescription=HR Recruiter PostgreSQL\n"
        "[Service]\nType=simple\n"
        f"Environment=LD_LIBRARY_PATH={LIB}\n"
        f"ExecStart={PGBIN / 'postgres'} -D {pgdata} -h 127.0.0.1 -p 5432 -k {DATA / 'pgsocket'}\n"
        "Restart=on-failure\nRestartSec=5\n"
        "[Install]\nWantedBy=default.target\n")
    (UNITS / "hr-recruiter-redis.service").write_text(
        "[Unit]\nDescription=HR Recruiter Redis\n"
        "[Service]\nType=simple\n"
        f"Environment=LD_LIBRARY_PATH={LIB}\n"
        f"ExecStart={REDISBIN / 'redis-server'} {DATA / 'redis.conf'}\n"
        "Restart=on-failure\nRestartSec=5\n"
        "[Install]\nWantedBy=default.target\n")
    run("systemctl", "--user", "daemon-reload")
    run("systemctl", "--user", "enable", "--now", "hr-recruiter-postgres.service", "hr-recruiter-redis.service")
    run("systemctl", "--user", "restart", "hr-recruiter-postgres.service")
    for _ in range(30):
        try:
            run(str(PGBIN / "pg_isready"), "-h", "127.0.0.1", "-p", "5432", env=pg_env)
            redis_env = dict(pg_env, **({"REDISCLI_AUTH": redis_password} if redis_password else {}))
            run(str(REDISBIN / "redis-cli"), "-h", "127.0.0.1", "ping", env=redis_env)
            break
        except subprocess.CalledProcessError:
            time.sleep(1)
    else:
        raise RuntimeError("PostgreSQL or Redis did not become ready")
    db_env = dict(pg_env, PGPASSWORD=db_password)
    existing = run(str(PGBIN / "psql"), "-h", "127.0.0.1", "-U", db_user,
                   "-d", "postgres", "-At", "-c", "SELECT datname FROM pg_database", env=db_env).stdout.splitlines()
    if db_name not in existing:
        run(str(PGBIN / "createdb"), "-h", "127.0.0.1", "-U", db_user,
            db_name, env=db_env)
    print("PostgreSQL and Redis are ready; application database exists.")


if __name__ == "__main__":
    main()
