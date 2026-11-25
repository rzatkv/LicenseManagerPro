#!/usr/bin/env bash
# LicenseManagerPro — one-time install script (v2.3.0)
#
# Installs LicenseManagerPro on a real server (Ubuntu 22.04 / 24.04):
#   FastAPI backend  (backend/, Python 3.11+, venv, systemd unit
#                     "license-manager", uvicorn on 127.0.0.1:8000)
#   React frontend   (frontend/, npm build -> static files served by Nginx)
#   MySQL 8 database (connection details are asked for; this script
#                     installs only the mysql *client*, not the server)
#
# Usage:
#   One-liner (downloads and runs this script):
#     curl -fsSL https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/install.sh | sudo bash
#   From a local clone:
#     ./install.sh
#   Options:
#     ./install.sh --help          show usage and exit
#     ./install.sh --dry-run       print every step it WOULD do, change nothing
#     ./install.sh --repair        re-run a previous install safely (see below)
#
# Idempotency / re-running:
#   An install is detected by the marker file
#   /opt/license-manager-pro/.installed (or the license-manager systemd
#   unit). A plain re-run REFUSES with instructions on how to repair or
#   uninstall. With --repair (alias --force) the safe steps are re-run:
#   system packages, code update, venv + pip install, frontend build,
#   Nginx vhosts, database migrations and service restart. A repair NEVER
#   drops or recreates the database and NEVER regenerates backend/.env
#   secrets (SECRET_KEY / DATABASE_URL are kept; only missing keys are
#   added). The first-admin account is only created on a fresh install.
#   To uninstall by hand: stop/disable the service, remove the unit and
#   /opt/license-manager-pro, then drop the MySQL database yourself.
#
# Requirements / assumptions:
#   - Ubuntu 22.04 or 24.04 with apt. Anything else is refused.
#   - Must run as root (use sudo). --dry-run is the exception: it changes
#     nothing, so it may run as any user.
#   - MySQL 8 ONLY. A DATABASE_URL in the environment that mentions
#     sqlite or postgres is refused, same as deploy.sh.
#   - A reachable MySQL 8 server (local or remote). The MySQL *server*
#     itself is NOT installed by this script.
#   - Ports 80 (and 443 for HTTPS) reachable, and the domains (if any)
#     already pointing at this server's public IP before choosing HTTPS.
#
# Safety:
#   - set -euo pipefail; every step announces itself; any failure names
#     the step and exits non-zero (nothing fails silently).
#   - Secrets (passwords, SECRET_KEY) are never printed, never passed on
#     a command line, and never logged. There is intentionally no `set -x`
#     in this script. backend/.env is mode 600, owned by the service user.
#   - All inputs are validated before anything destructive happens.
#   - No real secrets are shipped in this repository.
#
# The interactive wizard reads from /dev/tty, so it works when the script
# is piped from curl. Every answer can also be given as a flag (see
# --help) or an LMP_* environment variable, for unattended use.

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults (overridable by flags / environment)
# ---------------------------------------------------------------------------
REPO_URL="${LMP_REPO_URL:-https://github.com/rzatkv/LicenseManagerPro.git}"
REPO_RAW="https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main"
BRANCH="${LMP_BRANCH:-main}"
INSTALL_DIR="${LMP_INSTALL_DIR:-/opt/license-manager-pro}"
SERVICE_NAME="license-manager"
SERVICE_USER="lmp"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"

DRY_RUN=0
REPAIR=0

# Wizard answers (empty = ask interactively, unless --dry-run).
BACKEND_DOMAIN="${LMP_BACKEND_DOMAIN:-}"
FRONTEND_DOMAIN="${LMP_FRONTEND_DOMAIN:-}"
DB_HOST="${LMP_DB_HOST:-}"
DB_PORT="${LMP_DB_PORT:-3306}"
DB_NAME="${LMP_DB_NAME:-}"
DB_USER="${LMP_DB_USER:-}"
DB_PASSWORD="${LMP_DB_PASSWORD:-}"
ADMIN_EMAIL="${LMP_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${LMP_ADMIN_PASSWORD:-}"
USE_HTTPS="${LMP_USE_HTTPS:-}"   # yes | no (empty = ask, only if a domain is given)

# Filled in during the run; never printed.
SECRET_KEY=""
SERVER_IP=""

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Run a command, or just print it in dry-run mode. The command itself is
# echoed (arguments included) so --dry-run shows exactly what would run.
# Callers must NEVER pass a secret as an argument to run().
run() {
    if [ "$DRY_RUN" -eq 1 ]; then
        printf '    [dry-run] would run:'
        printf ' %q' "$@"
        printf '\n'
    else
        "$@"
    fi
}

# Write a file from stdin, or print what would be written in dry-run mode.
# Usage: emit_file <path> <owner:group> <mode>   (content on stdin)
emit_file() {
    local path="$1" owner="$2" mode="$3"
    if [ "$DRY_RUN" -eq 1 ]; then
        printf '    [dry-run] would write %s (owner %s, mode %s):\n' "$path" "$owner" "$mode"
        sed 's/^/      | /'
        printf '    [dry-run] end of %s\n' "$path"
    else
        local tmp
        tmp="$(mktemp)"
        cat > "$tmp"
        install -o "${owner%%:*}" -g "${owner##*:}" -m "$mode" "$tmp" "$path"
        rm -f "$tmp"
    fi
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    cat <<'EOF'
LicenseManagerPro installer — Ubuntu 22.04 / 24.04, MySQL 8 only.

Usage:
  curl -fsSL https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/install.sh | sudo bash
  ./install.sh [--dry-run] [--repair] [options]

Options:
  --help                 Show this help and exit.
  --dry-run              Print every step that WOULD run (with the exact
                         Nginx and systemd configs it would write) and
                         change nothing. Needs no root and no tty input.
  --repair, --force      Re-run a previous install safely: refreshes code,
                         dependencies, venv, frontend build, Nginx vhosts,
                         migrations and restarts the service. Never drops
                         the database, never regenerates backend/.env
                         secrets, never recreates the admin account.
  --backend-domain HOST  Backend (API) domain, e.g. api.example.com.
  --frontend-domain HOST Frontend (app) domain, e.g. app.example.com.
                         Each domain is optional, but give at least one for
                         a public install; with neither, the app is served
                         on the server IP over plain HTTP.
  --db-host HOST         MySQL host (default: 127.0.0.1).
  --db-port PORT         MySQL port (default: 3306).
  --db-name NAME         MySQL database name (default: license_manager).
  --db-user USER         MySQL user (default: lmp).
  --db-password PASS     MySQL password (asked interactively if omitted;
                         empty at the prompt generates a random one).
  --admin-email EMAIL    First admin account email.
  --admin-password PASS  First admin password (min 8 chars; asked twice
                         interactively if omitted, never echoed).
  --https / --no-https   Enable (or skip) Let's Encrypt HTTPS via certbot.
                         Only asked/offered when at least one domain is
                         given; without domains, plain HTTP is used.
  --install-dir DIR      Install directory (default: /opt/license-manager-pro).
  --branch BRANCH        Git branch to install (default: main).
  --repo URL             Git repository URL (default: the GitHub repo).

Environment: the same values can be given as LMP_BACKEND_DOMAIN,
LMP_FRONTEND_DOMAIN, LMP_DB_HOST, LMP_DB_PORT, LMP_DB_NAME, LMP_DB_USER,
LMP_DB_PASSWORD, LMP_ADMIN_EMAIL, LMP_ADMIN_PASSWORD, LMP_USE_HTTPS
(yes/no), LMP_INSTALL_DIR, LMP_BRANCH, LMP_REPO_URL. Flags win over env.

Anything not given is asked by the interactive wizard (reads /dev/tty,
so piping from curl still works). Secrets are never printed.

Idempotency: a plain re-run refuses if an install already exists (marker
file /opt/license-manager-pro/.installed — or $INSTALL_DIR/.installed when
--install-dir is used — or the license-manager systemd unit). Use
--repair to refresh an existing install, or uninstall by hand:
  sudo systemctl stop --now license-manager
  sudo systemctl disable license-manager
  sudo rm /etc/systemd/system/license-manager.service
  sudo systemctl daemon-reload
  sudo rm -rf /opt/license-manager-pro
  (then DROP DATABASE <name> in MySQL yourself — the script never does)
EOF
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
    case "$1" in
        --help|-h) usage; exit 0 ;;
        --dry-run) DRY_RUN=1; shift ;;
        --repair|--force) REPAIR=1; shift ;;
        --https) USE_HTTPS="yes"; shift ;;
        --no-https) USE_HTTPS="no"; shift ;;
        --backend-domain) BACKEND_DOMAIN="$2"; shift 2 ;;
        --frontend-domain) FRONTEND_DOMAIN="$2"; shift 2 ;;
        --db-host) DB_HOST="$2"; shift 2 ;;
        --db-port) DB_PORT="$2"; shift 2 ;;
        --db-name) DB_NAME="$2"; shift 2 ;;
        --db-user) DB_USER="$2"; shift 2 ;;
        --db-password) DB_PASSWORD="$2"; shift 2 ;;
        --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
        --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
        --install-dir) INSTALL_DIR="$2"; shift 2 ;;
        --branch) BRANCH="$2"; shift 2 ;;
        --repo) REPO_URL="$2"; shift 2 ;;
        --backend-domain=*|--frontend-domain=*|--db-host=*|--db-port=*|--db-name=*)
            die "Unknown option '$1'. Use '--option value' (with a space), not '='."
            ;;
        *) die "Unknown option '$1'. Run with --help for usage." ;;
    esac
done

# ---------------------------------------------------------------------------
# Validation helpers (pure, safe to call in dry-run)
# ---------------------------------------------------------------------------
valid_hostname() {
    # No scheme, no trailing slash, no spaces; labels of letters/digits/
    # hyphens, dots between labels, total <= 253 chars.
    local host="$1"
    [ -n "$host" ] || return 1
    [ "${#host}" -le 253 ] || return 1
    case "$host" in
        *://*|*/*|*\ *|..*|*..|.-*|*.|*-) return 1 ;;
    esac
    printf '%s' "$host" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
}

valid_email() {
    printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
}

# URL-encode one value (for the DB password inside DATABASE_URL).
url_encode() {
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

# ---------------------------------------------------------------------------
# Guards — run before anything destructive
# ---------------------------------------------------------------------------
step "Checking preconditions"

if [ "$DRY_RUN" -eq 1 ]; then
    info "Dry-run mode: no changes will be made, no root needed, no input asked."
    info "Would check: Ubuntu 22.04/24.04, root, DATABASE_URL, existing install."
else
    # 1. Ubuntu 22.04 / 24.04 with apt only.
    if [ ! -f /etc/os-release ] || ! grep -Eq '^ID=ubuntu$' /etc/os-release; then
        die "This installer supports Ubuntu 22.04 / 24.04 only (detected: $(grep -m1 '^PRETTY_NAME=' /etc/os-release 2>/dev/null || echo 'unknown OS')). Aborting rather than guessing package names."
    fi
    if ! grep -Eq '^VERSION_ID="(22\.04|24\.04)"$' /etc/os-release; then
        die "Unsupported Ubuntu version (only 22.04 and 24.04 are supported). Aborting."
    fi
    command -v apt-get >/dev/null 2>&1 || die "apt-get not found. This installer needs an apt-based (Ubuntu) system."
    info "Ubuntu $(grep -m1 '^VERSION_ID=' /etc/os-release | tr -d '"') detected."

    # 2. Must be root (sudo). The installer writes to /opt, /etc and systemd.
    if [ "$(id -u)" -ne 0 ]; then
        die "Must run as root. Re-run with sudo, e.g.: curl -fsSL $REPO_RAW/install.sh | sudo bash"
    fi
fi

# 3. MySQL only — refuse SQLite/PostgreSQL DATABASE_URLs, same rule as deploy.sh.
if [ -n "${DATABASE_URL:-}" ]; then
    case "$DATABASE_URL" in
        sqlite*|*postgres*|*postgresql*)
            die "DATABASE_URL in the environment points at SQLite/PostgreSQL ('${DATABASE_URL%%:*}...'). This installer is MySQL 8 only. Unset DATABASE_URL and re-run."
            ;;
        mysql+pymysql://*) info "DATABASE_URL in the environment is MySQL; the wizard values will take precedence." ;;
        *) die "DATABASE_URL in the environment is not a mysql+pymysql:// URL. Unset it and re-run." ;;
    esac
fi

# 4. Existing install? Refuse unless --repair.
EXISTING_INSTALL=0
if [ -f "$INSTALL_DIR/.installed" ] || [ -f /etc/systemd/system/"$SERVICE_NAME".service ]; then
    EXISTING_INSTALL=1
fi
if [ "$DRY_RUN" -eq 1 ]; then
    info "Would check for an existing install at $INSTALL_DIR (marker file) and the $SERVICE_NAME systemd unit."
elif [ "$EXISTING_INSTALL" -eq 1 ] && [ "$REPAIR" -eq 0 ]; then
    cat >&2 <<EOF

ERROR: LicenseManagerPro already looks installed ($INSTALL_DIR/.installed
and/or the $SERVICE_NAME systemd unit exists). Refusing to overwrite it —
re-running a fresh install would risk your database and secrets.

  To refresh the existing install safely (keeps the database and .env):
    ./install.sh --repair
  To remove it completely first (the database is NEVER dropped for you):
    sudo systemctl stop --now $SERVICE_NAME
    sudo systemctl disable $SERVICE_NAME
    sudo rm /etc/systemd/system/$SERVICE_NAME.service
    sudo systemctl daemon-reload
    sudo rm -rf $INSTALL_DIR
    (then DROP DATABASE in MySQL yourself if you really want it gone)
EOF
    exit 1
fi
if [ "$REPAIR" -eq 1 ]; then
    if [ "$EXISTING_INSTALL" -eq 0 ]; then
        warn "--repair given but no existing install was found; proceeding as a fresh install."
        REPAIR=0
    else
        info "Repair mode: safe steps will be re-run; the database and backend/.env secrets will be kept."
    fi
fi

# ---------------------------------------------------------------------------
# Interactive wizard (reads /dev/tty so piping from curl still works).
# Skipped entirely in dry-run: placeholder values are used instead.
# ---------------------------------------------------------------------------
TTY_IN="/dev/tty"
ask() { # ask <var_name> <prompt> <default>
    local var="$1" prompt="$2" default="$3" answer=""
    printf '%s' "$prompt" > "$TTY_IN"
    if [ -n "$default" ]; then printf ' [%s]' "$default" > "$TTY_IN"; fi
    printf ': ' > "$TTY_IN"
    IFS= read -r answer < "$TTY_IN" || true
    if [ -z "$answer" ]; then answer="$default"; fi
    printf -v "$var" '%s' "$answer"
}

ask_secret_twice() { # ask_secret_twice <var_name> <prompt> ; min 8 chars, twice
    local var="$1" prompt="$2" first="" second=""
    while :; do
        printf '%s: ' "$prompt" > "$TTY_IN"
        IFS= read -rs first < "$TTY_IN" || true
        printf '\n' > "$TTY_IN"
        if [ "${#first}" -lt 8 ]; then
            printf '  Password must be at least 8 characters. Try again.\n' > "$TTY_IN"
            continue
        fi
        printf 'Repeat password: ' > "$TTY_IN"
        IFS= read -rs second < "$TTY_IN" || true
        printf '\n' > "$TTY_IN"
        if [ "$first" != "$second" ]; then
            printf '  Passwords do not match. Try again.\n' > "$TTY_IN"
            continue
        fi
        break
    done
    printf -v "$var" '%s' "$first"
}

ask_yes_no() { # ask_yes_no <var_name> <prompt> <default yes|no>
    local var="$1" prompt="$2" default="$3" answer=""
    while :; do
        printf '%s (yes/no) [%s]: ' "$prompt" "$default" > "$TTY_IN"
        IFS= read -r answer < "$TTY_IN" || true
        answer="${answer:-$default}"
        case "$answer" in
            y|Y|yes|YES|Yes) printf -v "$var" '%s' "yes"; return 0 ;;
            n|N|no|NO|No)   printf -v "$var" '%s' "no";  return 0 ;;
            *) printf '  Please answer yes or no.\n' > "$TTY_IN" ;;
        esac
    done
}

if [ "$DRY_RUN" -eq 1 ]; then
    step "Wizard (dry-run: using placeholder values, asking nothing)"
    BACKEND_DOMAIN="${BACKEND_DOMAIN:-api.example.com}"
    FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-app.example.com}"
    DB_HOST="${DB_HOST:-127.0.0.1}"
    DB_PORT="${DB_PORT:-3306}"
    DB_NAME="${DB_NAME:-license_manager}"
    DB_USER="${DB_USER:-lmp}"
    DB_PASSWORD="dry-run-placeholder"
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
    ADMIN_PASSWORD="dry-run-placeholder"
    USE_HTTPS="${USE_HTTPS:-yes}"
    SERVER_IP="203.0.113.10"
    info "Backend domain:  $BACKEND_DOMAIN"
    info "Frontend domain: $FRONTEND_DOMAIN"
    info "MySQL: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
    info "Admin: $ADMIN_EMAIL"
    info "HTTPS: $USE_HTTPS"
else
    [ -c /dev/tty ] || die "No terminal available for the interactive wizard (/dev/tty is not accessible). Re-run from a terminal, or pass every value as flags (see --help) or LMP_* environment variables."
    step "Setup wizard — domains, database, admin account"
    info "Leave a domain empty to skip it. At least one domain is recommended"
    info "for a public install; with none, the app is served on the server IP."

    while :; do
        if [ -z "$BACKEND_DOMAIN" ]; then
            ask BACKEND_DOMAIN "Backend (API) domain, e.g. api.example.com (empty = none)" ""
        fi
        if [ -n "$BACKEND_DOMAIN" ] && ! valid_hostname "$BACKEND_DOMAIN"; then
            warn "'$BACKEND_DOMAIN' is not a valid hostname (no scheme, no trailing slash, letters/digits/dots/hyphens only)."
            BACKEND_DOMAIN=""
            continue
        fi
        break
    done
    while :; do
        if [ -z "$FRONTEND_DOMAIN" ]; then
            ask FRONTEND_DOMAIN "Frontend (app) domain, e.g. app.example.com (empty = none)" ""
        fi
        if [ -n "$FRONTEND_DOMAIN" ] && ! valid_hostname "$FRONTEND_DOMAIN"; then
            warn "'$FRONTEND_DOMAIN' is not a valid hostname (no scheme, no trailing slash, letters/digits/dots/hyphens only)."
            FRONTEND_DOMAIN=""
            continue
        fi
        if [ -n "$FRONTEND_DOMAIN" ] && [ "$FRONTEND_DOMAIN" = "$BACKEND_DOMAIN" ]; then
            warn "Frontend and backend domains must differ (or leave one empty)."
            FRONTEND_DOMAIN=""
            continue
        fi
        break
    done

    if [ "$REPAIR" -eq 0 ]; then
        info "MySQL 8 connection (the server itself is NOT installed by this script;"
        info "it must already exist and be reachable from here)."
        if [ -z "$DB_HOST" ]; then ask DB_HOST "MySQL host" "127.0.0.1"; fi
        if [ -z "$DB_PORT" ]; then ask DB_PORT "MySQL port" "3306"; fi
        if [ -z "$DB_NAME" ]; then ask DB_NAME "MySQL database name" "license_manager"; fi
        if [ -z "$DB_USER" ]; then ask DB_USER "MySQL user" "lmp"; fi
        case "$DB_PORT" in ''|*[!0-9]*) die "MySQL port must be a number (got '$DB_PORT')." ;; esac
        if [ -z "$DB_PASSWORD" ]; then
            local_pw_choice=""
            ask_yes_no local_pw_choice "Generate a random MySQL password for '$DB_USER'?" "yes"
            if [ "$local_pw_choice" = "yes" ]; then
                DB_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
                info "A random MySQL password was generated (it is stored in backend/.env; it is NOT printed here)."
            else
                printf 'MySQL password for %s (input hidden): ' "$DB_USER" > "$TTY_IN"
                IFS= read -rs DB_PASSWORD < "$TTY_IN" || true
                printf '\n' > "$TTY_IN"
                [ -n "$DB_PASSWORD" ] || die "MySQL password cannot be empty."
            fi
        fi

        while :; do
            if [ -z "$ADMIN_EMAIL" ]; then ask ADMIN_EMAIL "Admin email" ""; fi
            if valid_email "$ADMIN_EMAIL"; then break; fi
            warn "'$ADMIN_EMAIL' does not look like an email address."
            ADMIN_EMAIL=""
        done
        if [ -z "$ADMIN_PASSWORD" ]; then
            ask_secret_twice ADMIN_PASSWORD "Admin password (min 8 chars, input hidden)"
        elif [ "${#ADMIN_PASSWORD}" -lt 8 ]; then
            die "Admin password must be at least 8 characters."
        fi
    else
        info "Repair mode: database credentials and admin account are kept from the existing install."
    fi

    if [ -n "$BACKEND_DOMAIN" ] || [ -n "$FRONTEND_DOMAIN" ]; then
        if [ -z "$USE_HTTPS" ]; then
            ask_yes_no USE_HTTPS "Enable HTTPS with Let's Encrypt (certbot) for the domain(s)? (requires the domain(s) to already point at this server)" "yes"
        fi
    else
        if [ -z "$USE_HTTPS" ]; then USE_HTTPS="no"; fi
        info "No domains given: plain HTTP on the server IP will be used (no HTTPS without a domain)."
    fi
    case "$USE_HTTPS" in yes|no) ;; *) die "USE_HTTPS must be 'yes' or 'no' (got '$USE_HTTPS')." ;; esac
fi

# Derived values (same in dry-run and real runs).
if [ -n "$FRONTEND_DOMAIN" ]; then
    if [ "$USE_HTTPS" = "yes" ]; then FRONTEND_SCHEME="https"; else FRONTEND_SCHEME="http"; fi
    FRONTEND_ORIGIN="$FRONTEND_SCHEME://$FRONTEND_DOMAIN"
else
    FRONTEND_ORIGIN=""
fi
if [ -n "$BACKEND_DOMAIN" ]; then
    if [ "$USE_HTTPS" = "yes" ]; then BACKEND_SCHEME="https"; else BACKEND_SCHEME="http"; fi
    API_URL="$BACKEND_SCHEME://$BACKEND_DOMAIN/api"
else
    API_URL=""
fi
if [ "$DRY_RUN" -eq 0 ]; then
    SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    SERVER_IP="${SERVER_IP:-127.0.0.1}"
fi
if [ -z "$FRONTEND_ORIGIN" ]; then
    FRONTEND_ORIGIN="http://$SERVER_IP"
    FRONTEND_URL="$FRONTEND_ORIGIN"
else
    FRONTEND_URL="$FRONTEND_ORIGIN"
fi
if [ -z "$API_URL" ]; then
    if [ -n "$FRONTEND_DOMAIN" ]; then
        API_URL="$FRONTEND_ORIGIN/api"   # single-domain mode: /api proxied on the frontend vhost
    else
        API_URL="http://$SERVER_IP/api"
    fi
fi

# Validate final wizard values before doing anything destructive.
for d in "$BACKEND_DOMAIN" "$FRONTEND_DOMAIN"; do
    if [ -n "$d" ] && ! valid_hostname "$d"; then die "Invalid domain '$d'."; fi
done
if [ "$REPAIR" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
    valid_email "$ADMIN_EMAIL" || die "Invalid admin email '$ADMIN_EMAIL'."
    [ "${#ADMIN_PASSWORD}" -ge 8 ] || die "Admin password must be at least 8 characters."
fi

# ---------------------------------------------------------------------------
# Step 1 — system dependencies
# ---------------------------------------------------------------------------
step "Step 1/10 — Installing system packages (apt)"

if [ "$DRY_RUN" -eq 1 ]; then
    info "Would run: apt-get update"
    info "Would install: git curl openssl ca-certificates nginx mysql-client"
    info "Would install: python3.11+ (system python3 on 24.04; deadsnakes PPA python3.11 on 22.04)"
    info "Would install: Node.js 20+ (NodeSource setup_20.x) if node is missing or older than 20"
    info "Would install: python3-venv (or python3.11-venv / python3.12-venv to match), certbot + python3-certbot-nginx (only if HTTPS was chosen)"
else
    export DEBIAN_FRONTEND=noninteractive
    run apt-get update -qq \
        || die "Step 1 failed: 'apt-get update' did not succeed. Check network/DNS and re-run."
    UBUNTU_VERSION="$(grep -m1 '^VERSION_ID=' /etc/os-release | cut -d'"' -f2)"
    PY_PKGS=()
    if command -v python3 >/dev/null 2>&1; then
        PY_VER="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo 0.0)"
        PY_MAJOR="${PY_VER%%.*}"; PY_MINOR="${PY_VER##*.}"
        if [ "$PY_MAJOR" -gt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 11 ]; }; then
            PYTHON_BIN="python3"
            PY_PKGS=(python3-venv)
            info "Found python3 $PY_VER (>= 3.11), using it."
        fi
    fi
    if [ -z "${PYTHON_BIN:-}" ]; then
        # Ubuntu 22.04 ships Python 3.10; 3.11 comes from the deadsnakes PPA.
        if [ "$UBUNTU_VERSION" = "22.04" ]; then
            info "Ubuntu 22.04 ships Python 3.10; adding the deadsnakes PPA for Python 3.11."
            run apt-get install -y -qq software-properties-common \
                || die "Step 1 failed: could not install software-properties-common (needed for the deadsnakes PPA)."
            run add-apt-repository -y ppa:deadsnakes/ppa \
                || die "Step 1 failed: could not add the deadsnakes PPA."
            run apt-get update -qq \
                || die "Step 1 failed: 'apt-get update' after adding the PPA did not succeed."
            PYTHON_BIN="python3.11"
            PY_PKGS=(python3.11 python3.11-venv)
        else
            die "Step 1 failed: no Python 3.11+ found and no known way to provide one on Ubuntu $UBUNTU_VERSION."
        fi
    fi
    APT_PKGS=(git curl openssl ca-certificates nginx mysql-client "${PY_PKGS[@]}")
    if [ "$USE_HTTPS" = "yes" ]; then
        APT_PKGS+=(certbot python3-certbot-nginx)
    fi
    run apt-get install -y -qq "${APT_PKGS[@]}" \
        || die "Step 1 failed: 'apt-get install' did not succeed. Fix apt errors and re-run (or ./install.sh --repair)."
    command -v "$PYTHON_BIN" >/dev/null 2>&1 \
        || die "Step 1 failed: $PYTHON_BIN is still not available after install."

    # Node.js 20+ (the frontend build needs it; react-scripts 5 needs >= 14,
    # we standardise on 20 LTS).
    NEED_NODE=1
    if command -v node >/dev/null 2>&1; then
        NODE_MAJOR="$(node --version | sed 's/^v//; s/\..*//')"
        if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then NEED_NODE=0; info "Found node $(node --version) (>= 20), keeping it."; fi
    fi
    if [ "$NEED_NODE" -eq 1 ]; then
        info "Installing Node.js 20 LTS from NodeSource."
        run bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -" \
            || die "Step 1 failed: NodeSource setup_20.x did not succeed."
        run apt-get install -y -qq nodejs \
            || die "Step 1 failed: 'apt-get install nodejs' did not succeed."
        NODE_MAJOR="$(node --version | sed 's/^v//; s/\..*//')"
        [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null \
            || die "Step 1 failed: node is still older than 20 after install (got $(node --version 2>/dev/null || echo none))."
    fi
fi

# ---------------------------------------------------------------------------
# Step 2 — get the code into $INSTALL_DIR
# ---------------------------------------------------------------------------
step "Step 2/10 — Getting the code into $INSTALL_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/backend" ] && [ -d "$SCRIPT_DIR/frontend" ]; then
    LOCAL_REPO="$SCRIPT_DIR"
else
    LOCAL_REPO=""
fi

if [ "$DRY_RUN" -eq 1 ]; then
    if [ -n "$LOCAL_REPO" ]; then
        info "Would sync this local clone ($LOCAL_REPO) into $INSTALL_DIR with rsync (excluding .git, node_modules, .venv, frontend/build, __pycache__)."
    else
        info "Would run: git clone --branch $BRANCH --depth 1 $REPO_URL $INSTALL_DIR"
        info "(If $INSTALL_DIR already has a .git checkout, would instead: git fetch + reset --hard origin/$BRANCH — untracked backend/.env is never touched.)"
    fi
else
    if [ -n "$LOCAL_REPO" ]; then
        info "Local clone detected at $LOCAL_REPO; syncing it into $INSTALL_DIR."
        run mkdir -p "$INSTALL_DIR" \
            || die "Step 2 failed: could not create $INSTALL_DIR."
        command -v rsync >/dev/null 2>&1 || run apt-get install -y -qq rsync \
            || die "Step 2 failed: could not install rsync."
        run rsync -a --delete \
            --exclude=.git --exclude=.venv --exclude=venv \
            --exclude=node_modules --exclude=frontend/build \
            --exclude=__pycache__ --exclude='*.db' \
            "$LOCAL_REPO"/ "$INSTALL_DIR"/ \
            || die "Step 2 failed: rsync of the local clone into $INSTALL_DIR did not succeed."
    elif [ -d "$INSTALL_DIR/.git" ]; then
        info "Existing checkout found; updating it to origin/$BRANCH (untracked backend/.env is preserved)."
        run git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH" \
            || die "Step 2 failed: 'git fetch' did not succeed."
        run git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH" \
            || die "Step 2 failed: 'git reset --hard origin/$BRANCH' did not succeed."
    else
        [ -e "$INSTALL_DIR" ] && die "Step 2 failed: $INSTALL_DIR exists but is not a git checkout. Remove it by hand or use --repair."
        run git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR" \
            || die "Step 2 failed: 'git clone $REPO_URL' did not succeed. Check the URL and network access."
    fi
    [ -d "$INSTALL_DIR/backend" ] && [ -d "$INSTALL_DIR/frontend" ] \
        || die "Step 2 failed: $INSTALL_DIR does not contain backend/ and frontend/ after the code step."
fi

# Version stamp: git tag if present, else the branch name.
if [ "$DRY_RUN" -eq 1 ]; then
    APP_VERSION="2.3.0"
else
    APP_VERSION="$(git -C "$INSTALL_DIR" describe --tags --exact-match 2>/dev/null || true)"
    APP_VERSION="${APP_VERSION:-$(grep -m1 '^APP_VERSION' "$INSTALL_DIR/backend/config.py" 2>/dev/null | sed 's/.*"\([^"]*\)".*/\1/')}"
    APP_VERSION="${APP_VERSION:-2.3.0}"
fi

# ---------------------------------------------------------------------------
# Step 3 — service user + ownership
# ---------------------------------------------------------------------------
step "Step 3/10 — Creating the service user '$SERVICE_USER'"

if [ "$DRY_RUN" -eq 1 ]; then
    info "Would run: id -u $SERVICE_USER || useradd --system --home-dir $INSTALL_DIR --shell /usr/sbin/nologin $SERVICE_USER"
    info "Would run: chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR (frontend/build left world-readable for nginx)"
else
    if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
        run useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER" \
            || die "Step 3 failed: could not create user '$SERVICE_USER'."
    fi
    run chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR" \
        || die "Step 3 failed: could not chown $INSTALL_DIR to $SERVICE_USER."
fi

# ---------------------------------------------------------------------------
# Step 4 — backend venv + dependencies
# ---------------------------------------------------------------------------
step "Step 4/10 — Backend virtualenv + pip install"

if [ "$DRY_RUN" -eq 1 ]; then
    PYTHON_BIN="python3"
    info "Would run: \$PYTHON_BIN -m venv $INSTALL_DIR/backend/venv (fresh install) or reuse it (repair)"
    info "Would run: $INSTALL_DIR/backend/venv/bin/pip install --upgrade pip"
    info "Would run: $INSTALL_DIR/backend/venv/bin/pip install -r $INSTALL_DIR/backend/requirements.txt"
else
    PYTHON_BIN="${PYTHON_BIN:-python3}"
    if [ ! -x "$INSTALL_DIR/backend/venv/bin/python" ]; then
        run "$PYTHON_BIN" -m venv "$INSTALL_DIR/backend/venv" \
            || die "Step 4 failed: 'python -m venv' did not succeed (is ${PYTHON_BIN}-venv installed?)."
    fi
    run "$INSTALL_DIR/backend/venv/bin/pip" install -q --upgrade pip \
        || die "Step 4 failed: 'pip install --upgrade pip' did not succeed."
    run "$INSTALL_DIR/backend/venv/bin/pip" install -q -r "$INSTALL_DIR/backend/requirements.txt" \
        || die "Step 4 failed: 'pip install -r backend/requirements.txt' did not succeed."
    run chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/backend/venv" \
        || die "Step 4 failed: could not chown the venv to $SERVICE_USER."
fi

# ---------------------------------------------------------------------------
# Step 5 — backend/.env (fresh install only; repair keeps existing secrets)
# ---------------------------------------------------------------------------
step "Step 5/10 — Backend configuration (backend/.env)"

ENV_FILE="$INSTALL_DIR/backend/.env"
if [ "$REPAIR" -eq 1 ] && [ -f "$ENV_FILE" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        info "Would keep the existing backend/.env untouched (repair never regenerates secrets)."
    else
        info "Repair mode: keeping the existing backend/.env (secrets are never regenerated)."
        # Only add keys that are missing, so an old .env still gets new settings.
        for pair in "APP_VERSION=$APP_VERSION" "CORS_ORIGINS=$FRONTEND_ORIGIN"; do
            key="${pair%%=*}"
            if ! grep -q "^${key}=" "$ENV_FILE"; then
                printf '%s\n' "$pair" >> "$ENV_FILE"
                info "Added missing $key to backend/.env."
            fi
        done
    fi
else
    if [ "$DRY_RUN" -eq 1 ]; then
        SECRET_KEY="dry-run-placeholder-not-a-real-secret"
        info "Would generate SECRET_KEY with: openssl rand -hex 32 (never printed)"
        info "Would write backend/.env (mode 600, owner $SERVICE_USER) with:"
        info "  DATABASE_URL=mysql+pymysql://$DB_USER:<password-url-encoded>@$DB_HOST:$DB_PORT/$DB_NAME"
        info "  SECRET_KEY=<random 64 hex chars, never shown>"
        info "  APP_VERSION=$APP_VERSION"
        info "  CORS_ORIGINS=$FRONTEND_ORIGIN   (never '*')"
        info "  ACCESS_TOKEN_EXPIRE_MINUTES=60, DAILY_REQUEST_LIMIT=100"
        info "  RATE_LIMIT_AUTH_PER_MINUTE=10, RATE_LIMIT_VALIDATE_PER_MINUTE=60"
    else
        SECRET_KEY="$(openssl rand -hex 32)" \
            || die "Step 5 failed: 'openssl rand -hex 32' did not succeed."
        [ -n "$SECRET_KEY" ] || die "Step 5 failed: generated SECRET_KEY is empty."
        DB_PASSWORD_ENCODED="$(url_encode "$DB_PASSWORD")" \
            || die "Step 5 failed: could not URL-encode the database password."
        DATABASE_URL_VALUE="mysql+pymysql://${DB_USER}:${DB_PASSWORD_ENCODED}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
        umask 077
        {
            printf '# LicenseManagerPro — generated by install.sh. Do not commit. Do not share.\n'
            printf 'DATABASE_URL=%s\n' "$DATABASE_URL_VALUE"
            printf 'SECRET_KEY=%s\n' "$SECRET_KEY"
            printf 'APP_VERSION=%s\n' "$APP_VERSION"
            printf 'CORS_ORIGINS=%s\n' "$FRONTEND_ORIGIN"
            printf 'ACCESS_TOKEN_EXPIRE_MINUTES=60\n'
            printf 'DAILY_REQUEST_LIMIT=100\n'
            printf 'RATE_LIMIT_AUTH_PER_MINUTE=10\n'
            printf 'RATE_LIMIT_VALIDATE_PER_MINUTE=60\n'
        } > "$ENV_FILE" || die "Step 5 failed: could not write $ENV_FILE."
        chmod 600 "$ENV_FILE" || die "Step 5 failed: could not chmod 600 $ENV_FILE."
        chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE" \
            || die "Step 5 failed: could not chown $ENV_FILE to $SERVICE_USER."
        # The DATABASE_URL must be MySQL — refuse anything else, even our own.
        case "$DATABASE_URL_VALUE" in
            mysql+pymysql://*) ;;
            *) die "Step 5 failed: generated DATABASE_URL is not MySQL. Aborting." ;;
        esac
        info "Wrote $ENV_FILE (mode 600, owner $SERVICE_USER). The SECRET_KEY and passwords are not shown."
    fi
fi

# ---------------------------------------------------------------------------
# Step 6 — MySQL database + grants, then migrations
# ---------------------------------------------------------------------------
step "Step 6/10 — MySQL database, user grants, and schema"

# A temporary MySQL defaults file (mode 600) so the password never appears
# in a command line (visible via ps) or in the shell history.
mysql_defaults_file() {
    local f
    f="$(mktemp)"
    chmod 600 "$f"
    {
        printf '[client]\n'
        printf 'host=%s\n' "$DB_HOST"
        printf 'port=%s\n' "$DB_PORT"
        printf 'user=%s\n' "$DB_USER"
        printf 'password=%s\n' "$DB_PASSWORD"
    } > "$f"
    printf '%s' "$f"
}

if [ "$DRY_RUN" -eq 1 ]; then
    info "Would test the MySQL connection (mysql --defaults-extra-file=<temp 600 file> -e 'SELECT 1')."
    info "Would run (as the MySQL admin/root-equivalent credentials just given — the script"
    info "  connects as DB_USER; if that user cannot CREATE DATABASE, create it by hand first):"
    info "  CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    info "  CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '<password>';"
    info "  GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%'; FLUSH PRIVILEGES;"
    info "Would run migrations: 'alembic upgrade head' if backend/alembic.ini exists;"
    info "  otherwise the backend creates/migrates its own schema on startup (ensure_schema)."
else
    if [ "$REPAIR" -eq 0 ]; then
        CNF="$(mysql_defaults_file)"
        trap 'rm -f "$CNF"' EXIT
        # 6a. The app user must be able to connect. If it cannot, the
        # operator must create it first (we do not ask for a MySQL root
        # password here — that would be a second secret to handle).
        if ! mysql --defaults-extra-file="$CNF" -e "SELECT 1;" >/dev/null 2>&1; then
            rm -f "$CNF"; trap - EXIT
            cat >&2 <<EOF

ERROR (step 6): Could not connect to MySQL as '$DB_USER'@$DB_HOST:$DB_PORT.
Create the database and user first (as a MySQL admin), then re-run with --repair:

  mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mysql -u root -p -e "CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '<password>'; GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%'; FLUSH PRIVILEGES;"

(Use the same password you gave the wizard.)
EOF
            exit 1
        fi
        info "MySQL connection as '$DB_USER' works."
        mysql --defaults-extra-file="$CNF" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
            || die "Step 6 failed: CREATE DATABASE did not succeed (does '$DB_USER' have CREATE privileges?)."
        info "Database '$DB_NAME' exists."
        rm -f "$CNF"; trap - EXIT
    else
        info "Repair mode: database and grants are left exactly as they are (never dropped)."
    fi

    # 6b. Migrations. This repo has no Alembic setup: the backend creates
    # missing tables and adds missing columns on startup (ensure_schema in
    # backend/database.py). Run alembic only if a project adds it later.
    if [ -f "$INSTALL_DIR/backend/alembic.ini" ]; then
        info "Alembic found; running 'alembic upgrade head' as $SERVICE_USER."
        (cd "$INSTALL_DIR/backend" && sudo -u "$SERVICE_USER" ./venv/bin/alembic upgrade head) \
            || die "Step 6 failed: 'alembic upgrade head' did not succeed."
    else
        info "No Alembic in this repo; schema is created/migrated by the backend on startup (ensure_schema). Nothing extra to run."
    fi
fi

# ---------------------------------------------------------------------------
# Nginx vhost templates (functions, so --dry-run can print them verbatim)
# ---------------------------------------------------------------------------
# Backend vhost: reverse-proxy to uvicorn on 127.0.0.1:8000.
render_nginx_backend() { # $1 = server_name, $2 = listen directive ("80" or "80 default_server")
    cat <<EOF
# LicenseManagerPro backend (API) — generated by install.sh. Do not edit by hand;
# re-run ./install.sh --repair to regenerate.
server {
    listen $2;
    server_name $1;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
EOF
}

# Frontend vhost: static build + SPA fallback; $3="yes" adds an /api proxy
# (single-domain / no-domain mode, where the API shares this origin).
render_nginx_frontend() { # $1 = server_name, $2 = listen, $3 = api_proxy yes|no
    cat <<EOF
# LicenseManagerPro frontend — generated by install.sh. Do not edit by hand;
# re-run ./install.sh --repair to regenerate.
server {
    listen $2;
    server_name $1;

    root $INSTALL_DIR/frontend/build;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
EOF
    if [ "$3" = "yes" ]; then
        cat <<'EOF'

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
EOF
    fi
    printf '}\n'
}

render_systemd_unit() {
    cat <<EOF
# LicenseManagerPro backend — generated by install.sh. Do not edit by hand;
# re-run ./install.sh --repair to regenerate.
[Unit]
Description=LicenseManagerPro backend (FastAPI / uvicorn)
After=network.target mysql.service
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=$INSTALL_DIR/backend/.env
ExecStart=$INSTALL_DIR/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
}

# ---------------------------------------------------------------------------
# Step 7 — frontend build
# ---------------------------------------------------------------------------
step "Step 7/10 — Frontend build (npm ci && npm run build)"

if [ "$DRY_RUN" -eq 1 ]; then
    info "Would write frontend/.env with: REACT_APP_API_URL=$API_URL"
    info "Would run: cd $INSTALL_DIR/frontend && npm ci (or npm install if no lockfile)"
    info "Would run: cd $INSTALL_DIR/frontend && REACT_APP_API_URL=$API_URL npm run build"
    info "Would run: chmod -R a+rX $INSTALL_DIR/frontend/build (so nginx www-data can read it)"
    info "Build output: $INSTALL_DIR/frontend/build (served by Nginx, SPA fallback to index.html)"
else
    printf 'REACT_APP_API_URL=%s\n' "$API_URL" > "$INSTALL_DIR/frontend/.env" \
        || die "Step 7 failed: could not write $INSTALL_DIR/frontend/.env."
    chown "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/frontend/.env"
    if [ -f "$INSTALL_DIR/frontend/package-lock.json" ]; then
        (cd "$INSTALL_DIR/frontend" && sudo -u "$SERVICE_USER" npm ci) \
            || die "Step 7 failed: 'npm ci' did not succeed."
    else
        (cd "$INSTALL_DIR/frontend" && sudo -u "$SERVICE_USER" npm install) \
            || die "Step 7 failed: 'npm install' did not succeed."
    fi
    (cd "$INSTALL_DIR/frontend" && sudo -u "$SERVICE_USER" env REACT_APP_API_URL="$API_URL" npm run build) \
        || die "Step 7 failed: 'npm run build' did not succeed."
    [ -f "$INSTALL_DIR/frontend/build/index.html" ] \
        || die "Step 7 failed: build finished but frontend/build/index.html is missing."
    chmod -R a+rX "$INSTALL_DIR/frontend/build" \
        || die "Step 7 failed: could not make the build world-readable for nginx."
    info "Frontend built: $INSTALL_DIR/frontend/build (API: $API_URL)."
fi

# ---------------------------------------------------------------------------
# Step 8 — Nginx vhosts
# ---------------------------------------------------------------------------
step "Step 8/10 — Nginx vhosts"

# Decide the layout:
#   both domains    -> backend vhost on BACKEND_DOMAIN, frontend vhost on FRONTEND_DOMAIN
#   frontend only   -> one vhost on FRONTEND_DOMAIN (static + /api proxy)
#   backend only    -> backend vhost on BACKEND_DOMAIN + default vhost on the IP (static + /api proxy)
#   no domains      -> one default vhost on the IP (static + /api proxy)
if [ -n "$BACKEND_DOMAIN" ] && [ -n "$FRONTEND_DOMAIN" ]; then
    BACKEND_VHOST=1; FRONTEND_VHOST=1; FRONTEND_API_PROXY="no"
    BACKEND_SERVER_NAME="$BACKEND_DOMAIN"; BACKEND_LISTEN="80"
    FRONTEND_SERVER_NAME="$FRONTEND_DOMAIN"; FRONTEND_LISTEN="80"
elif [ -n "$FRONTEND_DOMAIN" ]; then
    BACKEND_VHOST=0; FRONTEND_VHOST=1; FRONTEND_API_PROXY="yes"
    FRONTEND_SERVER_NAME="$FRONTEND_DOMAIN"; FRONTEND_LISTEN="80"
elif [ -n "$BACKEND_DOMAIN" ]; then
    BACKEND_VHOST=1; FRONTEND_VHOST=1; FRONTEND_API_PROXY="yes"
    BACKEND_SERVER_NAME="$BACKEND_DOMAIN"; BACKEND_LISTEN="80"
    FRONTEND_SERVER_NAME="_"; FRONTEND_LISTEN="80 default_server"
else
    BACKEND_VHOST=0; FRONTEND_VHOST=1; FRONTEND_API_PROXY="yes"
    FRONTEND_SERVER_NAME="_"; FRONTEND_LISTEN="80 default_server"
fi

write_nginx_vhosts() {
    if [ "$BACKEND_VHOST" -eq 1 ]; then
        render_nginx_backend "$BACKEND_SERVER_NAME" "$BACKEND_LISTEN" \
            | emit_file "$NGINX_SITES_AVAILABLE/license-manager-api" "root:root" "644"
        run ln -sf "$NGINX_SITES_AVAILABLE/license-manager-api" "$NGINX_SITES_ENABLED/license-manager-api"
    fi
    if [ "$FRONTEND_VHOST" -eq 1 ]; then
        render_nginx_frontend "$FRONTEND_SERVER_NAME" "$FRONTEND_LISTEN" "$FRONTEND_API_PROXY" \
            | emit_file "$NGINX_SITES_AVAILABLE/license-manager" "root:root" "644"
        run ln -sf "$NGINX_SITES_AVAILABLE/license-manager" "$NGINX_SITES_ENABLED/license-manager"
    fi
    # The stock Ubuntu "default" site would fight the default_server vhost.
    if [ -e "$NGINX_SITES_ENABLED/default" ]; then
        run rm -f "$NGINX_SITES_ENABLED/default"
    fi
}

if [ "$DRY_RUN" -eq 1 ]; then
    if [ "$BACKEND_VHOST" -eq 1 ]; then info "Backend vhost: server_name $BACKEND_SERVER_NAME (proxy -> 127.0.0.1:8000)."; fi
    if [ "$FRONTEND_VHOST" -eq 1 ]; then info "Frontend vhost: server_name $FRONTEND_SERVER_NAME (root $INSTALL_DIR/frontend/build, SPA fallback; /api proxy: $FRONTEND_API_PROXY)."; fi
    write_nginx_vhosts
    info "Would run: nginx -t && systemctl reload nginx"
else
    write_nginx_vhosts
    run nginx -t || die "Step 8 failed: 'nginx -t' rejected the generated vhosts. The files are in $NGINX_SITES_AVAILABLE/license-manager*."
    run systemctl reload nginx || die "Step 8 failed: 'systemctl reload nginx' did not succeed."
    info "Nginx vhosts installed and reloaded."
fi

# ---------------------------------------------------------------------------
# Step 9 — systemd service for the backend
# ---------------------------------------------------------------------------
step "Step 9/10 — systemd service '$SERVICE_NAME'"

if [ "$DRY_RUN" -eq 1 ]; then
    render_systemd_unit | emit_file "/etc/systemd/system/$SERVICE_NAME.service" "root:root" "644"
    info "Would run: systemctl daemon-reload && systemctl enable --now $SERVICE_NAME"
    info "Would wait for readiness: GET http://127.0.0.1:8000/api/system/ready (up to ~60s)"
else
    render_systemd_unit | emit_file "/etc/systemd/system/$SERVICE_NAME.service" "root:root" "644"
    run systemctl daemon-reload || die "Step 9 failed: 'systemctl daemon-reload' did not succeed."
    run systemctl enable --now "$SERVICE_NAME" \
        || die "Step 9 failed: 'systemctl enable --now $SERVICE_NAME' did not succeed."
    info "Waiting for the backend to answer GET /api/system/ready ..."
    READY=0
    for _ in $(seq 1 30); do
        if curl -fsS -o /dev/null "http://127.0.0.1:8000/api/system/ready" 2>/dev/null; then READY=1; break; fi
        sleep 2
    done
    [ "$READY" -eq 1 ] \
        || die "Step 9 failed: backend did not become ready within ~60s. Check: sudo journalctl -u $SERVICE_NAME -n 100"
    info "Backend is up (GET /api/system/ready answered)."
fi

# ---------------------------------------------------------------------------
# Step 10 — HTTPS (optional), first admin, summary
# ---------------------------------------------------------------------------
step "Step 10/10 — HTTPS, first admin account, summary"

if [ "$USE_HTTPS" = "yes" ]; then
    DOMAINS_ARGS=()
    [ -n "$BACKEND_DOMAIN" ] && DOMAINS_ARGS+=(-d "$BACKEND_DOMAIN")
    [ -n "$FRONTEND_DOMAIN" ] && DOMAINS_ARGS+=(-d "$FRONTEND_DOMAIN")
    if [ "$DRY_RUN" -eq 1 ]; then
        info "Would run: certbot --nginx ${DOMAINS_ARGS[*]} --non-interactive --agree-tos --email $ADMIN_EMAIL --redirect"
        info "(Requires the domain(s) to already resolve to this server; certbot rewrites the Nginx vhosts for SSL.)"
    else
        [ "${#DOMAINS_ARGS[@]}" -gt 0 ] \
            || die "Step 10 failed: HTTPS was requested but no domain was given."
        run certbot --nginx "${DOMAINS_ARGS[@]}" --non-interactive --agree-tos --email "$ADMIN_EMAIL" --redirect \
            || die "Step 10 failed: certbot did not succeed. Check that the domain(s) resolve to this server, then run certbot --nginx by hand."
        info "HTTPS enabled via certbot."
    fi
else
    if [ "$DRY_RUN" -eq 1 ]; then
        info "Would skip certbot (HTTPS not chosen / no domains). Plain HTTP will be used."
    else
        info "HTTPS skipped; plain HTTP will be used."
    fi
fi

# First admin account. Registration is open only while no users exist
# (first-admin bootstrap in backend/routers/auth.py), so this is safe to
# attempt exactly once on a fresh install and must be skipped on repair.
if [ "$REPAIR" -eq 1 ]; then
    info "Repair mode: admin account is kept as-is (not recreated)."
elif [ "$DRY_RUN" -eq 1 ]; then
    info "Would create the first admin via: POST http://127.0.0.1:8000/api/auth/register"
    info "  body: {\"email\": \"$ADMIN_EMAIL\", \"password\": \"<hidden>\"} (sent from a temp file, never echoed)"
else
    REGISTER_JSON="$(mktemp)"
    chmod 600 "$REGISTER_JSON"
    # Build the JSON with python so special characters in the password are escaped.
    ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" REGISTER_JSON="$REGISTER_JSON" python3 -c \
        'import json, os; json.dump({"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]}, open(os.environ["REGISTER_JSON"], "w"))' \
        || { rm -f "$REGISTER_JSON"; die "Step 10 failed: could not build the registration request."; }
    if curl -fsS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:8000/api/auth/register" \
            -H 'Content-Type: application/json' --data @"$REGISTER_JSON" 2>/dev/null | grep -Eq '^(200|201)$'; then
        info "First admin account created."
    else
        rm -f "$REGISTER_JSON"
        cat >&2 <<EOF

WARNING (step 10): the first admin account could NOT be created automatically.
The install itself is complete — create the admin by hand:

  curl -X POST http://127.0.0.1:8000/api/auth/register \\
    -H 'Content-Type: application/json' \\
    -d '{"email": "$ADMIN_EMAIL", "password": "<choose-a-strong-password>"}'

(Registration is open only while no users exist; if an admin already
exists, log in with that account instead.)
EOF
    fi
    rm -f "$REGISTER_JSON"
fi

# Marker file: proves an install exists (used by the re-run guard).
if [ "$DRY_RUN" -eq 1 ]; then
    info "Would write marker file $INSTALL_DIR/.installed (version + date)."
else
    {
        printf 'version=%s\n' "$APP_VERSION"
        printf 'installed=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        printf 'branch=%s\n' "$BRANCH"
    } > "$INSTALL_DIR/.installed"
    chown "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/.installed"
fi

# ---------------------------------------------------------------------------
# Summary — URLs and the admin email only. NEVER a password or SECRET_KEY.
# ---------------------------------------------------------------------------
printf '\n========================================\n'
printf ' LicenseManagerPro installed successfully\n'
printf '========================================\n'
printf ' Frontend:  %s\n' "$FRONTEND_URL"
printf ' API:       %s\n' "$API_URL"
if [ -n "$ADMIN_EMAIL" ]; then
    printf ' Admin login email: %s\n' "$ADMIN_EMAIL"
    printf ' (Use the admin password you chose during setup. Passwords are never printed.)\n'
else
    printf ' Admin login: unchanged (repair kept the existing admin account).\n'
fi
printf ' Backend service: sudo systemctl status %s\n' "$SERVICE_NAME"
printf ' Backend logs:    sudo journalctl -u %s -f\n' "$SERVICE_NAME"
if [ "$USE_HTTPS" != "yes" ]; then
    printf ' Note: plain HTTP is in use. Add a domain and run certbot --nginx to enable HTTPS.\n'
fi
printf ' To refresh this install later (keeps database + secrets): ./install.sh --repair\n'
