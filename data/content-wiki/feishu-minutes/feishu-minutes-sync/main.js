const {
  FileSystemAdapter,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
  requestUrl,
} = require("obsidian");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const DEFAULT_QUERY = "妙记 智能纪要 会议总结";
const MINUTES_HINTS = ["妙记", "智能纪要", "会议总结", "录音主题", "AI 生成", "会议纪要"];
const TOKEN_EXPIRY_SKEW_SECONDS = 300;
const LEDGER_FILE = "ledger.json";
const LATEST_INDEX_FILE = "latest.json";
const FAILURE_LEDGER_FILE = "failure-ledger.jsonl";

const DEFAULT_SETTINGS = {
  appId: "",
  appSecret: "",
  openApiBaseUrl: "https://open.feishu.cn",
  accountsBaseUrl: "https://accounts.feishu.cn",
  feishuBaseUrl: "https://feishu.cn",
  redirectUri: "http://127.0.0.1:8765/callback",
  oauthHost: "127.0.0.1",
  oauthPort: 8765,
  oauthScope: "drive:drive:readonly docs:document.content:read",
  outputFolder: "FeishuMinutes",
  category: "",
  lookbackHours: 24,
  pageSize: 20,
  maxFiles: 80,
  maxDepth: 1,
  query: DEFAULT_QUERY,
  folderToken: "",
};

class OutputModal extends Modal {
  constructor(app, titleText, body) {
    super(app);
    this.titleText = titleText;
    this.body = body;
  }

  onOpen() {
    this.titleEl.setText(this.titleText);
    const pre = this.contentEl.createEl("pre");
    pre.addClass("feishu-minutes-sync-output");
    pre.setText(this.body || "暂无输出。");
  }
}

module.exports = class FeishuMinutesSyncPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.isRunning = false;
    this.statusBar = this.addStatusBarItem();
    this.setStatus("飞书同步空闲");

    this.addRibbonIcon("refresh-cw", "同步飞书妙记", () => {
      void this.sync(false);
    });

    this.addCommand({
      id: "authorize-feishu",
      name: "授权飞书账号",
      callback: () => void this.authorize(),
    });

    this.addCommand({
      id: "sync-recent-minutes",
      name: "同步最近的飞书妙记",
      callback: () => void this.sync(false),
    });

    this.addCommand({
      id: "dry-run-recent-minutes",
      name: "预览最近的飞书妙记",
      callback: () => void this.sync(true),
    });

    this.addCommand({
      id: "test-feishu-config",
      name: "测试飞书配置",
      callback: () => void this.testConfig(),
    });

    this.addCommand({
      id: "refresh-feishu-token",
      name: "刷新飞书授权",
      callback: () => void this.refreshUserToken(true),
    });

    this.addSettingTab(new FeishuMinutesSettingTab(this.app, this));
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
    this.tokenStore = data && data.tokenStore ? data.tokenStore : null;
  }

  async saveSettings() {
    await this.saveData(Object.assign({}, this.settings, { tokenStore: this.tokenStore || null }));
  }

  async testConfig() {
    try {
      this.requireAppConfig();
      const token = await this.getAppAccessToken();
      new Notice(`飞书配置可用，app_access_token 长度：${token.length}`, 7000);
    } catch (error) {
      new OutputModal(this.app, "飞书配置测试失败", this.errorMessage(error)).open();
    }
  }

  async authorize() {
    try {
      this.requireAppConfig();
      const code = await this.waitForOAuthCodeAndOpenBrowser();
      const tokenStore = await this.exchangeCodeForTokens(code);
      this.tokenStore = tokenStore;
      await this.saveSettings();
      new Notice(`飞书授权完成：${tokenStore.name || tokenStore.user_id || tokenStore.open_id || "已保存 token"}`, 9000);
    } catch (error) {
      new OutputModal(this.app, "飞书授权失败", this.errorMessage(error)).open();
    }
  }

  async sync(dryRun) {
    if (this.isRunning) {
      new Notice("飞书妙记同步正在运行。");
      return;
    }

    try {
      this.isRunning = true;
      this.setStatus(dryRun ? "飞书同步预览中..." : "飞书同步中...");
      const summary = await this.runAutoSync(dryRun);
      new Notice(this.formatSyncSummary(summary), 10000);
      this.setStatus(dryRun ? "飞书同步预览完成" : "飞书同步完成");

      if (summary.failed > 0 || dryRun) {
        new OutputModal(this.app, dryRun ? "飞书同步预览" : "飞书同步结果", JSON.stringify(summary, null, 2)).open();
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.setStatus("飞书同步失败");
      new Notice(`飞书妙记同步失败：${message}`, 12000);
      new OutputModal(this.app, "飞书同步失败", message).open();
    } finally {
      this.isRunning = false;
    }
  }

  async runAutoSync(dryRun) {
    const userToken = await this.getUserAccessToken();
    const options = this.normalizedSyncOptions();
    const cutoffSeconds = Math.floor(Date.now() / 1000) - options.lookbackHours * 3600;
    const discovered = await this.listFiles(userToken, options, options.folderToken);
    const candidates = discovered.filter((item) => this.getItemType(item) === "docx" && this.isWithinLookback(item, cutoffSeconds));
    const results = [];

    for (const item of candidates) {
      const docToken = this.getItemToken(item);
      const title = this.getItemTitle(item);
      const row = {
        title,
        doc_token: docToken,
        doc_url: this.getItemUrl(item),
        updated_at: this.getItemUpdatedAt(item),
        status: "candidate",
      };

      try {
        const markdown = await this.fetchMarkdown(userToken, docToken);
        if (!this.looksLikeMinutes(title, markdown, options.query)) {
          row.status = "ignored";
          row.reason = "not_minutes_like";
          results.push(row);
          continue;
        }

        row.status = "matched";
        if (!dryRun) {
          const payload = this.buildPayload(markdown, item, options);
          row.sync = this.persistPayload(payload, options.outputRoot, options.category);
          row.status = row.sync.status;
        }
      } catch (error) {
        row.status = "failed";
        row.error = this.errorMessage(error);
      }
      results.push(row);
    }

    return {
      status: "ok",
      mode: dryRun ? "dry-run" : "sync",
      scanned: discovered.length,
      candidates: candidates.length,
      matched: results.filter((item) => !["ignored", "failed"].includes(item.status)).length,
      created: results.filter((item) => item.status === "created").length,
      updated: results.filter((item) => item.status === "updated").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      ignored: results.filter((item) => item.status === "ignored").length,
      failed: results.filter((item) => item.status === "failed").length,
      output_root: options.outputRoot,
      token_source: this.tokenStore && this.isTokenValid(this.tokenStore) ? "plugin-data" : "refreshed",
      results,
    };
  }

  normalizedSyncOptions() {
    return {
      lookbackHours: this.toPositiveInt(this.settings.lookbackHours, DEFAULT_SETTINGS.lookbackHours),
      pageSize: this.toPositiveInt(this.settings.pageSize, DEFAULT_SETTINGS.pageSize),
      maxFiles: this.toPositiveInt(this.settings.maxFiles, DEFAULT_SETTINGS.maxFiles),
      maxDepth: Math.max(0, this.toPositiveInt(this.settings.maxDepth, DEFAULT_SETTINGS.maxDepth)),
      query: this.settings.query || DEFAULT_QUERY,
      folderToken: (this.settings.folderToken || "").trim(),
      category: normalizePath(this.settings.category || "").replace(/^\/+|\/+$/g, ""),
      outputRoot: this.resolveOutputRoot(),
    };
  }

  async getUserAccessToken() {
    if (this.isTokenValid(this.tokenStore)) return this.tokenStore.access_token;
    if (this.tokenStore && this.tokenStore.refresh_token) {
      await this.refreshUserToken(false);
      return this.tokenStore.access_token;
    }
    throw new Error("尚未完成飞书 OAuth 授权。请在插件设置中点击“授权飞书账号”。");
  }

  async refreshUserToken(showNotice) {
    this.requireAppConfig();
    if (!this.tokenStore || !this.tokenStore.refresh_token) {
      throw new Error("没有可刷新的 refresh_token，请先授权飞书账号。");
    }
    const appAccessToken = await this.getAppAccessToken();
    const response = await this.postJson(
      `${this.openApiBaseUrl()}/open-apis/authen/v1/refresh_access_token`,
      { grant_type: "refresh_token", refresh_token: this.tokenStore.refresh_token },
      appAccessToken,
    );
    this.tokenStore = this.normalizeTokenResponse(response, this.tokenStore);
    await this.saveSettings();
    if (showNotice) new Notice("飞书授权已刷新。", 7000);
  }

  async getAppAccessToken() {
    this.requireAppConfig();
    const response = await this.postJson(`${this.openApiBaseUrl()}/open-apis/auth/v3/app_access_token/internal`, {
      app_id: this.settings.appId.trim(),
      app_secret: this.settings.appSecret.trim(),
    });
    const token = response.app_access_token || (response.data && response.data.app_access_token);
    if (!token) throw new Error("飞书没有返回 app_access_token。");
    return token;
  }

  async exchangeCodeForTokens(code) {
    const appAccessToken = await this.getAppAccessToken();
    const response = await this.postJson(
      `${this.openApiBaseUrl()}/open-apis/authen/v1/access_token`,
      { grant_type: "authorization_code", code },
      appAccessToken,
    );
    return this.normalizeTokenResponse(response, {});
  }

  normalizeTokenResponse(response, existing) {
    const data = response.data || response;
    const accessToken = data.access_token || data.user_access_token;
    const refreshToken = data.refresh_token || (existing && existing.refresh_token);
    if (!accessToken) throw new Error("飞书没有返回 access_token。");
    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: data.token_type || "Bearer",
      expires_at: nowSeconds + Number(data.expires_in || 6900),
      refresh_expires_at: data.refresh_expires_in ? nowSeconds + Number(data.refresh_expires_in) : existing.refresh_expires_at,
      open_id: data.open_id || existing.open_id,
      union_id: data.union_id || existing.union_id,
      user_id: data.user_id || existing.user_id,
      tenant_key: data.tenant_key || existing.tenant_key,
      name: data.name || existing.name,
      updated_at: new Date().toISOString(),
    };
  }

  isTokenValid(tokenStore) {
    return Boolean(
      tokenStore &&
      tokenStore.access_token &&
      tokenStore.expires_at &&
      tokenStore.expires_at - TOKEN_EXPIRY_SKEW_SECONDS > Math.floor(Date.now() / 1000),
    );
  }

  waitForOAuthCodeAndOpenBrowser() {
    return new Promise((resolve, reject) => {
      const state = crypto.randomBytes(12).toString("hex");
      const redirectUrl = new URL(this.settings.redirectUri || DEFAULT_SETTINGS.redirectUri);
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url, this.settings.redirectUri);
          if (url.pathname !== redirectUrl.pathname) {
            res.writeHead(404);
            res.end("Not found");
            return;
          }

          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          const error = url.searchParams.get("error");
          if (error) throw new Error(`OAuth 失败：${error}`);
          if (returnedState && returnedState !== state) throw new Error("OAuth state 校验失败。");
          if (!code) throw new Error("OAuth 回调缺少 code。");

          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("飞书授权已完成，可以关闭这个窗口。");
          server.close(() => resolve(code));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(this.errorMessage(error));
          server.close(() => reject(error));
        }
      });

      server.on("error", reject);
      server.listen(this.toPositiveInt(this.settings.oauthPort, DEFAULT_SETTINGS.oauthPort), this.settings.oauthHost || "127.0.0.1", () => {
        const authorizeUrl = this.buildAuthorizeUrl(state);
        this.openExternal(authorizeUrl);
        new OutputModal(this.app, "飞书授权", `已打开授权链接。\n\n如果浏览器没有自动打开，请复制下面的链接：\n\n${authorizeUrl}\n\n回调地址必须已配置到飞书应用：\n${this.settings.redirectUri}`).open();
      });
    });
  }

  buildAuthorizeUrl(state) {
    const url = new URL(`${this.accountsBaseUrl()}/open-apis/authen/v1/authorize`);
    url.searchParams.set("client_id", this.settings.appId.trim());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", this.settings.redirectUri || DEFAULT_SETTINGS.redirectUri);
    url.searchParams.set("state", state);
    if (this.settings.oauthScope) url.searchParams.set("scope", this.settings.oauthScope);
    return url.toString();
  }

  openExternal(url) {
    try {
      const electron = require("electron");
      if (electron && electron.shell) {
        electron.shell.openExternal(url);
        return;
      }
    } catch {
      // Fall through to window.open.
    }
    window.open(url);
  }

  async listFiles(token, options, folderToken = "", depth = 0, visited = new Set()) {
    const output = [];
    let pageToken = "";
    while (output.length < options.maxFiles) {
      const data = (await this.requestJson("GET", "/open-apis/drive/v1/files", token, null, {
        page_size: Math.min(options.pageSize, 50),
        page_token: pageToken,
        folder_token: folderToken,
        order_by: "EditedTime",
        direction: "DESC",
      })).data || {};

      const files = data.files || data.items || data.list || [];
      for (const item of files) {
        const itemType = this.getItemType(item);
        const tokenValue = this.getItemToken(item);
        const visitKey = `${itemType}:${tokenValue}`;
        if (tokenValue && visited.has(visitKey)) continue;
        if (tokenValue) visited.add(visitKey);
        output.push(item);

        if (itemType === "folder" && tokenValue && depth < options.maxDepth && output.length < options.maxFiles) {
          const nested = await this.listFiles(token, options, tokenValue, depth + 1, visited);
          output.push(...nested);
        }
        if (output.length >= options.maxFiles) break;
      }

      pageToken = data.next_page_token || data.page_token || "";
      if (!data.has_more || !pageToken) break;
    }
    return output.slice(0, options.maxFiles);
  }

  async fetchMarkdown(token, docToken) {
    const data = (await this.requestJson("GET", "/open-apis/docs/v1/content", token, null, {
      doc_token: docToken,
      doc_type: "docx",
      content_type: "markdown",
    })).data || {};
    return data.content || data.markdown || data.text || "";
  }

  async requestJson(method, apiPath, token, body, params) {
    const url = new URL(`${this.openApiBaseUrl()}${apiPath}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    };
    const response = await requestUrl({
      url: url.toString(),
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      throw: false,
    });
    const parsed = this.parseResponseJson(response);
    if (response.status < 200 || response.status >= 300 || (parsed.code && parsed.code !== 0)) {
      throw new Error(`飞书 API 请求失败：${apiPath}，HTTP ${response.status}，code=${parsed.code || ""}，msg=${parsed.msg || parsed.message || ""}`);
    }
    return parsed;
  }

  async postJson(url, body, bearerToken) {
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    const response = await requestUrl({
      url,
      method: "POST",
      headers,
      body: JSON.stringify(body),
      throw: false,
    });
    const parsed = this.parseResponseJson(response);
    if (response.status < 200 || response.status >= 300 || (parsed.code && parsed.code !== 0)) {
      throw new Error(`飞书 OAuth 请求失败：HTTP ${response.status}，code=${parsed.code || ""}，msg=${parsed.msg || parsed.message || ""}`);
    }
    return parsed;
  }

  parseResponseJson(response) {
    if (response.json && typeof response.json === "object") return response.json;
    try {
      return JSON.parse(response.text || "");
    } catch {
      throw new Error(`飞书返回了非 JSON 响应：${String(response.text || "").slice(0, 200)}`);
    }
  }

  buildPayload(markdown, item, options) {
    const docToken = this.getItemToken(item);
    const docUrl = this.getItemUrl(item);
    const title = this.detectTitle(markdown, this.getItemTitle(item));
    const meetingDate = this.detectMeetingDate(markdown);
    const knowledge = this.extractKnowledge(markdown);
    const sourceUpdatedAt = this.itemUpdatedAtIso(item);
    return {
      title,
      meeting_date: meetingDate,
      source: "feishu_minutes",
      doc_token: docToken,
      doc_url: docUrl,
      workspace_root: options.outputRoot,
      category: options.category,
      participants: [],
      markdown: `${markdown.trim()}\n`,
      summary: this.summarize(markdown),
      audio: {
        status: "pending",
        file_name: null,
        download_url: null,
        resource_token: null,
        minutes_url: this.extractMinutesLink(markdown),
        error: null,
        attempted: false,
      },
      knowledge,
      extra_metadata: {
        project: options.category || "",
        tags: this.deriveTags(markdown),
        source_updated_at: sourceUpdatedAt,
        discovered_by: "obsidian-plugin",
        knowledge_counts: {
          todos: knowledge.todos.length,
          decisions: knowledge.decisions.length,
          risks: knowledge.risks.length,
        },
      },
      source_updated_at: sourceUpdatedAt,
    };
  }

  persistPayload(payload, outputRoot, category) {
    const markdown = (payload.markdown || "").trim();
    if (!markdown) throw new Error("payload.markdown 不能为空。");
    if (!payload.title) throw new Error("payload.title 不能为空。");

    const targetDir = path.join(outputRoot, category || "");
    this.ensureDir(targetDir);
    const ledgerPath = path.join(targetDir, LEDGER_FILE);
    const latestIndexPath = path.join(targetDir, LATEST_INDEX_FILE);
    const failureLedgerPath = path.join(targetDir, FAILURE_LEDGER_FILE);
    const ledger = this.loadJsonIfExists(ledgerPath, { version: 2, generated_at: null, records: [] });
    ledger.version = ledger.version || 2;
    ledger.records = ledger.records || [];
    const latestIndex = this.loadJsonIfExists(latestIndexPath, { generated_at: null, items: {} });
    latestIndex.items = latestIndex.items || {};

    const syncKey = this.computeSyncKey(payload);
    const contentHash = this.sha256(markdown);
    const payloadSignature = this.computePayloadSignature(payload);
    const latest = this.latestRecord(ledger.records, syncKey);
    const incomingUpdatedAt = this.parseDate(payload.source_updated_at || (payload.extra_metadata || {}).source_updated_at);
    const latestUpdatedAt = this.parseDate((latest || {}).source_updated_at);

    if (latest && incomingUpdatedAt && latestUpdatedAt && incomingUpdatedAt < latestUpdatedAt) {
      return this.buildSkipResult("stale_payload", latest, syncKey, contentHash, payloadSignature, ledgerPath, latestIndexPath);
    }
    if (latest && latest.payload_signature === payloadSignature) {
      return this.buildSkipResult("duplicate_payload_signature", latest, syncKey, contentHash, payloadSignature, ledgerPath, latestIndexPath);
    }

    const revision = latest ? Number(latest.revision || 1) + 1 : 1;
    const baseName = this.buildBaseName(payload);
    const initialStem = revision === 1 ? baseName : `${baseName}__rev${revision}`;
    const fileStem = this.resolveCollisionStem(targetDir, initialStem, payload, syncKey);
    payload.audio = Object.assign({}, payload.audio || {}, { attempted: false });

    const markdownPath = path.join(targetDir, `${fileStem}.md`);
    const jsonPath = path.join(targetDir, `${fileStem}.json`);
    const result = {
      status: latest ? "updated" : "created",
      sync_key: syncKey,
      revision,
      content_hash: contentHash,
      payload_signature: payloadSignature,
      markdown_path: markdownPath,
      json_path: jsonPath,
      ledger_path: ledgerPath,
      latest_index_path: latestIndexPath,
      failure_ledger_path: failureLedgerPath,
      ledger_action: latest ? "update" : "insert",
      stale_guard_applied: false,
      synced_at: this.nowIso(),
    };

    result.governance = this.buildGovernance(result, payload.audio);
    fs.writeFileSync(markdownPath, this.buildFrontmatter(payload, result) + markdown + "\n", "utf-8");
    this.saveJson(jsonPath, this.buildMetadata(payload, result));

    const sourceUpdatedAt = payload.source_updated_at || (payload.extra_metadata || {}).source_updated_at;
    ledger.records.push({
      sync_key: syncKey,
      title: payload.title,
      meeting_date: payload.meeting_date,
      doc_token: payload.doc_token,
      doc_url: payload.doc_url,
      content_hash: contentHash,
      payload_signature: payloadSignature,
      revision,
      status: result.status,
      markdown_path: markdownPath,
      json_path: jsonPath,
      audio_status: (payload.audio || {}).status || "pending",
      audio_saved_path: (payload.audio || {}).saved_path,
      knowledge_counts: {
        todos: ((payload.knowledge || {}).todos || []).length,
        decisions: ((payload.knowledge || {}).decisions || []).length,
        risks: ((payload.knowledge || {}).risks || []).length,
      },
      source_updated_at: sourceUpdatedAt,
      synced_at: result.synced_at,
    });
    ledger.generated_at = this.nowIso();
    this.saveJson(ledgerPath, ledger);

    latestIndex.items[syncKey] = {
      revision,
      payload_signature: payloadSignature,
      content_hash: contentHash,
      markdown_path: markdownPath,
      json_path: jsonPath,
      audio_status: (payload.audio || {}).status || "pending",
      source_updated_at: sourceUpdatedAt,
      synced_at: result.synced_at,
    };
    latestIndex.generated_at = this.nowIso();
    this.saveJson(latestIndexPath, latestIndex);
    return result;
  }

  buildSkipResult(reason, latest, syncKey, contentHash, payloadSignature, ledgerPath, latestIndexPath) {
    return {
      status: "skipped",
      reason,
      sync_key: syncKey,
      revision: latest.revision || 1,
      content_hash: contentHash,
      payload_signature: payloadSignature,
      markdown_path: latest.markdown_path,
      json_path: latest.json_path,
      ledger_path: ledgerPath,
      latest_index_path: latestIndexPath,
      ledger_action: "skip",
      stale_guard_applied: reason === "stale_payload",
      synced_at: this.nowIso(),
    };
  }

  buildFrontmatter(payload, result) {
    const audio = payload.audio || {};
    const knowledge = payload.knowledge || {};
    return [
      "---",
      `title: ${payload.title || ""}`,
      `date: ${payload.meeting_date || ""}`,
      `source: ${payload.source || "feishu_minutes"}`,
      `feishu_url: ${payload.doc_url || ""}`,
      `doc_token: ${payload.doc_token || ""}`,
      `audio_file: ${audio.file_name || ""}`,
      `audio_status: ${audio.status || "pending"}`,
      `audio_saved_path: ${audio.saved_path || ""}`,
      `todos_count: ${(knowledge.todos || []).length}`,
      `decisions_count: ${(knowledge.decisions || []).length}`,
      `risks_count: ${(knowledge.risks || []).length}`,
      `sync_time: ${result.synced_at}`,
      `revision: ${result.revision}`,
      `payload_signature: ${result.payload_signature}`,
      "---",
      "",
    ].join("\n");
  }

  buildMetadata(payload, result) {
    return {
      title: payload.title,
      meeting_date: payload.meeting_date,
      source: payload.source || "feishu_minutes",
      doc_token: payload.doc_token,
      doc_url: payload.doc_url,
      participants: payload.participants || [],
      summary: payload.summary,
      audio: payload.audio || {},
      knowledge: payload.knowledge || {},
      extra_metadata: payload.extra_metadata || {},
      governance: result.governance || {},
      sync: {
        sync_key: result.sync_key,
        content_hash: result.content_hash,
        payload_signature: result.payload_signature,
        revision: result.revision,
        synced_at: result.synced_at,
        status: result.status,
        source_updated_at: payload.source_updated_at || (payload.extra_metadata || {}).source_updated_at,
      },
    };
  }

  buildGovernance(result, audio) {
    return {
      failure_count: 0,
      failure_events: [],
      audio_attempted: Boolean(audio && audio.attempted),
      incremental: {
        stale_guard_applied: Boolean(result.stale_guard_applied),
        latest_index_path: result.latest_index_path,
      },
    };
  }

  buildBaseName(payload) {
    const date = payload.meeting_date || new Date().toISOString().slice(0, 10);
    return `${date}_${this.normalizeFilename(payload.title || "untitled-meeting")}`;
  }

  resolveCollisionStem(targetDir, initialStem, payload, syncKey) {
    let fileStem = initialStem;
    const suffix = payload.doc_token ? this.normalizeFilename(String(payload.doc_token)).slice(0, 8) : this.sha1(syncKey).slice(0, 8);
    let collisionIndex = 0;
    while (true) {
      const markdownPath = path.join(targetDir, `${fileStem}.md`);
      const jsonPath = path.join(targetDir, `${fileStem}.json`);
      const existingSync = this.readExistingSyncKey(jsonPath);
      if (!fs.existsSync(markdownPath) && !fs.existsSync(jsonPath)) return fileStem;
      if (existingSync === null || existingSync === syncKey) return fileStem;
      collisionIndex += 1;
      const extra = collisionIndex === 1 ? suffix : `${suffix}-${collisionIndex}`;
      fileStem = `${initialStem}__${extra}`;
    }
  }

  readExistingSyncKey(jsonPath) {
    if (!fs.existsSync(jsonPath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      return data && data.sync ? data.sync.sync_key : null;
    } catch {
      return null;
    }
  }

  latestRecord(records, syncKey) {
    const matched = (records || []).filter((record) => record.sync_key === syncKey);
    matched.sort((a, b) => Number(a.revision || 0) - Number(b.revision || 0) || String(a.synced_at || "").localeCompare(String(b.synced_at || "")));
    return matched.length ? matched[matched.length - 1] : null;
  }

  computeSyncKey(payload) {
    if (payload.sync_key) return String(payload.sync_key);
    if (payload.doc_token) return `doc:${payload.doc_token}`;
    if (payload.doc_url) return `url:${payload.doc_url}`;
    return `title:${payload.meeting_date || ""}:${String(payload.title || "").trim()}`;
  }

  computePayloadSignature(payload) {
    const normalized = {
      title: payload.title,
      meeting_date: payload.meeting_date,
      doc_token: payload.doc_token,
      doc_url: payload.doc_url,
      participants: payload.participants || [],
      summary: payload.summary,
      markdown: String(payload.markdown || "").trim(),
      audio: payload.audio || {},
      knowledge: payload.knowledge || {},
      extra_metadata: payload.extra_metadata || {},
      source_updated_at: payload.source_updated_at || (payload.extra_metadata || {}).source_updated_at,
    };
    return this.sha256(JSON.stringify(this.sortObject(normalized)));
  }

  sortObject(value) {
    if (Array.isArray(value)) return value.map((item) => this.sortObject(item));
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((acc, key) => {
        acc[key] = this.sortObject(value[key]);
        return acc;
      }, {});
    }
    return value;
  }

  detectTitle(markdown, docTitle) {
    const patterns = [/录音主题：(.+)/, /^#\s+(.+)$/];
    for (const line of markdown.split(/\r?\n/)) {
      const stripped = line.trim();
      for (const pattern of patterns) {
        const match = stripped.match(pattern);
        if (match) {
          const candidate = this.cleanTitle(match[1]);
          if (candidate && !candidate.startsWith("总结")) return candidate;
        }
      }
    }
    const fallback = this.cleanTitle(docTitle || "");
    if (fallback) return fallback;
    throw new Error("无法推断会议标题。");
  }

  detectMeetingDate(markdown) {
    const patterns = [
      /录音时间：(\d{4})年(\d{1,2})月(\d{1,2})日/,
      /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/,
    ];
    for (const line of markdown.split(/\r?\n/)) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          return `${String(Number(match[1])).padStart(4, "0")}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
        }
      }
    }
    return new Date().toISOString().slice(0, 10);
  }

  cleanTitle(value) {
    return String(value || "")
      .trim()
      .replace(/^智能纪要[:：]\s*/, "")
      .replace(/\s+\d{4}年\d{1,2}月\d{1,2}日$/, "")
      .trim();
  }

  summarize(markdown) {
    const lines = markdown.split(/\r?\n/).map((line) => line.trim());
    let collecting = false;
    const collected = [];
    for (const line of lines) {
      if (line === "# 总结") {
        collecting = true;
        continue;
      }
      if (collecting && line.startsWith("# ")) break;
      if (!collecting || !line || line.startsWith("<")) continue;
      const clean = line.replace(/^[-*]\s*/, "");
      if (clean) collected.push(clean);
      if (collected.join(" ").length >= 140) break;
    }
    const summary = collected.join(" ").trim();
    return summary ? summary.slice(0, 180) : "智能纪要自动同步";
  }

  deriveTags(markdown) {
    const tags = ["妙记", "自动同步"];
    if (markdown.includes("# 待办")) tags.push("待办");
    if (markdown.includes("# 关键决策")) tags.push("关键决策");
    if (markdown.includes("# 风险")) tags.push("风险");
    if (markdown.includes("# 智能章节")) tags.push("智能章节");
    return tags;
  }

  extractKnowledge(markdown) {
    const todos = [];
    const decisions = [];
    const risks = [];
    for (const [title, lines] of this.parseSections(markdown)) {
      for (const raw of lines) {
        const stripped = raw.trim();
        if (!stripped) continue;
        const isListLine = /^\s*(?:[-*]|\d+[.)])\s+/.test(raw);
        const clean = this.cleanItemText(stripped);
        if (!clean) continue;

        if ((title.includes("待办") || /待办|行动项|负责人|跟进|落实|补充|完成/.test(clean)) && (isListLine || title.includes("待办"))) {
          const ownerMatch = clean.match(/(?:负责人|Owner|owner)[:：]\s*([^，。,；;]+)/);
          const dueMatch = clean.match(/(?:截止|Due|due|时间)[:：]\s*([^，。,；;]+)/);
          todos.push({ text: clean, owner: ownerMatch ? ownerMatch[1].trim() : null, due: dueMatch ? dueMatch[1].trim() : null, source_section: title });
          continue;
        }
        if ((title.includes("决策") || /决策|决定|明确|结论|通过|采用/.test(clean)) && (isListLine || title.includes("决策"))) {
          decisions.push({ text: clean, source_section: title });
          continue;
        }
        if ((title.includes("风险") || /风险|担心|阻塞|延期|成本|问题|依赖/.test(clean)) && (isListLine || title.includes("风险") || clean.includes("问题"))) {
          risks.push({ text: clean, source_section: title });
        }
      }
    }
    return {
      todos: this.uniqueItems(todos),
      decisions: this.uniqueItems(decisions),
      risks: this.uniqueItems(risks),
    };
  }

  parseSections(markdown) {
    const sections = [];
    let currentTitle = "__root__";
    let currentLines = [];
    for (const raw of markdown.split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, "");
      if (line.startsWith("# ")) {
        sections.push([currentTitle, currentLines]);
        currentTitle = line.slice(2).trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
    sections.push([currentTitle, currentLines]);
    return sections;
  }

  cleanItemText(line) {
    return line
      .trim()
      .replace(/^[-*]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/^\*\*(.+?)\*\*[:：]?\s*/, "$1：")
      .replace(/[ ：]+$/g, "")
      .trim();
  }

  uniqueItems(items) {
    const seen = new Set();
    const output = [];
    for (const item of items) {
      const key = JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(item);
    }
    return output;
  }

  looksLikeMinutes(title, markdown, query) {
    const combined = `${title}\n${markdown}`;
    if (/https?:\/\/[^\s)]+\/minutes\/[A-Za-z0-9_-]+/.test(combined)) return true;
    if (/录音主题[:：]/.test(combined)) return true;
    if (/录音时间[:：]/.test(combined)) return true;
    if (/智能纪要.*AI.*生成|AI.*生成.*智能纪要/.test(combined)) return true;
    const titleLooksLikeMinutes = this.keywordHit(title, query);
    const bodyLooksLikeMeetingSummary = /#\s*(总结|待办|关键决策|风险|相关链接)|会议日期[:：]|会议时间[:：]|妙记[:：]/.test(markdown);
    return titleLooksLikeMinutes && bodyLooksLikeMeetingSummary;
  }

  keywordHit(text, query) {
    const source = String(text || "").toLowerCase();
    const keywords = Array.from(new Set([...(query || "").split(/\s+/), ...MINUTES_HINTS].filter(Boolean)));
    return keywords.some((keyword) => source.includes(keyword.toLowerCase()));
  }

  getItemToken(item) {
    return item.token || item.file_token || item.doc_token || item.obj_token || item.node_token || "";
  }

  getItemType(item) {
    return item.type || item.file_type || item.obj_type || "";
  }

  getItemTitle(item) {
    return item.name || item.title || item.file_name || "";
  }

  getItemUrl(item) {
    const direct = item.url || item.link || item.docs_url || item.web_url || "";
    if (direct) return direct;
    const token = this.getItemToken(item);
    const type = this.getItemType(item);
    if (token && type === "docx") return `${this.feishuBaseUrl()}/docx/${token}`;
    return "";
  }

  getItemUpdatedAt(item) {
    return this.secondsSinceEpoch(item.updated_time || item.update_time || item.modified_time || item.edit_time);
  }

  itemUpdatedAtIso(item) {
    const seconds = this.getItemUpdatedAt(item);
    return seconds ? new Date(seconds * 1000).toISOString() : null;
  }

  isWithinLookback(item, cutoffSeconds) {
    const updatedAt = this.getItemUpdatedAt(item);
    return !updatedAt || updatedAt >= cutoffSeconds;
  }

  extractMinutesLink(markdown) {
    const match = markdown.match(/- 妙记：\[[^\]]+\]\((https?:\/\/[^)]+)\)/);
    return match ? match[1] : null;
  }

  secondsSinceEpoch(value) {
    if (!value) return 0;
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return num > 1e12 ? Math.floor(num / 1000) : num;
  }

  resolveOutputRoot() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("无法获取当前仓库的本地文件路径。这个插件仅支持桌面端。");
    }
    const vaultRoot = adapter.getBasePath();
    const vaultFolder = normalizePath(this.settings.outputFolder || "FeishuMinutes").replace(/^\/+/, "");
    return path.join(vaultRoot, vaultFolder);
  }

  requireAppConfig() {
    if (!this.settings.appId.trim() || !this.settings.appSecret.trim()) {
      throw new Error("请先在插件设置中填写飞书 App ID 和 App Secret。");
    }
  }

  openApiBaseUrl() {
    return (this.settings.openApiBaseUrl || DEFAULT_SETTINGS.openApiBaseUrl).replace(/\/$/, "");
  }

  accountsBaseUrl() {
    return (this.settings.accountsBaseUrl || DEFAULT_SETTINGS.accountsBaseUrl).replace(/\/$/, "");
  }

  feishuBaseUrl() {
    return (this.settings.feishuBaseUrl || DEFAULT_SETTINGS.feishuBaseUrl).replace(/\/$/, "");
  }

  formatSyncSummary(data) {
    const mode = String(data.mode || "sync");
    return `飞书${mode === "dry-run" ? "预览" : "同步"}：扫描 ${data.scanned || 0} 个，候选 ${data.candidates || 0} 个，新建 ${data.created || 0} 个，更新 ${data.updated || 0} 个，跳过 ${data.skipped || 0} 个，忽略 ${data.ignored || 0} 个，失败 ${data.failed || 0} 个。输出目录：${data.output_root || this.resolveOutputRoot()}`;
  }

  normalizeFilename(value) {
    return String(value || "")
      .trim()
      .replace(/\//g, "-")
      .replace(/[\\:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "untitled";
  }

  ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
  }

  loadJsonIfExists(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  }

  saveJson(file, data) {
    this.ensureDir(path.dirname(file));
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  }

  appendFailureRecord(file, record) {
    this.ensureDir(path.dirname(file));
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf-8");
  }

  sha256(text) {
    return crypto.createHash("sha256").update(String(text), "utf-8").digest("hex");
  }

  sha1(text) {
    return crypto.createHash("sha1").update(String(text), "utf-8").digest("hex");
  }

  parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  nowIso() {
    return new Date().toISOString();
  }

  toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  setStatus(text) {
    if (this.statusBar) this.statusBar.setText(text);
  }
};

class FeishuMinutesSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const { settings } = this.plugin;
    containerEl.empty();

    containerEl.createEl("h3", { text: "飞书应用配置" });

    new Setting(containerEl)
      .setName("飞书 App ID")
      .setDesc("飞书开放平台企业自建应用的 App ID。")
      .addText((text) => {
        text.setPlaceholder("cli_xxx").setValue(settings.appId).onChange(async (value) => {
          settings.appId = value.trim();
          await this.plugin.saveSettings();
        });
        text.inputEl.size = 48;
      });

    new Setting(containerEl)
      .setName("飞书 App Secret")
      .setDesc("飞书开放平台企业自建应用的 App Secret。会保存在当前 Vault 的插件数据中，请不要分享 data.json。")
      .addText((text) => {
        text.setPlaceholder("xxx").setValue(settings.appSecret).onChange(async (value) => {
          settings.appSecret = value.trim();
          await this.plugin.saveSettings();
        });
        text.inputEl.type = "password";
        text.inputEl.size = 48;
      });

    new Setting(containerEl)
      .setName("OAuth 回调地址")
      .setDesc("需要添加到飞书应用的重定向 URL 白名单。默认：http://127.0.0.1:8765/callback")
      .addText((text) => {
        text.setValue(settings.redirectUri).onChange(async (value) => {
          settings.redirectUri = value.trim() || DEFAULT_SETTINGS.redirectUri;
          try {
            settings.oauthPort = Number(new URL(settings.redirectUri).port || DEFAULT_SETTINGS.oauthPort);
          } catch {
            // Keep the previous port if the URL is incomplete while typing.
          }
          await this.plugin.saveSettings();
        });
        text.inputEl.size = 56;
      });

    new Setting(containerEl)
      .setName("OAuth 权限范围")
      .setDesc("默认包含云空间只读和文档内容读取。")
      .addText((text) => {
        text.setValue(settings.oauthScope).onChange(async (value) => {
          settings.oauthScope = value.trim() || DEFAULT_SETTINGS.oauthScope;
          await this.plugin.saveSettings();
        });
        text.inputEl.size = 56;
      });

    new Setting(containerEl)
      .setName("授权状态")
      .setDesc(this.authorizationStatusText())
      .addButton((button) => button.setButtonText("授权飞书账号").setCta().onClick(() => void this.plugin.authorize()))
      .addButton((button) => button.setButtonText("刷新授权").onClick(() => void this.plugin.refreshUserToken(true)))
      .addButton((button) => button.setButtonText("测试配置").onClick(() => void this.plugin.testConfig()));

    containerEl.createEl("h3", { text: "同步设置" });

    new Setting(containerEl)
      .setName("仓库内输出文件夹")
      .setDesc("同步文件会写入当前 Obsidian 仓库内的这个相对路径。")
      .addText((text) => text.setPlaceholder("FeishuMinutes").setValue(settings.outputFolder).onChange(async (value) => {
        settings.outputFolder = value.trim() || DEFAULT_SETTINGS.outputFolder;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("分类子目录")
      .setDesc("输出根目录下的可选子文件夹。")
      .addText((text) => text.setPlaceholder("meeting-notes").setValue(settings.category).onChange(async (value) => {
        settings.category = value.trim();
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("回溯小时数")
      .addText((text) => text.setValue(String(settings.lookbackHours)).onChange(async (value) => {
        settings.lookbackHours = this.toPositiveInt(value, DEFAULT_SETTINGS.lookbackHours);
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("最大扫描文件数")
      .addText((text) => text.setValue(String(settings.maxFiles)).onChange(async (value) => {
        settings.maxFiles = this.toPositiveInt(value, DEFAULT_SETTINGS.maxFiles);
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("最大文件夹深度")
      .addText((text) => text.setValue(String(settings.maxDepth)).onChange(async (value) => {
        settings.maxDepth = Math.max(0, this.toPositiveInt(value, DEFAULT_SETTINGS.maxDepth));
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("每页读取数量")
      .addText((text) => text.setValue(String(settings.pageSize)).onChange(async (value) => {
        settings.pageSize = this.toPositiveInt(value, DEFAULT_SETTINGS.pageSize);
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("飞书文件夹 token")
      .setDesc("可选。指定要扫描的飞书云空间文件夹 token；留空则扫描云空间根目录。")
      .addText((text) => {
        text.setValue(settings.folderToken).onChange(async (value) => {
          settings.folderToken = value.trim();
          await this.plugin.saveSettings();
        });
        text.inputEl.size = 48;
      });

    new Setting(containerEl)
      .setName("搜索关键词")
      .setDesc("用于辅助判断哪些文档是妙记智能纪要。")
      .addText((text) => {
        text.setValue(settings.query).onChange(async (value) => {
          settings.query = value.trim() || DEFAULT_QUERY;
          await this.plugin.saveSettings();
        });
        text.inputEl.size = 48;
      });

    new Setting(containerEl)
      .setName("操作")
      .addButton((button) => button.setButtonText("预览").onClick(() => void this.plugin.sync(true)))
      .addButton((button) => button.setButtonText("同步").setCta().onClick(() => void this.plugin.sync(false)));

    containerEl.createEl("h3", { text: "高级设置" });

    new Setting(containerEl)
      .setName("OpenAPI 地址")
      .setDesc("中国飞书默认 https://open.feishu.cn；Lark 国际版可改为对应域名。")
      .addText((text) => {
        text.setValue(settings.openApiBaseUrl).onChange(async (value) => {
          settings.openApiBaseUrl = value.trim() || DEFAULT_SETTINGS.openApiBaseUrl;
          await this.plugin.saveSettings();
        });
        text.inputEl.size = 48;
      });

    new Setting(containerEl)
      .setName("账号授权地址")
      .setDesc("中国飞书默认 https://accounts.feishu.cn。")
      .addText((text) => {
        text.setValue(settings.accountsBaseUrl).onChange(async (value) => {
          settings.accountsBaseUrl = value.trim() || DEFAULT_SETTINGS.accountsBaseUrl;
          await this.plugin.saveSettings();
        });
        text.inputEl.size = 48;
      });

    new Setting(containerEl)
      .setName("飞书网页地址")
      .setDesc("用于生成文档链接，默认 https://feishu.cn。")
      .addText((text) => {
        text.setValue(settings.feishuBaseUrl).onChange(async (value) => {
          settings.feishuBaseUrl = value.trim() || DEFAULT_SETTINGS.feishuBaseUrl;
          await this.plugin.saveSettings();
        });
        text.inputEl.size = 48;
      });
  }

  authorizationStatusText() {
    const token = this.plugin.tokenStore;
    if (!token || !token.access_token) return "尚未授权。";
    const expiresAt = token.expires_at ? new Date(token.expires_at * 1000).toLocaleString() : "未知";
    const user = token.name || token.user_id || token.open_id || "未知用户";
    return `已授权：${user}；access_token 过期时间：${expiresAt}`;
  }

  toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
