#!/usr/bin/env bash
# LicenseManagerPro - one-command native installer.
#
# Installs LicenseManagerPro on a fresh server with a single command:
#   - Python 3.11+ backend (FastAPI/uvicorn, systemd unit "license-manager",
#     listening on 127.0.0.1:8000 only - never exposed directly)
#   - MySQL 9 server, installed and configured by this script
#     (database "license_manager", user "lmp")
#   - React frontend, built and served by Nginx with SPA fallback
#   - One domain on port 443 with a Let's Encrypt certificate
#     (Nginx reverse-proxies /api/ to the backend)
#   - No domain? The script asks for the server's public IP and gets a
#     Let's Encrypt certificate for <ip>.sslip.io (90 days, auto-renewed)
#   - First admin account created automatically via the API
#   - The script fetches the code itself (git clone of the GitHub repo)
#     when the project files are not already on this machine, so the
#     quick-install command works from ANY directory:
#         sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/installation/install.sh)"
#
# Supported OS: Ubuntu/Debian (apt) and RHEL/Rocky/Alma/CentOS/Fedora (dnf).
# Run as root (sudo). Supports DRY_RUN=1 (prints what would happen),
# --repair (re-run safe steps, keeps database/.env/admin), --help,
# --domain=, --admin-email=, --no-ssl, --skip-admin, --install-dir=,
# --branch=, and LMP_* environment variables (see --help).
set -euo pipefail

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    sed -n '2,24p' "$0"
    printf '\nUsage: sudo ./install.sh [options]\n'
    printf '       sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/installation/install.sh)"\n'
    printf '\nOptions:\n'
    printf '  --help             Show this help.\n'
    printf '  --dry-run          Print what would happen; change nothing (needs no root).\n'
    printf '  --repair           Re-run safe steps on an existing install; keeps the\n'
    printf '                     database, backend/.env and the admin account.\n'
    printf '  --no-ssl           Skip certbot (plain HTTP). Default is HTTPS when a\n'
    printf '                     domain or an IP is given.\n'
    printf '  --skip-admin       Do not create the first admin account.\n'
    printf '  --domain=HOST      Domain to serve the app on, e.g. app.example.com.\n'
    printf '  --admin-email=ADR  Admin login email.\n'
    printf '  --install-dir=DIR  Where the code lives (default /opt/license-manager-pro).\n'
    printf '  --branch=NAME      Git branch to install (default main).\n'
    printf '\nEnvironment (same names with the LMP_ prefix): LMP_DOMAIN,\n'
    printf 'LMP_ADMIN_EMAIL, LMP_ADMIN_PASSWORD, LMP_DB_PASSWORD,\n'
    printf 'LMP_INSTALL_DIR, LMP_BRANCH, LMP_REPO_URL, LMP_NO_SSL, DRY_RUN.\n'
    printf 'Passwords must NOT be passed as flags (visible in ps/history).\n'
    printf 'Set them in the environment or let the wizard ask (hidden input).\n'
    exit 0
fi

# ---------------------------------------------------------------------------
# Defaults (overridable by flags / environment)
# ---------------------------------------------------------------------------
REPO_URL="${LMP_REPO_URL:-https://github.com/rzatkv/LicenseManagerPro.git}"
BRANCH="${LMP_BRANCH:-main}"
INSTALL_DIR="${LMP_INSTALL_DIR:-/opt/license-manager-pro}"
SERVICE_NAME="license-manager"
SERVICE_USER="lmp"
APP_VERSION="3.0.13"
DB_NAME="license_manager"
DB_USER="lmp"
DB_HOST="127.0.0.1"
DB_PORT="3306"

DRY_RUN="${DRY_RUN:-0}"
REPAIR=0
NO_SSL="${LMP_NO_SSL:-0}"
SKIP_ADMIN=0

# Wizard answers (empty = ask interactively, unless --dry-run).
DOMAIN="${LMP_DOMAIN:-}"
ADMIN_EMAIL="${LMP_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${LMP_ADMIN_PASSWORD:-}"
DB_PASSWORD="${LMP_DB_PASSWORD:-}"
SERVER_IP="${SERVER_IP:-}"

# Filled in during the run; never printed.
SECRET_KEY=""
SITE_HOST=""
SITE_URL=""
API_URL=""
CORS_ORIGINS=""
USE_HTTPS="yes"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Run a command, or just print it in dry-run mode.
run() {
    if [ "$DRY_RUN" = "1" ]; then
        printf '    [dry-run] %s\n' "$*"
        return 0
    fi
    "$@"
}

# Ask a question on /dev/tty (the wizard must work when stdin is piped).
TTY_IN="/dev/tty"
ask() { # ask VAR "prompt" "default"
    local var="$1" prompt="$2" default="$3" answer=""
    if [ "$DRY_RUN" = "1" ]; then
        printf '    [dry-run] would ask: %s (default: %s)\n' "$prompt" "$default"
        return 0
    fi
    printf '%s [%s]: ' "$prompt" "$default" > "$TTY_IN"
    IFS= read -r answer < "$TTY_IN" || true
    [ -n "$answer" ] || answer="$default"
    printf -v "$var" '%s' "$answer"
}

ask_yes_no() { # ask_yes_no VAR "prompt" "yes|no"
    local var="$1" prompt="$2" default="$3" answer=""
    while :; do
        if [ "$DRY_RUN" = "1" ]; then
            printf '    [dry-run] would ask (yes/no): %s (default: %s)\n' "$prompt" "$default"
            printf -v "$var" '%s' "$default"
            return 0
        fi
        printf '%s (yes/no) [%s]: ' "$prompt" "$default" > "$TTY_IN"
        IFS= read -r answer < "$TTY_IN" || true
        [ -n "$answer" ] || answer="$default"
        case "$answer" in
            yes|no) printf -v "$var" '%s' "$answer"; return 0 ;;
            *) printf 'Please answer yes or no.\n' > "$TTY_IN" ;;
        esac
    done
}

# Ask for a secret twice (hidden input); both entries must match.
ask_secret_twice() { # ask_secret_twice VAR "prompt"
    local var="$1" prompt="$2" first="" second=""
    if [ "$DRY_RUN" = "1" ]; then
        printf '    [dry-run] would ask (hidden, twice): %s\n' "$prompt"
        return 0
    fi
    while :; do
        printf '%s (input hidden): ' "$prompt" > "$TTY_IN"
        IFS= read -rs first < "$TTY_IN" || true
        printf '\n' > "$TTY_IN"
        printf 'Repeat (input hidden): ' > "$TTY_IN"
        IFS= read -rs second < "$TTY_IN" || true
        printf '\n' > "$TTY_IN"
        if [ -z "$first" ]; then
            printf 'It cannot be empty.\n' > "$TTY_IN"
            continue
        fi
        if [ "$first" != "$second" ]; then
            printf 'The two entries do not match. Try again.\n' > "$TTY_IN"
            continue
        fi
        printf -v "$var" '%s' "$first"
        return 0
    done
}

valid_hostname() { # valid_hostname VALUE
    case "$1" in
        *[!A-Za-z0-9.-]*|"") return 1 ;;
        *..*) return 1 ;;
        .*|*.) return 1 ;;
        *) return 0 ;;
    esac
}

valid_email() { # valid_email VALUE
    case "$1" in
        *@*.*) return 0 ;;
        *) return 1 ;;
    esac
}

valid_ipv4() { # valid_ipv4 VALUE
    case "$1" in
        *[!0-9.]*|"") return 1 ;;
    esac
    local IFS=. a b c d
    read -r a b c d <<EOF
$1
EOF
    for o in "$a" "$b" "$c" "$d"; do
        case "$o" in ''|*[!0-9]*) return 1 ;; esac
        [ "$o" -le 255 ] 2>/dev/null || return 1
    done
    [ -n "$a" ] && [ -n "$b" ] && [ -n "$c" ] && [ -n "$d" ]
}

# URL-encode one value (for the DB password inside DATABASE_URL).
url_encode() {
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""), end="")' "$1"
}

random_password() { # random_password BYTES
    openssl rand -hex "${1:-24}"
}

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --repair) REPAIR=1 ;;
        --no-ssl) NO_SSL=1 ;;
        --skip-admin) SKIP_ADMIN=1 ;;
        --domain=*) DOMAIN="${arg#--domain=}" ;;
        --admin-email=*) ADMIN_EMAIL="${arg#--admin-email=}" ;;
        --install-dir=*) INSTALL_DIR="${arg#--install-dir=}" ;;
        --branch=*) BRANCH="${arg#--branch=}" ;;
        --help|-h) ;; # handled above
        --admin-password=*|--db-password=*)
            die "Option '${arg%%=*}' was removed (security): a password on the command line is visible in 'ps' output and shell history. Set LMP_ADMIN_PASSWORD / LMP_DB_PASSWORD in the environment instead, or let the wizard ask for it with hidden input." ;;
        *) die "Unknown option: $arg (see --help)." ;;
    esac
done

# ---------------------------------------------------------------------------
# Step 0 - checks: root, OS, ports, piped-run guard
# ---------------------------------------------------------------------------
step "Step 0/10 - Pre-flight checks"

# Piped runs (curl | bash) set $0 to "bash", so $0 is not a real file.
if [ "$DRY_RUN" != "1" ] && [ "$(id -u)" -ne 0 ] && [ ! -f "$0" ]; then
    die "This installer must run as root. Run it with sudo, or download it first and run 'sudo ./install.sh'."
fi
if [ "$DRY_RUN" != "1" ] && [ "$(id -u)" -ne 0 ]; then
    die "This installer must run as root (it writes to /opt, /etc and systemd). Re-run with sudo."
fi

# OS detection: Debian/Ubuntu (apt) or RHEL/Rocky/Alma/CentOS/Fedora (dnf).
OS_FAMILY=""
OS_ID=""
OS_VERSION=""
if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-}"
    OS_VERSION="${VERSION_ID:-}"
    case "$ID" in
        ubuntu|debian) OS_FAMILY="debian" ;;
        rhel|rocky|almalinux|centos|fedora) OS_FAMILY="rhel" ;;
        *) case "${ID_LIKE:-}" in
               *debian*) OS_FAMILY="debian" ;;
               *rhel*|*fedora*) OS_FAMILY="rhel" ;;
           esac ;;
    esac
fi
[ -n "$OS_FAMILY" ] || die "Unsupported OS: could not detect a Debian/Ubuntu or RHEL-family system from /etc/os-release."
info "OS: $OS_ID $OS_VERSION ($OS_FAMILY)."

# The script's own directory (empty when piped through bash -c).
SCRIPT_DIR=""
if [ -f "$0" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
else
    SCRIPT_DIR="$PWD"
fi

# Ports 80/443 must be free (nginx will bind them).
for port in 80 443; do
    if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$port" 2>/dev/null | grep -q ":$port"; then
        die "Port $port is already in use (something else is listening). Stop that service first, then re-run."
    fi
done

# A previous install exists: only --repair may touch it.
if [ "$REPAIR" -eq 0 ] && [ -f "$INSTALL_DIR/.installed" ] && [ "$DRY_RUN" != "1" ]; then
    die "An install already exists at $INSTALL_DIR (marker .installed found). To refresh it safely (keeps the database, backend/.env and the admin account), re-run with --repair."
fi

# ---------------------------------------------------------------------------
# Setup wizard - admin account, domain, database password
# ---------------------------------------------------------------------------
if [ "$REPAIR" -eq 0 ]; then
    if [ "$DRY_RUN" = "1" ]; then
        # Dry-run: use placeholders so the wizard loops pass without a tty.
        [ -n "$ADMIN_EMAIL" ] || ADMIN_EMAIL="admin@example.com"
        [ -n "$ADMIN_PASSWORD" ] || ADMIN_PASSWORD="dry-run-password-123"
        [ -n "$DB_PASSWORD" ] || DB_PASSWORD="dry-run-db-password"
        info "Dry-run: using placeholder admin/database values (nothing is installed)."
    fi
    if [ "$DRY_RUN" != "1" ]; then
        [ -c /dev/tty ] || die "No terminal available for the interactive wizard (/dev/tty is not accessible). Re-run from a terminal, or pass every value as flags (see --help) or LMP_* environment variables."
    fi
    step "Setup wizard - admin account, domain, database"
    info "The admin email and password are for the first admin login."
    while :; do
        if [ -z "$ADMIN_EMAIL" ]; then ask ADMIN_EMAIL "Admin email" ""; fi
        if valid_email "$ADMIN_EMAIL"; then break; fi
        warn "'$ADMIN_EMAIL' does not look like an email address."
        ADMIN_EMAIL=""
    done
    if [ -z "$ADMIN_PASSWORD" ]; then
        ask_secret_twice ADMIN_PASSWORD "Admin password (8-72 chars, input hidden)"
    fi
    if [ "${#ADMIN_PASSWORD}" -lt 8 ]; then
        die "Admin password must be at least 8 characters."
    fi
    if [ "$(printf '%s' "$ADMIN_PASSWORD" | wc -c)" -gt 72 ]; then
        die "Admin password must be at most 72 bytes (the backend rejects longer ones)."
    fi
    if [ -z "$DOMAIN" ]; then
        ask DOMAIN "Domain to serve the app on, e.g. app.example.com (empty = use the server IP)" ""
    fi
    if [ -n "$DOMAIN" ] && ! valid_hostname "$DOMAIN"; then
        die "'$DOMAIN' is not a valid hostname (no scheme, no trailing slash, letters/digits/dots/hyphens only)."
    fi
    if [ -z "$DB_PASSWORD" ]; then
        local_pw_choice=""
        ask_yes_no local_pw_choice "Generate a random MySQL password for the app user '$DB_USER'?" "yes"
        if [ "$local_pw_choice" = "yes" ]; then
            DB_PASSWORD="$(random_password 24)" || die "Could not generate a random MySQL password."
            info "A random MySQL password was generated (it is stored in backend/.env; it is NOT printed here)."
        else
            printf 'MySQL password for %s (input hidden): ' "$DB_USER" > "$TTY_IN"
            IFS= read -rs DB_PASSWORD < "$TTY_IN" || true
            printf '\n' > "$TTY_IN"
            [ -n "$DB_PASSWORD" ] || die "MySQL password cannot be empty."
        fi
    fi
else
    info "Repair mode: admin account, domain and database credentials are kept from the existing install."
fi

# Derived values (same in dry-run and real runs).
if [ -n "$DOMAIN" ]; then
    SITE_HOST="$DOMAIN"
    SITE_URL="https://$DOMAIN"
    CORS_ORIGINS="https://$DOMAIN"
elif [ "$REPAIR" -eq 1 ] && [ -f "$INSTALL_DIR/backend/.env" ]; then
    # Repair: keep the site URL the existing install was built with.
    SITE_HOST="$(grep '^CORS_ORIGINS=' "$INSTALL_DIR/backend/.env" 2>/dev/null | cut -d= -f2- | cut -d, -f1 | sed 's|https\?://||')"
    SITE_URL="https://$SITE_HOST"
    CORS_ORIGINS="https://$SITE_HOST"
else
    # No domain: serve on the server's public IP with a Let's Encrypt
    # certificate for <ip>.sslip.io (Let's Encrypt does not issue
    # certificates for bare IP addresses; sslip.io names resolve to the IP).
    if [ "$DRY_RUN" = "1" ] && [ -z "$SERVER_IP" ]; then
        SERVER_IP="203.0.113.10"
        info "Dry-run: using placeholder server IP 203.0.113.10 (TEST-NET-3, not real)."
    fi
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP="$(curl -4 -fsS --max-time 10 https://ifconfig.me 2>/dev/null || true)"
    fi
    if [ -n "$SERVER_IP" ] && ! valid_ipv4 "$SERVER_IP"; then
        if printf '%s' "$SERVER_IP" | grep -q ':'; then
            die "The server IP '$SERVER_IP' looks like IPv6. sslip.io works with IPv4 only - give a domain instead."
        fi
        die "Could not detect a valid public IPv4 address (got '$SERVER_IP'). Give a domain with --domain=, or set SERVER_IP."
    fi
    if [ -z "$SERVER_IP" ]; then
        ask SERVER_IP "Server public IPv4 address (no domain given; used for the sslip.io certificate)" ""
        valid_ipv4 "$SERVER_IP" || die "'$SERVER_IP' is not a valid IPv4 address."
    fi
    SSLIP_HOST="$(printf '%s' "$SERVER_IP" | tr '.' '-')".sslip.io
    SITE_HOST="$SSLIP_HOST"
    SITE_URL="https://$SSLIP_HOST"
    CORS_ORIGINS="https://$SSLIP_HOST,http://$SERVER_IP"
    info "No domain given: the site will be https://$SSLIP_HOST (Let's Encrypt, 90 days, auto-renewed by certbot)."
fi
API_URL="$SITE_URL/api"
if [ "$NO_SSL" = "1" ]; then
    USE_HTTPS="no"
    SITE_URL="${SITE_URL/https:/http:}"
    API_URL="${API_URL/https:/http:}"
fi

# ---------------------------------------------------------------------------
# Step 1 - system packages, Python, Node.js, MySQL 9, Nginx, Certbot
# ---------------------------------------------------------------------------
step "Step 1/10 - System packages, Python, Node.js, MySQL 9, Nginx, Certbot"

# Pick Python 3.11+ (prefer 3.12, then 3.11); installs the interpreter and
# the venv package when the OS provides one. On Ubuntu older than 24.04
# neither is in the default repos, so the deadsnakes PPA is used instead
# (same approach as the old root install.sh).
pick_python() {
    for b in python3.12 python3.11; do
        if command -v "$b" >/dev/null 2>&1; then PYTHON_BIN="$b"; return 0; fi
    done
    if [ "$DRY_RUN" = "1" ]; then
        info "Would install a Python 3.11+ interpreter + venv package (python3.12 preferred, python3.11 fallback; deadsnakes PPA on Ubuntu < 24.04)."
        PYTHON_BIN="python3.12"
        return 0
    fi
    if [ "$OS_FAMILY" = "debian" ]; then
        if apt-get install -y python3.12 python3.12-venv 2>/dev/null || apt-get install -y python3.11 python3.11-venv 2>/dev/null; then
            :
        elif [ "$OS_ID" = "ubuntu" ]; then
            info "No Python 3.11+ in the default repos; adding the deadsnakes PPA."
            apt-get install -y software-properties-common || die "Step 1 failed: could not install software-properties-common (needed for the deadsnakes PPA)."
            add-apt-repository -y ppa:deadsnakes/ppa || die "Step 1 failed: could not add the deadsnakes PPA."
            apt-get update || die "Step 1 failed: 'apt-get update' after adding the PPA did not succeed."
            apt-get install -y python3.11 python3.11-venv || die "Step 1 failed: could not install Python 3.11 from the deadsnakes PPA."
        else
            die "Step 1 failed: no Python 3.11+ available on $OS_ID $OS_VERSION."
        fi
    else
        if ! dnf install -y python3.12 python3.12-venv 2>/dev/null; then
            dnf install -y python3.11 python3.11-venv || die "Step 1 failed: could not install Python 3.11+ (tried python3.12 and python3.11)."
        fi
    fi
    for b in python3.12 python3.11; do
        if command -v "$b" >/dev/null 2>&1; then PYTHON_BIN="$b"; return 0; fi
    done
    die "Step 1 failed: Python 3.11+ is still not available after install."
}

if [ "$OS_FAMILY" = "debian" ]; then
    run apt-get update || die "Step 1 failed: 'apt-get update' did not succeed. Check network/DNS and re-run."
    run apt-get install -y ca-certificates curl git gnupg lsb-release openssl \
        || die "Step 1 failed: could not install base packages."
    pick_python
    # Node.js 22 LTS via NodeSource.
    if [ "$DRY_RUN" = "1" ]; then
        info "Would run: curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
        info "Would run: apt-get install -y nodejs"
    else
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
            || die "Step 1 failed: NodeSource setup_22.x did not succeed."
        apt-get install -y nodejs || die "Step 1 failed: 'apt-get install nodejs' did not succeed."
    fi
    [ "$(node --version 2>/dev/null | sed 's/^v//; s/\..*//')" -ge 20 ] 2>/dev/null \
        || [ "$DRY_RUN" = "1" ] \
        || die "Step 1 failed: node is still older than 20 after install (got $(node --version 2>/dev/null || echo none))."
    run apt-get install -y nginx certbot python3-certbot-nginx ufw \
        || die "Step 1 failed: could not install nginx/certbot."
    # MySQL 9.7 LTS from the official Oracle APT repo.
    if [ "$DRY_RUN" = "1" ]; then
        info "Would install MySQL 9.7 LTS (Oracle APT repo mysql-apt-config, server mysql-9.7-lts) and enable the mysql service."
    else
        MYSQL_APT_DEB="$(mktemp --suffix=.deb)"
        curl -fsSL -o "$MYSQL_APT_DEB" "${MYSQL_APT_CONFIG_URL:-https://dev.mysql.com/get/mysql-apt-config_0.8.40-1_all.deb}" \
            || { rm -f "$MYSQL_APT_DEB"; die "Step 1 failed: could not download the MySQL APT config package."; }
        printf 'mysql-apt-config mysql-apt-config/select-server select mysql-9.7-lts\n' | debconf-set-selections
        DEBIAN_FRONTEND=noninteractive dpkg -i "$MYSQL_APT_DEB" \
            || { rm -f "$MYSQL_APT_DEB"; die "Step 1 failed: could not install the MySQL APT config package."; }
        rm -f "$MYSQL_APT_DEB"
        apt-get update || die "Step 1 failed: 'apt-get update' after adding the MySQL repo did not succeed."
        DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server \
            || die "Step 1 failed: could not install mysql-server (MySQL 9.7 LTS)."
        systemctl enable --now mysql || die "Step 1 failed: could not start the mysql service."
    fi
else
    run dnf install -y ca-certificates curl git gnupg openssl \
        || die "Step 1 failed: could not install base packages."
    pick_python
    # Node.js 22 LTS via NodeSource.
    if [ "$DRY_RUN" = "1" ]; then
        info "Would run: curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -"
        info "Would run: dnf install -y nodejs"
    else
        curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - \
            || die "Step 1 failed: NodeSource setup_22.x did not succeed."
        dnf install -y nodejs || die "Step 1 failed: 'dnf install nodejs' did not succeed."
    fi
    [ "$(node --version 2>/dev/null | sed 's/^v//; s/\..*//')" -ge 20 ] 2>/dev/null \
        || [ "$DRY_RUN" = "1" ] \
        || die "Step 1 failed: node is still older than 20 after install (got $(node --version 2>/dev/null || echo none))."
    run dnf install -y epel-release || true
    run dnf install -y nginx certbot python3-certbot-nginx firewalld policycoreutils-python-utils \
        || die "Step 1 failed: could not install nginx/certbot."
    # MySQL 9.7 LTS from the official Oracle YUM repo.
    if [ "$DRY_RUN" = "1" ]; then
        info "Would install MySQL 9.7 LTS (Oracle YUM repo mysql97-community-release, server mysql-server) and enable the mysqld service."
    else
        EL_VER="$(printf '%s' "$OS_VERSION" | cut -d. -f1)"
        dnf install -y "${MYSQL_YUM_RELEASE_URL:-https://dev.mysql.com/get/mysql97-community-release-el${EL_VER}-1.noarch.rpm}" \
            || die "Step 1 failed: could not install the MySQL YUM repo package."
        dnf module disable mysql -y || true
        dnf install -y mysql-server --setopt=install_weak_deps=False \
            || die "Step 1 failed: could not install mysql-server (MySQL 9.7 LTS)."
        systemctl enable --now mysqld || die "Step 1 failed: could not start the mysqld service."
    fi
fi
info "Base packages installed (Python: $PYTHON_BIN, Node: $(node --version 2>/dev/null || echo 'dry-run'))."

# Firewall: open 80/443 (best effort - a locked-down firewall is the
# operator's choice, and the script must not fail for it).
if [ "$OS_FAMILY" = "debian" ]; then
    if command -v ufw >/dev/null 2>&1; then
        run ufw allow 80/tcp || true
        run ufw allow 443/tcp || true
    fi
else
    if command -v firewall-cmd >/dev/null 2>&1; then
        run systemctl enable --now firewalld || true
        run firewall-cmd --permanent --add-service=http || true
        run firewall-cmd --permanent --add-service=https || true
        run firewall-cmd --reload || true
    fi
    if command -v setsebool >/dev/null 2>&1; then
        run setsebool -P httpd_can_network_connect 1 || true
    fi
fi

# ---------------------------------------------------------------------------
# Step 2 - locate the code, or fetch it from GitHub
# ---------------------------------------------------------------------------
step "Step 2/10 - Getting the code into $INSTALL_DIR"

# has_project DIR - true when DIR holds the LicenseManagerPro project.
has_project() {
    [ -f "$1/backend/requirements.txt" ] && [ -f "$1/backend/main.py" ] && [ -f "$1/frontend/package.json" ]
}

PROJECT_DIR=""
if [ -n "${LMP_INSTALL_DIR:-}" ] && has_project "$INSTALL_DIR"; then
    PROJECT_DIR="$INSTALL_DIR"
    info "Project files found in \$LMP_INSTALL_DIR ($INSTALL_DIR)."
elif has_project "$SCRIPT_DIR"; then
    PROJECT_DIR="$SCRIPT_DIR"
    info "Project files found next to the script ($SCRIPT_DIR)."
elif has_project "$PWD"; then
    PROJECT_DIR="$PWD"
    info "Project files found in the current directory ($PWD)."
elif has_project "$SCRIPT_DIR/../LicenseManagerPro"; then
    PROJECT_DIR="$(cd "$SCRIPT_DIR/../LicenseManagerPro" && pwd)"
    info "Project files found in $PROJECT_DIR."
else
    # Nothing on this machine: clone the repo (this is what makes the
    # one-liner work from any directory).
    PROJECT_DIR="$INSTALL_DIR"
    if [ "$DRY_RUN" = "1" ]; then
        info "Would fetch the project: git clone --depth 1 --branch $BRANCH $REPO_URL $PROJECT_DIR"
    else
        if [ -e "$PROJECT_DIR" ]; then
            die "Step 2 failed: $PROJECT_DIR exists but does not contain the LicenseManagerPro project. Remove it by hand or set LMP_INSTALL_DIR to another directory."
        fi
        run git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$PROJECT_DIR" \
            || die "Step 2 failed: 'git clone $REPO_URL' did not succeed. Check the URL and network access to github.com."
    fi
fi
INSTALL_DIR="$PROJECT_DIR"
[ "$DRY_RUN" = "1" ] || cd "$INSTALL_DIR" || die "Step 2 failed: could not enter $INSTALL_DIR."
has_project "$INSTALL_DIR" || [ "$DRY_RUN" = "1" ] \
    || die "Step 2 failed: $INSTALL_DIR does not contain backend/ and frontend/ after the code step."
PROJECT_OWNER="$(stat -c %U "$INSTALL_DIR" 2>/dev/null || echo root)"
info "Project directory: $INSTALL_DIR"

# ---------------------------------------------------------------------------
# Step 3 - service user + ownership
# ---------------------------------------------------------------------------
step "Step 3/10 - Creating the service user '$SERVICE_USER'"

if [ "$DRY_RUN" = "1" ]; then
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
# Step 4 - backend virtualenv + dependencies
# ---------------------------------------------------------------------------
step "Step 4/10 - Backend virtualenv + pip install"

if [ "$DRY_RUN" = "1" ]; then
    info "Would run: \$PYTHON_BIN -m venv $INSTALL_DIR/backend/venv (fresh install) or reuse it (repair)"
    info "Would run: $INSTALL_DIR/backend/venv/bin/pip install --upgrade pip"
    info "Would run: $INSTALL_DIR/backend/venv/bin/pip install -r $INSTALL_DIR/backend/requirements.txt"
else
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
# Step 5 - backend/.env (fresh install only; repair keeps existing secrets)
# ---------------------------------------------------------------------------
step "Step 5/10 - Backend configuration (backend/.env)"

ENV_FILE="$INSTALL_DIR/backend/.env"
if [ "$REPAIR" -eq 1 ] && [ -f "$ENV_FILE" ]; then
    if [ "$DRY_RUN" = "1" ]; then
        info "Would keep the existing backend/.env untouched (repair never regenerates secrets)."
    else
        info "Repair mode: keeping the existing backend/.env (secrets are never regenerated)."
        for pair in "APP_VERSION=$APP_VERSION" "CORS_ORIGINS=$CORS_ORIGINS"; do
            key="${pair%%=*}"
            if ! grep -q "^${key}=" "$ENV_FILE"; then
                printf '%s\n' "$pair" >> "$ENV_FILE"
                info "Added missing $key to backend/.env."
            fi
        done
    fi
else
    if [ "$DRY_RUN" = "1" ]; then
        SECRET_KEY="dry-run-placeholder-not-a-real-secret"
        info "Would generate SECRET_KEY with: openssl rand -hex 32 (never printed)"
        info "Would write backend/.env (mode 600, owner $SERVICE_USER) with:"
        info "  DATABASE_URL=mysql+pymysql://$DB_USER:<hidden>@$DB_HOST:$DB_PORT/$DB_NAME"
        info "  SECRET_KEY=<random 64 hex chars, never shown>"
        info "  APP_VERSION=$APP_VERSION"
        info "  CORS_ORIGINS=$CORS_ORIGINS   (never '*')"
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
            printf '# LicenseManagerPro - generated by install.sh. Do not commit. Do not share.\n'
            printf 'DATABASE_URL=%s\n' "$DATABASE_URL_VALUE"
            printf 'SECRET_KEY=%s\n' "$SECRET_KEY"
            printf 'APP_VERSION=%s\n' "$APP_VERSION"
            printf 'CORS_ORIGINS=%s\n' "$CORS_ORIGINS"
            printf 'ACCESS_TOKEN_EXPIRE_MINUTES=60\n'
            printf 'DAILY_REQUEST_LIMIT=100\n'
            printf 'RATE_LIMIT_AUTH_PER_MINUTE=10\n'
            printf 'RATE_LIMIT_VALIDATE_PER_MINUTE=60\n'
        } > "$ENV_FILE" || die "Step 5 failed: could not write $ENV_FILE."
        chmod 600 "$ENV_FILE" || die "Step 5 failed: could not chmod 600 $ENV_FILE."
        chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE" \
            || die "Step 5 failed: could not chown $ENV_FILE to $SERVICE_USER."
        case "$DATABASE_URL_VALUE" in
            mysql+pymysql://*) ;;
            *) die "Step 5 failed: generated DATABASE_URL is not MySQL. Aborting." ;;
        esac
        info "Wrote $ENV_FILE (mode 600, owner $SERVICE_USER). The SECRET_KEY and passwords are not shown."
    fi
fi

# ---------------------------------------------------------------------------
# Step 6 - MySQL database + user
# ---------------------------------------------------------------------------
step "Step 6/10 - MySQL database and user"

# Root access to MySQL. Debian/Ubuntu: root connects via the unix socket
# (auth_socket), no password. RHEL: MySQL generates a temporary root
# password at first start; rotate it to a random one and save it in a
# root-only file for later use.
MYSQL_SERVICE="mysql"
[ "$OS_FAMILY" = "rhel" ] && MYSQL_SERVICE="mysqld"

setup_mysql_root() { # sets ROOT_CNF (temp defaults file, mode 600)
    ROOT_CNF="$(mktemp)"
    chmod 600 "$ROOT_CNF"
    if [ "$OS_FAMILY" = "debian" ]; then
        printf '[client]\nuser=root\n' > "$ROOT_CNF"
    else
        local temp_pw="" root_pw="" sql_tmp=""
        for _ in $(seq 1 30); do
            temp_pw="$(grep 'temporary password' /var/log/mysqld.log 2>/dev/null | tail -1 | awk '{print $NF}')"
            [ -n "$temp_pw" ] && break
            sleep 2
        done
        [ -n "$temp_pw" ] || die "Step 6 failed: could not read the temporary MySQL root password from /var/log/mysqld.log."
        root_pw="$(random_password 24)" || die "Step 6 failed: could not generate a MySQL root password."
        sql_tmp="$(mktemp)"
        chmod 600 "$sql_tmp"
        printf "ALTER USER 'root'@'localhost' IDENTIFIED BY '%s';\n" "$root_pw" > "$sql_tmp"
        MYSQL_PWD="$temp_pw" mysql -u root --connect-expired-password < "$sql_tmp" \
            || { rm -f "$sql_tmp"; die "Step 6 failed: could not rotate the MySQL root password."; }
        rm -f "$sql_tmp"
        printf '# MySQL root password for this server (generated by install.sh). Keep it safe.\n%s\n' "$root_pw" > /root/.license-manager-pro-mysql-root
        chmod 600 /root/.license-manager-pro-mysql-root
        info "MySQL root password saved to /root/.license-manager-pro-mysql-root (mode 600; it is NOT printed here)."
        {
            printf '[client]\n'
            printf 'user=root\n'
            printf 'password=%s\n' "$root_pw"
        } > "$ROOT_CNF"
    fi
}

if [ "$DRY_RUN" = "1" ]; then
    info "Would wait for MySQL to answer, then run as root:"
    info "  CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    info "  CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '<password>';"
    info "  GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%'; FLUSH PRIVILEGES;"
    info "Schema is created/migrated by the backend itself on startup (ensure_schema); no migration step."
elif [ "$REPAIR" -eq 1 ]; then
    info "Repair mode: database and grants are left exactly as they are (never dropped)."
else
    setup_mysql_root
    trap 'rm -f "$ROOT_CNF"' EXIT
    READY=0
    for _ in $(seq 1 30); do
        if mysql --defaults-extra-file="$ROOT_CNF" -e "SELECT 1;" >/dev/null 2>&1; then READY=1; break; fi
        sleep 2
    done
    [ "$READY" -eq 1 ] || { rm -f "$ROOT_CNF"; trap - EXIT; die "Step 6 failed: MySQL did not answer within ~60s. Check: sudo systemctl status $MYSQL_SERVICE"; }
    info "MySQL is up."
    SQL_FILE="$(mktemp)"
    chmod 600 "$SQL_FILE"
    {
        printf 'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n' "$DB_NAME"
        printf "CREATE USER IF NOT EXISTS '%s'@'%%' IDENTIFIED BY '%s';\n" "$DB_USER" "${DB_PASSWORD//\'/\'\'}"
        printf "GRANT ALL PRIVILEGES ON \`%s\`.* TO '%s'@'%%';\n" "$DB_NAME" "$DB_USER"
        printf 'FLUSH PRIVILEGES;\n'
    } > "$SQL_FILE"
    mysql --defaults-extra-file="$ROOT_CNF" < "$SQL_FILE" \
        || { rm -f "$SQL_FILE" "$ROOT_CNF"; trap - EXIT; die "Step 6 failed: CREATE DATABASE / CREATE USER did not succeed."; }
    rm -f "$SQL_FILE" "$ROOT_CNF"
    trap - EXIT
    info "Database '$DB_NAME' and user '$DB_USER' are ready."
fi

# ---------------------------------------------------------------------------
# Nginx vhost template (function, so --dry-run can print it verbatim)
# ---------------------------------------------------------------------------
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
NGINX_CONF_DIR="/etc/nginx/conf.d"
if [ "$OS_FAMILY" = "rhel" ]; then
    NGINX_VHOST_FILE="$NGINX_CONF_DIR/license-manager.conf"
else
    NGINX_VHOST_FILE="$NGINX_SITES_AVAILABLE/license-manager"
fi

render_nginx_vhost() { # $1 = server_name(s), $2 = listen directive
    cat <<EOF
# LicenseManagerPro - generated by install.sh. Do not edit by hand;
# re-run ./install.sh --repair to regenerate.
server {
    listen $2;
    server_name $1;

    # Browsers only honour HSTS over HTTPS, so this is a no-op on plain
    # HTTP and active once TLS is terminated.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 10m;

    root $INSTALL_DIR/frontend/build;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
}

render_systemd_unit() {
    cat <<EOF
# LicenseManagerPro backend - generated by install.sh. Do not edit by hand;
# re-run ./install.sh --repair to regenerate.
[Unit]
Description=LicenseManagerPro backend (FastAPI / uvicorn)
After=network.target $MYSQL_SERVICE.service
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=$INSTALL_DIR/backend/.env
# Nginx (same host) sets X-Forwarded-For, and uvicorn must honour it -
# otherwise every client looks like 127.0.0.1 to the app, so the per-IP
# rate limits are shared by all users and module-key IP allowlists see
# the proxy IP instead of the caller. Only 127.0.0.1 is trusted: uvicorn
# listens on loopback only, so no outside client can spoof the header.
ExecStart=$INSTALL_DIR/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
}

# ---------------------------------------------------------------------------
# Step 7 - frontend build
# ---------------------------------------------------------------------------
step "Step 7/10 - Frontend build (npm ci && npm run build)"

if [ "$DRY_RUN" = "1" ]; then
    info "Would write frontend/.env with: REACT_APP_API_URL=$API_URL"
    info "Would run: cd $INSTALL_DIR/frontend && npm ci (or npm install if no lockfile)"
    info "Would run: cd $INSTALL_DIR/frontend && REACT_APP_API_URL=$API_URL npm run build"
    info "Would run: chmod -R a+rX $INSTALL_DIR/frontend/build (so nginx can read it)"
    info "Build output: $INSTALL_DIR/frontend/build (served by Nginx, SPA fallback to index.html)"
else
    printf 'REACT_APP_API_URL=%s\n' "$API_URL" > "$INSTALL_DIR/frontend/.env" \
        || die "Step 7 failed: could not write $INSTALL_DIR/frontend/.env."
    chown "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/frontend/.env"
    if [ -f "$INSTALL_DIR/frontend/package-lock.json" ]; then
        (cd "$INSTALL_DIR/frontend" && npm ci) \
            || die "Step 7 failed: 'npm ci' did not succeed."
    else
        (cd "$INSTALL_DIR/frontend" && npm install) \
            || die "Step 7 failed: 'npm install' did not succeed."
    fi
    (cd "$INSTALL_DIR/frontend" && env REACT_APP_API_URL="$API_URL" npm run build) \
        || die "Step 7 failed: 'npm run build' did not succeed."
    [ -f "$INSTALL_DIR/frontend/build/index.html" ] \
        || die "Step 7 failed: build finished but frontend/build/index.html is missing."
    chmod -R a+rX "$INSTALL_DIR/frontend/build" \
        || die "Step 7 failed: could not make the build world-readable for nginx."
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/frontend" \
        || die "Step 7 failed: could not chown the frontend to $SERVICE_USER."
    if [ "$OS_FAMILY" = "rhel" ] && command -v chcon >/dev/null 2>&1; then
        chcon -R -t httpd_sys_content_t "$INSTALL_DIR/frontend/build" || true
    fi
    info "Frontend built: $INSTALL_DIR/frontend/build (API: $API_URL)."
fi

# ---------------------------------------------------------------------------
# Step 8 - Nginx vhost
# ---------------------------------------------------------------------------
step "Step 8/10 - Nginx vhost"

# server_name: the site host, plus the raw IP when the site is IP-based
# (so the site also answers directly on the IP over plain HTTP).
if [ -n "$DOMAIN" ]; then
    SERVER_NAMES="$SITE_HOST"
else
    SERVER_NAMES="$SITE_HOST $SERVER_IP"
fi

write_nginx_vhost() {
    if [ "$OS_FAMILY" = "rhel" ]; then
        render_nginx_vhost "$SERVER_NAMES" "80" > "$NGINX_VHOST_FILE" \
            || die "Step 8 failed: could not write $NGINX_VHOST_FILE."
    else
        render_nginx_vhost "$SERVER_NAMES" "80" > "$NGINX_VHOST_FILE" \
            || die "Step 8 failed: could not write $NGINX_VHOST_FILE."
        run ln -sf "$NGINX_VHOST_FILE" "$NGINX_SITES_ENABLED/license-manager"
        if [ -e "$NGINX_SITES_ENABLED/default" ]; then
            run rm -f "$NGINX_SITES_ENABLED/default"
        fi
    fi
}

if [ "$DRY_RUN" = "1" ]; then
    info "Vhost: server_name $SERVER_NAMES (root $INSTALL_DIR/frontend/build, SPA fallback; /api proxy to 127.0.0.1:8000)."
    render_nginx_vhost "$SERVER_NAMES" "80"
    info "Would run: nginx -t && systemctl enable --now nginx && systemctl reload nginx"
else
    write_nginx_vhost
    run nginx -t || die "Step 8 failed: 'nginx -t' rejected the generated vhost. The file is $NGINX_VHOST_FILE."
    run systemctl enable --now nginx || die "Step 8 failed: could not start nginx."
    run systemctl reload nginx || die "Step 8 failed: 'systemctl reload nginx' did not succeed."
    info "Nginx vhost installed and reloaded."
fi

# ---------------------------------------------------------------------------
# Step 9 - systemd service for the backend
# ---------------------------------------------------------------------------
step "Step 9/10 - systemd service '$SERVICE_NAME'"

if [ "$DRY_RUN" = "1" ]; then
    render_systemd_unit
    info "Would run: systemctl daemon-reload && systemctl enable --now $SERVICE_NAME"
    info "Would wait for readiness: GET http://127.0.0.1:8000/api/system/ready (up to ~60s)"
else
    render_systemd_unit > "/etc/systemd/system/$SERVICE_NAME.service" \
        || die "Step 9 failed: could not write /etc/systemd/system/$SERVICE_NAME.service."
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
# Step 10 - HTTPS, first admin account, summary
# ---------------------------------------------------------------------------
step "Step 10/10 - HTTPS, first admin account, summary"

HTTPS_OK=0
if [ "$USE_HTTPS" = "yes" ]; then
    if [ "$DRY_RUN" = "1" ]; then
        info "Would run: certbot --nginx -d $SITE_HOST --non-interactive --agree-tos --email $ADMIN_EMAIL --redirect"
        info "(Requires the domain to already resolve to this server; certbot rewrites the Nginx vhost for SSL.)"
        HTTPS_OK=1
    else
        if run certbot --nginx -d "$SITE_HOST" --non-interactive --agree-tos --email "$ADMIN_EMAIL" --redirect; then
            HTTPS_OK=1
            info "HTTPS enabled via certbot."
        else
            warn "certbot did not succeed. The site stays on plain HTTP for now."
            warn "Check that $SITE_HOST resolves to this server, then run: sudo certbot --nginx -d $SITE_HOST"
            SITE_URL="http://${SITE_HOST}"
            API_URL="http://${SITE_HOST}/api"
        fi
    fi
else
    if [ "$DRY_RUN" = "1" ]; then
        info "Would skip certbot (HTTPS not chosen). Plain HTTP will be used."
    else
        info "HTTPS skipped; plain HTTP will be used."
    fi
fi

# First admin account. Registration is open only while no users exist
# (first-admin bootstrap in backend/routers/auth.py), so this is safe to
# attempt exactly once on a fresh install and must be skipped on repair.
if [ "$REPAIR" -eq 1 ]; then
    info "Repair mode: admin account is kept as-is (not recreated)."
elif [ "$SKIP_ADMIN" -eq 1 ]; then
    info "Admin creation skipped (--skip-admin). Create the first admin by hand (see below)."
elif [ "$DRY_RUN" = "1" ]; then
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
The install itself is complete - create the admin by hand:

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
if [ "$DRY_RUN" = "1" ]; then
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
# Summary - URLs and the admin email only. NEVER a password or SECRET_KEY.
# ---------------------------------------------------------------------------
printf '\n========================================\n'
printf ' LicenseManagerPro installed successfully\n'
printf '========================================\n'
printf ' Frontend:  %s\n' "$SITE_URL"
printf ' API:       %s\n' "$API_URL"
if [ "$REPAIR" -eq 1 ]; then
    printf ' Admin login: unchanged (repair kept the existing admin account).\n'
elif [ "$SKIP_ADMIN" -eq 1 ]; then
    printf ' Admin login: not created (--skip-admin). Create it with the curl command above.\n'
else
    printf ' Admin login email: %s\n' "$ADMIN_EMAIL"
    printf ' (Use the admin password you chose during setup. Passwords are never printed.)\n'
fi
printf ' Backend service: sudo systemctl status %s\n' "$SERVICE_NAME"
printf ' Backend logs:    sudo journalctl -u %s -f\n' "$SERVICE_NAME"
if [ "$USE_HTTPS" != "yes" ] || [ "$HTTPS_OK" -eq 0 ]; then
    printf ' Note: plain HTTP is in use. Add a domain and run: sudo certbot --nginx -d %s\n' "$SITE_HOST"
fi
printf ' To refresh this install later (keeps database + secrets): ./install.sh --repair\n'
