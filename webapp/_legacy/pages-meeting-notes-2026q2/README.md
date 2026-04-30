# pages-meeting-notes-2026q2 (archived)

会议纪要模块 v1 旧版的快照，归档于 2026-05-01。

原路径：
- `webapp/src/pages/meeting-notes/` → `pages/`
- `webapp/src/components/meeting-notes/` → `components/`

原路由：`/meeting-notes/*`，已被 `prototype/meeting/*` + `/meeting/*` 全面替换，
且 prototype 的 sidebar 旧版入口同步移除。

## 何时回头看

- 在 `prototype/meeting/*` 实现某个新功能时，可对照旧版同名文件理解原始设计意图
  （例如 GenerationCenter 的轴生成 UI、AxisRegeneratePanel 的重跑参数表单等）
- 发现外部书签/邮件/文档还在引 `/meeting-notes/...` 链接需要做兼容跳转时

## 如何恢复

```bash
git mv webapp/_legacy/pages-meeting-notes-2026q2/pages       webapp/src/pages/meeting-notes
git mv webapp/_legacy/pages-meeting-notes-2026q2/components  webapp/src/components/meeting-notes
```

然后回填 `webapp/src/App.tsx` 的 import 与 `<Route path="meeting-notes">` 嵌套块
（参考归档前的 git history，commit 之前一次的版本即可）。

## 不要做的事

- **不要**在归档目录里继续改代码 —— 这里是冷冻区，任何修改都不会进 build
- **不要**删 README —— 后人需要这个上下文
