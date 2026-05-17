---
name: lark
description: 安全使用 lark-cli 操作飞书日历、文档、任务、消息和审批。
user-invocable: true
---
<!-- Claudian 管理的飞书 CLI skill，请勿手动编辑。 -->

# 飞书 CLI

在当前 vault 工作区中使用 `lark-cli` 操作飞书。

## 使用规则

- 优先使用适合当前请求的飞书 CLI shortcut，例如 `calendar +agenda`、`task +get-my-tasks`、`docs +create` 和 `im +messages-send`。
- 当命令参数、返回结构、身份支持、风险级别或所需权限不明确时，先用 `lark-cli schema <method> --format json` 检查命令。
- 命令支持时优先使用 JSON 输出参数，例如 `--format json` 或 `--json`。
- 访问或创建用户个人云文档、日历、任务、邮箱等资源时，默认使用 `--as user`；只有用户明确要求机器人身份时才使用 `--as bot`。
- 大范围读取时使用分页参数控制规模，例如支持时使用 `--page-limit`、`--page-all` 和 `--page-delay`。
- 对写入、删除、审批、发消息或其他外部可见操作，命令支持时先 dry run，并在执行真实操作前征得用户确认。
- 如果 CLI 提示缺少权限，请让用户通过 Claudian 飞书集成授权具体 scope，不要盲目重试。
- 如果 CLI 提示应用权限违规、开发者后台链接或管理员审批要求，请告诉用户需要在开发者后台配置或审批飞书应用。
- 不要打印、持久化或泄露 app secret、access token、refresh token、authorization code、device code 或 bearer token。

## 恢复方式

- 配置或 keychain 错误表示用户需要在 Claudian 中运行飞书配置初始化流程。
- 未登录错误表示用户需要通过飞书集成登录。
- 缺少或过期的飞书 CLI Skills 提示表示用户需要在 Claudian 中运行飞书 Skills 更新流程。
