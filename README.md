# LarkBridge

[中文文档](./README.zh.md)

> Sync Feishu/Lark Minutes to Obsidian with one click.

LarkBridge brings your Feishu meeting notes, transcripts, and recordings into your Obsidian vault — automatically formatted as clean Markdown.

![LarkBridge Settings](https://github.com/Clawborn/lark-bridge/raw/main/docs/settings.png)

## Features

- **One-click sync** — click the ↻ icon in the sidebar, or use the command palette
- **Meeting notes** — AI-generated summaries from Feishu Minutes
- **Transcripts** — full verbatim transcripts with timestamps
- **Recordings** — audio/video files downloaded alongside notes
- **Images & whiteboards** — automatically downloaded and embedded
- **Smart naming** — files named as `YYYY-MM-DD_topic_type` for easy browsing
- **Incremental sync** — only downloads new content, skips what you already have
- **Tag cleaning** — converts Feishu proprietary tags to standard Markdown
- **Dual mode** — works via Feishu API (no terminal needed) or lark-cli

## Quick start

### Method 1: Feishu API (recommended, no terminal needed)

#### Step 1: Create a Feishu app

1. Open [Feishu Developer Console](https://open.feishu.cn/app)
2. Click **Create Custom App**
3. Fill in app name (e.g. "LarkBridge") and description, click **Create**
4. You'll see **App ID** and **App Secret** on the app's main page — copy both

#### Step 2: Configure app permissions

1. In your app's page, go to **Permissions & Scopes** (权限管理) in the left sidebar
2. Search and enable these scopes one by one:

| Scope | Purpose |
|-------|---------|
| `search:docs:read` | Search meeting notes |
| `docx:document:readonly` | Read document content |
| `docs:document.content:read` | Read document blocks |
| `docs:document.media:download` | Download images |
| `docs:document:export` | Export documents |
| `drive:file:download` | Download files |
| `vc:meeting.search:read` | Search meeting records |
| `vc:note:read` | Read meeting notes |
| `minutes:minutes:readonly` | Read meeting minutes |
| `minutes:minutes.media:export` | Download recordings |

3. After adding all scopes, click **Create a Version** (创建版本) in the left sidebar under **Version Management**
4. Fill in version info and submit for review
5. For personal use, switch to **Test Mode**: go to **App Release** → set status to **Testing** or self-approve

> **Important**: If you're in an organization, you may need admin approval. For personal Feishu accounts, self-approval is usually sufficient.

#### Step 3: Install and configure LarkBridge

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/Clawborn/lark-bridge/releases)
2. In your Obsidian vault, create: `.obsidian/plugins/lark-bridge/`
3. Copy the three files into it
4. Open Obsidian → **Settings** → **Community plugins** → turn off **Restricted mode** → enable **LarkBridge**
5. Open LarkBridge settings, expand **Method 1: Feishu API**
6. Paste your **App ID** and **App Secret**
7. Click **Login** → a browser window opens
8. Log in to your Feishu account and authorize the app
9. Come back to Obsidian — the status bar should turn **green**

#### Step 4: Sync!

Click the **↻ icon** in the left sidebar, or press `Cmd/Ctrl+P` → "Sync Lark Minutes".

---

### Method 2: lark-cli (for terminal users)

If you prefer using the command line:

```bash
# 1. Install lark-cli
npm install -g @larksuite/cli

# 2. Create a Feishu app (interactive)
lark-cli config init

# 3. Login with recommended scopes
lark-cli auth login --recommend

# 4. Verify
lark-cli auth status
```

Then in Obsidian, go to LarkBridge settings → click **Refresh** → status should turn green.

---

## Usage

### Syncing

- **Sidebar**: Click the ↻ icon in the left ribbon
- **Command palette**: `Cmd/Ctrl+P` → "同步飞书妙记 (Sync Lark Minutes)"
- **Settings**: Scroll down and click "Start sync"

LarkBridge will:
1. Search your Feishu account for new meeting notes and transcripts
2. Download only new files (incremental — won't re-download existing ones)
3. Clean up Feishu's proprietary HTML tags into standard Markdown
4. Download images and whiteboard thumbnails
5. Download recordings for meetings longer than your configured minimum

### File naming

Files are named `YYYY-MM-DD_topic_type.ext` for easy chronological browsing:

```
2026-03-27_AI创业项目及发展前景访谈_纪要.md
2026-03-27_AI创业项目及发展前景访谈_逐字稿.md
2026-03-27_AI创业项目及发展前景访谈_录音_25m30s.mp4
```

Same meeting's notes, transcript, and recording sort together alphabetically.

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Sync directory | `LarkBridge` | Folder for synced files (relative to vault root) |
| Assets subdirectory | `assets` | Subfolder for images and whiteboards |
| Skip recordings under | `5` min | Don't download short recordings |

## Troubleshooting

### "Not connected" after filling in credentials

- Make sure you copied the **App Secret** correctly (not the App ID)
- Check that your Feishu app has all required scopes enabled
- For organization accounts, ensure the app is approved or in test mode

### Login button keeps spinning

- Make sure you completed the authorization in the browser
- Check your network connection
- Try clicking Login again — the device code expires after 10 minutes

### "Request failed, status 404"

- This was a bug in early versions. Update to the latest version.

### Sync completes but finds 0 documents

- Make sure you have Feishu Minutes (妙记) recordings in your account
- Check that your Feishu app has `search:docs:read` scope enabled
- The search looks for "智能纪要" and "文字记录" — these are auto-generated by Feishu Minutes

### Images show as `[飞书图片: xxx]` instead of actual images

- Images require `docs:document.media:download` scope
- If using CLI mode, make sure lark-cli has the right permissions

### Recordings fail to download

- Recordings require `minutes:minutes.media:export` scope
- You can only download recordings from meetings you organized or have access to
- Recordings use `curl` for download — make sure `curl` is available on your system

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Obsidian   │────▶│  LarkBridge  │────▶│  Feishu API  │
│  (your vault)│◀────│   (plugin)   │◀────│  / lark-cli  │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                     ┌─────┴─────┐
                     │ Clean tags │
                     │ Download   │
                     │ images     │
                     │ Rename     │
                     │ files      │
                     └───────────┘
```

1. **Search** Feishu docs for meeting notes ("智能纪要") and transcripts ("文字记录")
2. **Fetch** document content
3. **Clean** Feishu proprietary tags into standard Markdown
4. **Download** images and whiteboard thumbnails
5. **Download** recordings via URL + curl
6. **Save** with smart `date_topic_type` naming

## Tag conversion

| Feishu tag | Converted to |
|------------|-------------|
| `<image token="..."/>` | `![[assets/token.png]]` (downloaded) |
| `<whiteboard token="..."/>` | `![[assets/token.png]]` (thumbnail) |
| `<grid>` / `<column>` | Removed (content preserved) |
| `<quote-container>` | `>` blockquote |
| `<text color="gray">` | `` `timestamp` `` |
| `<text color="gray" bgcolor="gray">` | `**@mention**` |
| `<mention-user>` | Removed |
| `<add-ons>` | Removed |
| `<callout>` | `>` blockquote |

## Network & privacy

LarkBridge connects to:
- `accounts.feishu.cn` — OAuth device code authorization
- `open.feishu.cn` — Feishu Open API (search, fetch docs, download media)
- Your app credentials are stored locally in Obsidian's plugin data (`.obsidian/plugins/lark-bridge/data.json`)
- No data is sent to any third-party service

## Building from source

```bash
git clone https://github.com/Clawborn/lark-bridge.git
cd lark-bridge
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/lark-bridge/`.

## License

MIT

## Authors

[@Clawborn](https://github.com/Clawborn) & [@clawyouseeme](https://github.com/clawyouseeme)
