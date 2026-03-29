#!/usr/bin/env bash
# 在本机将 PostgreSQL 升级为 16、数据目录设为 /newdata/db/pgdata，
# 并开放监听与 author 库 + scubiry 用户从任意 IP 的密码登录（scram-sha-256）。
# 用法: sudo bash deploy/setup-postgresql16-newdata.sh
# 可选环境变量:
#   SKIP_FIREWALL=1     不修改 firewalld
#   SKIP_PGVECTOR=1     不编译安装 pgvector
#   RESTORE_SQL=路径    导入该 SQL（如 /newdata/db/pg15_dumpall.sql）

set -euo pipefail

RED="$(printf '\033[1;31m')"
GRN="$(printf '\033[1;32m')"
RST="$(printf '\033[0m')"

die() { echo "${RED}ERROR:${RST} $*" >&2; exit 1; }
ok() { echo "${GRN}OK:${RST} $*"; }

[[ "$(id -u)" -eq 0 ]] || die "请使用 root 或 sudo 运行"

PGDATA="${PGDATA:-/newdata/db/pgdata}"
NEWDATA_ROOT="$(dirname "$PGDATA")"
UNIT_DROPIN="/etc/systemd/system/postgresql.service.d/override.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v dnf >/dev/null || die "需要 dnf（OpenCloudOS/RHEL 系）"

# PostgreSQL 16 可执行文件路径：PGDG 常为 /usr/pgsql-16/bin，部分发行版（如 OpenCloudOS）在 /usr/bin
if [[ -x /usr/pgsql-16/bin/initdb ]]; then
  PG_BIN="/usr/pgsql-16/bin"
elif [[ -x /usr/bin/initdb ]] && /usr/bin/initdb --version 2>/dev/null | grep -qE '\) 16\.|PostgreSQL 16\.'; then
  PG_BIN="/usr/bin"
else
  die "未找到 PostgreSQL 16 的 initdb（已检查 /usr/pgsql-16/bin 与 /usr/bin）"
fi

# --- 1) 安装 PostgreSQL 16（若仍为 15 客户端/插件则替换） ---
if ! rpm -q postgresql16-server &>/dev/null; then
  echo "安装 postgresql16-server / postgresql16-contrib ..."
  dnf install -y postgresql16 postgresql16-server postgresql16-contrib --allowerasing
fi

# --- 2) systemd：PGDATA ---
mkdir -p "$(dirname "$UNIT_DROPIN")"
if [[ -f "$SCRIPT_DIR/postgresql.service.d-override.conf" ]]; then
  cp -f "$SCRIPT_DIR/postgresql.service.d-override.conf" "$UNIT_DROPIN"
else
  cat >"$UNIT_DROPIN" <<'EOF'
[Service]
Environment=PGDATA=/newdata/db/pgdata
EOF
fi
ok "已写入 $UNIT_DROPIN"

# --- 3) 目录权限 ---
mkdir -p "$NEWDATA_ROOT"
chown postgres:postgres "$NEWDATA_ROOT"
chmod 711 "$NEWDATA_ROOT" 2>/dev/null || true

# --- 4) 若旧数据仍在默认路径且为 15：移走以免阻碍 init/启动 ---
OLD_DEFAULT="/var/lib/pgsql/data"
if [[ -f "$OLD_DEFAULT/PG_VERSION" ]]; then
  ver="$(cat "$OLD_DEFAULT/PG_VERSION")"
  if [[ "$ver" != "16" ]]; then
    bak="/var/lib/pgsql/data.pg${ver}.bak.$(date +%Y%m%d%H%M%S)"
    echo "发现旧集群 $OLD_DEFAULT (PG $ver)，移至 $bak"
    mv "$OLD_DEFAULT" "$bak"
  fi
fi

# --- 5) initdb（仅当尚未初始化）---
if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  echo "初始化集群: $PGDATA"
  sudo -u postgres "${PG_BIN}/initdb" -D "$PGDATA" -E UTF8 --locale=C.UTF-8 \
    --auth-local=peer --auth-host=scram-sha-256
fi
[[ "$(cat "$PGDATA/PG_VERSION")" == "16" ]] || die "PGDATA 版本不是 16: $PGDATA"

# --- 6) postgresql.conf：监听所有地址 ---
CONF="$PGDATA/postgresql.conf"
if grep -qE '^[[:space:]]*#?listen_addresses[[:space:]]*=' "$CONF"; then
  sed -i "s/^[#[:space:]]*listen_addresses[[:space:]]*=.*/listen_addresses = '*'/" "$CONF"
else
  echo "listen_addresses = '*'" >>"$CONF"
fi

# --- 7) pg_hba：本地全库；外网仅 author + scubiry + 密码（scram-sha-256）---
HBA="$PGDATA/pg_hba.conf"
cat >"$HBA" <<'EOF'
# Managed by setup-postgresql16-newdata.sh — 匹配顺序自上而下，第一条生效
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Unix 套接字（本机 postgres 系统用户免密）
local   all             all                                     peer

# 本机 TCP：所有库、所有角色（便于本机 psql / 应用）
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256

# 任意 IPv4/IPv6：仅 author 库 + scubiry 用户
host    author          scubiry         0.0.0.0/0               scram-sha-256
host    author          scubiry         ::/0                    scram-sha-256

local   replication     all                                     peer
host    replication     all             127.0.0.1/32            scram-sha-256
host    replication     all             ::1/128                 scram-sha-256
EOF
chmod 600 "$HBA"
chown postgres:postgres "$HBA"

# --- 8) pgvector（与远程/项目一致；须在首次导入含 vector 的备份前装好）---
if [[ "${SKIP_PGVECTOR:-0}" != "1" ]]; then
  if [[ ! -f /usr/pgsql-16/share/extension/vector.control ]] && [[ ! -f /usr/share/pgsql/extension/vector.control ]]; then
    echo "编译安装 pgvector ..."
    dnf install -y postgresql16-server-devel gcc make git
    if [[ -x "${PG_BIN}/pg_config" ]]; then
      PG_CONFIG_FOR_VECTOR="${PG_BIN}/pg_config"
    else
      PG_CONFIG_FOR_VECTOR="$(command -v pg_config)"
    fi
    [[ -n "${PG_CONFIG_FOR_VECTOR:-}" && -x "$PG_CONFIG_FOR_VECTOR" ]] || die "未找到 pg_config（需 postgresql16-server-devel）"
    rm -rf /tmp/pgvector-build
    git clone --depth 1 --branch v0.7.4 https://github.com/pgvector/pgvector.git /tmp/pgvector-build
    ( cd /tmp/pgvector-build && make PG_CONFIG="$PG_CONFIG_FOR_VECTOR" && make install PG_CONFIG="$PG_CONFIG_FOR_VECTOR" )
    ok "pgvector 已安装"
  else
    ok "pgvector 扩展文件已存在，跳过编译"
  fi
fi

# --- 9) 启动 PostgreSQL ---
systemctl daemon-reload
systemctl enable postgresql
systemctl restart postgresql
sleep 2
systemctl is-active --quiet postgresql || {
  journalctl -u postgresql -n 50 --no-pager
  die "postgresql 启动失败"
}
ok "postgresql 已运行，PGDATA=$PGDATA"

# --- 10) 可选：导入备份 ---
if [[ -n "${RESTORE_SQL:-}" && -f "$RESTORE_SQL" ]]; then
  echo "导入 $RESTORE_SQL ..."
  sudo -u postgres "${PG_BIN}/psql" -v ON_ERROR_STOP=1 -f "$RESTORE_SQL" postgres
  ok "导入完成"
fi

# --- 11) 防火墙 ---
if [[ "${SKIP_FIREWALL:-0}" != "1" ]] && command -v firewall-cmd >/dev/null; then
  if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=postgresql 2>/dev/null || firewall-cmd --permanent --add-port=5432/tcp
    firewall-cmd --reload
    ok "firewalld 已放行 5432"
  else
    echo "firewalld 未运行，跳过。若需放行请手动: firewall-cmd --permanent --add-service=postgresql && firewall-cmd --reload"
  fi
fi

echo ""
ok "完成。请确认:"
echo "  - ${PG_BIN}/psql -h 127.0.0.1 -U postgres -c \"SELECT version();\""
echo "  - 应用连接: postgresql://scubiry:密码@<本机公网IP>:5432/author"
echo "  - 公网明文传输有风险，生产环境建议配合 VPN 或 hostssl + 证书。"
