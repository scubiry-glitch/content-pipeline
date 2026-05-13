# 飞书妙记同步 Obsidian 插件

这是一个本地桌面端 Obsidian 插件，用来把飞书/Lark 妙记智能纪要同步到当前 Obsidian 仓库。

当前版本是独立插件，不依赖本地 `feishu-minutes-sync` skill，也不需要安装 Python、OpenClaw 或额外 Node 脚本。

## 本地安装

此目录已包含 `main.js`，可以直接作为本地第三方插件安装使用。

将安装包里的 `feishu-minutes-sync` 文件夹复制或软链接到：

```text
<your-vault>/.obsidian/plugins/feishu-minutes-sync
```

插件文件夹至少需要包含：

- `manifest.json`
- `main.js`
- `styles.css`

`main.js` 是当前可直接安装的插件入口。目录中保留了开发配置，后续如需重新构建需要可访问 npm：

```bash
cd obsidian-plugin
npm install
npm run build
```

## 飞书前置配置

每个使用者都需要配置自己的飞书/Lark 开放平台应用，不能复用别人的 token 或 App Secret。

1. 在飞书开放平台创建企业自建应用。
2. 复制 App ID 和 App Secret。
3. 添加 OAuth 回调地址：

```text
http://127.0.0.1:8765/callback
```

4. 开通权限：
   - `drive:drive:readonly`
   - `docs:document.content:read`
5. 在 Obsidian 插件设置里填写 App ID、App Secret。
6. 点击“授权飞书账号”，完成 OAuth 授权。

授权 token 会保存在当前 Vault 的插件数据文件里。分享插件时不要分享 `.obsidian/plugins/feishu-minutes-sync/data.json`。
