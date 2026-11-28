#!/usr/bin/env bash
# install.sh - Install the Dedicated Server Portal with one command (no Docker)
#
#   sudo ./install.sh
#
# What it does, in order:
#   1) Detects the OS (Ubuntu/Debian or RHEL/Rocky/Alma/CentOS/Fedora)
#      and installs everything: Python 3.11+, Node 22, MySQL 9.7 LTS,
#      Nginx, Certbot, Redis
#   2) Asks for the admin account (username, email, full name, password)
#      and creates the SuperAdmin
#   3) Creates the MySQL 9 database, runs migrations, builds the frontend
#   4) Starts the backend with systemd (127.0.0.1:8000 only - port 8000
#      is NOT exposed)
#   5) Configures Nginx as a reverse proxy: your domain on port 443
#      (HTTPS with Let's Encrypt), serving the frontend and /api/v1.
#      Without a domain, it asks for the server IP and gets a valid
#      Let's Encrypt certificate for that IP (via sslip.io - Let's Encrypt
#      does not issue certificates for bare IPs; the certificate lasts
#      90 days and certbot renews it automatically)
#
# Quick install (run from the extracted project directory):
#   sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/installation/install.sh)"
#
# Options:
#   ./install.sh --help            show this help
#   ./install.sh --dry-run         print commands without running them (DRY_RUN=1 too)
#   ./install.sh --no-ssl          skip Let's Encrypt (plain HTTP on port 80)
#   ./install.sh --skip-admin      skip creating the SuperAdmin
#   ./install.sh --domain=portal.example.com
#   ./install.sh --admin-user=reza --admin-email=reza@example.com
#
# Environment variables (for unattended runs):
#   DOMAIN=portal.example.com  ADMIN_USERNAME=admin  ADMIN_EMAIL=admin@example.com
#   ADMIN_FULL_NAME="Reza Karimi"  ADMIN_PASSWORD='...'  DB_PASSWORD='...'  MYSQL_ROOT_PASSWORD='...'
#   MYSQL_APT_CONFIG_URL=...  MYSQL_YUM_RELEASE_URL=...  (if Oracle changes its package URLs)
#
# Security note: the admin password is never stored in a file; it is passed
# only to the admin-creation script at install time. Secrets (JWT, WHMCS,
# DB password) live only in .env with mode 600.
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$INSTALL_DIR"

# This installer runs the project in place: the project files must be here.
for _f in requirements.txt app frontend/package.json; do
  [ -e "$INSTALL_DIR/$_f" ] || { echo "ERROR: project file not found: $INSTALL_DIR/$_f - run this installer from the extracted project directory." >&2; exit 1; }
done

DRY_RUN="${DRY_RUN:-0}"
NO_SSL=0
SKIP_ADMIN=0
DOMAIN="${DOMAIN:-}"
SERVER_IP="${SERVER_IP:-}"
ADMIN_USERNAME="${ADMIN_USERNAME:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_FULL_NAME="${ADMIN_FULL_NAME:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
DB_PASSWORD="${DB_PASSWORD:-}"

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      sed -n '2,40p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    --dry-run) DRY_RUN=1 ;;
    --no-ssl) NO_SSL=1 ;;
    --skip-admin) SKIP_ADMIN=1 ;;
    --domain=*) DOMAIN="${arg#--domain=}" ;;
    --admin-user=*) ADMIN_USERNAME="${arg#--admin-user=}" ;;
    --admin-email=*) ADMIN_EMAIL="${arg#--admin-email=}" ;;
    --admin-full-name=*) ADMIN_FULL_NAME="${arg#--admin-full-name=}" ;;
    *) echo "Unknown option: $arg (help: ./install.sh --help)" >&2; exit 2 ;;
  esac
done

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf '!! %s\n' "$*" >&2; }
die()  { warn "ERROR: $*"; exit 1; }
run()  { if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; else "$@"; fi; }

rand_hex() { openssl rand -hex "$1"; }
rand_password() { # Strong password matching the backend policy: upper+lower+digit+special
  printf '%s' "$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-16)Aa1!"
}

password_ok() { # Backend policy: at least 10 chars, upper + lower + digit + special char
  local p="$1"
  [ "${#p}" -ge 10 ] || return 1
  printf '%s' "$p" | grep -q '[A-Z]' || return 1
  printf '%s' "$p" | grep -q '[a-z]' || return 1
  printf '%s' "$p" | grep -q '[0-9]' || return 1
  printf '%s' "$p" | grep -q '[^A-Za-z0-9]' || return 1
  return 0
}

# ---------- 0) Must run as root (or re-run with sudo) ----------
if [ "$(id -u)" -ne 0 ]; then
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] (would not run as root; in a real run it re-runs with sudo)"
  elif [ -f "$0" ] && command -v sudo >/dev/null 2>&1; then
    log "Re-running with sudo..."
    exec sudo DRY_RUN="$DRY_RUN" DOMAIN="$DOMAIN" SERVER_IP="$SERVER_IP" ADMIN_USERNAME="$ADMIN_USERNAME" \
      ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_FULL_NAME="$ADMIN_FULL_NAME" \
      ADMIN_PASSWORD="$ADMIN_PASSWORD" DB_PASSWORD="$DB_PASSWORD" \
      "$0" "$@"
  else
    die "This script must be run as root. Run it with sudo, or download it first: curl -fsSL -o install.sh https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/installation/install.sh && sudo ./install.sh"
  fi
fi

# ---------- 1) Detect the OS ----------
OS_ID=""; OS_VERSION_ID=""; OS_LIKE=""
if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-}"; OS_VERSION_ID="${VERSION_ID:-}"; OS_LIKE="${ID_LIKE:-}"
fi
OS_FAMILY=""
case "$OS_ID $OS_LIKE" in
  *debian*|*ubuntu*) OS_FAMILY="debian" ;;
  *rhel*|*fedora*|*centos*|*rocky*|*alma*|*oracle*) OS_FAMILY="rhel" ;;
  *) die "Unsupported OS: ${OS_ID:-unknown} ${OS_VERSION_ID:-}. Supported: Ubuntu/Debian and RHEL/Rocky/AlmaLinux/CentOS/Fedora." ;;
esac
EL_VERSION="$(printf '%s' "$OS_VERSION_ID" | cut -d. -f1)"
log "OS: ${PRETTY_NAME:-$OS_ID $OS_VERSION_ID} (family: $OS_FAMILY)"

PROJECT_OWNER="$(stat -c %U "$INSTALL_DIR")"
as_owner() { # Run a command as the project owner (not root) so files stay owned by them
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; return 0; fi
  if [ "$PROJECT_OWNER" = "root" ]; then "$@"; else runuser -u "$PROJECT_OWNER" -- "$@"; fi
}

# ---------- 2) Check ports 80 and 443 ----------
if [ "$DRY_RUN" != "1" ]; then
  for port in 80 443; do
    if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$port" 2>/dev/null | grep -q ":$port"; then
      warn "Port $port is already in use - Nginx cannot bind to it. Stop the service using it first."
    fi
  done
fi

# ---------- 3) Ask the user for input (before the long install) ----------
prompt_text() { # prompt_text VAR "question" "default"
  local var="$1" q="$2" def="$3" val=""
  eval "val=\${$var:-}"
  [ -n "$val" ] && return 0
  if [ "$DRY_RUN" = "1" ]; then eval "$var=\"\$def\""; return 0; fi
  if [ -n "$def" ]; then printf '%s [%s]: ' "$q" "$def"; else printf '%s: ' "$q"; fi
  read -r val || true
  [ -z "$val" ] && val="$def"
  eval "$var=\"\$val\""
}
prompt_password() { # prompt_password VAR "question" - asks twice and checks the policy
  local var="$1" q="$2" p1="" p2=""
  eval "[ -n \"\${$var:-}\" ]" && return 0
  [ "$DRY_RUN" = "1" ] && { eval "$var=\"DryRun1234!x\""; return 0; }
  while :; do
    printf '%s (at least 10 chars, upper+lower+digit+special): ' "$q"
    read -rs p1 || true; echo
    printf 'Repeat password: '; read -rs p2 || true; echo
    [ "$p1" = "$p2" ] || { warn "The two passwords do not match; try again."; continue; }
    password_ok "$p1" || { warn "Weak password: it needs at least 10 characters with upper and lower case letters, a digit and a special character."; continue; }
    eval "$var=\"\$p1\""
    return 0
  done
}

if [ "$SKIP_ADMIN" != "1" ]; then
  log "Admin account (custom - this is the account that will be created)"
  prompt_text ADMIN_USERNAME "Admin username" "admin"
  prompt_text ADMIN_EMAIL "Admin email" "admin@example.com"
  prompt_text ADMIN_FULL_NAME "Admin full name" "System Administrator"
  prompt_password ADMIN_PASSWORD "Admin password"
fi
log "Domain (for HTTPS on port 443)"
prompt_text DOMAIN "Domain (e.g. portal.example.com - empty = IP only on port 80)" ""
if [ -n "$DOMAIN" ]; then
  case "$DOMAIN" in
    *.*) : ;;
    *) die "Not a valid domain: $DOMAIN" ;;
  esac
  if [ "$DRY_RUN" != "1" ] && command -v getent >/dev/null 2>&1; then
    if ! getent hosts "$DOMAIN" >/dev/null 2>&1; then
      warn "Domain $DOMAIN does not resolve to any IP - for a Let's Encrypt certificate its DNS must point at this server. The install continues; you can retry certbot later."
    fi
  fi
fi
# No domain: ask for the server's public IP and get the SSL certificate for that IP.
# Let's Encrypt does not issue certificates for bare IPs, so sslip.io is used:
# the host <ip>.sslip.io (e.g. 1-2-3-4.sslip.io) resolves to the same IP, and
# certbot gets a valid 90-day certificate for it that renews itself.
SSL_IP_HOST=""
if [ -z "$DOMAIN" ]; then
  DETECTED_IP=""
  if [ "$DRY_RUN" != "1" ]; then
    DETECTED_IP="$(curl -4 -fsS --max-time 10 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) {print $i; exit}}')"
  fi
  if [ "$DRY_RUN" = "1" ]; then SERVER_IP="203.0.113.10";
  else prompt_text SERVER_IP "Server public IP (for the SSL certificate)" "$DETECTED_IP"; fi
  if ! printf '%s' "$SERVER_IP" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    die "Not a valid IPv4 address: $SERVER_IP (for IPv6 or an invalid IP, give a domain instead)"
  fi
  SSL_IP_HOST="$(printf '%s' "$SERVER_IP" | tr '.' '-').sslip.io"
  if [ "$DRY_RUN" != "1" ] && [ -n "$DETECTED_IP" ] && [ "$SERVER_IP" != "$DETECTED_IP" ]; then
    warn "The given IP ($SERVER_IP) differs from the server's detected public IP ($DETECTED_IP) - the SSL certificate may fail."
  fi
fi
if [ -z "$DB_PASSWORD" ]; then
  if [ "$DRY_RUN" = "1" ]; then DB_PASSWORD="DryRunDb1234!x";
  else
    printf 'MySQL password for the portal database user (empty = auto-generate a strong one): '
    read -rs DB_PASSWORD || true; echo
    [ -z "$DB_PASSWORD" ] && DB_PASSWORD="$(rand_password)"
  fi
fi

# ---------- 4) Install prerequisites ----------
install_pkgs() {
  if [ "$OS_FAMILY" = "debian" ]; then
    run apt-get update -y
    run env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  else
    run dnf install -y "$@"
  fi
}

if [ "$OS_FAMILY" = "debian" ]; then
  log "Installing base packages (Debian/Ubuntu)"
  install_pkgs curl wget git openssl ca-certificates gnupg lsb-release \
    python3 python3-venv python3-pip nginx iproute2
else
  log "Installing base packages (RHEL)"
  install_pkgs curl wget git openssl ca-certificates gnupg2 \
    python3 python3-pip nginx iproute dnf-plugins-core
  # EPEL is needed for certbot and redis
  if ! rpm -q epel-release >/dev/null 2>&1; then
    run dnf install -y epel-release || warn "Installing EPEL failed; certbot/redis may not be available."
  fi
fi

# ---------- 5) Python 3.11+ ----------
pick_python() {
  for c in python3.12 python3.11 python3; do
    command -v "$c" >/dev/null 2>&1 || continue
    if "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
      echo "$c"; return 0
    fi
  done
  return 1
}
if [ "$OS_FAMILY" = "debian" ]; then
  # Ubuntu 22.04 ships Python 3.10 by default; install 3.11 as well
  install_pkgs python3.11 python3.11-venv || true
else
  install_pkgs python3.11 python3.11-pip || install_pkgs python3.12 python3.12-pip || true
fi
PYTHON="$(pick_python || true)"
[ -n "$PYTHON" ] || die "Python 3.11 or newer not found. (Ubuntu 22.04: needs python3.11; RHEL 9: needs python3.11)"
log "Python: $($PYTHON --version)"

# ---------- 6) Node.js 22 LTS ----------
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(process.versions.node.split(".")[0] >= 20 ? 0 : 1)' 2>/dev/null; then
  log "Installing Node.js 22 LTS (from NodeSource)"
  if [ "$OS_FAMILY" = "debian" ]; then
    run bash -c "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
    install_pkgs nodejs
  else
    run bash -c "curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -"
    run dnf install -y nodejs
  fi
fi
log "Node: $(node --version) / npm: $(npm --version)"

# ---------- 7) MySQL 9.7 LTS ----------
MYSQL_VERSION="$(mysql --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
if [ -n "$MYSQL_VERSION" ]; then
  case "$MYSQL_VERSION" in
    9.*) log "MySQL $MYSQL_VERSION is already installed - skipping." ;;
    *) die "MySQL version $MYSQL_VERSION is installed on this server; this script needs MySQL 9. Upgrade MySQL to 9 first or use a clean server." ;;
  esac
else
  log "Installing MySQL 9.7 LTS from the official Oracle repository"
  if [ "$OS_FAMILY" = "debian" ]; then
    APT_DEB="${MYSQL_APT_CONFIG_URL:-https://dev.mysql.com/get/mysql-apt-config_0.8.40-1_all.deb}"
    run curl -fsSL -o /tmp/mysql-apt-config.deb "$APT_DEB" \
      || die "Downloading mysql-apt-config failed. If the URL changed, get the new one from https://dev.mysql.com/downloads/repo/apt/ and re-run with MYSQL_APT_CONFIG_URL=..."
    # Select the 9.7 series without an interactive prompt
    echo "mysql-apt-config mysql-apt-config/select-server select mysql-9.7-lts" | run debconf-set-selections
    run dpkg -i /tmp/mysql-apt-config.deb
    run apt-get update -y
    run env DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server
    run systemctl enable --now mysql
  else
    YUM_RPM="${MYSQL_YUM_RELEASE_URL:-https://dev.mysql.com/get/mysql97-community-release-el${EL_VERSION}-1.noarch.rpm}"
    run dnf install -y "$YUM_RPM" \
      || die "Downloading the MySQL repository package failed. Get the right URL for EL${EL_VERSION} from https://dev.mysql.com/downloads/repo/yum/ and re-run with MYSQL_YUM_RELEASE_URL=..."
    # The system's own mysql module can hide Oracle's packages
    run dnf module disable -y mysql || true
    run dnf install -y --setopt=install_weak_deps=False mysql-community-server
    run systemctl enable --now mysqld
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] would verify: mysql --version reports 9.x"
  else
    MYSQL_VERSION="$(mysql --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
    case "$MYSQL_VERSION" in
      9.*) log "MySQL $MYSQL_VERSION installed." ;;
      *) die "MySQL version after install is '${MYSQL_VERSION:-unknown}'; expected 9.x." ;;
    esac
  fi
fi

# ---------- 8) Create the MySQL database and user ----------
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
  MYSQL_ROOT_PASSWORD="$(rand_password)"
  MYSQL_ROOT_PASSWORD_GENERATED=1
else
  MYSQL_ROOT_PASSWORD_GENERATED=0
fi

mysql_root() { # Run SQL as root - the auth method depends on the OS
  if [ "$OS_FAMILY" = "debian" ]; then
    # APT install: root logs in via auth_socket (no password)
    run mysql -e "$1"
  else
    # Password via MYSQL_PWD so it never shows in the process list
    run env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -e "$1"
  fi
}

if [ "$OS_FAMILY" = "rhel" ]; then
  # RHEL: the first start generates a temporary password in the log
  # (password via MYSQL_PWD so it never shows in the process list)
  TEMP_PASS="$(grep 'temporary password' /var/log/mysqld.log 2>/dev/null | tail -1 | sed 's/.*root@localhost: //' || true)"
  if [ -n "$TEMP_PASS" ]; then
    log "Setting the temporary MySQL root password (first start)"
    run env MYSQL_PWD="$TEMP_PASS" mysql -u root --connect-expired-password \
      -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '$MYSQL_ROOT_PASSWORD';"
  elif ! MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -e "SELECT 1" >/dev/null 2>&1; then
    warn "The current MySQL root password is unknown (no temporary password in the log, and the given one does not work). If MySQL was already installed, pass MYSQL_ROOT_PASSWORD with the correct password and re-run."
  fi
fi

log "Creating the portal_db database and portal user in MySQL 9"
mysql_root "CREATE DATABASE IF NOT EXISTS portal_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_root "CREATE USER IF NOT EXISTS 'portal'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';"
mysql_root "ALTER USER 'portal'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';"
mysql_root "GRANT ALL PRIVILEGES ON portal_db.* TO 'portal'@'127.0.0.1'; FLUSH PRIVILEGES;"
run env MYSQL_PWD="$DB_PASSWORD" mysql -u portal -h 127.0.0.1 -e "SELECT VERSION() AS mysql_version;" \
  || die "Connecting to MySQL as the portal user failed."

# ---------- 9) Redis (optional - without it the backend falls back to in-memory) ----------
REDIS_URL=""
if [ "$OS_FAMILY" = "debian" ]; then install_pkgs redis-server || true; else install_pkgs redis || true; fi
if command -v redis-cli >/dev/null 2>&1; then
  run systemctl enable --now redis-server 2>/dev/null || run systemctl enable --now redis 2>/dev/null || true
  if [ "$DRY_RUN" != "1" ] && redis-cli ping 2>/dev/null | grep -q PONG; then
    REDIS_URL="redis://127.0.0.1:6379/0"
    log "Redis is up."
  fi
fi

# ---------- 10) Create .env (MySQL only - never SQLite, never PostgreSQL) ----------
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Creating .env with random secure secrets (database: MySQL 9)"
  JWT_SECRET="$(rand_hex 32)"
  WHMCS_KEY="$(rand_hex 32)"
  WHMCS_SECRET="$(rand_hex 32)"
  if [ -n "$DOMAIN" ]; then CORS_ORIGINS="[\"https://$DOMAIN\"]";
  else
    CORS_ORIGINS="[\"https://$SSL_IP_HOST\", \"http://$SERVER_IP\"]"
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] would write $ENV_FILE (DATABASE_URL=mysql+asyncmy://portal:****@127.0.0.1:3306/portal_db, CORS_ORIGINS=$CORS_ORIGINS, random JWT/WHMCS secrets, mode 600)"
  else
  cat > "$ENV_FILE" <<EOF
APP_NAME=Dedicated Server Portal
APP_VERSION=1.0.0
ENVIRONMENT=production
DEBUG=false
API_V1_PREFIX=/api/v1
DATABASE_URL=mysql+asyncmy://portal:${DB_PASSWORD}@127.0.0.1:3306/portal_db?charset=utf8mb4
MYSQL_PASSWORD=${DB_PASSWORD}
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
JWT_SECRET_KEY=${JWT_SECRET}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
WHMCS_API_KEY=${WHMCS_KEY}
WHMCS_HMAC_SECRET=${WHMCS_SECRET}
WHMCS_AUTO_CREATE_SWITCH=true
REDIS_URL=${REDIS_URL}
RATE_LIMIT_LOGIN_PER_MINUTE=5
RATE_LIMIT_GLOBAL_PER_MINUTE=120
CORS_ORIGINS=${CORS_ORIGINS}
LOGIN_MAX_FAILED_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
EOF
  chmod 600 "$ENV_FILE"
  chown "$PROJECT_OWNER:" "$ENV_FILE" 2>/dev/null || true
  echo ".env created (mode 600). Secrets live only in this file; never commit it."
  fi
else
  echo ".env already exists; using it as-is, without overwriting."
fi

# Enforce MySQL (never SQLite, never PostgreSQL) - project rule
if [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] would validate DATABASE_URL in .env is mysql+asyncmy:// (refusing sqlite/postgresql)"
else
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
case "$DB_URL" in
  mysql+asyncmy://*|mysql+aiomysql://*) echo "Database: MySQL" ;;
  sqlite*|postgresql*|postgres*)
    die "This project must run on MySQL, but DATABASE_URL is set to '${DB_URL%%://*}'." ;;
  *) die "DATABASE_URL is invalid or empty: $DB_URL" ;;
esac
fi

# ---------- 11) Backend: venv + dependencies + migrations ----------
log "Creating the venv and installing backend dependencies"
if [ ! -d "$INSTALL_DIR/.venv" ]; then
  as_owner "$PYTHON" -m venv "$INSTALL_DIR/.venv"
fi
as_owner "$INSTALL_DIR/.venv/bin/python" -m pip install --upgrade pip
as_owner "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

log "Running Alembic migrations on MySQL 9"
run "$INSTALL_DIR/.venv/bin/alembic" upgrade head

# ---------- 12) Create the SuperAdmin ----------
if [ "$SKIP_ADMIN" != "1" ]; then
  log "Creating the SuperAdmin"
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] INITIAL_ADMIN_USERNAME=$ADMIN_USERNAME INITIAL_ADMIN_EMAIL=$ADMIN_EMAIL INITIAL_ADMIN_FULL_NAME=\"$ADMIN_FULL_NAME\" .venv/bin/python -m app.scripts.create_admin"
  else
    INITIAL_ADMIN_USERNAME="$ADMIN_USERNAME" \
    INITIAL_ADMIN_EMAIL="$ADMIN_EMAIL" \
    INITIAL_ADMIN_FULL_NAME="$ADMIN_FULL_NAME" \
    INITIAL_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    run "$INSTALL_DIR/.venv/bin/python" -m app.scripts.create_admin
  fi
fi

# ---------- 13) Frontend: build ----------
log "Building the frontend"
as_owner npm --prefix "$INSTALL_DIR/frontend" ci
as_owner npm --prefix "$INSTALL_DIR/frontend" run build
if [ "$DRY_RUN" != "1" ]; then
  [ -f "$INSTALL_DIR/frontend/dist/index.html" ] || die "The frontend build did not produce index.html."
fi

# ---------- 14) Backend with systemd - 127.0.0.1:8000 only ----------
UNIT_FILE="/etc/systemd/system/portal-api.service"
log "Creating the systemd service for the backend (internal bind 127.0.0.1:8000)"
if [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] would write $UNIT_FILE (gunicorn main:app, uvicorn workers, bind 127.0.0.1:8000, User=$PROJECT_OWNER, EnvironmentFile=$ENV_FILE)"
else
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Dedicated Server Portal API
After=network.target mysql.service mysqld.service
Wants=mysql.service mysqld.service

[Service]
Type=exec
User=$PROJECT_OWNER
Group=$PROJECT_OWNER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$INSTALL_DIR/.venv/bin/gunicorn main:app -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000 --workers 2 --access-logfile -
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
fi
run systemctl daemon-reload
run systemctl enable --now portal-api

# ---------- 15) Nginx - reverse proxy (80/443) + static frontend ----------
if [ "$OS_FAMILY" = "debian" ]; then NGINX_SITE="/etc/nginx/sites-available/portal"; else NGINX_SITE="/etc/nginx/conf.d/portal.conf"; fi
if [ -n "$DOMAIN" ]; then SERVER_NAME="$DOMAIN";
elif [ -n "$SSL_IP_HOST" ]; then SERVER_NAME="$SSL_IP_HOST $SERVER_IP";
else SERVER_NAME="_"; fi
log "Configuring Nginx (server_name: $SERVER_NAME - static frontend + /api proxy to 127.0.0.1:8000)"
if [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] would write $NGINX_SITE (server_name $SERVER_NAME, root $INSTALL_DIR/frontend/dist, /api/ -> 127.0.0.1:8000)"
else
cat > "$NGINX_SITE" <<EOF
# Dedicated Server Portal - reverse proxy
# The backend listens only on 127.0.0.1:8000; only 80/443 are public.
server {
    listen 80;
    server_name $SERVER_NAME;

    client_max_body_size 2m;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Request-ID \$request_id;
    }

    location / {
        root $INSTALL_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
fi
if [ "$OS_FAMILY" = "debian" ]; then
  run ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/portal
  run rm -f /etc/nginx/sites-enabled/default
fi
run nginx -t
run systemctl enable --now nginx
run systemctl reload nginx

# SELinux (RHEL only): let Nginx proxy to the backend and read the frontend files
if [ "$OS_FAMILY" = "rhel" ] && command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  run setsebool -P httpd_can_network_connect 1 || true
  run chcon -R -t httpd_sys_content_t "$INSTALL_DIR/frontend/dist" 2>/dev/null || true
  run systemctl reload nginx || true
fi

# Firewall: open 80 and 443 (only if a firewall is active)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  run ufw allow 80/tcp; run ufw allow 443/tcp
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state 2>/dev/null | grep -q running; then
  run firewall-cmd --permanent --add-service=http --add-service=https
  run firewall-cmd --reload
fi

# ---------- 16) HTTPS certificate with Let's Encrypt ----------
# With a domain: certificate for the domain itself.
# Without a domain: certificate for the sslip.io host of the IP.
SSL_OK=0
CERT_DOMAIN=""
if [ -n "$DOMAIN" ]; then CERT_DOMAIN="$DOMAIN";
elif [ -n "$SSL_IP_HOST" ]; then CERT_DOMAIN="$SSL_IP_HOST"; fi
if [ -n "$CERT_DOMAIN" ] && [ "$NO_SSL" != "1" ]; then
  if [ -n "$DOMAIN" ]; then log "Getting a Let's Encrypt certificate for $DOMAIN (port 443)";
  else log "Getting a Let's Encrypt certificate for the server IP ($SERVER_IP) via $SSL_IP_HOST (port 443)"; fi
  if [ "$OS_FAMILY" = "debian" ]; then install_pkgs python3-certbot-nginx || true;
  else install_pkgs certbot python3-certbot-nginx || true; fi
  if [ "$DRY_RUN" = "1" ] || command -v certbot >/dev/null 2>&1; then
    CERTBOT_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
    if [ "$DRY_RUN" = "1" ]; then
      echo "[dry-run] certbot --nginx -d $CERT_DOMAIN --non-interactive --agree-tos -m $CERTBOT_EMAIL --redirect"
      SSL_OK=1
    elif run certbot --nginx -d "$CERT_DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect; then
      SSL_OK=1
      run systemctl reload nginx
      log "HTTPS certificate active (90-day certificate; certbot auto-renewal is on)"
    else
      warn "Getting the Let's Encrypt certificate failed - the site stays on HTTP (port 80) for now."
      if [ -n "$DOMAIN" ]; then
        warn "Usual cause: the domain's DNS does not point at this server yet. Once it does, run:"
        warn "  sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $CERTBOT_EMAIL --redirect"
      else
        warn "Usual cause: the given IP is wrong or port 80 is closed. Manual command:"
        warn "  sudo certbot --nginx -d $SSL_IP_HOST --non-interactive --agree-tos -m $CERTBOT_EMAIL --redirect"
      fi
    fi
  else
    warn "certbot could not be installed; the site stays on HTTP. Later: sudo apt install python3-certbot-nginx && sudo certbot --nginx -d $CERT_DOMAIN"
  fi
fi

# ---------- 17) Wait for the API to become healthy ----------
log "Waiting for the backend health check"
if [ "$DRY_RUN" != "1" ]; then
  OK=0
  # Note: /api/v1/health returns HTTP 200 even when the database is down,
  # so a successful curl is not enough - the body must contain "database":"up".
  for i in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:8000/api/v1/health 2>/dev/null | grep -q '"database"[[:space:]]*:[[:space:]]*"up"'; then OK=1; break; fi
    sleep 3
  done
  [ "$OK" = "1" ] || { warn "The backend did not become healthy within 3 minutes. Logs: journalctl -u portal-api -f"; exit 1; }
  echo "Backend is healthy (MySQL 9 connected)"
fi

# ---------- 18) Summary ----------
if [ -n "$DOMAIN" ] && [ "$SSL_OK" = "1" ]; then SITE_URL="https://$DOMAIN";
elif [ -n "$DOMAIN" ]; then SITE_URL="http://$DOMAIN";
elif [ "$SSL_OK" = "1" ]; then SITE_URL="https://$SSL_IP_HOST";
elif [ -n "$SERVER_IP" ]; then SITE_URL="http://$SERVER_IP";
else SITE_URL="http://localhost"; fi
cat <<EOF

============================================================
 Installation complete (database: MySQL 9.7, Nginx on 443)
------------------------------------------------------------
 Site     : $SITE_URL
 Frontend : $SITE_URL
 Backend  : $SITE_URL/api/v1  (internal: 127.0.0.1:8000 - port 8000 is not public)
 Health   : $SITE_URL/api/v1/health
EOF
if [ -z "$DOMAIN" ] && [ -n "$SERVER_IP" ]; then
  echo " Server IP: $SERVER_IP (HTTPS address via $SSL_IP_HOST)"
fi
if [ "$SKIP_ADMIN" != "1" ]; then
  cat <<EOF
 Admin    : $ADMIN_USERNAME ($ADMIN_EMAIL)
 Admin password: the one you entered (stored nowhere)
EOF
fi
cat <<'EOF'
 JWT/WHMCS secrets and the DB password live only in this server's .env file.
 Everyday commands:
   API status:  sudo systemctl status portal-api
   API logs:    sudo journalctl -u portal-api -f
   Restart:     sudo systemctl restart portal-api nginx
   Test Nginx:  sudo nginx -t
   SSL cert:    sudo certbot renew --dry-run
============================================================
EOF
if [ "${MYSQL_ROOT_PASSWORD_GENERATED:-0}" = "1" ]; then
  echo "The generated MySQL root password is stored in .env (MYSQL_ROOT_PASSWORD)."
fi
