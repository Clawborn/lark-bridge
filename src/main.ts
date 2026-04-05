import { Plugin, PluginSettingTab, Setting, Notice, App } from "obsidian";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";

// ─── Settings ────────────────────────────────────────────────────────

interface LarkBridgeSettings {
  syncDir: string;
  assetsSubdir: string;
  skipUnder: number; // skip recordings shorter than N minutes
}

const DEFAULT_SETTINGS: LarkBridgeSettings = {
  syncDir: "LarkBridge",
  assetsSubdir: "assets",
  skipUnder: 5,
};

// ─── Plugin ──────────────────────────────────────────────────────────

export default class LarkBridgePlugin extends Plugin {
  settings!: LarkBridgeSettings;
  syncing = false;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LarkBridgeSettingTab(this.app, this));

    // Ribbon icon
    this.addRibbonIcon("refresh-cw", "LarkBridge: 同步飞书妙记", () => this.sync());

    // Command palette
    this.addCommand({
      id: "lark-bridge-sync",
      name: "同步飞书妙记 (Sync Lark Minutes)",
      callback: () => this.sync(),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  run(cmd: string, timeout = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        cmd,
        {
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          env: {
            ...process.env,
            PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
          },
        },
        (err, stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve(stdout + stderr);
        },
      );
    });
  }

  private json(raw: string): any {
    const i = raw.indexOf("{");
    if (i === -1) return null;
    try {
      return JSON.parse(raw.slice(i));
    } catch {
      return null;
    }
  }

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
    let s = name.replace(/[/:*?"<>|]/g, "").trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  private dateFrom(title: string): string | null {
    const m = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;
    const m2 = title.match(/^(\d{2})-(\d{2})/);
    if (m2) return `2026-${m2[1]}-${m2[2]}`;
    return null;
  }

  private topicFrom(title: string): string {
    let t = title
      .replace(/^(智能纪要[：:]|文字记录[：:])/, "")
      .replace(/\s*\d{4}年\d{1,2}月\d{1,2}日\s*/, "")
      .replace(/^\d{2}-\d{2}\s*[|｜]?\s*/, "");
    return this.safe(t);
  }

  // ─── Tag cleaning ────────────────────────────────────────────────

  private cleanTags(c: string): string {
    // add-ons
    c = c.replace(/<add-ons[^>]*(?:\/?>[\s\S]*?<\/add-ons>|\/?>)/g, "");
    // reference-synced → unwrap
    c = c.replace(/<reference-synced[^>]*>([\s\S]*?)<\/reference-synced>/g, "$1");
    // image → placeholder
    c = c.replace(/<image\s+token="([^"]+)"[^/]*\/>/g, "[飞书图片: $1]");
    // whiteboard → placeholder
    c = c.replace(/<whiteboard\s+token="([^"]+)"[^/]*\/>/g, "[飞书白板: $1]");
    // grid / column → unwrap
    c = c.replace(/<\/?grid[^>]*>/g, "");
    c = c.replace(/<\/?column[^>]*>/g, "");
    // quote-container → blockquote
    c = c.replace(/<quote-container>([\s\S]*?)<\/quote-container>/g, (_, inner: string) =>
      inner.trim().split("\n").map((l: string) => "> " + l).join("\n"),
    );
    // text tags
    c = c.replace(/<text\s+color="gray"\s+bgcolor="gray">([^<]*)<\/text>/g, "**$1**");
    c = c.replace(/<text\s+color="gray">([^<]*)<\/text>/g, "`$1`");
    c = c.replace(/<text[^>]*>([\s\S]*?)<\/text>/g, "$1");
    // mentions
    c = c.replace(/<mention-user\s+[^/]*\/>/g, "");
    c = c.replace(/<mention-doc[^>]*(?:\/?>|>[^<]*<\/mention-doc>)/g, "");
    // callout → blockquote
    c = c.replace(/<callout[^>]*>([\s\S]*?)<\/callout>/g, (_, inner: string) =>
      inner.trim().split("\n").map((l: string) => "> " + l).join("\n"),
    );
    // chat-card, iframe
    c = c.replace(/<chat-card[^>]*>[\s\S]*?<\/chat-card>/g, "");
    c = c.replace(/<iframe[^>]*\/>/g, "");
    // collapse blank lines
    c = c.replace(/\n{4,}/g, "\n\n\n");
    return c;
  }

  // ─── Image download ──────────────────────────────────────────────

  private async downloadImages(content: string): Promise<string> {
    const ap = this.assetsPath();
    const imgMatches = [...content.matchAll(/\[飞书图片: ([^\]]+)\]/g)];
    const wbMatches = [...content.matchAll(/\[飞书白板: ([^\]]+)\]/g)];
    const all: [string, string][] = [
      ...imgMatches.map((m): [string, string] => [m[1].trim(), "media"]),
      ...wbMatches.map((m): [string, string] => [m[1].trim(), "whiteboard"]),
    ];

    if (all.length === 0) return content;
    if (!fs.existsSync(ap)) fs.mkdirSync(ap, { recursive: true });

    for (const [token, type] of all) {
      const file = `${token}.png`;
      const full = path.join(ap, file);
      if (fs.existsSync(full) && fs.statSync(full).size > 100) {
        content = content.replace(
          type === "media" ? `[飞书图片: ${token}]` : `[飞书白板: ${token}]`,
          `![[${this.settings.assetsSubdir}/${token}.png]]`,
        );
        continue;
      }
      try {
        await this.run(
          `cd "${ap}" && lark-cli docs +media-download --token "${token}" --type ${type} --output "${file}" --overwrite`,
          30_000,
        );
        if (fs.existsSync(full) && fs.statSync(full).size > 100) {
          content = content.replace(
            type === "media" ? `[飞书图片: ${token}]` : `[飞书白板: ${token}]`,
            `![[${this.settings.assetsSubdir}/${token}.png]]`,
          );
        }
      } catch { /* skip */ }
    }
    return content;
  }

  // ─── Search docs ─────────────────────────────────────────────────

  private async searchDocs(query: string): Promise<any[]> {
    const results: any[] = [];
    let pageToken: string | null = null;

    for (let page = 0; page < 10; page++) {
      let cmd = `lark-cli docs +search --query "${query}" --page-size 20 --format json`;
      if (pageToken) cmd += ` --page-token '${pageToken}'`;

      try {
        const out = await this.run(cmd, 30_000);
        const d = this.json(out);
        if (!d?.data) break;
        results.push(...(d.data.results || []));
        if (!d.data.has_more) break;
        pageToken = d.data.page_token || "";
        if (!pageToken) break;
      } catch {
        break;
      }
    }
    return results;
  }

  // ─── Download recordings ─────────────────────────────────────────

  private async syncRecordings(existing: Set<string>) {
    const sp = this.syncPath();
    const current = fs.readdirSync(sp).filter((f) => f.endsWith(".md"));
    const newNotes = current.filter((f) => !existing.has(f) && f.includes("_纪要.md"));

    for (const fname of newNotes) {
      const content = fs.readFileSync(path.join(sp, fname), "utf-8");
      const tokens = [...new Set(content.match(/obcn[a-z0-9]{10,}/g) || [])];

      for (const token of tokens) {
        try {
          // Get metadata
          const metaOut = await this.run(
            `lark-cli minutes minutes get --params '{"minute_token":"${token}"}' --format json`,
            15_000,
          );
          const meta = this.json(metaOut);
          const minute = meta?.data?.minute || {};
          const duration = parseInt(minute.duration || "0");

          // Skip short recordings
          if (duration > 0 && duration < this.settings.skipUnder * 60_000) continue;

          const durStr = duration > 0
            ? `_${Math.floor(duration / 60_000)}m${Math.floor((duration % 60_000) / 1000)}s`
            : "";

          const recName = fname.replace("_纪要.md", `_录音${durStr}.mp4`);
          const recPath = path.join(sp, recName);
          if (fs.existsSync(recPath)) continue;

          // Get download URL (lark-cli blocks internal URL, use curl)
          const urlOut = await this.run(
            `lark-cli minutes +download --minute-tokens "${token}" --url-only`,
            15_000,
          );
          const urlData = this.json(urlOut);
          if (!urlData?.ok) continue;
          const url = urlData.data.download_url;

          // Download
          await this.run(`curl -sL -o "${recPath}" "${url}"`, 180_000);
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
      // Check lark-cli
      try {
        await this.run("lark-cli --version", 5_000);
      } catch {
        new Notice("LarkBridge: 未找到 lark-cli，请先安装：npm install -g @larksuite/cli");
        return;
      }

      const sp = this.syncPath();
      if (!fs.existsSync(sp)) fs.mkdirSync(sp, { recursive: true });

      const existing = this.existingFiles();
      let newCount = 0;

      // Search notes + transcripts
      const notes = await this.searchDocs("智能纪要");
      const transcripts = await this.searchDocs("文字记录");
      const all = [...notes, ...transcripts];

      new Notice(`LarkBridge: 找到 ${all.length} 个文档，检查新增...`);

      for (const item of all) {
        const title = (item.title_highlighted || "").replace(/<\/?h>/g, "");
        const token = item.result_meta?.token || "";
        if (!title || !token) continue;

        const ftype = title.includes("智能纪要") ? "纪要" : title.includes("文字记录") ? "逐字稿" : "纪要";
        let date = this.dateFrom(title) || item.result_meta?.create_time_iso?.slice(0, 10) || "未知日期";
        const topic = this.topicFrom(title);
        const fileName = `${date}_${topic}_${ftype}.md`;

        if (existing.has(fileName)) continue;

        try {
          const out = await this.run(`lark-cli docs +fetch --doc "${token}" --format pretty`, 30_000);
          if (out && out.length > 50) {
            let content = this.cleanTags(out);
            content = await this.downloadImages(content);
            fs.writeFileSync(path.join(sp, fileName), content);
            newCount++;
          }
        } catch { /* skip */ }
      }

      // Download recordings
      if (newCount > 0) {
        new Notice(`LarkBridge: 下载录音...`);
        await this.syncRecordings(existing);
      }

      new Notice(
        newCount > 0
          ? `LarkBridge: 同步完成！新增 ${newCount} 个文件`
          : "LarkBridge: 同步完成，没有新内容",
      );
    } catch (e: any) {
      console.error("LarkBridge sync error:", e);
      new Notice(`LarkBridge: 同步失败 — ${e.message}`);
    } finally {
      this.syncing = false;
    }
  }
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

    // ─── Status check ────────────────────────────────────────────
    containerEl.createEl("h2", { text: "LarkBridge" });

    const statusEl = containerEl.createDiv({ cls: "lark-bridge-status" });
    statusEl.style.cssText = "padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px;";

    // Check lark-cli
    let cliInstalled = false;
    let cliLoggedIn = false;
    let userName = "";

    try {
      await this.plugin.run("lark-cli --version", 5_000);
      cliInstalled = true;
    } catch {}

    if (cliInstalled) {
      try {
        const out = await this.plugin.run("lark-cli auth status --format json", 5_000);
        const d = JSON.parse(out.slice(out.indexOf("{")));
        if (d.tokenStatus === "valid") {
          cliLoggedIn = true;
          userName = d.userName || "";
        }
      } catch {}
    }

    if (!cliInstalled) {
      statusEl.style.background = "var(--background-modifier-error)";
      statusEl.style.color = "var(--text-on-accent)";
      statusEl.innerHTML = `
        <strong>Step 1: Install lark-cli</strong><br>
        Open terminal and run:<br>
        <code style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:3px;">npm install -g @larksuite/cli</code>
      `;
    } else if (!cliLoggedIn) {
      statusEl.style.background = "var(--background-modifier-error)";
      statusEl.style.color = "var(--text-on-accent)";
      statusEl.innerHTML = `
        <strong>Step 2: Login to Feishu</strong><br>
        Open terminal and run:<br>
        <code style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:3px;">lark-cli config init</code><br>
        <code style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:3px;">lark-cli auth login --recommend</code>
      `;
    } else {
      statusEl.style.background = "var(--background-modifier-success)";
      statusEl.style.color = "var(--text-on-accent)";
      statusEl.innerHTML = `<strong>Connected</strong> — logged in as ${userName || "Feishu user"}. Click the sync icon in the sidebar to start.`;
    }

    // ─── Setup guide (collapsed) ─────────────────────────────────
    const guideDetails = containerEl.createEl("details");
    guideDetails.style.cssText = "margin-bottom:16px;";
    const guideSummary = guideDetails.createEl("summary", { text: "Setup guide (first-time users)" });
    guideSummary.style.cssText = "cursor:pointer;font-weight:600;margin-bottom:8px;";
    const guideContent = guideDetails.createDiv();
    guideContent.innerHTML = `
      <ol style="padding-left:20px;line-height:1.8;">
        <li>Install <a href="https://nodejs.org">Node.js</a> (if not already installed)</li>
        <li>Open Terminal and run: <code>npm install -g @larksuite/cli</code></li>
        <li>Create a Feishu app: <code>lark-cli config init</code></li>
        <li>Login: <code>lark-cli auth login --recommend</code></li>
        <li>Come back here — the status above should turn green</li>
        <li>Click the <strong>sync icon</strong> (↻) in the left sidebar</li>
      </ol>
      <p style="color:var(--text-muted);font-size:12px;">
        For detailed instructions, visit <a href="https://github.com/Clawborn/lark-bridge">github.com/Clawborn/lark-bridge</a>
      </p>
    `;

    // ─── Settings ────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Sync directory")
      .setDesc("Folder to save synced files (relative to vault root)")
      .addText((t) =>
        t.setValue(this.plugin.settings.syncDir).onChange(async (v) => {
          this.plugin.settings.syncDir = v.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Assets subdirectory")
      .setDesc("Subfolder for downloaded images and whiteboard thumbnails")
      .addText((t) =>
        t.setValue(this.plugin.settings.assetsSubdir).onChange(async (v) => {
          this.plugin.settings.assetsSubdir = v.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Skip recordings under (minutes)")
      .setDesc("Don't download recordings shorter than this")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.skipUnder)).onChange(async (v) => {
          this.plugin.settings.skipUnder = parseInt(v) || 5;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Manually trigger a sync")
      .addButton((b) =>
        b.setButtonText("Start sync").onClick(() => this.plugin.sync()),
      );

    // ─── Refresh status button ───────────────────────────────────
    new Setting(containerEl)
      .setName("Refresh status")
      .setDesc("Re-check lark-cli connection after setup")
      .addButton((b) =>
        b.setButtonText("Refresh").onClick(() => this.display()),
      );
  }
}
