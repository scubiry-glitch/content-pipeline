#!/usr/bin/env bash
#
# remote-pipeline-sync.sh — 从本机读取 api/config/run-routing.json 的 workers，
#   对含 ssh + deploy.repo 且 host≠localhost 的条目依次：
#   ① 同步代码（每台 deploy.sync_mode：git | scp，见下）
#   ② 下发本机 run-routing.json（可 --skip-config）
#   ③ 远端 dist：deploy.rebuild_dist 所列 workspace（api / webapp）各执行 npm run build（可 --skip-build）
#   ④ pm2 restart + 可选日志 grep（deploy.pm2_app 未设则跳过）
#
# sync_mode（run-routing.json deploy.sync_mode，缺省 git）：
#   git  — 远端 cd repo && git pull；若未 --force 且远端 git HEAD == 本机 HEAD，跳过 pull
#   scp  — 本机 rsync 仓库根 → 远端 repo/；若未 --force 且远端 .pipeline-deploy-rev == 本机 HEAD，跳过 rsync
#
# 文档：onekeydeploy/multi-worker-design.md §3.4.1
#
# 用法（在仓库根执行）：
#   cd /path/to/pipeline && bash onekeydeploy/remote-pipeline-sync.sh
#   bash onekeydeploy/remote-pipeline-sync.sh --only huoshanpro
#   bash onekeydeploy/remote-pipeline-sync.sh --force     # 跳过「版本一致则省略」短路
#   bash onekeydeploy/remote-pipeline-sync.sh --dry-run
#   bash onekeydeploy/remote-pipeline-sync.sh --skip-build   # 不执行远端 npm run build
#
# 依赖：node、OpenSSH ssh/scp；sync_mode=scp 时需本机 rsync。路径勿含空格。
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
RSYNC_EXCLUDES="$SCRIPT_DIR/rsync-remote-code-excludes.txt"

readonly LOG_GREP_PATTERN='WORKER_ID resolved|twin-worker'

SSH_BASE=( -n -o BatchMode=yes -o ConnectTimeout=25 -o ConnectionAttempts=1 )
SCP_BASE=( -o BatchMode=yes -o ConnectTimeout=25 -o ConnectionAttempts=1 )

DRY_RUN=0
ONLY_FILTER=""
SKIP_CONFIG=0
SKIP_BUILD=0
FORCE=0

usage() {
  sed -n '1,35p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-config) SKIP_CONFIG=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --force) FORCE=1 ;;
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
if [[ ! -f "$RSYNC_EXCLUDES" ]]; then
  echo "找不到 rsync 排除文件: $RSYNC_EXCLUDES" >&2
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

# 远端 git HEAD（失败时输出空）
remote_git_head() {
  local port="$1" ssh_target="$2" repo="$3"
  ssh "${SSH_BASE[@]}" -p "$port" "$ssh_target" "bash -lc \"cd $repo && git rev-parse HEAD 2>/dev/null\"" 2>/dev/null | tr -d '\r\n' || true
}

# 远端 scp 部署戳（由本脚本写入）
remote_deploy_rev() {
  local port="$1" ssh_target="$2" repo="$3"
  ssh "${SSH_BASE[@]}" -p "$port" "$ssh_target" "bash -lc \"cat $repo/.pipeline-deploy-rev 2>/dev/null\"" 2>/dev/null | tr -d '\r\n' || true
}

# 远端 npm run build（仅 api / webapp）；rebuild_csv 形如 api 或 api,webapp
remote_rebuild_dist() {
  local port="$1" ssh_target="$2" repo="$3" rebuild_csv="$4"
  local parts p ws

  if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ "$SKIP_BUILD" -eq 1 ]]; then
      dim "  ③ （--skip-build）跳过 npm run build"
    elif [[ -z "$rebuild_csv" || "$rebuild_csv" == "-" ]]; then
      dim "  ③ （未配置 deploy.rebuild_dist）跳过 dist 构建"
    else
      IFS=',' read -ra parts <<< "$rebuild_csv"
      for p in "${parts[@]}"; do
        ws="${p//[[:space:]]/}"
        [[ -z "$ws" ]] && continue
        if [[ "$ws" != "api" && "$ws" != "webapp" ]]; then
          warn "忽略非法 rebuild_dist：$ws（仅 api、webapp）"
          continue
        fi
        dim "  ③ ssh … cd $repo/$ws && npm run build"
      done
    fi
    return 0
  fi

  if [[ "$SKIP_BUILD" -eq 1 ]]; then
    return 0
  fi
  if [[ -z "$rebuild_csv" || "$rebuild_csv" == "-" ]]; then
    return 0
  fi

  IFS=',' read -ra parts <<< "$rebuild_csv"
  for p in "${parts[@]}"; do
    ws="${p//[[:space:]]/}"
    [[ -z "$ws" ]] && continue
    if [[ "$ws" != "api" && "$ws" != "webapp" ]]; then
      warn "忽略非法 rebuild_dist：$ws（仅 api、webapp）"
      continue
    fi
    if ! ssh "${SSH_BASE[@]}" -p "$port" "$ssh_target" "bash -lc \"set -euo pipefail; cd $repo/$ws && npm run build\""; then
      return 1
    fi
    ok "远端 npm run build ($ws) → dist"
  done
  return 0
}

main() {
  bold "═══ remote-pipeline-sync · $(date '+%Y-%m-%d %H:%M:%S %Z') ═══"
  dim "  本机仓库: $REPO_ROOT"
  dim "  配置源: $ROUTING_JSON"
  [[ "$DRY_RUN" -eq 1 ]] && warn "dry-run：不实际执行 ssh/scp/rsync"
  [[ "$SKIP_CONFIG" -eq 1 ]] && warn "已 --skip-config：不下发 run-routing.json"
  [[ "$SKIP_BUILD" -eq 1 ]] && warn "已 --skip-build：跳过远端 npm run build（dist）"
  [[ "$FORCE" -eq 1 ]] && warn "已 --force：不跳过版本已一致的代码同步步骤"
  echo

  local LOCAL_SHA
  LOCAL_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null | tr -d '\r\n' || echo '')
  if [[ -z "$LOCAL_SHA" ]]; then
    warn "本机 $REPO_ROOT 不是 git 仓库或无法 rev-parse HEAD，版本比较将失效，每次都会尝试同步代码"
    LOCAL_SHA="unknown"
  else
    dim "  本机 HEAD: $LOCAL_SHA"
  fi

  # 若配置里存在 scp 模式，要求 rsync；并在本机有未提交变更时提醒
  if node "$PARSER" "$ROUTING_JSON" | awk -F'\t' '$7=="scp"{f=1} END{exit f?0:1}'; then
    if [[ "$DRY_RUN" -eq 0 ]] && ! command -v rsync >/dev/null 2>&1; then
      echo "配置中含 deploy.sync_mode=scp，需要本机安装 rsync。" >&2
      exit 1
    fi
    if [[ "$DRY_RUN" -eq 0 ]] && [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]]; then
      warn "本机工作区有未提交变更：scp 将推送当前磁盘文件（不仅是 HEAD 快照），请确认"
    fi
  fi

  local ok_n=0 fail_n=0
  local id ssh_target repo pm2_app logfile port sync_mode rebuild_csv
  local total matched

  total=$(node "$PARSER" "$ROUTING_JSON" | wc -l | tr -d ' ')
  if [[ -z "$total" || "$total" -eq 0 ]]; then
    warn "run-routing.json 中没有任何可 SSH 的 worker（需 ssh + deploy.repo + host 且非 localhost）"
    exit 1
  fi

  matched=0
  while IFS=$'\t' read -r id ssh_target repo pm2_app logfile port sync_mode rebuild_csv || [[ -n "${id:-}" ]]; do
    [[ -z "${id:-}" ]] && continue
    [[ "${sync_mode:-}" != "scp" ]] && sync_mode=git
    [[ -z "${rebuild_csv:-}" || "$rebuild_csv" == "" ]] && rebuild_csv="-"

    if [[ -n "$ONLY_FILTER" && "$id" != "$ONLY_FILTER" && "$ssh_target" != "$ONLY_FILTER" ]]; then
      continue
    fi
    matched=$((matched + 1))

    bold "▌$id ($ssh_target) port=$port  sync_mode=$sync_mode"
    dim "  repo=$repo  pm2=${pm2_app:--}  log=${logfile:--}  rebuild_dist=${rebuild_csv:--}"

    local step_ok=1

    if [[ "$DRY_RUN" -eq 1 ]]; then
      dim "  ① 代码: mode=$sync_mode  local_HEAD=$LOCAL_SHA  (--force=$FORCE)"
      if [[ "$sync_mode" == "git" ]]; then
        dim "     → 比较远端 git HEAD；一致则跳过 pull，否则 ssh git pull"
      else
        dim "     → 比较远端 $repo/.pipeline-deploy-rev；一致则跳过 rsync，否则 rsync + 写 deploy-rev"
      fi
      if [[ "$SKIP_CONFIG" -eq 0 ]]; then
        push_routing_json "$ssh_target" "$repo" "$port"
      else
        dim "  ② （--skip-config）跳过 run-routing scp"
      fi
      remote_rebuild_dist "$port" "$ssh_target" "$repo" "$rebuild_csv"
      if [[ -n "$pm2_app" && "$pm2_app" != "-" ]]; then
        local dr="pm2 restart $pm2_app --update-env"
        [[ -n "$logfile" && "$logfile" != "-" ]] && dr+="; tail -80 $logfile | grep -E '$LOG_GREP_PATTERN'"
        dim "  ④ ssh … $dr"
      else
        dim "  ④ （无 deploy.pm2_app）跳过 pm2"
      fi
      ok "dry-run"
      ok_n=$((ok_n + 1))
      echo
      continue
    fi

    # --- ① 代码同步 ---
    if [[ "$sync_mode" == "git" ]]; then
      local rhead
      rhead=$(remote_git_head "$port" "$ssh_target" "$repo")
      if [[ "$FORCE" -eq 0 && -n "$rhead" && "$rhead" == "$LOCAL_SHA" ]]; then
        dim "  git：远端 HEAD 已与本机一致 ($LOCAL_SHA)，跳过 git pull"
      else
        if ! ssh "${SSH_BASE[@]}" -p "$port" "$ssh_target" "bash -lc \"set -euo pipefail; cd $repo && git pull\""; then
          fail "git pull 失败"
          step_ok=0
        fi
      fi
    else
      local rrev
      rrev=$(remote_deploy_rev "$port" "$ssh_target" "$repo")
      if [[ "$FORCE" -eq 0 && -n "$rrev" && "$rrev" == "$LOCAL_SHA" ]]; then
        dim "  scp：远端 .pipeline-deploy-rev 已与本机 HEAD 一致，跳过 rsync"
      else
        if ! rsync -az --delete --exclude-from="$RSYNC_EXCLUDES" \
          -e "ssh -o BatchMode=yes -o ConnectTimeout=25 -o ConnectionAttempts=1 -p $port" \
          "$REPO_ROOT/" "${ssh_target}:$repo/"; then
          fail "rsync 失败"
          step_ok=0
        else
          if ! ssh "${SSH_BASE[@]}" -p "$port" "$ssh_target" "bash -lc \"echo $LOCAL_SHA > $repo/.pipeline-deploy-rev\""; then
            fail "写入 .pipeline-deploy-rev 失败"
            step_ok=0
          else
            ok "已 rsync 代码并写入 .pipeline-deploy-rev=$LOCAL_SHA"
          fi
        fi
      fi
    fi

    # --- ② run-routing.json ---
    if [[ "$step_ok" -eq 1 && "$SKIP_CONFIG" -eq 0 ]]; then
      if ! push_routing_json "$ssh_target" "$repo" "$port"; then
        fail "scp run-routing.json 失败"
        step_ok=0
      else
        ok "已下发 api/config/run-routing.json"
      fi
    fi

    # --- ③ 远端 dist（npm run build）---
    if [[ "$step_ok" -eq 1 ]]; then
      if ! remote_rebuild_dist "$port" "$ssh_target" "$repo" "$rebuild_csv"; then
        fail "远端 npm run build（dist）失败"
        step_ok=0
      fi
    fi

    # --- ④ pm2 ---
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
