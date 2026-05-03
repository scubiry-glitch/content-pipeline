#!/usr/bin/env bash
#
# diag-worker-host.sh — 一键收集本机 worker 注册必备信息
#
# 用法（对方机器上跑）：
#   curl -fsSL <repo-url>/scripts/diag-worker-host.sh | bash
#   # 或 git pull 后:
#   bash scripts/diag-worker-host.sh
#
# 输出格式适合直接贴给运维 / Claude，便于补 host_aliases 到
# api/config/run-routing.json 的 workers.{} 注册表里。

set -uo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

bold "═══ Worker host 诊断 · $(date '+%Y-%m-%d %H:%M:%S %Z') ═══"
echo

bold "▌1. 主机标识（用于 host_aliases）"
echo "  hostname:    $(hostname 2>/dev/null || echo '?')"
echo "  全主机名:    $(hostname -f 2>/dev/null || echo '?')"
echo "  内网 IPv4:"
# macOS 没有 ip 命令；Linux ip 命令优先；都失败则从 ifconfig 兜底
if command -v ip >/dev/null 2>&1; then
  ip -4 addr show 2>/dev/null | awk '/inet / && $2 !~ /^127\./ {print "    " $2}'
elif command -v ifconfig >/dev/null 2>&1; then
  # macOS / BSD ifconfig：每行 `inet 192.168.x.x netmask ...`
  ifconfig 2>/dev/null | awk '/^[ \t]*inet / && $2 !~ /^127\./ {print "    " $2}'
else
  echo "    (no ip / ifconfig command found)"
fi
echo "  公网 IPv4（如能通外网）:"
EXT_IP=$(curl -s -m 3 https://api.ipify.org 2>/dev/null || echo '')
if [ -n "$EXT_IP" ]; then
  echo "    $EXT_IP"
else
  warn "（curl ipify 不通，手动确认；可在云控制台查）"
fi
echo

bold "▌2. .env 当前 WORKER_ID（如有）"
ENV_FILES=()
[ -f api/.env ] && ENV_FILES+=("api/.env")
[ -f /proweb/run/pipeline/api/.env ] && ENV_FILES+=("/proweb/run/pipeline/api/.env")
[ -f /proweb/run/Pipeline/content-pipeline/api/.env ] && ENV_FILES+=("/proweb/run/Pipeline/content-pipeline/api/.env")
[ -f /newdata/pipeline/api/.env ] && ENV_FILES+=("/newdata/pipeline/api/.env")
if [ ${#ENV_FILES[@]} -eq 0 ]; then
  warn "未找到 api/.env（试了几个常见路径）"
else
  for f in "${ENV_FILES[@]}"; do
    val=$(grep -E '^WORKER_ID=' "$f" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -n "$val" ]; then
      ok "$f: WORKER_ID=$val"
    else
      dim "  $f: WORKER_ID 未设（auto-detect 模式）"
    fi
  done
fi
echo

bold "▌3. pm2 进程"
if command -v pm2 >/dev/null 2>&1; then
  pm2 list 2>/dev/null | awk '/mn-worker|content-pipeline-api/ || NR<=4 || /^└/' | head -15
else
  warn "pm2 未安装，跳过"
fi
echo

bold "▌4. mn-worker 启动 self-check 日志（最近 100 行内）"
LOG_FILES=(/tmp/mn-worker-out.log /tmp/worker-mn.log /tmp/worker-llm.log /tmp/worker-self.log)
FOUND_LOG=0
for log in "${LOG_FILES[@]}"; do
  if [ -f "$log" ]; then
    LINES=$(tail -100 "$log" 2>/dev/null | grep -E "WORKER_ID resolved|run-routing|registry audit|twin-worker|auto-detect" | tail -5)
    if [ -n "$LINES" ]; then
      ok "$log"
      echo "$LINES" | sed 's/^/    /'
      FOUND_LOG=1
    fi
  fi
done
if [ "$FOUND_LOG" -eq 0 ]; then
  warn "未找到 worker 日志或日志中无 self-check 输出（可能 pm2 重启后日志被截断）"
fi
echo

bold "▌5. 仓库代码版本"
# 候选路径 + 当前 cwd 自动加进来（macOS 仓库路径不固定）
REPO_DIRS=(/proweb/run/pipeline /proweb/run/Pipeline/content-pipeline /newdata/pipeline)
# 当前 cwd 如果是 git repo 且不在已知列表里，也加进来
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  CWD_REPO="$(git rev-parse --show-toplevel)"
  if [[ ! " ${REPO_DIRS[*]} " =~ " $CWD_REPO " ]]; then
    REPO_DIRS+=("$CWD_REPO")
  fi
fi
FOUND_REPO=0
for d in "${REPO_DIRS[@]}"; do
  if [ -d "$d/.git" ]; then
    FOUND_REPO=1
    HASH=$(git -C "$d" log --oneline -1 2>/dev/null)
    HAS_FIX=$(git -C "$d" log --oneline 2>/dev/null | grep -E "a6d5f55|5d24678" | head -2)
    ok "$d"
    echo "    最新 commit: $HASH"
    if [ -n "$HAS_FIX" ]; then
      ok "    包含 host 自检 + auto-detect 修复"
    else
      warn "    缺少 commit a6d5f55 / 5d24678 — 请 git pull"
    fi
  fi
done
if [ "$FOUND_REPO" -eq 0 ]; then
  warn "未在已知路径找到 git 仓库（试了 /proweb/run/pipeline 等 + 当前 cwd）"
  warn "如果你的仓库在别处，请 cd 进去后再跑这个脚本"
fi
echo

bold "▌6. 建议 host_aliases 取值"
HN=$(hostname 2>/dev/null)
# 收集所有非 127.x.x.x / 198.18.x / utun-style fake 网段的 IPv4
collect_inner_ips() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 addr show 2>/dev/null | awk '/inet / && $2 !~ /^127\./ {sub(/\/.*/,"",$2); print $2}'
  elif command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | awk '/^[ \t]*inet / && $2 !~ /^127\./ {print $2}'
  fi
}
# 过滤掉 ClashX / 网络隔离 / docker bridge 这类伪 IP
filter_real_ips() {
  awk '$0 !~ /^(198\.18\.|172\.17\.|172\.18\.|172\.19\.)/'
}
INNERS=$(collect_inner_ips | filter_real_ips | head -3)
if [ -n "$HN" ] && [ -n "$INNERS" ]; then
  echo "  在主仓库的 api/config/run-routing.json，本机对应 worker 的 entry 加："
  echo
  # 拼 JSON 数组
  ALIASES_JSON='"'"$HN"'"'
  while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    ALIASES_JSON="$ALIASES_JSON, \"$ip\""
  done <<< "$INNERS"
  printf '    "host_aliases": [%s],\n' "$ALIASES_JSON"
  echo
  echo "  然后 git push，所有节点 git pull + 重启 worker。"
elif [ -n "$HN" ]; then
  warn "未拿到内网 IPv4，仅给 hostname："
  printf '    "host_aliases": ["%s"],\n' "$HN"
fi
echo

bold "═══ 完成 · 把上面输出整段贴给运维 ═══"
