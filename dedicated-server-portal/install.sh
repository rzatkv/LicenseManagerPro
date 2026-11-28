#!/usr/bin/env bash
# install.sh — نصب کامل Dedicated Server Portal با یک دستور (بدون Docker)
#
#   sudo ./install.sh
#
# چه کار می‌کند (به ترتیب):
#   ۱) سیستم‌عامل را تشخیص می‌دهد (Ubuntu/Debian یا RHEL/Rocky/Alma/CentOS/Fedora)
#      و همه پیش‌نیازها را نصب می‌کند: Python 3.11+ ،Node 22 ،MySQL 9.7 LTS ،Nginx ،Certbot ،Redis
#   ۲) اطلاعات ادمین را از شما می‌پرسد (نام کاربری، ایمیل، نام کامل، رمز عبور)
#      و حساب SuperAdmin را می‌سازد
#   ۳) دیتابیس MySQL 9 را می‌سازد، Migrationها را اجرا می‌کند، فرانت‌اند را بیلد می‌کند
#   ۴) بک‌اند را با systemd بالا می‌آورد (فقط روی 127.0.0.1:8000 — پورت ۸۰۰۰ بیرون باز نیست)
#   ۵) Nginx را Reverse Proxy می‌کند: دامنه شما روی پورت ۴۴۳ (HTTPS با Let's Encrypt)
#      و فرانت‌اند + /api/v1 را سرو می‌کند. اگر دامنه ندادید، IP را می‌پرسد و گواهی
#      معتبر Let's Encrypt را برای همان IP می‌گیرد (از طریق sslip.io — چون Let's Encrypt
#      برای IP خام گواهی صادر نمی‌کند؛ گواهی ۹۰ روزه است و certbot خودش تمدیدش می‌کند)
#
# گزینه‌ها:
#   ./install.sh --help            راهنما
#   ./install.sh --dry-run         فقط نمایش دستورات، بدون اجرا (DRY_RUN=1 هم همین کار را می‌کند)
#   ./install.sh --no-ssl          بدون گرفتن گواهی Let's Encrypt (فقط HTTP روی پورت ۸۰)
#   ./install.sh --skip-admin      بدون ساخت SuperAdmin
#   ./install.sh --domain=portal.example.com
#   ./install.sh --admin-user=reza --admin-email=reza@example.com
#
# متغیرهای محیطی (برای اجرای غیرتعاملی):
#   DOMAIN=portal.example.com  ADMIN_USERNAME=admin  ADMIN_EMAIL=admin@example.com
#   ADMIN_FULL_NAME="Reza Karimi"  ADMIN_PASSWORD='...'  DB_PASSWORD='...'  MYSQL_ROOT_PASSWORD='...'
#   MYSQL_APT_CONFIG_URL=...  MYSQL_YUM_RELEASE_URL=...  (در صورت تغییر آدرس بسته‌های اوراکل)
#
# نکته امنیتی: رمز ادمین هیچ‌وقت در فایل ذخیره نمی‌شود؛ فقط همان لحظه به اسکریپت ساخت
# ادمین داده می‌شود. Secretها (JWT ،WHMCS ،رمز دیتابیس) فقط در فایل .env با دسترسی 600 هستند.
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$INSTALL_DIR"

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
      sed -n '2,32p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    --dry-run) DRY_RUN=1 ;;
    --no-ssl) NO_SSL=1 ;;
    --skip-admin) SKIP_ADMIN=1 ;;
    --domain=*) DOMAIN="${arg#--domain=}" ;;
    --admin-user=*) ADMIN_USERNAME="${arg#--admin-user=}" ;;
    --admin-email=*) ADMIN_EMAIL="${arg#--admin-email=}" ;;
    --admin-full-name=*) ADMIN_FULL_NAME="${arg#--admin-full-name=}" ;;
    *) echo "گزینه ناشناخته: $arg (راهنما: ./install.sh --help)" >&2; exit 2 ;;
  esac
done

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf '!! %s\n' "$*" >&2; }
die()  { warn "خطا: $*"; exit 1; }
run()  { if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; else "$@"; fi; }

rand_hex() { openssl rand -hex "$1"; }
rand_password() { # رمز قوی سازگار با policy بک‌اند: بزرگ+کوچک+عدد+خاص
  printf '%s' "$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-16)Aa1!"
}

password_ok() { # policy بک‌اند: حداقل ۱۰ کاراکتر + بزرگ + کوچک + عدد + کاراکتر خاص
  local p="$1"
  [ "${#p}" -ge 10 ] || return 1
  printf '%s' "$p" | grep -q '[A-Z]' || return 1
  printf '%s' "$p" | grep -q '[a-z]' || return 1
  printf '%s' "$p" | grep -q '[0-9]' || return 1
  printf '%s' "$p" | grep -q '[^A-Za-z0-9]' || return 1
  return 0
}

# ---------- 0) باید root باشیم (یا با sudo دوباره اجرا شویم) ----------
if [ "$(id -u)" -ne 0 ]; then
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] (به‌جای root اجرا نمی‌شود؛ در اجرای واقعی با sudo دوباره اجرا می‌شود)"
  elif command -v sudo >/dev/null 2>&1; then
    log "اجرا با sudo..."
    exec sudo DRY_RUN="$DRY_RUN" DOMAIN="$DOMAIN" SERVER_IP="$SERVER_IP" ADMIN_USERNAME="$ADMIN_USERNAME" \
      ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_FULL_NAME="$ADMIN_FULL_NAME" \
      ADMIN_PASSWORD="$ADMIN_PASSWORD" DB_PASSWORD="$DB_PASSWORD" \
      "$0" "$@"
  else
    die "این اسکریپت باید با root یا sudo اجرا شود."
  fi
fi

# ---------- 1) تشخیص سیستم‌عامل ----------
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
  *) die "سیستم‌عامل پشتیبانی نمی‌شود: ${OS_ID:-نامشخص} ${OS_VERSION_ID:-}. پشتیبانی‌شده: Ubuntu/Debian و RHEL/Rocky/AlmaLinux/CentOS/Fedora." ;;
esac
EL_VERSION="$(printf '%s' "$OS_VERSION_ID" | cut -d. -f1)"
log "سیستم‌عامل: ${PRETTY_NAME:-$OS_ID $OS_VERSION_ID} (خانواده: $OS_FAMILY)"

PROJECT_OWNER="$(stat -c %U "$INSTALL_DIR")"
as_owner() { # اجرای دستور به‌عنوان مالک پروژه (نه root) تا فایل‌ها مال او بمانند
  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; return 0; fi
  if [ "$PROJECT_OWNER" = "root" ]; then "$@"; else runuser -u "$PROJECT_OWNER" -- "$@"; fi
}

# ---------- 2) بررسی پورت‌های ۸۰ و ۴۴۳ ----------
if [ "$DRY_RUN" != "1" ]; then
  for port in 80 443; do
    if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$port" 2>/dev/null | grep -q ":$port"; then
      warn "پورت $port همین حالا در حال استفاده است — Nginx نمی‌تواند روی آن بالا بیاید. اول سرویس اشغال‌کننده را متوقف کنید."
    fi
  done
fi

# ---------- 3) پرسیدن اطلاعات از کاربر (قبل از نصب طولانی) ----------
prompt_text() { # prompt_text VAR "سؤال" "پیش‌فرض"
  local var="$1" q="$2" def="$3" val=""
  eval "val=\${$var:-}"
  [ -n "$val" ] && return 0
  if [ "$DRY_RUN" = "1" ]; then eval "$var=\"\$def\""; return 0; fi
  if [ -n "$def" ]; then printf '%s [%s]: ' "$q" "$def"; else printf '%s: ' "$q"; fi
  read -r val || true
  [ -z "$val" ] && val="$def"
  eval "$var=\"\$val\""
}
prompt_password() { # prompt_password VAR "سؤال" — دو بار می‌پرسد و policy را چک می‌کند
  local var="$1" q="$2" p1="" p2=""
  eval "[ -n \"\${$var:-}\" ]" && return 0
  [ "$DRY_RUN" = "1" ] && { eval "$var=\"DryRun1234!x\""; return 0; }
  while :; do
    printf '%s (حداقل ۱۰ کاراکتر، بزرگ+کوچک+عدد+خاص): ' "$q"
    read -rs p1 || true; echo
    printf 'تکرار رمز: '; read -rs p2 || true; echo
    [ "$p1" = "$p2" ] || { warn "دو رمز یکی نیست؛ دوباره وارد کنید."; continue; }
    password_ok "$p1" || { warn "رمز ضعیف است؛ باید حداقل ۱۰ کاراکتر با حروف بزرگ و کوچک، عدد و کاراکتر خاص داشته باشد."; continue; }
    eval "$var=\"\$p1\""
    return 0
  done
}

if [ "$SKIP_ADMIN" != "1" ]; then
  log "اطلاعات حساب ادمین (سفارشی — همین‌ها ساخته می‌شوند)"
  prompt_text ADMIN_USERNAME "نام کاربری ادمین" "admin"
  prompt_text ADMIN_EMAIL "ایمیل ادمین" "admin@example.com"
  prompt_text ADMIN_FULL_NAME "نام کامل ادمین" "System Administrator"
  prompt_password ADMIN_PASSWORD "رمز عبور ادمین"
fi
log "دامنه (برای HTTPS روی پورت ۴۴۳)"
prompt_text DOMAIN "دامنه (مثل portal.example.com — خالی = فقط با IP روی پورت ۸۰)" ""
if [ -n "$DOMAIN" ]; then
  case "$DOMAIN" in
    *.*) : ;;
    *) die "دامنه معتبر نیست: $DOMAIN" ;;
  esac
  if [ "$DRY_RUN" != "1" ] && command -v getent >/dev/null 2>&1; then
    if ! getent hosts "$DOMAIN" >/dev/null 2>&1; then
      warn "دامنه $DOMAIN به هیچ IPای resolve نمی‌شود — برای گرفتن گواهی Let's Encrypt باید DNS آن به همین سرور اشاره کند. نصب ادامه می‌یابد و بعداً می‌توانید با certbot دوباره تلاش کنید."
    fi
  fi
fi
# بدون دامنه: IP عمومی سرور را می‌پرسیم و گواهی SSL را روی همان IP می‌گیریم.
# Let's Encrypt برای IP خام گواهی صادر نمی‌کند، پس از sslip.io استفاده می‌شود:
# هاست <ip>.sslip.io (مثلاً 1-2-3-4.sslip.io) به همان IP resolve می‌شود و certbot
# برای آن یک گواهی معتبر ۹۰ روزه می‌گیرد که خودش تمدیدش می‌کند.
SSL_IP_HOST=""
if [ -z "$DOMAIN" ]; then
  DETECTED_IP=""
  if [ "$DRY_RUN" != "1" ]; then
    DETECTED_IP="$(curl -4 -fsS --max-time 10 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) {print $i; exit}}')"
  fi
  if [ "$DRY_RUN" = "1" ]; then SERVER_IP="203.0.113.10";
  else prompt_text SERVER_IP "IP عمومی سرور (برای گرفتن گواهی SSL)" "$DETECTED_IP"; fi
  if ! printf '%s' "$SERVER_IP" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    die "IP معتبر IPv4 نیست: $SERVER_IP (برای IPv6 یا IP نامعتبر، دامنه بدهید)"
  fi
  SSL_IP_HOST="$(printf '%s' "$SERVER_IP" | tr '.' '-').sslip.io"
  if [ "$DRY_RUN" != "1" ] && [ -n "$DETECTED_IP" ] && [ "$SERVER_IP" != "$DETECTED_IP" ]; then
    warn "IP داده‌شده ($SERVER_IP) با IP عمومی تشخیص‌داده‌شده سرور ($DETECTED_IP) فرق می‌کند — گواهی SSL ممکن است ناموفق باشد."
  fi
fi
if [ -z "$DB_PASSWORD" ]; then
  if [ "$DRY_RUN" = "1" ]; then DB_PASSWORD="DryRunDb1234!x";
  else
    printf 'رمز دیتابیس MySQL برای کاربر portal (خالی = ساخت خودکار رمز قوی): '
    read -rs DB_PASSWORD || true; echo
    [ -z "$DB_PASSWORD" ] && DB_PASSWORD="$(rand_password)"
  fi
fi

# ---------- 4) نصب پیش‌نیازها ----------
install_pkgs() {
  if [ "$OS_FAMILY" = "debian" ]; then
    run apt-get update -y
    run env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  else
    run dnf install -y "$@"
  fi
}

if [ "$OS_FAMILY" = "debian" ]; then
  log "نصب بسته‌های پایه (Debian/Ubuntu)"
  install_pkgs curl wget git openssl ca-certificates gnupg lsb-release \
    python3 python3-venv python3-pip nginx iproute2
else
  log "نصب بسته‌های پایه (RHEL)"
  install_pkgs curl wget git openssl ca-certificates gnupg2 \
    python3 python3-pip nginx iproute dnf-plugins-core
  # EPEL برای certbot و redis لازم است
  if ! rpm -q epel-release >/dev/null 2>&1; then
    run dnf install -y epel-release || warn "نصب EPEL ناموفق بود؛ certbot/redis ممکن است در دسترس نباشند."
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
  # Ubuntu 22.04 به‌صورت پیش‌فرض Python 3.10 دارد؛ 3.11 را هم نصب می‌کنیم
  install_pkgs python3.11 python3.11-venv || true
else
  install_pkgs python3.11 python3.11-pip || install_pkgs python3.12 python3.12-pip || true
fi
PYTHON="$(pick_python || true)"
[ -n "$PYTHON" ] || die "Python 3.11 یا بالاتر پیدا نشد. (Ubuntu 22.04: نیاز به python3.11 ؛ RHEL 9: نیاز به python3.11)"
log "Python: $($PYTHON --version)"

# ---------- 6) Node.js 22 LTS ----------
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(process.versions.node.split(".")[0] >= 20 ? 0 : 1)' 2>/dev/null; then
  log "نصب Node.js 22 LTS (از NodeSource)"
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
    9.*) log "MySQL $MYSQL_VERSION از قبل نصب است ✓ — نصب دوباره نمی‌شود." ;;
    *) die "MySQL نسخه $MYSQL_VERSION روی این سرور نصب است؛ این اسکریپت MySQL 9 می‌خواهد. اول MySQL را به 9 ارتقا دهید یا از سرور تمیز استفاده کنید." ;;
  esac
else
  log "نصب MySQL 9.7 LTS از مخزن رسمی Oracle"
  if [ "$OS_FAMILY" = "debian" ]; then
    APT_DEB="${MYSQL_APT_CONFIG_URL:-https://dev.mysql.com/get/mysql-apt-config_0.8.40-1_all.deb}"
    run curl -fsSL -o /tmp/mysql-apt-config.deb "$APT_DEB" \
      || die "دانلود mysql-apt-config ناموفق بود. اگر آدرس عوض شده، از https://dev.mysql.com/downloads/repo/apt/ آدرس جدید را بگیرید و با MYSQL_APT_CONFIG_URL=... دوباره اجرا کنید."
    # انتخاب سری 9.7 بدون پنجره تعاملی
    echo "mysql-apt-config mysql-apt-config/select-server select mysql-9.7-lts" | run debconf-set-selections
    run dpkg -i /tmp/mysql-apt-config.deb
    run apt-get update -y
    run env DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server
    run systemctl enable --now mysql
  else
    YUM_RPM="${MYSQL_YUM_RELEASE_URL:-https://dev.mysql.com/get/mysql97-community-release-el${EL_VERSION}-1.noarch.rpm}"
    run dnf install -y "$YUM_RPM" \
      || die "دانلود بسته مخزن MySQL ناموفق بود. آدرس درست برای EL${EL_VERSION} را از https://dev.mysql.com/downloads/repo/yum/ بگیرید و با MYSQL_YUM_RELEASE_URL=... دوباره اجرا کنید."
    # ماژول mysql خود سیستم ممکن است بسته‌های اوراکل را پنهان کند
    run dnf module disable -y mysql || true
    run dnf install -y --setopt=install_weak_deps=False mysql-community-server
    run systemctl enable --now mysqld
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] would verify: mysql --version reports 9.x"
  else
    MYSQL_VERSION="$(mysql --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
    case "$MYSQL_VERSION" in
      9.*) log "MySQL $MYSQL_VERSION نصب شد ✓" ;;
      *) die "نسخه MySQL بعد از نصب «${MYSQL_VERSION:-نامشخص}» است؛ انتظار 9.x می‌رفت." ;;
    esac
  fi
fi

# ---------- 8) ساخت دیتابیس و کاربر MySQL ----------
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
  MYSQL_ROOT_PASSWORD="$(rand_password)"
  MYSQL_ROOT_PASSWORD_GENERATED=1
else
  MYSQL_ROOT_PASSWORD_GENERATED=0
fi

mysql_root() { # اجرای SQL به‌عنوان root — روش احراز هویت به سیستم‌عامل بستگی دارد
  if [ "$OS_FAMILY" = "debian" ]; then
    # نصب APT: root با auth_socket وارد می‌شود (بدون رمز)
    run mysql -e "$1"
  else
    # رمز از طریق MYSQL_PWD داده می‌شود تا در لیست پردازش‌ها دیده نشود
    run env MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -e "$1"
  fi
}

if [ "$OS_FAMILY" = "rhel" ]; then
  # RHEL: در اولین استارت یک رمز موقت در لاگ ساخته می‌شود
  # (رمز از طریق MYSQL_PWD داده می‌شود تا در لیست پردازش‌ها دیده نشود)
  TEMP_PASS="$(grep 'temporary password' /var/log/mysqld.log 2>/dev/null | tail -1 | sed 's/.*root@localhost: //' || true)"
  if [ -n "$TEMP_PASS" ]; then
    log "تنظیم رمز root موقت MySQL (اولین استارت)"
    run env MYSQL_PWD="$TEMP_PASS" mysql -u root --connect-expired-password \
      -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '$MYSQL_ROOT_PASSWORD';"
  elif ! MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root -e "SELECT 1" >/dev/null 2>&1; then
    warn "رمز root فعلی MySQL مشخص نیست (نه رمز موقت در لاگ هست، نه رمز داده‌شده کار می‌کند). اگر MySQL از قبل نصب بوده، MYSQL_ROOT_PASSWORD را با رمز درست بدهید و دوباره اجرا کنید."
  fi
fi

log "ساخت دیتابیس portal_db و کاربر portal در MySQL 9"
mysql_root "CREATE DATABASE IF NOT EXISTS portal_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql_root "CREATE USER IF NOT EXISTS 'portal'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';"
mysql_root "ALTER USER 'portal'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';"
mysql_root "GRANT ALL PRIVILEGES ON portal_db.* TO 'portal'@'127.0.0.1'; FLUSH PRIVILEGES;"
run env MYSQL_PWD="$DB_PASSWORD" mysql -u portal -h 127.0.0.1 -e "SELECT VERSION() AS mysql_version;" \
  || die "اتصال به MySQL با کاربر portal ناموفق بود."

# ---------- 9) Redis (اختیاری — اگر نصب نشد، بک‌اند به حافظه داخلی برمی‌گردد) ----------
REDIS_URL=""
if [ "$OS_FAMILY" = "debian" ]; then install_pkgs redis-server || true; else install_pkgs redis || true; fi
if command -v redis-cli >/dev/null 2>&1; then
  run systemctl enable --now redis-server 2>/dev/null || run systemctl enable --now redis 2>/dev/null || true
  if [ "$DRY_RUN" != "1" ] && redis-cli ping 2>/dev/null | grep -q PONG; then
    REDIS_URL="redis://127.0.0.1:6379/0"
    log "Redis فعال است ✓"
  fi
fi

# ---------- 10) ساخت .env (فقط MySQL — نه SQLite، نه PostgreSQL) ----------
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "ساخت فایل .env با Secretهای تصادفی امن (دیتابیس: MySQL 9)"
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
  echo ".env ساخته شد (دسترسی 600). Secretها فقط در همین فایل هستند؛ آن را commit نکنید."
  fi
else
  echo ".env از قبل وجود دارد؛ همان استفاده می‌شود و بازنویسی نمی‌شود."
fi

# اجبار MySQL (نه SQLite، نه PostgreSQL) — قانون پروژه
if [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] would validate DATABASE_URL in .env is mysql+asyncmy:// (refusing sqlite/postgresql)"
else
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
case "$DB_URL" in
  mysql+asyncmy://*|mysql+aiomysql://*) echo "دیتابیس: MySQL ✓" ;;
  sqlite*|postgresql*|postgres*)
    die "این پروژه باید با MySQL اجرا شود، اما DATABASE_URL روی «${DB_URL%%://*}» تنظیم شده است." ;;
  *) die "DATABASE_URL نامعتبر یا خالی است: $DB_URL" ;;
esac
fi

# ---------- 11) بک‌اند: venv + وابستگی‌ها + Migration ----------
log "ساخت venv و نصب وابستگی‌های بک‌اند"
if [ ! -d "$INSTALL_DIR/.venv" ]; then
  as_owner "$PYTHON" -m venv "$INSTALL_DIR/.venv"
fi
as_owner "$INSTALL_DIR/.venv/bin/python" -m pip install --upgrade pip
as_owner "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

log "اجرای Migrationهای Alembic روی MySQL 9"
run "$INSTALL_DIR/.venv/bin/alembic" upgrade head

# ---------- 12) ساخت SuperAdmin ----------
if [ "$SKIP_ADMIN" != "1" ]; then
  log "ساخت SuperAdmin"
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

# ---------- 13) فرانت‌اند: بیلد ----------
log "بیلد فرانت‌اند"
as_owner npm --prefix "$INSTALL_DIR/frontend" ci
as_owner npm --prefix "$INSTALL_DIR/frontend" run build
if [ "$DRY_RUN" != "1" ]; then
  [ -f "$INSTALL_DIR/frontend/dist/index.html" ] || die "بیلد فرانت‌اند index.html نساخت."
fi

# ---------- 14) بک‌اند با systemd — فقط روی 127.0.0.1:8000 ----------
UNIT_FILE="/etc/systemd/system/portal-api.service"
log "ساخت سرویس systemd برای بک‌اند (bind داخلی 127.0.0.1:8000)"
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

# ---------- 15) Nginx — Reverse Proxy (۸۰/۴۴۳) + فرانت‌اند استاتیک ----------
if [ "$OS_FAMILY" = "debian" ]; then NGINX_SITE="/etc/nginx/sites-available/portal"; else NGINX_SITE="/etc/nginx/conf.d/portal.conf"; fi
if [ -n "$DOMAIN" ]; then SERVER_NAME="$DOMAIN";
elif [ -n "$SSL_IP_HOST" ]; then SERVER_NAME="$SSL_IP_HOST $SERVER_IP";
else SERVER_NAME="_"; fi
log "تنظیم Nginx (دامنه: $SERVER_NAME — فرانت‌اند استاتیک + پروکسی /api به 127.0.0.1:8000)"
if [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] would write $NGINX_SITE (server_name $SERVER_NAME, root $INSTALL_DIR/frontend/dist, /api/ -> 127.0.0.1:8000)"
else
cat > "$NGINX_SITE" <<EOF
# Dedicated Server Portal — Reverse Proxy
# بک‌اند فقط روی 127.0.0.1:8000 گوش می‌دهد؛ بیرون فقط ۸۰/۴۴۳ باز است.
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

# SELinux (فقط RHEL): اجازه پروکسی Nginx به بک‌اند + خواندن فایل‌های فرانت‌اند
if [ "$OS_FAMILY" = "rhel" ] && command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  run setsebool -P httpd_can_network_connect 1 || true
  run chcon -R -t httpd_sys_content_t "$INSTALL_DIR/frontend/dist" 2>/dev/null || true
  run systemctl reload nginx || true
fi

# فایروال: باز کردن ۸۰ و ۴۴۳ (فقط اگر فایروال فعال است)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  run ufw allow 80/tcp; run ufw allow 443/tcp
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state 2>/dev/null | grep -q running; then
  run firewall-cmd --permanent --add-service=http --add-service=https
  run firewall-cmd --reload
fi

# ---------- 16) گواهی HTTPS با Let's Encrypt ----------
# با دامنه: گواهی برای خود دامنه. بدون دامنه: گواهی برای هاست sslip.io همان IP.
SSL_OK=0
CERT_DOMAIN=""
if [ -n "$DOMAIN" ]; then CERT_DOMAIN="$DOMAIN";
elif [ -n "$SSL_IP_HOST" ]; then CERT_DOMAIN="$SSL_IP_HOST"; fi
if [ -n "$CERT_DOMAIN" ] && [ "$NO_SSL" != "1" ]; then
  if [ -n "$DOMAIN" ]; then log "گرفتن گواهی Let's Encrypt برای $DOMAIN (پورت ۴۴۳)";
  else log "گرفتن گواهی Let's Encrypt برای IP سرور ($SERVER_IP) از طریق $SSL_IP_HOST (پورت ۴۴۳)"; fi
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
      log "گواهی HTTPS فعال شد ✓ (گواهی ۹۰ روزه؛ تمدید خودکار certbot فعال است)"
    else
      warn "گرفتن گواهی Let's Encrypt ناموفق بود — سایت فعلاً روی HTTP (پورت ۸۰) بالا می‌آید."
      if [ -n "$DOMAIN" ]; then
        warn "علت معمول: DNS دامنه هنوز به این سرور اشاره نمی‌کند. بعد از درست‌شدن DNS این دستور را بزنید:"
        warn "  sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $CERTBOT_EMAIL --redirect"
      else
        warn "علت معمول: IP داده‌شده درست نیست یا پورت ۸۰ بسته است. دستور دستی:"
        warn "  sudo certbot --nginx -d $SSL_IP_HOST --non-interactive --agree-tos -m $CERTBOT_EMAIL --redirect"
      fi
    fi
  else
    warn "certbot نصب نشد؛ سایت روی HTTP می‌ماند. بعداً: sudo apt install python3-certbot-nginx && sudo certbot --nginx -d $CERT_DOMAIN"
  fi
fi

# ---------- 17) انتظار برای آماده‌شدن API ----------
log "انتظار برای Healthcheck بک‌اند"
if [ "$DRY_RUN" != "1" ]; then
  OK=0
  # نکته: /api/v1/health حتی وقتی دیتابیس پایین است هم HTTP 200 برمی‌گرداند،
  # پس فقط موفقیت curl کافی نیست — باید در بدنه جواب "database":"up" باشد.
  for i in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:8000/api/v1/health 2>/dev/null | grep -q '"database"[[:space:]]*:[[:space:]]*"up"'; then OK=1; break; fi
    sleep 3
  done
  [ "$OK" = "1" ] || { warn "بک‌اند بعد از ۳ دقیقه سالم نشد. لاگ: journalctl -u portal-api -f"; exit 1; }
  echo "بک‌اند سالم است ✓ (MySQL 9 متصل است)"
fi

# ---------- 18) خلاصه ----------
if [ -n "$DOMAIN" ] && [ "$SSL_OK" = "1" ]; then SITE_URL="https://$DOMAIN";
elif [ -n "$DOMAIN" ]; then SITE_URL="http://$DOMAIN";
elif [ "$SSL_OK" = "1" ]; then SITE_URL="https://$SSL_IP_HOST";
elif [ -n "$SERVER_IP" ]; then SITE_URL="http://$SERVER_IP";
else SITE_URL="http://localhost"; fi
cat <<EOF

============================================================
 نصب کامل شد ✓  (دیتابیس: MySQL 9.7 ،Nginx روی ۴۴۳)
------------------------------------------------------------
 سایت     : $SITE_URL
 فرانت‌اند: $SITE_URL
 بک‌اند   : $SITE_URL/api/v1  (داخلی: 127.0.0.1:8000 — پورت ۸۰۰۰ بیرون باز نیست)
 Health   : $SITE_URL/api/v1/health
EOF
if [ -z "$DOMAIN" ] && [ -n "$SERVER_IP" ]; then
  echo " IP سرور  : $SERVER_IP (آدرس HTTPS از طریق $SSL_IP_HOST)"
fi
if [ "$SKIP_ADMIN" != "1" ]; then
  cat <<EOF
 ادمین    : $ADMIN_USERNAME ($ADMIN_EMAIL)
 رمز ادمین: همان رمزی که خودتان وارد کردید (هیچ‌جا ذخیره نشده)
EOF
fi
cat <<'EOF'
 Secretهای JWT و WHMCS و رمز دیتابیس فقط داخل فایل .env همین سرور هستند.
 دستورات روزمره:
   وضعیت بک‌اند: sudo systemctl status portal-api
   لاگ بک‌اند:   sudo journalctl -u portal-api -f
   ری‌استارت:    sudo systemctl restart portal-api nginx
   تست Nginx:    sudo nginx -t
   گواهی SSL:    sudo certbot renew --dry-run
============================================================
EOF
if [ "${MYSQL_ROOT_PASSWORD_GENERATED:-0}" = "1" ]; then
  echo "رمز root ساخته‌شده MySQL در فایل .env (MYSQL_ROOT_PASSWORD) ذخیره شد."
fi
