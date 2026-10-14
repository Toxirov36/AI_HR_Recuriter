#!/usr/bin/env python3
"""Start the built HR app as user services on localhost ports 3000/8081."""

from pathlib import Path
import subprocess


BASE = Path.home() / "hr-recruiter"
CURRENT = BASE / "current"
APT = BASE / "runtime" / "apt-root"
DATA = BASE / "data"
UNITS = Path.home() / ".config" / "systemd" / "user"


def main() -> None:
    if not (CURRENT / "apps/backend/dist/main.js").exists():
        raise RuntimeError("Build the release and create ~/hr-recruiter/current first")
    nginx_dir = DATA / "nginx"
    for name in ("client", "proxy", "fastcgi", "uwsgi", "scgi"):
        (nginx_dir / name).mkdir(parents=True, exist_ok=True)
    config = DATA / "nginx.conf"
    config.write_text(f"""worker_processes 1;
pid {nginx_dir / 'nginx.pid'};
error_log {nginx_dir / 'error.log'} warn;
events {{ worker_connections 1024; }}
http {{
  include {APT / 'etc/nginx/mime.types'};
  default_type application/octet-stream;
  access_log {nginx_dir / 'access.log'};
  client_body_temp_path {nginx_dir / 'client'};
  proxy_temp_path {nginx_dir / 'proxy'};
  fastcgi_temp_path {nginx_dir / 'fastcgi'};
  uwsgi_temp_path {nginx_dir / 'uwsgi'};
  scgi_temp_path {nginx_dir / 'scgi'};
  client_max_body_size 6m;
  server {{
    listen 127.0.0.1:8081;
    server_name _;
    root {CURRENT / 'apps/frontend/dist'};
    index index.html;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(self), geolocation=()" always;
    add_header Cross-Origin-Opener-Policy same-origin-allow-popups always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" always;
    location /api/ {{
      proxy_pass http://127.0.0.1:3000;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
      proxy_read_timeout 130s;
    }}
    location /assets/ {{ try_files $uri =404; expires 1y; access_log off; }}
    location / {{ try_files $uri $uri/ /index.html; }}
  }}
}}
""")
    (UNITS / "hr-recruiter-api.service").write_text(
        "[Unit]\nDescription=HR Recruiter API\n"
        "After=hr-recruiter-postgres.service hr-recruiter-redis.service\n"
        "Wants=hr-recruiter-postgres.service hr-recruiter-redis.service\n"
        "[Service]\nType=simple\n"
        f"WorkingDirectory={CURRENT}\n"
        f"EnvironmentFile={BASE / '.env'}\n"
        "Environment=NODE_ENV=production HOST=127.0.0.1 PORT=3000\n"
        f"ExecStart={BASE / 'runtime/node/bin/node'} {CURRENT / 'apps/backend/dist/main.js'}\n"
        "Restart=on-failure\nRestartSec=5\n"
        "[Install]\nWantedBy=default.target\n")
    (UNITS / "hr-recruiter-web.service").write_text(
        "[Unit]\nDescription=HR Recruiter web frontend\n"
        "After=hr-recruiter-api.service\nWants=hr-recruiter-api.service\n"
        "[Service]\nType=forking\n"
        f"PIDFile={nginx_dir / 'nginx.pid'}\n"
        f"ExecStart={APT / 'usr/sbin/nginx'} -c {config}\n"
        f"ExecReload={APT / 'usr/sbin/nginx'} -c {config} -s reload\n"
        f"ExecStop={APT / 'usr/sbin/nginx'} -c {config} -s quit\n"
        "Restart=on-failure\nRestartSec=5\n"
        "[Install]\nWantedBy=default.target\n")
    subprocess.run((str(APT / "usr/sbin/nginx"), "-t", "-c", str(config)), check=True)
    subprocess.run(("systemctl", "--user", "daemon-reload"), check=True)
    subprocess.run(("systemctl", "--user", "enable", "--now",
                    "hr-recruiter-api.service", "hr-recruiter-web.service"), check=True)
    print("API and frontend user services were started.")


if __name__ == "__main__":
    main()
