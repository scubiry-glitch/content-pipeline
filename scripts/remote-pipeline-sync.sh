#!/usr/bin/env bash
#
# remote-pipeline-sync.sh — 从本机读取 api/config/run-routing.json 的 workers，
#   对含 ssh + deploy.repo 且 host≠localhost 的条目依次：git pull → 下发同一份 run-routing.json → pm2 restart（可选）
# 文档：docs/质量v2/multi-worker-design.md §3.4.1；下线/冒名 SOP：docs/质量v2/ops-vm-0-11-decommission.md（B.6 可选脚本）
#
# 用法：
#   cd /path/to/pipeline && bash scripts/remote-pipeline-sync.sh
#   RUN_ROUTING_JSON=/abs/path/run-routing.json bash scripts/remote-pipeline-sync.sh
#   bash scripts/remote-pipeline-sync.sh --only huoshanpro
#   bash scripts/remote-pipeline-sync.sh --skip-config    # 不下发 run-routing.json
#   bash scripts/remote-pipeline-sync.sh --dry-run
#
# 依赖：本机 node（与仓库同级）、OpenSSH ssh/scp；远端已配置免密登录（BatchMode）。
# 每台 worker 的 deploy.pm2_app 未设则跳过 pm2；deploy.worker_log 未设则跳过 tail。
#

set -uo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROUTING_JSON="${RUN_ROUTING_JSON:-$REPO_ROOT/api/config/run-routing.json}"
PARSER="$SCRIPT_DIR/parse-run-routing-remote-hosts.mjs"

readonly LOG_GREP_PATTERN='WORKER_ID resolved|twin-worker'

SSH_BASE=( -o BatchMode=yes -o ConnectTimeout=25 -o ConnectionAttempts=1 )
SCP_BASE=( -o BatchMode=yes -o ConnectTimeout=25 -o ConnectionAttempts=1 )

DRY_RUN=0
ONLY_FILTER=""
SKIP_CONFIG=0

usage() {
  sed -n '1,22p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-config) SKIP_CONFIG=1 ;;
    --only)
      ONLY_FILTER="${2:-}"
      if [[ -z "$ONLY_FILTER" ]]; then echo "用法: $0 --only <worker_id 或 user@host>"; exit 1; fi
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "未知参数: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if ! command -v node >/dev/null 2>&1; then
  echo "需要本机安装 node（PATH 中可执行 node）。" >&2
  exit 1
fi
if [[ ! -f "$ROUTING_JSON" ]]; then
  echo "找不到 run-routing: $ROUTING_JSON" >&2
  exit 1
fi
if [[ ! -f "$PARSER" ]]; then
  echo "找不到解析脚本: $PARSER" >&2
  exit 1
fi

push_routing_json() {
  local ssh_target="$1"
  local repo="$2"
  local port="${3:-22}"
  local dest="${ssh_target}:${repo}/api/config/run-routing.json"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    dim "scp -P $port $ROUTING_JSON $dest"
    return 0
  fi

  scp "${SCP_BASE[@]}" -P "$port" "$ROUTING_JSON" "$dest"
}

main() {
  bold "═══ remote-pipeline-sync · $(date '+%Y-%m-%d %H:%M:%S %Z') ═══"
  dim "  配置源: $ROUTING_JSON"
  [[ "$DRY_RUN" -eq 1 ]] && warn "dry-run：不实际执行 ssh/scp"
  [[ "$SKIP_CONFIG" -eq 1 ]] && warn "已 --skip-config：不下发 run-routing.json"
  echo

  local ok_n=0 fail_n=0
  local id ssh_target repo pm2_app logfile port
  local total matched

  total=$(node "$PARSER" "$ROUTING_JSON" | wc -l | tr -d ' ')
  if [[ -z "$total" || "$total" -eq 0 ]]; then
    warn "run-routing.json 中没有任何可 SSH 的 worker（需 ssh + deploy.repo + host 且非 localhost）"
    exit 1
  fi

  matched=0
  while IFS=$'\t' read -r id ssh_target repo pm2_app logfile port || [[ -n "${id:-}" ]]; do
    [[ -z "${id:-}" ]] && continue
    if [[ -n "$ONLY_FILTER" && "$id" != "$ONLY_FILTER" && "$ssh_target" != "$ONLY_FILTER" ]]; then
      continue
    fi
    matched=$((matched + 1))

    bold "▌$id ($ssh_target) port=$port"
    dim "  repo=$repo  pm2=${pm2_app:--}  log=${logfile:--}"

    local step_ok=1

    if [[ "$DRY_RUN" -eq 1 ]]; then
      dim "  ① ssh -p $port $ssh_target bash -lc \"set -euo pipefail; cd $repo && git pull\""
      if [[ "$SKIP_CONFIG" -eq 0 ]]; then
        push_routing_json "$ssh_target" "$repo" "$port"
      else
        dim "  ② （--skip-config）跳过 scp"
      fi
      if [[ -n "$pm2_app" && "$pm2_app" != "-" ]]; then
        local dr="pm2 restart $pm2_app --update-env"
        [[ -n "$logfile" && "$logfile" != "-" ]] && dr+="; tail -80 $logfile | grep -E '$LOG_GREP_PATTERN'"
        dim "  ③ ssh -p $port $ssh_target bash -lc \"set -euo pipefail; $dr || true\""
      else
        dim "  ③ （无 deploy.pm2_app）跳过 pm2"
      fi
      ok "dry-run"
      ok_n=$((ok_n + 1))
      echo
      continue
    fi

    # 1) 先拉代码
    if ! ssh "${SSH_BASE[@]}" -p "$port" "$ssh_target" "bash -lc \"set -euo pipefail; cd $repo && git pull\""; then
      fail "git pull 失败"
      step_ok=0
    fi

    # 2) 本机 run-routing.json → 远端（与仓库里当前编辑一致）
    if [[ "$step_ok" -eq 1 && "$SKIP_CONFIG" -eq 0 ]]; then
      if ! push_routing_json "$ssh_target" "$repo" "$port"; then
        fail "scp run-routing.json 失败"
        step_ok=0
      else
        ok "已下发 api/config/run-routing.json"
      fi
    fi

    # 3) pm2 + 日志片段
    if [[ "$step_ok" -eq 1 ]]; then
      if [[ -n "$pm2_app" && "$pm2_app" != "-" ]]; then
        local tail_cmd="pm2 restart $pm2_app --update-env"
        if [[ -n "$logfile" && "$logfile" != "-" ]]; then
          tail_cmd+="; set +e; tail -80 $logfile 2>/dev/null | grep -E '$LOG_GREP_PATTERN' || true"
        fi
        if ! ssh "${SSH_BASE[@]}" -p "$port" "$ssh_target" "bash -lc \"set -euo pipefail; $tail_cmd\""; then
          fail "pm2 / 日志步骤失败"
          step_ok=0
        fi
      else
        dim "  （未配置 deploy.pm2_app，跳过 pm2 restart）"
      fi
    fi

    if [[ "$step_ok" -eq 1 ]]; then
      ok "完成"
      ok_n=$((ok_n + 1))
    else
      fail_n=$((fail_n + 1))
    fi
    echo
  done < <(node "$PARSER" "$ROUTING_JSON")

  if [[ -n "$ONLY_FILTER" && "$matched" -eq 0 ]]; then
    warn "--only $ONLY_FILTER 未匹配任何 worker_id 或 user@host（配置里共 $total 台可 SSH）"
    exit 1
  fi

  bold "═══ 汇总：成功 $ok_n · 失败 $fail_n ═══"
  [[ "$fail_n" -eq 0 ]]
}

main
