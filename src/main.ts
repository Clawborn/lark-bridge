import { Plugin, PluginSettingTab, Setting, Notice, App, requestUrl } from "obsidian";
import { exec, execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";

// ─── Settings ────────────────────────────────────────────────────────

interface LarkBridgeSettings {
  mode: "api" | "cli" | "auto";
  appId: string;
  appSecret: string;
  userAccessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  syncDir: string;
  assetsSubdir: string;
  skipUnder: number;
}

const DEFAULT_SETTINGS: LarkBridgeSettings = {
  mode: "auto",
  appId: "",
  appSecret: "",
  userAccessToken: "",
  refreshToken: "",
  tokenExpiry: 0,
  syncDir: "LarkBridge",
  assetsSubdir: "assets",
  skipUnder: 5,
};

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

// ─── Plugin ──────────────────────────────────────────────────────────

export default class LarkBridgePlugin extends Plugin {
  settings!: LarkBridgeSettings;
  syncing = false;
  private _cliAvailable: boolean | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LarkBridgeSettingTab(this.app, this));
    this.addRibbonIcon("refresh-cw", "LarkBridge: 同步飞书妙记", () => this.sync());
    this.addCommand({
      id: "lark-bridge-sync",
      name: "同步飞书妙记 (Sync Lark Minutes)",
      callback: () => this.sync(),
    });
  }

  onunload() {
    this.syncing = false;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ─── Mode detection ──────────────────────────────────────────────

  async checkCliStatus(): Promise<{ installed: boolean; loggedIn: boolean; userName: string }> {
    try {
      await this.execLarkCli(["--version"], 5_000);
    } catch {
      this._cliAvailable = false;
      return { installed: false, loggedIn: false, userName: "" };
    }
    try {
      const out = await this.execLarkCli(["auth", "status", "--format", "json"], 5_000);
      const d = this.parseJson(out);
      if (d?.tokenStatus === "valid") {
        this._cliAvailable = true;
        return { installed: true, loggedIn: true, userName: d.userName || "" };
      }
    } catch {}
    this._cliAvailable = false;
    return { installed: true, loggedIn: false, userName: "" };
  }

  hasApiMode(): boolean {
    return !!(this.settings.appId && this.settings.appSecret && this.settings.userAccessToken);
  }

  resetCliCache() {
    this._cliAvailable = null;
  }

  private async resolveMode(): Promise<"api" | "cli"> {
    if (this.settings.mode === "api") return "api";
    if (this.settings.mode === "cli") return "cli";
    if (this.hasApiMode()) return "api";
    if (this._cliAvailable === null) await this.checkCliStatus();
    if (this._cliAvailable) return "cli";
    return "api";
  }

  // ─── Shell helpers (CLI mode, safe) ──────────────────────────────

  private execLarkCli(args: string[], timeout = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("lark-cli", args, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` },
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout + stderr);
      });
    });
  }

  private execCurl(args: string[], timeout = 180_000): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile("curl", args, { timeout }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ─── API helpers (API mode) ──────────────────────────────────────

  private async apiRequest(urlPath: string, opts: { method?: string; body?: any; binary?: boolean } = {}): Promise<any> {
    await this.ensureToken();
    const method = opts.method || "GET";
    const url = `${FEISHU_BASE}${urlPath}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.settings.userAccessToken}`,
    };
    if (opts.body) headers["Content-Type"] = "application/json";

    const resp = await requestUrl({
      url,
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (opts.binary) return resp.arrayBuffer;
    return resp.json;
  }

  private async ensureToken() {
    if (this.settings.userAccessToken && this.settings.tokenExpiry > Date.now() + 60_000) return;
    if (!this.settings.refreshToken || !this.settings.appId || !this.settings.appSecret) {
      throw new Error("Not logged in. Go to Settings → LarkBridge and click 'Login'.");
    }

    const resp = await requestUrl({
      url: "https://accounts.feishu.cn/oauth/v1/token",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.settings.appId,
        client_secret: this.settings.appSecret,
        grant_type: "refresh_token",
        refresh_token: this.settings.refreshToken,
      }),
    });

    if (resp.json?.access_token) {
      this.settings.userAccessToken = resp.json.access_token;
      this.settings.refreshToken = resp.json.refresh_token || this.settings.refreshToken;
      this.settings.tokenExpiry = Date.now() + (resp.json.expires_in || 7200) * 1000;
      await this.saveSettings();
    } else {
      this.settings.userAccessToken = "";
      this.settings.refreshToken = "";
      await this.saveSettings();
      throw new Error("Token expired. Please re-login in LarkBridge settings.");
    }
  }

  private async getAppAccessToken(): Promise<string> {
    const resp = await requestUrl({
      url: `${FEISHU_BASE}/auth/v3/app_access_token/internal`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.settings.appId, app_secret: this.settings.appSecret }),
    });
    if (resp.json?.code === 0) return resp.json.app_access_token;
    throw new Error("Failed to get app token. Check App ID and Secret.");
  }

  // ─── OAuth login (device code flow) ──────────────────────────────

  async startLogin(): Promise<string> {
    if (!this.settings.appId || !this.settings.appSecret) {
      throw new Error("Fill in App ID and App Secret first.");
    }

    const ACCOUNTS_BASE = "https://accounts.feishu.cn";
    const scopes = [
      "search:docs:read", "docx:document:readonly", "docs:document.content:read",
      "docs:document.media:download", "docs:document:export", "drive:file:download",
      "vc:meeting.search:read", "vc:note:read", "minutes:minutes:readonly",
      "minutes:minutes.media:export", "offline_access",
    ].join(" ");

    // Step 1: Request device code from accounts.feishu.cn
    const resp = await requestUrl({
      url: `${ACCOUNTS_BASE}/oauth/v1/device_authorization`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.settings.appId,
        client_secret: this.settings.appSecret,
        scope: scopes,
      }),
    });

    if (resp.json?.error) throw new Error(`Auth failed: ${resp.json.error_description || resp.json.error}`);

    const deviceCode = resp.json.device_code;
    const verificationUrl = resp.json.verification_url || resp.json.verification_uri || resp.json.verification_uri_complete;
    const interval = (resp.json.interval || 5) * 1000;
    const expiresIn = resp.json.expires_in || 600;

    if (!deviceCode || !verificationUrl) throw new Error("Invalid device auth response.");

    // Step 2: Open browser for user to authorize
    window.open(verificationUrl);

    // Step 3: Poll for token
    const deadline = Date.now() + expiresIn * 1000;
    while (Date.now() < deadline) {
      await sleep(interval);

      try {
        const tokenResp = await requestUrl({
          url: `${ACCOUNTS_BASE}/oauth/v1/device_token`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: this.settings.appId,
            client_secret: this.settings.appSecret,
            device_code: deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        });

        if (tokenResp.json?.access_token) {
          this.settings.userAccessToken = tokenResp.json.access_token;
          this.settings.refreshToken = tokenResp.json.refresh_token || "";
          this.settings.tokenExpiry = Date.now() + (tokenResp.json.expires_in || 7200) * 1000;
          await this.saveSettings();

          try {
            const me = await this.apiRequest("/authen/v1/user_info");
            return me.data?.name || "Feishu User";
          } catch {
            return "Feishu User";
          }
        }
        // authorization_pending or slow_down → keep polling
      } catch { /* keep polling */ }
    }
    throw new Error("Login timed out. Please try again.");
  }

  // ─── Utilities ───────────────────────────────────────────────────

  private vaultPath(): string {
    return (this.app.vault.adapter as any).basePath;
  }
  private syncPath(): string {
    return path.join(this.vaultPath(), this.settings.syncDir);
  }
  private assetsPath(): string {
    return path.join(this.syncPath(), this.settings.assetsSubdir);
  }
  private existingFiles(): Set<string> {
    const p = this.syncPath();
    if (!fs.existsSync(p)) return new Set();
    return new Set(fs.readdirSync(p).filter((f) => f.endsWith(".md")));
  }
  private safe(name: string, max = 60): string {
    let s = name.replace(/[/:*?"<>|\\\n\r]/g, "").trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  private dateFrom(title: string): string | null {
    const m = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;
    // MM-DD without year: use current year
    const m2 = title.match(/^(\d{2})-(\d{2})/);
    if (m2) return `${new Date().getFullYear()}-${m2[1]}-${m2[2]}`;
    return null;
  }
  private topicFrom(title: string): string {
    let t = title
      .replace(/^(智能纪要[：:]|文字记录[：:])/, "")
      .replace(/\s*\d{4}年\d{1,2}月\d{1,2}日\s*/, "")
      .replace(/^\d{2}-\d{2}\s*[|｜]?\s*/, "");
    return this.safe(t);
  }
  private parseJson(raw: string): any {
    const i = raw.indexOf("{");
    if (i === -1) return null;
    try { return JSON.parse(raw.slice(i)); } catch { return null; }
  }

  // ─── Tag cleaning ────────────────────────────────────────────────

  private cleanTags(c: string): string {
    c = c.replace(/<add-ons[^>]*(?:\/?>[\s\S]*?<\/add-ons>|\/?>)/g, "");
    c = c.replace(/<reference-synced[^>]*>([\s\S]*?)<\/reference-synced>/g, "$1");
    c = c.replace(/<image\s+token="([^"]+)"[^/]*\/>/g, "[飞书图片: $1]");
    c = c.replace(/<whiteboard\s+token="([^"]+)"[^/]*\/>/g, "[飞书白板: $1]");
    c = c.replace(/<\/?grid[^>]*>/g, "");
    c = c.replace(/<\/?column[^>]*>/g, "");
    c = c.replace(/<quote-container>([\s\S]*?)<\/quote-container>/g, (_, inner: string) =>
      inner.trim().split("\n").map((l: string) => "> " + l).join("\n"));
    c = c.replace(/<text\s+color="gray"\s+bgcolor="gray">([^<]*)<\/text>/g, "**$1**");
    c = c.replace(/<text\s+color="gray">([^<]*)<\/text>/g, "`$1`");
    c = c.replace(/<text[^>]*>([\s\S]*?)<\/text>/g, "$1");
    c = c.replace(/<mention-user\s+[^/]*\/>/g, "");
    c = c.replace(/<mention-doc[^>]*(?:\/?>|>[^<]*<\/mention-doc>)/g, "");
    c = c.replace(/<callout[^>]*>([\s\S]*?)<\/callout>/g, (_, inner: string) =>
      inner.trim().split("\n").map((l: string) => "> " + l).join("\n"));
    c = c.replace(/<chat-card[^>]*>[\s\S]*?<\/chat-card>/g, "");
    c = c.replace(/<iframe[^>]*\/>/g, "");
    c = c.replace(/\n{4,}/g, "\n\n\n");
    return c;
  }

  // ─── Search (dual mode) ──────────────────────────────────────────

  private async searchDocs(query: string, mode: "api" | "cli"): Promise<any[]> {
    const results: any[] = [];
    let pageToken: string | null = null;

    for (let page = 0; page < 10; page++) {
      try {
        if (mode === "cli") {
          const args = ["docs", "+search", "--query", query, "--page-size", "20", "--format", "json"];
          if (pageToken) args.push("--page-token", pageToken);
          const out = await this.execLarkCli(args, 30_000);
          const d = this.parseJson(out);
          if (!d?.data) break;
          results.push(...(d.data.results || []));
          if (!d.data.has_more) break;
          pageToken = d.data.page_token || "";
        } else {
          const body: any = { query, docs_filter: { search_obj_type: "DOC" }, count: 20 };
          if (pageToken) body.page_token = pageToken;
          const resp = await this.apiRequest("/search/v2/doc_wiki/search", { method: "POST", body });
          if (!resp?.data) break;
          for (const item of resp.data.items || []) {
            results.push({
              title_highlighted: item.doc?.title || "",
              result_meta: {
                token: item.doc?.doc_token || "",
                create_time_iso: item.doc?.create_time || "",
              },
            });
          }
          if (!resp.data.has_more) break;
          pageToken = resp.data.page_token || "";
        }
        if (!pageToken) break;
      } catch { break; }
    }
    return results;
  }

  // ─── Fetch doc (dual mode) ───────────────────────────────────────

  private async fetchDoc(token: string, mode: "api" | "cli"): Promise<string> {
    if (mode === "cli") {
      return await this.execLarkCli(["docs", "+fetch", "--doc", token, "--format", "pretty"], 30_000);
    }
    // API mode: get blocks and convert to text
    const resp = await this.apiRequest(`/docx/v1/documents/${token}/raw_content`);
    return resp?.data?.content || "";
  }

  // ─── Download media (dual mode) ──────────────────────────────────

  private async downloadMedia(token: string, type: string, outPath: string, mode: "api" | "cli"): Promise<boolean> {
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100) return true;

    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (mode === "cli") {
      try {
        const file = path.basename(outPath);
        // execFile with cwd instead of shell cd
        await new Promise<void>((resolve, reject) => {
          execFile("lark-cli", ["docs", "+media-download", "--token", token, "--type", type, "--output", file, "--overwrite"], {
            timeout: 30_000, cwd: dir,
            env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` },
          }, (err) => err ? reject(err) : resolve());
        });
        return fs.existsSync(outPath) && fs.statSync(outPath).size > 100;
      } catch { return false; }
    }

    // API mode
    try {
      const url = type === "whiteboard"
        ? `/board/v1/whiteboards/${token}/download_as_image`
        : `/drive/v1/medias/${token}/download`;
      const data = await this.apiRequest(url, { binary: true });
      if (data && data.byteLength > 100) {
        fs.writeFileSync(outPath, Buffer.from(data));
        return true;
      }
    } catch {}
    return false;
  }

  // ─── Download images in content ──────────────────────────────────

  private async downloadImages(content: string, mode: "api" | "cli"): Promise<string> {
    const ap = this.assetsPath();
    const imgMatches = [...content.matchAll(/\[飞书图片: ([^\]]+)\]/g)];
    const wbMatches = [...content.matchAll(/\[飞书白板: ([^\]]+)\]/g)];
    const all: [string, string][] = [
      ...imgMatches.map((m): [string, string] => [m[1].trim(), "media"]),
      ...wbMatches.map((m): [string, string] => [m[1].trim(), "whiteboard"]),
    ];
    if (all.length === 0) return content;

    for (const [token, type] of all) {
      const outPath = path.join(ap, `${token}.png`);
      const ok = await this.downloadMedia(token, type, outPath, mode);
      if (ok) {
        const placeholder = type === "media" ? `[飞书图片: ${token}]` : `[飞书白板: ${token}]`;
        content = content.replace(placeholder, `![[${this.settings.assetsSubdir}/${token}.png]]`);
      }
    }
    return content;
  }

  // ─── Download recordings ─────────────────────────────────────────

  private async syncRecordings(existing: Set<string>, mode: "api" | "cli") {
    const sp = this.syncPath();
    const newNotes = fs.readdirSync(sp)
      .filter((f) => f.endsWith(".md") && !existing.has(f) && f.includes("_纪要.md"));

    for (const fname of newNotes) {
      const content = fs.readFileSync(path.join(sp, fname), "utf-8");
      const tokens = [...new Set(content.match(/obcn[a-z0-9]{10,}/g) || [])];

      for (const token of tokens) {
        try {
          let duration = 0;

          if (mode === "cli") {
            const out = await this.execLarkCli([
              "minutes", "minutes", "get",
              "--params", JSON.stringify({ minute_token: token }),
              "--format", "json",
            ], 15_000);
            const meta = this.parseJson(out);
            duration = parseInt(meta?.data?.minute?.duration || "0");
          } else {
            const resp = await this.apiRequest(`/minutes/v1/minutes/${token}`);
            duration = parseInt(resp?.data?.minute?.duration || "0");
          }

          if (duration > 0 && duration < this.settings.skipUnder * 60_000) continue;

          const durStr = duration > 0
            ? `_${Math.floor(duration / 60_000)}m${Math.floor((duration % 60_000) / 1000)}s`
            : "";
          const recName = fname.replace("_纪要.md", `_录音${durStr}.mp4`);
          const recPath = path.join(sp, recName);
          if (fs.existsSync(recPath)) continue;

          // Get download URL
          let downloadUrl = "";
          if (mode === "cli") {
            const urlOut = await this.execLarkCli([
              "minutes", "+download", "--minute-tokens", token, "--url-only",
            ], 15_000);
            const urlData = this.parseJson(urlOut);
            if (!urlData?.ok) continue;
            downloadUrl = urlData.data.download_url;
          } else {
            const resp = await this.apiRequest(`/minutes/v1/minutes/${token}/media`, { method: "POST", body: {} });
            downloadUrl = resp?.data?.download_url || "";
          }
          if (!downloadUrl) continue;

          // Download with curl (safe for large files, no OOM)
          await this.execCurl(["-sL", "-o", recPath, downloadUrl]);
        } catch { /* skip */ }
      }
    }
  }

  // ─── Main sync ───────────────────────────────────────────────────

  async sync() {
    if (this.syncing) {
      new Notice("LarkBridge: 同步进行中...");
      return;
    }
    this.syncing = true;
    new Notice("LarkBridge: 开始同步...");

    try {
      const mode = await this.resolveMode();

      if (mode === "cli" && !this._cliAvailable) {
        new Notice("LarkBridge: lark-cli not available. Check settings.");
        return;
      }
      if (mode === "api" && !this.hasApiMode()) {
        new Notice("LarkBridge: Not logged in. Go to Settings → LarkBridge.");
        return;
      }

      const sp = this.syncPath();
      if (!fs.existsSync(sp)) fs.mkdirSync(sp, { recursive: true });

      const existing = this.existingFiles();
      let newCount = 0;

      const notes = await this.searchDocs("智能纪要", mode);
      const transcripts = await this.searchDocs("文字记录", mode);
      const all = [...notes, ...transcripts];

      new Notice(`LarkBridge: 找到 ${all.length} 个文档，检查新增...`);

      for (const item of all) {
        const title = (item.title_highlighted || "").replace(/<\/?h>/g, "");
        const token = item.result_meta?.token || "";
        if (!title || !token) continue;

        const ftype = title.includes("智能纪要") ? "纪要" : title.includes("文字记录") ? "逐字稿" : "纪要";
        const date = this.dateFrom(title) || item.result_meta?.create_time_iso?.slice(0, 10) || "未知日期";
        const topic = this.topicFrom(title);
        const fileName = `${date}_${topic}_${ftype}.md`;

        if (existing.has(fileName)) continue;

        try {
          const out = await this.fetchDoc(token, mode);
          if (out && out.length > 50) {
            let content = this.cleanTags(out);
            content = await this.downloadImages(content, mode);
            fs.writeFileSync(path.join(sp, fileName), content);
            newCount++;
          }
        } catch { /* skip */ }
      }

      if (newCount > 0) {
        new Notice("LarkBridge: 下载录音...");
        await this.syncRecordings(existing, mode);
      }

      new Notice(
        newCount > 0
          ? `LarkBridge: 同步完成！新增 ${newCount} 个文件`
          : "LarkBridge: 同步完成，没有新内容",
      );
    } catch (e: any) {
      console.error("LarkBridge sync error:", e);
      new Notice(`LarkBridge: ${e.message}`);
    } finally {
      this.syncing = false;
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Settings tab ──────────────────────────────────────────────────

class LarkBridgeSettingTab extends PluginSettingTab {
  plugin: LarkBridgePlugin;

  constructor(app: App, plugin: LarkBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "LarkBridge" });

    // ─── Status ──────────────────────────────────────────────────
    const statusEl = containerEl.createDiv();
    statusEl.style.cssText = "padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px;line-height:1.6;";

    const cli = await this.plugin.checkCliStatus();
    const hasApi = this.plugin.hasApiMode();

    if (hasApi) {
      statusEl.style.background = "var(--background-modifier-success)";
      statusEl.style.color = "var(--text-on-accent)";
      statusEl.textContent = "Connected via Feishu API. Click the ↻ icon in the sidebar to sync.";
    } else if (cli.loggedIn) {
      statusEl.style.background = "var(--background-modifier-success)";
      statusEl.style.color = "var(--text-on-accent)";
      statusEl.textContent = `Connected via lark-cli (${cli.userName}). Click the ↻ icon in the sidebar to sync.`;
    } else {
      statusEl.style.background = "var(--background-modifier-error)";
      statusEl.style.color = "var(--text-on-accent)";
      statusEl.textContent = "Not connected. Choose a setup method below.";
    }

    // ─── Method 1: API ───────────────────────────────────────────
    const apiSection = containerEl.createEl("details");
    if (!cli.loggedIn || hasApi) apiSection.setAttribute("open", "");
    apiSection.style.cssText = "margin-bottom:16px;border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;";
    apiSection.createEl("summary", {
      text: "Method 1: Feishu API (recommended, no terminal needed)",
      attr: { style: "cursor:pointer;font-weight:600;margin-bottom:8px;" },
    });
    const apiDiv = apiSection.createDiv();

    // Step 1
    new Setting(apiDiv)
      .setName("Step 1: Create a Feishu app")
      .setDesc("Go to Feishu Developer Console, create an app, copy App ID and App Secret.")
      .addButton((b) => b.setButtonText("Open console").onClick(() => window.open("https://open.feishu.cn/app")));

    // Step 2
    new Setting(apiDiv)
      .setName("App ID")
      .addText((t) => t.setPlaceholder("cli_xxxxxxxx").setValue(this.plugin.settings.appId)
        .onChange(async (v) => { this.plugin.settings.appId = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(apiDiv)
      .setName("App Secret")
      .addText((t) => {
        t.setPlaceholder("xxxxxxxx").setValue(this.plugin.settings.appSecret)
          .onChange(async (v) => { this.plugin.settings.appSecret = v.trim(); await this.plugin.saveSettings(); });
        t.inputEl.type = "password";
      });

    // Step 3
    new Setting(apiDiv)
      .setName("Step 2: Login with Feishu")
      .setDesc("Opens browser for authorization.")
      .addButton((b) => b.setButtonText("Login").setCta().onClick(async () => {
        b.setButtonText("Waiting...");
        b.setDisabled(true);
        try {
          const name = await this.plugin.startLogin();
          new Notice(`LarkBridge: Logged in as ${name}`);
          this.display();
        } catch (e: any) {
          new Notice(`LarkBridge: ${e.message}`);
          b.setButtonText("Login");
          b.setDisabled(false);
        }
      }));

    if (hasApi) {
      new Setting(apiDiv)
        .setName("Logout")
        .addButton((b) => b.setButtonText("Logout").setWarning().onClick(async () => {
          this.plugin.settings.userAccessToken = "";
          this.plugin.settings.refreshToken = "";
          this.plugin.settings.tokenExpiry = 0;
          await this.plugin.saveSettings();
          this.display();
        }));
    }

    // ─── Method 2: CLI ───────────────────────────────────────────
    const cliSection = containerEl.createEl("details");
    if (cli.loggedIn && !hasApi) cliSection.setAttribute("open", "");
    cliSection.style.cssText = "margin-bottom:16px;border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;";
    cliSection.createEl("summary", {
      text: "Method 2: lark-cli (for terminal users)",
      attr: { style: "cursor:pointer;font-weight:600;margin-bottom:8px;" },
    });

    const cliDiv = cliSection.createDiv();
    const ol = cliDiv.createEl("ol", { attr: { style: "padding-left:20px;line-height:1.8;" } });
    ol.createEl("li").createEl("code", { text: "npm install -g @larksuite/cli" });
    ol.createEl("li").createEl("code", { text: "lark-cli config init" });
    ol.createEl("li").createEl("code", { text: "lark-cli auth login --recommend" });
    ol.createEl("li", { text: "Come back here and click Refresh" });

    // ─── Sync settings ───────────────────────────────────────────
    containerEl.createEl("h3", { text: "Sync settings" });

    new Setting(containerEl)
      .setName("Sync directory")
      .setDesc("Folder for synced files (relative to vault root)")
      .addText((t) => t.setValue(this.plugin.settings.syncDir)
        .onChange(async (v) => { this.plugin.settings.syncDir = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Assets subdirectory")
      .setDesc("Subfolder for images and whiteboards")
      .addText((t) => t.setValue(this.plugin.settings.assetsSubdir)
        .onChange(async (v) => { this.plugin.settings.assetsSubdir = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Skip recordings under (minutes)")
      .setDesc("Don't download short recordings")
      .addText((t) => t.setValue(String(this.plugin.settings.skipUnder))
        .onChange(async (v) => { this.plugin.settings.skipUnder = parseInt(v) || 5; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Sync now")
      .addButton((b) => b.setButtonText("Start sync").setCta().onClick(() => this.plugin.sync()));

    new Setting(containerEl)
      .setName("Refresh status")
      .addButton((b) => b.setButtonText("Refresh").onClick(() => {
        this.plugin.resetCliCache();
        this.display();
      }));
  }
}
