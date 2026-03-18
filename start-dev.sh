#!/bin/bash

# 内容生产流水线 - 开发环境启动脚本

echo "🚀 启动内容生产流水线开发环境..."
echo ""

# 检查依赖
command -v tmux >/dev/null 2>&1 || { echo "❌ 需要安装 tmux: brew install tmux"; exit 1; }

# 创建 tmux 会话
SESSION_NAME="content-pipeline"

# 如果会话已存在，先关闭
tmux kill-session -t $SESSION_NAME 2>/dev/null

# 创建新会话
tmux new-session -d -s $SESSION_NAME

# 窗口 1: 后端 API
tmux rename-window -t $SESSION_NAME:0 'backend'
tmux send-keys -t $SESSION_NAME:0 'cd /Users/行业研究/demo-project/content-pipeline/api && echo "启动后端 API..." && npm run dev' C-m

# 窗口 2: 前端
tmux new-window -t $SESSION_NAME:1 -n 'frontend'
tmux send-keys -t $SESSION_NAME:1 'cd /Users/行业研究/demo-project/content-pipeline/webapp && echo "启动前端..." && sleep 5 && npm run dev' C-m

# 窗口 3: 日志监控
tmux new-window -t $SESSION_NAME:2 -n 'logs'
tmux send-keys -t $SESSION_NAME:2 'cd /Users/行业研究/demo-project/content-pipeline && echo "日志监控..."' C-m

echo "✅ 开发环境已启动!"
echo ""
echo "访问地址:"
echo "  - 前端: http://localhost:5173"
echo "  - 后端: http://localhost:3000"
echo ""
echo "命令:"
echo "  - 查看会话: tmux attach -t $SESSION_NAME"
echo "  - 关闭环境: tmux kill-session -t $SESSION_NAME"
echo ""
echo "在 tmux 中:"
echo "  - Ctrl+B, 0-2 切换窗口"
echo "  - Ctrl+B, D 分离会话"
echo "  - Ctrl+B, [ 滚动查看日志"
echo ""

# 自动附加到会话
tmux attach -t $SESSION_NAME
